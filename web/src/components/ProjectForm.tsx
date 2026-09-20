import { useState, type CSSProperties } from "react";
import type { Project, ProjectInput } from "../lib/types";

// Create / edit form for a project. Shared by the list page (create) and the detail page (edit).
export function ProjectForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: Project | null;
  onSubmit: (input: ProjectInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [repositoryUrl, setRepositoryUrl] = useState(initial?.repository_url ?? "");
  const trimmedName = name.trim();
  const trim = (v: string) => (v.trim() ? v.trim() : null);

  const handleSubmit = () => {
    if (!trimmedName) return;
    onSubmit({
      name: trimmedName,
      description: trim(description),
      url: trim(url),
      repository_url: trim(repositoryUrl),
    });
  };

  return (
    <div style={overlay} onMouseDown={onCancel}>
      <div style={dialog} onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>
          {initial ? "プロジェクトを変更" : "新規プロジェクト"}
        </h3>

        <label style={fieldLabel}>プロジェクト名</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSubmit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="例: AWS移行 Phase1 アプリケーション移行"
          style={textInput}
        />

        <label style={{ ...fieldLabel, marginTop: 14 }}>概要（任意）</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
          rows={3}
          placeholder="プロジェクトの説明"
          style={{ ...textInput, resize: "vertical", fontFamily: "inherit" }}
        />

        <label style={{ ...fieldLabel, marginTop: 14 }}>URL（任意）</label>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSubmit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="https://example.vercel.app"
          style={textInput}
        />

        <label style={{ ...fieldLabel, marginTop: 14 }}>リポジトリ（任意）</label>
        <input
          value={repositoryUrl}
          onChange={(e) => setRepositoryUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSubmit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="https://github.com/owner/repo"
          style={textInput}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={onCancel} style={cancelBtn}>
            キャンセル
          </button>
          <button onClick={handleSubmit} disabled={!trimmedName} style={submitBtn}>
            {initial ? "保存" : "作成"}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  width: 420,
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

const cancelBtn: CSSProperties = {
  background: "#fff",
  color: "#3b4149",
  border: "1px solid #cbd2d9",
  borderRadius: 6,
  padding: "5px 10px",
  fontSize: 12,
  cursor: "pointer",
};

const submitBtn: CSSProperties = {
  background: "#0972d3",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "7px 14px",
  fontSize: 13,
  cursor: "pointer",
};
