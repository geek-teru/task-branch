import { useCallback, useState } from "react";

// A width the user can drag, remembered per browser (localStorage).
// Returns the current width and a mousedown handler for the drag handle.
// invert: the handle sits on the left edge, so dragging right makes the column narrower.
export function useResizableWidth(
  storageKey: string,
  initial: number,
  min: number,
  max: number,
  options?: { invert?: boolean }
) {
  const sign = options?.invert ? -1 : 1;
  const [width, setWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved >= min && saved <= max) return saved;
    } catch {
      // Storage can be unavailable (private mode); fall back to the default.
    }
    return initial;
  });

  const startResize = useCallback(
    (e: { clientX: number; preventDefault: () => void; stopPropagation: () => void }) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = width;
      const clamp = (w: number) => Math.min(max, Math.max(min, w));
      const onMove = (ev: MouseEvent) => setWidth(clamp(startWidth + sign * (ev.clientX - startX)));
      const onUp = (ev: MouseEvent) => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        const final = clamp(startWidth + sign * (ev.clientX - startX));
        setWidth(final);
        try {
          localStorage.setItem(storageKey, String(final));
        } catch {
          // Ignore: the width still applies for this session.
        }
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [width, min, max, storageKey, sign]
  );

  return { width, startResize };
}

// Shared look of the vertical drag handle sitting on a column border.
export const resizeHandleStyle = {
  position: "absolute" as const,
  top: 0,
  bottom: 0,
  width: 7,
  cursor: "col-resize",
  zIndex: 5,
  userSelect: "none" as const,
};
