import { browser } from 'webextension-polyfill-ts';

import {
  KanjiSearchResult,
  NameSearchResult,
  WordSearchResult,
} from '../../background/search-result';
import { CopyType } from '../../common/copy-keys';
import { ReferenceAbbreviation } from '../../common/refs';
import { getTextToCopy } from '../copy-text';
import { getCopyEntryFromResult } from '../get-copy-entry';
import { CopyState } from '../popup';

import { html, svg } from './builder';
import { renderClipboard } from './icons';
import { getLangTag } from './lang-tag';

export function renderCopyOverlay({
  copyState,
  kanjiReferences,
  onCancelCopy,
  onCopy,
  result,
  showKanjiComponents,
}: {
  copyState: CopyState;
  kanjiReferences: Array<ReferenceAbbreviation>;
  onCancelCopy?: () => void;
  onCopy?: (copyType: CopyType) => void;
  result?: WordSearchResult | NameSearchResult | KanjiSearchResult;
  showKanjiComponents?: boolean;
}): HTMLDivElement {
  const copyOverlay = html('div', { class: 'copy-overlay' });
  copyOverlay.classList.toggle(
    '-active',
    copyState.kind === 'active' || copyState.kind === 'error'
  );

  // Heading
  copyOverlay.append(
    html(
      'div',
      {
        role: 'heading',
        class: 'copy-heading',
        lang: getLangTag(),
      },
      browser.i18n.getMessage('content_copy_overlay_copy_title')
    )
  );

  // Work out what we would copy so we can generate suitable preview text
  const entryToCopy = result
    ? getCopyEntryFromResult({
        result,
        index: copyState.kind !== 'inactive' ? copyState.index : 0,
      })
    : null;

  // Options
  const list = copyOverlay.appendChild(html('ul', { class: 'copy-options' }));

  // Entry button
  {
    const entryPreviewText = entryToCopy
      ? getTextToCopy({
          entry: entryToCopy,
          copyType: 'entry',
          kanjiReferences,
          showKanjiComponents,
        })
      : undefined;
    const button = renderButtonWithPreview({
      label: browser.i18n.getMessage('content_copy_overlay_entry_button'),
      previewText: entryPreviewText,
    });
    button.addEventListener('click', () => onCopy?.('entry'));
    list.append(html('li', {}, button));
  }

  // Tab-separated button
  {
    const tabSeparatedPreviewText = entryToCopy
      ? getTextToCopy({
          entry: entryToCopy,
          copyType: 'tab',
          kanjiReferences,
          showKanjiComponents,
        }).replace(/\t/g, ' → ')
      : undefined;
    const button = renderButtonWithPreview({
      label: browser.i18n.getMessage(
        'content_copy_overlay_tab_separated_button'
      ),
      previewText: tabSeparatedPreviewText,
    });
    button.addEventListener('click', () => onCopy?.('tab'));
    list.append(html('li', {}, button));
  }

  // Word button
  {
    const copyWordButton = list
      .appendChild(html('li'))
      .appendChild(html('button', { class: '-icon-label' }));

    if (entryToCopy) {
      const icon = renderClipboard();
      icon.classList.add('icon');
      copyWordButton.append(icon);
    }
    const copyWordLabel = html('span');
    if (entryToCopy) {
      copyWordLabel.append(
        getTextToCopy({
          entry: entryToCopy,
          copyType: 'word',
        })
      );
      copyWordLabel.lang = 'ja';
    } else {
      copyWordLabel.append(
        browser.i18n.getMessage(
          result?.type === 'kanji'
            ? 'content_copy_overlay_kanji_button'
            : 'content_copy_overlay_word_button'
        )
      );
      copyWordLabel.lang = getLangTag();
    }
    copyWordButton.append(copyWordLabel);
    copyWordButton.addEventListener('click', () => onCopy?.('word'));
  }

  // Cancel button
  const cancelButton = html(
    'button',
    {
      class: 'cancel-button',
      lang: getLangTag(),
    },
    svg(
      'svg',
      {
        class: 'icon',
        viewBox: '0 0 24 24',
        stroke: 'currentColor',
        'stroke-width': '2',
      },
      svg('path', { d: 'M6 18L18 6M6 6l12 12' })
    ),
    browser.i18n.getMessage('content_copy_overlay_cancel_button')
  );
  cancelButton.addEventListener('click', () => onCancelCopy?.());
  copyOverlay.append(cancelButton);

  return copyOverlay;
}

function renderButtonWithPreview({
  label,
  previewText,
}: {
  label: string;
  previewText?: string;
}) {
  const button = html('button', { lang: getLangTag() }, label);

  if (previewText) {
    const previewRow = html('div', {
      class: 'copy-preview',
      role: 'presentation',
    });

    const icon = renderClipboard();
    icon.classList.add('icon');
    previewRow.append(icon);

    previewRow.append(html('span', { lang: 'ja' }, previewText));

    button.append(previewRow);
  }

  return button;
}