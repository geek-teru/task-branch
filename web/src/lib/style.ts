import type { Status } from "./types";

export const STATUS_COLOR: Record<Status, { bg: string; border: string; fg: string }> = {
  todo: { bg: "#e2f4fb", border: "#33a9c9", fg: "#0b5e73" },
  in_progress: { bg: "#eaf2fc", border: "#0972d3", fg: "#0b4a8a" },
  done: { bg: "#eaf6ec", border: "#1a7f37", fg: "#12652b" },
  closed: { bg: "#f4f5f6", border: "#8d99a8", fg: "#5f6b7a" },
};
