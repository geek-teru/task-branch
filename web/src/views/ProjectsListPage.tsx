import { useState, type CSSProperties } from "react";
import type { Project } from "../lib/types";

type FormState = { mode: "create" } | { mode: "edit"; project: Project };

export function ProjectsListPage({
  projects,
  onCreate,
  onUpdate,
  onDelete,
  onShowGantt,
  onExport,
}: {
  projects: Project[];
  onCreate: (name: string, description: string | null) => void;
  onUpdate: (id: string, name: string, description: string | null) => void;
  onDelete: (id: string) => void;
  onShowGantt: (projectId: string) => void;
  onExport: (project: Project) => void;
}) {
  const [form, setForm] = useState<FormState | null>(null);

  const submit = (name: string, description: string | null) => {
    if (!form) return;
    if (form.mode === "create") onCreate(name, description);
    else onUpdate(form.project.id, name, description);
    setForm(null);
  };

  return (
    <div style={{ padding: 24, overflow: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>プロジェクト</h2>
        <button onClick={() => setForm({ mode: "create" })} style={primaryBtn}>
          新規プロジェクト
        </button>
      </div>

      {projects.length === 0 ? (
        <div style={{ color: "#5f6b7a" }}>
          プロジェクトがありません。「新規プロジェクト」から作成してください。
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          {projects.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                flexDirection: "column",
                textAlign: "left",
                background: "#fff",
                border: "1px solid #e5e8eb",
                borderRadius: 10,
                padding: 16,
                boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
              }}
            >
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: "#5f6b7a", minHeight: 16 }}>
                {p.description ?? "（説明なし）"}
              </div>
              <div style={{ fontSize: 11, color: "#94a0ad", marginTop: 10 }}>
                作成: {new Date(p.created_at).toLocaleDateString("ja-JP")}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
                <button onClick={() => setForm({ mode: "edit", project: p })} style={cardBtn}>
                  変更
                </button>
                <button onClick={() => onShowGantt(p.id)} style={cardBtn}>
                  ガントチャート
                </button>
                <button onClick={() => onExport(p)} style={cardBtn}>
                  JSONエクスポート
                </button>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        `プロジェクト「${p.name}」を削除します。\n配下のエピック・ストーリー・タスク・依存関係もすべて削除されます。よろしいですか？`
                      )
                    ) {
                      onDelete(p.id);
                    }
                  }}
                  style={dangerBtn}
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <ProjectForm
          initial={form.mode === "edit" ? form.project : null}
          onSubmit={submit}
          onCancel={() => setForm(null)}
        />
      )}
    </div>
  );
}

function ProjectForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: Project | null;
  onSubmit: (name: string, description: string | null) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const trimmedName = name.trim();

  const handleSubmit = () => {
    if (!trimmedName) return;
    const d = description.trim();
    onSubmit(trimmedName, d ? d : null);
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
            if (e.key === "Enter") handleSubmit();
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

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
          <button onClick={onCancel} style={cardBtn}>
            キャンセル
          </button>
          <button onClick={handleSubmit} disabled={!trimmedName} style={primaryBtn}>
            {initial ? "保存" : "作成"}
          </button>
        </div>
      </div>
    </div>
  );
}

const primaryBtn: CSSProperties = {
  marginLeft: "auto",
  background: "#0972d3",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "7px 14px",
  fontSize: 13,
  cursor: "pointer",
};

const cardBtn: CSSProperties = {
  background: "#fff",
  color: "#3b4149",
  border: "1px solid #cbd2d9",
  borderRadius: 6,
  padding: "5px 10px",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const dangerBtn: CSSProperties = {
  ...cardBtn,
  marginLeft: "auto",
  color: "#a3210b",
  borderColor: "#f0c2ba",
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
