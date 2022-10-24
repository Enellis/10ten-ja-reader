import { allMajorDataSeries } from '@birchill/jpdict-idb';
import Browser, { browser } from 'webextension-polyfill-ts';

import { getLocalizedDataSeriesLabel } from '../common/data-series-labels';
import { throttle } from '../utils/throttle';
import { JpdictStateWithFallback } from './jpdict';

interface BrowserActionState {
  enabled: boolean;
  jpdictState: JpdictStateWithFallback;
  tabId: number | undefined;
  toolbarIcon: 'default' | 'sky';
}

// Chrome makes the tooltip disappear for a second or so if we try updating it
// while it is showing so if we update it too quickly it becomes impossible to
// read. Instead we need to throttle our updates. 2.5s or so seems like a good
// balance between being up-to-date and being readable.
const throttledSetTitle = throttle(
  (...args: Parameters<Browser.Action.Static['setTitle']>) => {
    void browser.browserAction.setTitle(...args);
  },
  2500
);

let currentUpdate: { next?: BrowserActionState } | undefined;

export function updateBrowserAction(params: BrowserActionState) {
  // If we are already trying to update the browser action, queue our changes,
  // clobbering any other queued changes.
  //
  // We need to ensure only one update runs at a time because in Chromium-based
  // browsers setIcon is not FIFO and we can have earlier changes clobbering
  // later ones.
  if (currentUpdate) {
    currentUpdate.next = params;
    return;
  }

  void (async () => {
    let nextParams: BrowserActionState | undefined = params;
    while (nextParams) {
      try {
        // Indicate an update is running
        currentUpdate = {};
        await doUpdateBrowserAction(nextParams);
      } catch {
        // Ignore
      }
      // Look for the next update
      nextParams = currentUpdate?.next;
    }
    // No updates left
    currentUpdate = undefined;
  })();
}

async function doUpdateBrowserAction({
  enabled,
  jpdictState,
  tabId,
  toolbarIcon,
}: BrowserActionState) {
  const iconFilenameParts = ['10ten'];
  let tooltip: string;

  // Apply the variant, if needed
  if (toolbarIcon === 'sky') {
    iconFilenameParts.push('sky');
  }

  // First choose the base icon type / text
  if (enabled) {
    const jpdictWords = jpdictState.words.state;
    const fallbackWords = jpdictState.words.fallbackState;

    if (jpdictWords === 'ok' || fallbackWords === 'ok') {
      tooltip = browser.i18n.getMessage('command_toggle_enabled');
    } else if (jpdictWords === 'init' || fallbackWords === 'loading') {
      tooltip = browser.i18n.getMessage('command_toggle_loading');
    } else if (fallbackWords === 'unloaded') {
      // If we get this far, we've either failed to load the jpdict database or
      // we simply haven't got around to populating it yet (e.g. we're still
      // downloading the other databases).
      //
      // However, we won't load the fallback database until the user actually
      // tries to look something up so we don't know if it's available yet or
      // not. For now, assume everything is ok.
      tooltip = browser.i18n.getMessage('command_toggle_enabled');
    } else {
      iconFilenameParts.push('error');
      tooltip = browser.i18n.getMessage('error_loading_dictionary');
    }
  } else {
    iconFilenameParts.push('disabled');
    tooltip = browser.i18n.getMessage('command_toggle_disabled');
  }

  const seriesColors = {
    words: 'green',
    names: 'blue',
    kanji: 'purple',
    radicals: 'purple',
  };

  // Next determine if we need to overlay any additional information.
  switch (jpdictState.updateState.type) {
    case 'checking':
      // Technically the 'indeterminate' icon would be more correct here but
      // using '0' instead leads to less flicker.
      iconFilenameParts.push(
        '0p',
        seriesColors[jpdictState.updateState.series]
      );
      tooltip = browser.i18n.getMessage('command_toggle_checking');
      break;

    case 'updating':
      {
        const { totalProgress, series } = jpdictState.updateState;
        // We only have progress variants for the regular and disabled styles.
        if (!iconFilenameParts.includes('error')) {
          iconFilenameParts.push(
            Math.round(totalProgress * 5) * 20 + 'p',
            seriesColors[series]
          );
        }
        const dbLabel = getLocalizedDataSeriesLabel(series);
        const progressAsPercent = Math.round(totalProgress * 100);
        tooltip = browser.i18n.getMessage('command_toggle_downloading', [
          dbLabel,
          String(progressAsPercent),
        ]);
      }
      break;
  }

  // Set the icon
  //
  // We'd like to feature-detect if SVG icons are supported but Safari will
  // just fail silently if we try.
  const iconFilename = iconFilenameParts.join('-');
  await setIcon(iconFilename, tabId);

  // Add a warning overlay and update the string if there was a fatal
  // update error.
  const hasNotOkDatabase = allMajorDataSeries.some(
    (series) => jpdictState[series].state !== 'ok'
  );
  if (
    hasNotOkDatabase &&
    !!jpdictState.updateError &&
    jpdictState.updateError.name !== 'AbortError' &&
    // Don't show quota exceeded errors. If the quota is exceeded, there's not
    // a lot the user can do about it, and we don't want to bother them with
    // a constant error signal.
    jpdictState.updateError.name !== 'QuotaExceededError'
  ) {
    await browser.browserAction.setBadgeText({ text: '!', tabId });
    await browser.composeAction?.setBadgeText({ text: '!' });
    await browser.browserAction.setBadgeBackgroundColor({
      color: 'yellow',
      tabId,
    });
    await browser.composeAction?.setBadgeBackgroundColor({ color: 'yellow' });
    tooltip = browser.i18n.getMessage('command_toggle_update_error');
  } else {
    await browser.browserAction.setBadgeText({ text: '', tabId });
    await browser.composeAction?.setBadgeText({ text: '' });
  }

  // Set the caption
  throttledSetTitle({ title: tooltip, tabId });
  await browser.composeAction?.setTitle({ title: tooltip });
}

async function setIcon(iconFilename: string, tabId?: number): Promise<void> {
  // We'd like to feature-detect if SVG icons are supported but Safari will
  // just fail silently if we try.
  if (__SUPPORTS_SVG_ICONS__) {
    const details = { path: `images/${iconFilename}.svg` };
    await browser.browserAction.setIcon({ ...details, tabId });
    await browser.composeAction?.setIcon(details);
  } else {
    const details = {
      path: {
        16: `images/${iconFilename}-16.png`,
        32: `images/${iconFilename}-32.png`,
        48: `images/${iconFilename}-48.png`,
      },
    };
    await browser.browserAction.setIcon({ ...details, tabId });
    await browser.composeAction?.setIcon(details);
  }
}

// This will clobber any existing icon settings so it is only intended
// to be used on startup (when no existing icon is already set) or when the icon
// setting is changed (in which case we will update the browser action for
// enabled tabs immediately afterwards anyway).
export function setDefaultToolbarIcon(toolbarIcon: 'default' | 'sky') {
  const iconFilename =
    toolbarIcon === 'sky' ? '10ten-disabled' : '10ten-sky-disabled';
  void setIcon(iconFilename);
}
