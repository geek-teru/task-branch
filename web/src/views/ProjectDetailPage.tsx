import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Project, ProjectInput } from "../lib/types";
import { ProjectForm } from "../components/ProjectForm";
import { IdBadge } from "../components/IdBadge";

type Tile = { key: string; title: string; note: string; onOpen: (projectId: string) => void };

// Project detail: the project's home. Header + metadata, big links into the three views,
// and the destructive actions kept apart at the bottom.
export function ProjectDetailPage({
  project,
  onUpdate,
  onDelete,
  onSetActive,
  onExport,
  onShowBacklog,
  onShowGantt,
  onShowKanban,
}: {
  project: Project;
  onUpdate: (id: string, input: ProjectInput) => void;
  onDelete: (id: string) => void;
  onSetActive: (id: string, isActive: boolean) => void;
  onExport: (project: Project) => void;
  onShowBacklog: (projectId: string) => void;
  onShowGantt: (projectId: string) => void;
  onShowKanban: (projectId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const tiles: Tile[] = [
    { key: "backlog", title: "バックログ", note: "エピックとバックログの一覧", onOpen: onShowBacklog },
    { key: "gantt", title: "ガントチャート", note: "エピックとストーリーの期間", onOpen: onShowGantt },
    { key: "kanban", title: "カンバン", note: "進行中ストーリーのタスク", onOpen: onShowKanban },
  ];

  return (
    <div style={{ height: "100%", overflow: "auto", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 880, padding: "20px 24px 40px" }}>
        <Link to="/projects" style={{ fontSize: 12, color: "#0972d3", textDecoration: "none" }}>
          ← プロジェクト
        </Link>

        {/* header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, margin: "12px 0 0" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>{project.name}</h2>
              {!project.is_active && <span style={inactiveBadge}>アーカイブ済み</span>}
              <IdBadge id={project.id} />
            </div>
            <div style={{ fontSize: 13, color: project.description ? "#5f6b7a" : "#94a0ad", marginTop: 6 }}>
              {project.description ?? "（説明なし）"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={() => setEditing(true)} style={btn}>
              変更
            </button>
            <button onClick={() => onExport(project)} style={btn}>
              JSONエクスポート
            </button>
          </div>
        </div>

        {/* metadata */}
        <div style={metaRow}>
          <Meta label="サイト">
            {project.url ? (
              <a href={project.url} target="_blank" rel="noreferrer" style={link} title={project.url}>
                {hostOf(project.url)}
              </a>
            ) : (
              DASH
            )}
          </Meta>
          <Meta label="リポジトリ">
            {project.repository_url ? (
              <a href={project.repository_url} target="_blank" rel="noreferrer" style={link} title={project.repository_url}>
                {repoOf(project.repository_url)}
              </a>
            ) : (
              DASH
            )}
          </Meta>
          <Meta label="作成">{fmt(project.created_at)}</Meta>
          <Meta label="更新">{fmt(project.updated_at)}</Meta>
        </div>

        {/* views */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 20 }}>
          {tiles.map((t) => {
            const on = hovered === t.key;
            return (
              <button
                key={t.key}
                onClick={() => t.onOpen(project.id)}
                onMouseEnter={() => setHovered(t.key)}
                onMouseLeave={() => setHovered((cur) => (cur === t.key ? null : cur))}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  textAlign: "left",
                  background: "#fff",
                  border: `1px solid ${on ? "#0972d3" : "#e5e8eb"}`,
                  borderRadius: 10,
                  padding: "14px 16px",
                  cursor: "pointer",
                  boxShadow: on ? "0 2px 8px rgba(9,114,211,0.12)" : "0 1px 2px rgba(0,0,0,0.04)",
                  transition: "border-color 120ms, box-shadow 120ms",
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#1f2933" }}>{t.title}</span>
                  <span style={{ display: "block", fontSize: 11, color: "#94a0ad", marginTop: 3 }}>{t.note}</span>
                </span>
                <span style={{ fontSize: 14, color: on ? "#0972d3" : "#cbd2d9" }}>→</span>
              </button>
            );
          })}
        </div>

        {/* archive / delete */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginTop: 28,
            paddingTop: 14,
            borderTop: "1px solid #e5e8eb",
          }}
        >
          <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: "#94a0ad" }}>
            {project.is_active
              ? "アーカイブすると、ガントチャート・カンバン・バックログの選択肢から外れます。"
              : "アーカイブ中です。アクティブに戻すと各画面の選択肢に再び表示されます。"}
          </div>
          <button
            onClick={() => {
              const message = project.is_active
                ? `プロジェクト「${project.name}」をアーカイブします。\nガントチャート・カンバン・バックログの選択肢から外れます。よろしいですか？`
                : `プロジェクト「${project.name}」をアクティブに戻します。よろしいですか？`;
              if (window.confirm(message)) onSetActive(project.id, !project.is_active);
            }}
            style={quietBtn}
          >
            {project.is_active ? "アーカイブする" : "アクティブに戻す"}
          </button>
          <button
            onClick={() => {
              if (
                window.confirm(
                  `プロジェクト「${project.name}」を削除します。\n配下のエピック・ストーリー・タスク・依存関係もすべて削除されます。よろしいですか？`
                )
              ) {
                onDelete(project.id);
              }
            }}
            style={{ ...quietBtn, color: "#a3210b" }}
          >
            削除
          </button>
        </div>
      </div>

      {editing && (
        <ProjectForm
          initial={project}
          onSubmit={(input) => {
            onUpdate(project.id, input);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}

const DASH = <span style={{ color: "#94a0ad" }}>—</span>;

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "#94a0ad", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: "#3b4149", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {children}
      </div>
    </div>
  );
}

// Show links short: the host for a site, owner/repo for a repository.
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function repoOf(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/^\/|\/$/g, "");
    return path || url;
  } catch {
    return url;
  }
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
}

const metaRow: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 16,
  marginTop: 16,
  padding: "12px 16px",
  background: "#fff",
  border: "1px solid #e5e8eb",
  borderRadius: 10,
};

const link: CSSProperties = { color: "#0972d3", textDecoration: "none" };

const btn: CSSProperties = {
  background: "#fff",
  color: "#3b4149",
  border: "1px solid #cbd2d9",
  borderRadius: 6,
  padding: "5px 12px",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const quietBtn: CSSProperties = {
  background: "none",
  border: "none",
  padding: "4px 6px",
  fontSize: 12,
  color: "#5f6b7a",
  cursor: "pointer",
  whiteSpace: "nowrap",
  textDecoration: "underline",
};

const inactiveBadge: CSSProperties = {
  fontSize: 11,
  borderRadius: 999,
  padding: "2px 10px",
  background: "#f2f3f4",
  color: "#5f6b7a",
  border: "1px solid #d5dbdb",
  whiteSpace: "nowrap",
};
