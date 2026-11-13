import { useSyncExternalStore } from "react";

// Phone layout: narrower than Tailwind's `md` (768px). Keep this in step with `md:` in classNames.
export const MOBILE_QUERY = "(max-width: 767.98px)";

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

const getSnapshot = () => window.matchMedia(MOBILE_QUERY).matches;
const getServerSnapshot = () => false;

// True while the viewport is in the phone layout; updates when the width crosses 768px.
// Use it only where the rendered parts differ (sidebar ↔ bottom tab bar, side panel ↔ full-screen
// sheet). Anything CSS can handle (sizes, hiding, stacking) uses Tailwind's `md:` instead.
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
