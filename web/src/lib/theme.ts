import { useSyncExternalStore } from "react";

// Color theme: light / dark / follow the OS. The choice is kept per browser (localStorage "theme");
// the resolved light/dark goes on <html data-theme>, which index.css uses to swap the color tokens.
// web/index.html runs the same resolution inline before React renders, so the page doesn't flash light.
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";
// Used when nothing (or an invalid value) is saved. "light" until the theme switch UI lands
// (f88dfa6b), so OS-dark users aren't put on dark without a way back. Keep in sync with web/index.html.
const DEFAULT_PREFERENCE: ThemePreference = "light";

function isPreference(v: unknown): v is ThemePreference {
  return v === "light" || v === "dark" || v === "system";
}

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isPreference(saved) ? saved : DEFAULT_PREFERENCE;
  } catch {
    return DEFAULT_PREFERENCE;
  }
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function resolve(p: ThemePreference): ResolvedTheme {
  return p === "system" ? systemTheme() : p;
}

type State = { preference: ThemePreference; resolved: ResolvedTheme };

let state: State = { preference: readPreference(), resolved: "light" };
state = { ...state, resolved: resolve(state.preference) };
const listeners = new Set<() => void>();

function setState(next: State) {
  if (next.preference === state.preference && next.resolved === state.resolved) return;
  state = next;
  listeners.forEach((l) => l());
}

// Put the resolved theme on <html>. Safe to call repeatedly.
export function applyTheme(p: ThemePreference): ResolvedTheme {
  const resolved = resolve(p);
  document.documentElement.dataset.theme = resolved;
  setState({ preference: p, resolved });
  return resolved;
}

export function getThemePreference(): ThemePreference {
  return state.preference;
}

// Save the choice for this browser and apply it at once.
export function setThemePreference(p: ThemePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, p);
  } catch {
    // Storage blocked (private mode etc.): still switch for this page.
  }
  applyTheme(p);
}

// While "system" is chosen, follow OS changes. One listener for the whole app.
window.matchMedia(DARK_QUERY).addEventListener("change", () => {
  if (state.preference === "system") applyTheme("system");
});

// Another tab changed the choice.
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY) applyTheme(readPreference());
});

applyTheme(state.preference);

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

const getSnapshot = () => state;

// Current choice and what it resolves to. Every caller (header menu, settings) sees the same value.
export function useTheme(): {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
} {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { preference: s.preference, resolved: s.resolved, setPreference: setThemePreference };
}
