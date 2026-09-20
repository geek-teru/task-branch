import type { CSSProperties } from "react";

// Small confirmation modal (message + キャンセル / 変更する). Click-away or Escape cancels.
export function ConfirmDialog({
  message,
  confirmLabel = "変更する",
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const btnBase: CSSProperties = {
    padding: "7px 16px",
    borderRadius: 6,
    fontSize: 13,
    cursor: "pointer",
  };
  return (
    <div
      onClick={onCancel}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: "rgba(31,41,51,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 8,
          boxShadow: "0 8px 28px rgba(31,41,51,0.25)",
          width: 380,
          maxWidth: "90vw",
          padding: 20,
        }}
      >
        <div style={{ fontSize: 14, color: "#1f2933", lineHeight: 1.6, whiteSpace: "pre-line" }}>
          {message}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button
            onClick={onCancel}
            style={{ ...btnBase, background: "#fff", color: "#3b4149", border: "1px solid #cbd2d9" }}
          >
            キャンセル
          </button>
          <button
            autoFocus
            onClick={onConfirm}
            style={{ ...btnBase, background: "#1f2933", color: "#fff", border: "1px solid #1f2933" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
