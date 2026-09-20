import { useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Project, ProjectInput } from "../lib/types";
import { ProjectForm } from "../components/ProjectForm";
import { IdBadge } from "../components/IdBadge";

// Project detail: view / edit the project itself. Everything except 変更 lives in
// the "…" menu next to it (jump to a view, export, archive, delete).
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

  const archive = () => {
    const message = project.is_active
      ? `プロジェクト「${project.name}」をアーカイブします。\nガントチャート・カンバン・バックログの選択肢から外れます。よろしいですか？`
      : `プロジェクト「${project.name}」をアクティブに戻します。よろしいですか？`;
    if (window.confirm(message)) onSetActive(project.id, !project.is_active);
  };

  const remove = () => {
    if (
      window.confirm(
        `プロジェクト「${project.name}」を削除します。\n配下のエピック・ストーリー・タスク・依存関係もすべて削除されます。よろしいですか？`
      )
    ) {
      onDelete(project.id);
    }
  };

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

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setEditing(true)} style={btn}>
            変更
          </button>
          <ActionMenu
            items={[
              { label: "バックログ", onSelect: () => onShowBacklog(project.id) },
              { label: "ガントチャート", onSelect: () => onShowGantt(project.id) },
              { label: "カンバン", onSelect: () => onShowKanban(project.id) },
              { label: "JSONエクスポート", onSelect: () => onExport(project), separated: true },
              { label: project.is_active ? "アーカイブする" : "アクティブに戻す", onSelect: archive },
              { label: "削除", onSelect: remove, danger: true },
            ]}
          />
        </div>
      </div>
      <div style={{ fontSize: 13, color: project.description ? "#3b4149" : "#94a0ad" }}>
        {project.description ?? "（説明なし）"}
      </div>

      <section style={card}>
        <div style={cardHeader}>
          <h3 style={h3}>基本情報</h3>
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

type ActionItem = { label: string; onSelect: () => void; danger?: boolean; separated?: boolean };

// "…" button: the project's actions, collapsed into one pulldown.
function ActionMenu({ items }: { items: ActionItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="そのほかの操作"
        aria-label="そのほかの操作"
        style={{ ...btn, padding: "5px 10px", lineHeight: "14px", fontSize: 14 }}
      >
        …
      </button>
      {open && (
        <>
          {/* click-away closes the menu */}
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 19 }} />
          <div style={menu}>
            {items.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 12px",
                  border: "none",
                  borderTop: item.separated ? "1px solid #e5e8eb" : "none",
                  marginTop: item.separated ? 4 : 0,
                  paddingTop: item.separated ? 10 : 6,
                  borderRadius: 4,
                  background: "transparent",
                  color: item.danger ? "#a3210b" : "#1f2933",
                  fontSize: 12,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const DASH = <span style={{ color: "#94a0ad" }}>—</span>;

function Field({ label, children }: { label: string; children: ReactNode }) {
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

const menu: CSSProperties = {
  position: "absolute",
  right: 0,
  top: "calc(100% + 4px)",
  zIndex: 20,
  minWidth: 160,
  background: "#fff",
  border: "1px solid #cbd2d9",
  borderRadius: 6,
  boxShadow: "0 4px 12px rgba(31,41,51,0.18)",
  padding: 4,
};

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
