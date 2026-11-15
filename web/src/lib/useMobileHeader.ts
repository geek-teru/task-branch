import { useEffect, useSyncExternalStore } from "react";

// Phone layout (< 768px): the page heading (<PageHeader>) and the filter bar (<Toolbar>) are
// folded by default so the list gets the screen, and the heading's toggle opens both together.
// The two are siblings in every view, so they share this small store instead of props.
let expanded = false;
let toolbars = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function setMobileHeaderExpanded(next: boolean) {
  if (expanded === next) return;
  expanded = next;
  emit();
}

// Whether the heading's details and the toolbar are open on the phone.
export function useMobileHeaderExpanded(): boolean {
  return useSyncExternalStore(subscribe, () => expanded, () => false);
}

// Whether a <Toolbar> is on the page (the heading shows its toggle when there is something to open).
export function useHasToolbar(): boolean {
  return useSyncExternalStore(subscribe, () => toolbars > 0, () => false);
}

// Called by <Toolbar> while it is mounted.
export function useRegisterToolbar() {
  useEffect(() => {
    toolbars += 1;
    emit();
    return () => {
      toolbars -= 1;
      emit();
    };
  }, []);
}

// Called by <PageHeader>: each page starts folded again when the heading goes away.
export function useResetOnUnmount() {
  useEffect(() => () => setMobileHeaderExpanded(false), []);
}
