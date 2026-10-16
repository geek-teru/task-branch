import { useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { BacklogStory, Project } from "../lib/types";
import { STATUS_LABEL } from "../lib/types";
import { STATUS_COLOR } from "../lib/style";
import { useResizableWidth, resizeHandleStyle } from "../lib/useResizableWidth";
import { EpicStateBadge } from "../components/EpicStateBadge";
import { ConfirmDialog } from "../components/ConfirmDialog";

// Stories of one project: active ones and inactive ones (バックログ).
// Only name / description / status / state are shown; the document (context) is not loaded here.
export function BacklogView({
  projects,
  projectId,
  stories,
  onSelectProject,
  onAddBacklog,
  onSetActive,
}: {
  projects: Project[];
  projectId: string;
  stories: BacklogStory[] | null;
  onSelectProject: (projectId: string) => void;
  onAddBacklog: (title: string, description: string | null) => Promise<void>;
  onSetActive: (storyId: string, active: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [pendingState, setPendingState] = useState<{ story: BacklogStory; active: boolean } | null>(null);
  // 名前・ステータス・状態はドラッグで幅を変えられる。説明は残り幅を使う。
  const name = useResizableWidth("backlog.nameWidth", 320, 160, 720);
  const status = useResizableWidth("backlog.statusWidth", 96, 72, 240, { invert: true });
  const state = useResizableWidth("backlog.stateWidth", 96, 72, 240, { invert: true });
  // 状態での絞り込み。all = 両方出す
  const [stateFilter, setStateFilter] = useState<"all" | "active" | "inactive">("all");

  const visible = useMemo(() => {
    if (!stories) return null;
    if (stateFilter === "all") return stories;
    return stories.filter((s) => (stateFilter === "active" ? s.activated_at != null : s.activated_at == null));
  }, [stories, stateFilter]);

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
        <label style={{ fontSize: 12, color: "#5f6b7a", marginLeft: 8 }}>状態</label>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as "all" | "active" | "inactive")}
          style={{ fontSize: 13, padding: "4px 8px", borderRadius: 6, border: "1px solid #cbd2d9" }}
        >
          <option value="all">すべて</option>
          <option value="active">Active</option>
          <option value="inactive">InActive</option>
        </select>
        <button onClick={() => setAdding(true)} style={{ ...primaryBtn, marginLeft: "auto" }}>
          バックログを追加
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, padding: 24, overflow: "auto", boxSizing: "border-box" }}>
        {!visible ? (
          <div style={{ color: "#5f6b7a" }}>読み込み中…</div>
        ) : stories!.length === 0 ? (
          <div style={{ color: "#5f6b7a" }}>ストーリーがありません。「バックログを追加」から登録してください。</div>
        ) : visible.length === 0 ? (
          <div style={{ color: "#5f6b7a" }}>
            {stateFilter === "active" ? "Active" : "InActive"}のストーリーはありません。
          </div>
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <th style={{ ...th, width: name.width, position: "relative" }}>
                  名前
                  <div onMouseDown={name.startResize} title="ドラッグで幅を変更" style={{ ...resizeHandleStyle, right: -3 }} />
                </th>
                <th style={th}>説明</th>
                <th style={{ ...th, width: status.width, position: "relative" }}>
                  ステータス
                  <div onMouseDown={status.startResize} title="ドラッグで幅を変更" style={{ ...resizeHandleStyle, left: -3 }} />
                </th>
                <th style={{ ...th, width: state.width, position: "relative" }}>
                  状態
                  <div onMouseDown={state.startResize} title="ドラッグで幅を変更" style={{ ...resizeHandleStyle, left: -3 }} />
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => {
                const active = s.activated_at != null;
                const c = STATUS_COLOR[s.status];
                return (
                  <tr key={s.id}>
                    <td style={{ ...td, position: "relative" }}>
                      <Link to={`/stories/${s.id}`} style={titleLink} title="詳細を開く">
                        {s.title}
                      </Link>
                      <div onMouseDown={name.startResize} title="ドラッグで幅を変更" style={{ ...resizeHandleStyle, right: -3 }} />
                    </td>
                    <td style={{ ...td, color: s.description ? "#3b4149" : "#94a0ad" }}>
                      {s.description ?? "（説明なし）"}
                    </td>
                    <td style={{ ...td, position: "relative" }}>
                      <span style={{ ...statusBadge, background: c.bg, color: c.fg, borderColor: c.border }}>
                        {STATUS_LABEL[s.status]}
                      </span>
                      <div onMouseDown={status.startResize} title="ドラッグで幅を変更" style={{ ...resizeHandleStyle, left: -3 }} />
                    </td>
                    <td style={{ ...td, position: "relative" }}>
                      <EpicStateBadge
                        active={active}
                        onPick={(next) => setPendingState({ story: s, active: next })}
                      />
                      <div onMouseDown={state.startResize} title="ドラッグで幅を変更" style={{ ...resizeHandleStyle, left: -3 }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {pendingState && (
        <ConfirmDialog
          message={
            pendingState.active
              ? `「${pendingState.story.title}」を Active にします。ストーリーとして着手した扱いになります。よろしいですか？`
              : `「${pendingState.story.title}」を InActive にします。バックログに戻ります。よろしいですか？`
          }
          onConfirm={() => {
            onSetActive(pendingState.story.id, pendingState.active);
            setPendingState(null);
          }}
          onCancel={() => setPendingState(null)}
        />
      )}

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
  tableLayout: "fixed",
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

const statusBadge: CSSProperties = {
  display: "inline-block",
  fontSize: 12,
  padding: "2px 8px",
  borderRadius: 10,
  border: "1px solid",
  whiteSpace: "nowrap",
};

const titleLink: CSSProperties = {
  color: "#0972d3",
  fontWeight: 600,
  textDecoration: "none",
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

