import { useState, type CSSProperties, type MouseEvent } from "react";

// Shows a shortened uuid; click to copy the full value (used to hand ids to the AI / MCP).
// Rendered as plain inline text so it blends into the surrounding layout.
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
    <button onClick={copy} title={`${id}\nクリックでコピー`} style={copied ? { ...style, ...copiedStyle } : style}>
      {copied ? "コピーしました" : id.slice(0, 8)}
    </button>
  );
}

const style: CSSProperties = {
  background: "none",
  border: "none",
  borderBottom: "1px dotted #cbd2d9",
  padding: 0,
  fontSize: 11,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  color: "#94a0ad",
  cursor: "pointer",
  whiteSpace: "nowrap",
  lineHeight: 1.6,
};

const copiedStyle: CSSProperties = {
  borderBottomColor: "transparent",
  color: "#1a7f37",
  fontFamily: "inherit",
};
