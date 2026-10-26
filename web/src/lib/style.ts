import type { Status } from "./types";

// Color values for inline styles. They point at the @theme tokens in index.css,
// so they stay in sync with STATUS_CLASS while screens move to className.
export const STATUS_COLOR: Record<Status, { bg: string; border: string; fg: string }> = {
  todo: { bg: "var(--color-status-todo-bg)", border: "var(--color-status-todo-border)", fg: "var(--color-status-todo-fg)" },
  in_progress: {
    bg: "var(--color-status-in_progress-bg)",
    border: "var(--color-status-in_progress-border)",
    fg: "var(--color-status-in_progress-fg)",
  },
  done: { bg: "var(--color-status-done-bg)", border: "var(--color-status-done-border)", fg: "var(--color-status-done-fg)" },
  closed: { bg: "var(--color-status-closed-bg)", border: "var(--color-status-closed-border)", fg: "var(--color-status-closed-fg)" },
};

// Tailwind class names per status. Written out in full so Tailwind can find them in the source.
export const STATUS_CLASS: Record<Status, { bg: string; border: string; text: string }> = {
  todo: { bg: "bg-status-todo-bg", border: "border-status-todo-border", text: "text-status-todo-fg" },
  in_progress: {
    bg: "bg-status-in_progress-bg",
    border: "border-status-in_progress-border",
    text: "text-status-in_progress-fg",
  },
  done: { bg: "bg-status-done-bg", border: "border-status-done-border", text: "text-status-done-fg" },
  closed: { bg: "bg-status-closed-bg", border: "border-status-closed-border", text: "text-status-closed-fg" },
};
