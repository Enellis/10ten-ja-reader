/// Properties about the target element from which we started lookup needed
/// so that we can correctly position the popup in a way that doesn't overlap
/// the element.
export type TargetProps = {
  hasTitle: boolean;
  isVerticalText: boolean;
};

export function getTargetElementProps(target: Element): TargetProps {
  return {
    hasTitle: !!((target as HTMLElement) || null)?.title,
    isVerticalText: !!target.ownerDocument.defaultView
      ?.getComputedStyle(target)
      .writingMode.startsWith('vertical'),
  };
}