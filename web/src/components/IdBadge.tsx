import { useState, type MouseEvent } from "react";
import { cn } from "../lib/cn";

// Shows a shortened uuid; click to copy the full value (used to hand ids to the AI / MCP).
// Looks like a neutral Badge in a monospace font.
export function IdBadge({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async (e: MouseEvent) => {
    e.stopPropagation(); // the badge often sits inside a clickable row / card
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard can be blocked (insecure context / permissions); the title still shows the full id.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title={`${id}\nクリックでコピー`}
      className={cn(
        "m-0 inline-flex h-5 shrink-0 cursor-pointer items-center whitespace-nowrap rounded border px-1.5 text-[11px] leading-none transition-colors",
        copied
          ? "border-accent bg-accent/10 font-sans text-brand"
          : "border-border bg-surface-muted font-mono text-fg-muted hover:border-border-strong hover:text-fg",
      )}
    >
      {copied ? "コピーしました" : id.slice(0, 8)}
    </button>
  );
}
