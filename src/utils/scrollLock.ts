let lockCount = 0;
let savedScrollY = 0;

// iOS Safari scrolls the document to bring a focused input above the on-screen keyboard even
// when html/body have overflow: hidden — this takes body out of the scroll chain entirely so
// there's nothing for that behavior to act on. Ref-counted so a quick blur-then-focus handoff
// between two locks (e.g. origin field to destination field) doesn't briefly unlock in between.
export function lockBodyScroll() {
  if (lockCount === 0) {
    savedScrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
  }
  lockCount++;
}

export function unlockBodyScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    window.scrollTo(0, savedScrollY);
  }
}
