import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { Project, ProjectInput } from "../lib/types";
import { ProjectForm } from "../components/ProjectForm";
import { IdBadge } from "../components/IdBadge";

// Project detail: the place to edit / archive / delete / export one project.
// The list page only navigates; everything that changes a project lives here.
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

  return (
    <div style={{ height: "100%", overflow: "auto", padding: 24, boxSizing: "border-box" }}>
      <Link to="/projects" style={{ fontSize: 12, color: "#0972d3", textDecoration: "none" }}>
        ← プロジェクト
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 6px" }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{project.name}</h2>
        <span style={project.is_active ? activeBadge : inactiveBadge}>
          {project.is_active ? "Active" : "InActive（アーカイブ）"}
        </span>
        <IdBadge id={project.id} />
      </div>
      <div style={{ fontSize: 13, color: project.description ? "#3b4149" : "#94a0ad" }}>
        {project.description ?? "（説明なし）"}
      </div>

      <section style={card}>
        <div style={cardHeader}>
          <h3 style={h3}>表示</h3>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button onClick={() => onShowBacklog(project.id)} style={btn}>
            バックログ
          </button>
          <button onClick={() => onShowGantt(project.id)} style={btn}>
            ガントチャート
          </button>
          <button onClick={() => onShowKanban(project.id)} style={btn}>
            カンバン
          </button>
        </div>
      </section>

      <section style={card}>
        <div style={cardHeader}>
          <h3 style={h3}>基本情報</h3>
          <button onClick={() => setEditing(true)} style={{ ...btn, marginLeft: "auto" }}>
            変更
          </button>
        </div>
        <Field label="URL">
          {project.url ? (
            <a href={project.url} target="_blank" rel="noreferrer" style={link}>
              {project.url}
            </a>
          ) : (
            DASH
          )}
        </Field>
        <Field label="リポジトリ">
          {project.repository_url ? (
            <a href={project.repository_url} target="_blank" rel="noreferrer" style={link}>
              {project.repository_url}
            </a>
          ) : (
            DASH
          )}
        </Field>
        <Field label="作成日時">{fmt(project.created_at)}</Field>
        <Field label="更新日時">{fmt(project.updated_at)}</Field>
      </section>

      <section style={card}>
        <div style={cardHeader}>
          <h3 style={h3}>操作</h3>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button onClick={() => onExport(project)} style={btn}>
            JSONエクスポート
          </button>
          <button
            onClick={() => {
              const message = project.is_active
                ? `プロジェクト「${project.name}」をアーカイブします。\nガントチャート・カンバン・バックログの選択肢から外れます。よろしいですか？`
                : `プロジェクト「${project.name}」をアクティブに戻します。よろしいですか？`;
              if (window.confirm(message)) onSetActive(project.id, !project.is_active);
            }}
            style={btn}
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
            style={{ ...btn, marginLeft: "auto", color: "#a3210b", borderColor: "#f0c2ba" }}
          >
            削除
          </button>
        </div>
      </section>

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "5px 0", fontSize: 13 }}>
      <div style={{ width: 96, flexShrink: 0, color: "#94a0ad", fontSize: 12, fontWeight: 600 }}>{label}</div>
      <div style={{ minWidth: 0, wordBreak: "break-all" }}>{children}</div>
    </div>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
}

const card: CSSProperties = {
  marginTop: 20,
  background: "#fff",
  border: "1px solid #e5e8eb",
  borderRadius: 10,
  padding: 16,
  maxWidth: 720,
};

const cardHeader: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 12,
};

const h3: CSSProperties = { margin: 0, fontSize: 14 };

const link: CSSProperties = { color: "#0972d3", textDecoration: "none" };

const btn: CSSProperties = {
  background: "#fff",
  color: "#3b4149",
  border: "1px solid #cbd2d9",
  borderRadius: 6,
  padding: "5px 10px",
  fontSize: 12,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const badgeBase: CSSProperties = {
  fontSize: 11,
  borderRadius: 999,
  padding: "2px 10px",
  border: "1px solid",
  whiteSpace: "nowrap",
};

const activeBadge: CSSProperties = {
  ...badgeBase,
  background: "#e8f3ff",
  color: "#0972d3",
  borderColor: "#b5d6f7",
};

const inactiveBadge: CSSProperties = {
  ...badgeBase,
  background: "#f2f3f4",
  color: "#5f6b7a",
  borderColor: "#d5dbdb",
};
