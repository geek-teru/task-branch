import { useState, type CSSProperties } from "react";
import type { Status, StoryInput } from "../lib/types";
import { STATUS_LABEL, STATUS_ORDER } from "../lib/types";

// Modal form to create or edit a story or task (title / status / dates / description).
export function TaskForm({
  heading,
  noun = "ストーリー",
  submitLabel,
  initial,
  onSubmit,
  onCancel,
}: {
  heading: string;
  noun?: string; // used in field labels, e.g. "タスク" → "タスク名"
  submitLabel: string;
  initial: StoryInput;
  onSubmit: (values: StoryInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState<Status>(initial.status);
  const [start, setStart] = useState(initial.start_date ?? "");
  const [due, setDue] = useState(initial.due_date ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const trimmedTitle = title.trim();

  const handleSubmit = () => {
    if (!trimmedTitle) return;
    const d = description.trim();
    onSubmit({
      title: trimmedTitle,
      status,
      start_date: start || null,
      due_date: due || null,
      description: d ? d : null,
    });
  };

  return (
    <div style={overlay} onMouseDown={onCancel}>
      <div style={dialog} onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>{heading}</h3>

        <label style={fieldLabel}>{noun}名</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="例: 認証基盤の移行"
          style={textInput}
        />

        <label style={{ ...fieldLabel, marginTop: 14 }}>ステータス</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as Status)} style={textInput}>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>

        <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>開始日</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={textInput} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabel}>期限</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={textInput} />
          </div>
        </div>

        <label style={{ ...fieldLabel, marginTop: 14 }}>詳細（任意）</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
          rows={3}
          placeholder={`${noun}の説明`}
          style={{ ...textInput, resize: "vertical", fontFamily: "inherit" }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={onCancel} style={secondaryBtn}>
            キャンセル
          </button>
          <button onClick={handleSubmit} disabled={!trimmedTitle} style={primaryBtn}>
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
