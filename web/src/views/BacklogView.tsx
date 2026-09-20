import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { BacklogEpic, Project } from "../lib/types";

// Epics of one project: active ones (エピック) and inactive ones (バックログ).
// Only name / description / state are shown; the document (context) is not loaded here.
export function BacklogView({
  projects,
  projectId,
  epics,
  onSelectProject,
  onAddBacklog,
}: {
  projects: Project[];
  projectId: string;
  epics: BacklogEpic[] | null;
  onSelectProject: (projectId: string) => void;
  onAddBacklog: (title: string, description: string | null) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderBottom: "1px solid #e5e8eb",
          background: "#fff",
          flexShrink: 0,
        }}
      >
        <label style={{ fontSize: 12, color: "#5f6b7a" }}>プロジェクト</label>
        <select
          value={projectId}
          onChange={(e) => onSelectProject(e.target.value)}
          style={{ fontSize: 13, padding: "4px 8px", borderRadius: 6, border: "1px solid #cbd2d9" }}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button onClick={() => setAdding(true)} style={{ ...primaryBtn, marginLeft: "auto" }}>
          バックログを追加
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, padding: 24, overflow: "auto", boxSizing: "border-box" }}>
        {!epics ? (
          <div style={{ color: "#5f6b7a" }}>読み込み中…</div>
        ) : epics.length === 0 ? (
          <div style={{ color: "#5f6b7a" }}>エピック・バックログがありません。「バックログを追加」から登録してください。</div>
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <th style={{ ...th, width: "30%" }}>名前</th>
                <th style={th}>説明</th>
                <th style={{ ...th, width: 160 }}>状態</th>
                <th style={{ ...th, width: 72 }} />
              </tr>
            </thead>
            <tbody>
              {epics.map((e) => {
                const active = e.activated_at != null;
                return (
                  <tr key={e.id}>
                    <td style={{ ...td, fontWeight: 600 }}>{e.title}</td>
                    <td style={{ ...td, color: e.description ? "#3b4149" : "#94a0ad" }}>
                      {e.description ?? "（説明なし）"}
                    </td>
                    <td style={td}>
                      <span style={active ? activeBadge : inactiveBadge}>
                        {active ? "エピック（Active）" : "バックログ（Inactive）"}
                      </span>
                    </td>
                    <td style={td}>
                      <Link to={`/epics/${e.id}`} style={detailBtn}>
                        詳細
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {adding && (
        <BacklogForm
          onSubmit={async (title, description) => {
            await onAddBacklog(title, description);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
}

// Name (required) and description. A new backlog item starts inactive; its context is written on the detail page.
function BacklogForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (title: string, description: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const trimmed = title.trim();

  const submit = async () => {
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const d = description.trim();
      await onSubmit(trimmed, d ? d : null);
    } catch {
      // Reported by the caller (error banner); keep the form open so the input is not lost.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={overlay} onMouseDown={onCancel}>
      <div style={dialog} onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>バックログを追加</h3>

        <label style={fieldLabel}>名前</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
            if (e.key === "Escape") onCancel();
          }}
          placeholder="例: ユーザー登録"
          style={textInput}
        />

        <label style={{ ...fieldLabel, marginTop: 14 }}>説明（任意）</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
          rows={3}
          placeholder="一覧に出す 1〜2 行の説明"
          style={{ ...textInput, resize: "vertical", fontFamily: "inherit" }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={onCancel} disabled={saving} style={secondaryBtn}>
            キャンセル
          </button>
          <button onClick={submit} disabled={!trimmed || saving} style={primaryBtn}>
            {saving ? "追加中…" : "追加"}
          </button>
        </div>
      </div>
    </div>
  );
}

const table: CSSProperties = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  background: "#fff",
  border: "1px solid #e5e8eb",
  borderRadius: 10,
  overflow: "hidden",
  fontSize: 13,
};

const th: CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 600,
  color: "#5f6b7a",
  background: "#f7f8f9",
  borderBottom: "1px solid #e5e8eb",
};

const td: CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #eef0f2",
  verticalAlign: "top",
  color: "#1f2933",
};

const primaryBtn: CSSProperties = {
  background: "#0972d3",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "6px 14px",
  fontSize: 13,
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  background: "#fff",
  color: "#3b4149",
  border: "1px solid #cbd2d9",
  borderRadius: 6,
  padding: "6px 14px",
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

const detailBtn: CSSProperties = {
  display: "inline-block",
  background: "#fff",
  color: "#3b4149",
  border: "1px solid #cbd2d9",
  borderRadius: 6,
  padding: "3px 10px",
  fontSize: 12,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const badge: CSSProperties = {
  display: "inline-block",
  fontSize: 12,
  padding: "2px 8px",
  borderRadius: 10,
  border: "1px solid",
  whiteSpace: "nowrap",
};

const activeBadge: CSSProperties = { ...badge, background: "#eaf2fc", color: "#0b4a8a", borderColor: "#0972d3" };
const inactiveBadge: CSSProperties = { ...badge, background: "#f4f5f6", color: "#5f6b7a", borderColor: "#cbd2d9" };
