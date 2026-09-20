import { useState, type CSSProperties } from "react";

// Shows a shortened uuid; click to copy the full value (used to hand ids to the AI / MCP).
export function IdBadge({ id, label = "ID" }: { id: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard can be blocked (insecure context / permissions); the title still shows the full id.
    }
  };

  return (
    <button onClick={copy} title={`${id}\nクリックでコピー`} style={style} aria-label={`${label} をコピー`}>
      <span style={{ color: "#94a0ad" }}>{label}</span>
      <span>{id.slice(0, 8)}</span>
      <span style={{ color: copied ? "#1a7f37" : "#94a0ad" }}>{copied ? "コピーしました" : "コピー"}</span>
    </button>
  );
}

const style: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "#f7f8f9",
  border: "1px solid #e5e8eb",
  borderRadius: 6,
  padding: "2px 8px",
  fontSize: 11,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  color: "#3b4149",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
