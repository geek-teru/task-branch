import { useState, type CSSProperties } from "react";
import type { Project, ProjectInput } from "../lib/types";
import { ProjectForm } from "../components/ProjectForm";

// Project list: navigate only. Editing / deleting / exporting lives on the detail page.
export function ProjectsListPage({
  projects,
  onCreate,
  onShowDetail,
  onShowBacklog,
  onShowGantt,
  onShowKanban,
}: {
  projects: Project[];
  onCreate: (input: ProjectInput) => void;
  onShowDetail: (projectId: string) => void;
  onShowBacklog: (projectId: string) => void;
  onShowGantt: (projectId: string) => void;
  onShowKanban: (projectId: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const inactiveCount = projects.filter((p) => !p.is_active).length;
  const visible = showInactive ? projects : projects.filter((p) => p.is_active);

  return (
    <div style={{ padding: 24, overflow: "auto", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>プロジェクト</h2>
        {inactiveCount > 0 && (
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#5f6b7a" }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            InActive も表示（{inactiveCount}）
          </label>
        )}
        <button onClick={() => setCreating(true)} style={primaryBtn}>
          新規プロジェクト
        </button>
      </div>

      {visible.length === 0 ? (
        <div style={{ color: "#5f6b7a" }}>
          {projects.length === 0
            ? "プロジェクトがありません。「新規プロジェクト」から作成してください。"
            : "アクティブなプロジェクトがありません。「InActive も表示」で確認できます。"}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 12,
          }}
        >
          {visible.map((p) => (
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
                opacity: p.is_active ? 1 : 0.7,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => onShowDetail(p.id)} title="詳細を開く" style={nameBtn}>
                  {p.name}
                </button>
                {!p.is_active && <span style={inactiveBadge}>InActive</span>}
              </div>
              <div style={{ fontSize: 12, color: "#5f6b7a", minHeight: 16, marginTop: 4 }}>
                {p.description ?? "（説明なし）"}
              </div>
              {(p.url || p.repository_url) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noreferrer" style={linkStyle} title={p.url}>
                      サイト
                    </a>
                  )}
                  {p.repository_url && (
                    <a href={p.repository_url} target="_blank" rel="noreferrer" style={linkStyle} title={p.repository_url}>
                      リポジトリ
                    </a>
                  )}
                </div>
              )}
              <div style={{ fontSize: 11, color: "#94a0ad", marginTop: 10 }}>
                作成: {new Date(p.created_at).toLocaleDateString("ja-JP")}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
                <button onClick={() => onShowBacklog(p.id)} style={cardBtn}>
                  バックログ
                </button>
                <button onClick={() => onShowGantt(p.id)} style={cardBtn}>
                  ガントチャート
                </button>
                <button onClick={() => onShowKanban(p.id)} style={cardBtn}>
                  カンバン
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <ProjectForm
          initial={null}
          onSubmit={(input) => {
            onCreate(input);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      )}
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

const nameBtn: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  textAlign: "left",
  fontWeight: 600,
  fontSize: 15,
  color: "#0972d3",
  cursor: "pointer",
};

const linkStyle: CSSProperties = {
  fontSize: 12,
  color: "#0972d3",
  textDecoration: "none",
  whiteSpace: "nowrap",
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

const inactiveBadge: CSSProperties = {
  fontSize: 10,
  borderRadius: 999,
  padding: "1px 8px",
  background: "#f2f3f4",
  color: "#5f6b7a",
  border: "1px solid #d5dbdb",
  whiteSpace: "nowrap",
};
