import { useState, type CSSProperties } from "react";

// Modal form to add or rename a story group (name only). Styled like TaskForm.
export function GroupForm({
  heading,
  submitLabel,
  initialName = "",
  onSubmit,
  onCancel,
}: {
  heading: string;
  submitLabel: string;
  initialName?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  const handleSubmit = () => {
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div style={overlay} onMouseDown={onCancel}>
      <div style={dialog} onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>{heading}</h3>

        <label style={fieldLabel}>グループ名</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="例: リリース 1"
          style={textInput}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={onCancel} style={secondaryBtn}>
            キャンセル
          </button>
          <button onClick={handleSubmit} disabled={!trimmed} style={primaryBtn}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const primaryBtn: CSSProperties = {
  background: "#0972d3",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "7px 14px",
  fontSize: 13,
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  background: "#fff",
  color: "#3b4149",
  border: "1px solid #cbd2d9",
  borderRadius: 6,
  padding: "7px 14px",
  fontSize: 13,
  cursor: "pointer",
};

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(31,41,51,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 100,
};

const dialog: CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 24,
  width: 440,
  maxWidth: "90vw",
  boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
};

const fieldLabel: CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "#5f6b7a",
  marginBottom: 6,
};

const textInput: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontSize: 13,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #cbd2d9",
};
