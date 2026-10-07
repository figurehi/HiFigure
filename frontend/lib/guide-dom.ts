/** Resolve duplicate coach-mark anchors to the selected, visible target. */
export function findVisibleGuideAnchor(anchor: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-guide-anchor="${anchor}"]`),
  );
  const visible = elements
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ element, rect }) => {
      if (rect.width <= 0 || rect.height <= 0 || element.closest('[aria-hidden="true"], [hidden]')) return false;
      const computed = window.getComputedStyle(element);
      return computed.display !== "none" && computed.visibility !== "hidden" && computed.opacity !== "0";
    });
  if (visible.length === 0) return null;
  return visible
    .sort((left, right) => {
      const leftPreferred = left.element.closest('[aria-modal="true"]')
        ? 2
        : left.element.closest(".is-selected, .is-active") ? 1 : 0;
      const rightPreferred = right.element.closest('[aria-modal="true"]')
        ? 2
        : right.element.closest(".is-selected, .is-active") ? 1 : 0;
      if (leftPreferred !== rightPreferred) return rightPreferred - leftPreferred;
      return visibleArea(right.rect) - visibleArea(left.rect);
    })[0]?.element ?? null;
}

export function prefersReducedGuideMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function isGuideAnchorComfortablyVisible(rect: DOMRect) {
  if (typeof window === "undefined") return false;
  const margin = 28;
  const mobileGuideSpace = window.innerWidth <= 720 ? Math.min(window.innerHeight * 0.42, 360) : 0;
  return (
    rect.top >= margin &&
    rect.left >= margin &&
    rect.right <= window.innerWidth - margin &&
    rect.bottom <= window.innerHeight - margin - mobileGuideSpace
  );
}

export function scrollGuideAnchorIntoView(anchor: string) {
  const element = findVisibleGuideAnchor(anchor);
  if (!element) return false;
  element.scrollIntoView({
    behavior: prefersReducedGuideMotion() ? "auto" : "smooth",
    block: "center",
    inline: "center",
  });
  return true;
}

function visibleArea(rect: DOMRect) {
  const width = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
  const height = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
  return width * height;
}
