/**
 * Whether a key event's target takes typing, so a bare-letter shortcut must let it pass.
 * `closest`, not `matches`: inside a rich-text host the event target is whichever inline element
 * the caret sits in, and only its ancestor carries `contenteditable`.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]') !==
      null
  )
}
