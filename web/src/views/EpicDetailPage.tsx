import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  addStory,
  getEpic,
  getLatestContextRevision,
  listStories,
  setEpicActive,
  updateEpicContext,
  updateEpicInfo,
} from "../lib/api";
import type { ContextRevision, Project, StoryInput, Task } from "../lib/types";
import { STATUS_LABEL } from "../lib/types";
import { STATUS_COLOR } from "../lib/style";
import { TaskForm } from "../components/TaskForm";
import { IdBadge } from "../components/IdBadge";
import { EpicStateBadge } from "../components/EpicStateBadge";
import { ConfirmDialog } from "../components/ConfirmDialog";

// Epic detail: view / edit the context document and add stories.
// Loads its own data through the api layer (the epic's context is only needed here).
export function EpicDetailPage({
  epicId,
  projects,
  onError,
}: {
  epicId: string;
  projects: Project[];
  onError: (message: string) => void;
}) {
  const [epic, setEpic] = useState<Task | null | undefined>(undefined); // undefined = loading
  const [stories, setStories] = useState<Task[]>([]);
  const [revision, setRevision] = useState<ContextRevision | null>(null);
  const [draft, setDraft] = useState<string | null>(null); // non-null while editing
  const [saving, setSaving] = useState(false);
  const [addingStory, setAddingStory] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [pendingState, setPendingState] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      const [e, s, r] = await Promise.all([getEpic(epicId), listStories(epicId), getLatestContextRevision(epicId)]);
      setEpic(e);
      setStories(s);
      setRevision(r);
    } catch (err: any) {
      onError(String(err.message ?? err));
    }
  }, [epicId, onError]);

  useEffect(() => {
    setEpic(undefined);
    setDraft(null);
    load();
  }, [load]);

  if (epic === undefined) return <div style={{ padding: 24, color: "#5f6b7a" }}>読み込み中…</div>;
  if (epic === null) return <div style={{ padding: 24, color: "#5f6b7a" }}>エピックが見つかりません。</div>;

  const project = projects.find((p) => p.id === epic.project_id);
  const active = epic.activated_at != null;
  const editing = draft !== null;
  const dirty = editing && draft !== (epic.context ?? "");

  const save = async () => {
    if (draft === null) return;
    setSaving(true);
    try {
      await updateEpicContext(epic.id, draft.trim() === "" ? null : draft);
      setDraft(null);
      await load();
    } catch (err: any) {
      onError(String(err.message ?? err));
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (dirty && !window.confirm("編集中の内容を破棄します。よろしいですか？")) return;
    setDraft(null);
  };

  const changeState = async (next: boolean) => {
    try {
      await setEpicActive(epic.id, next);
      setPendingState(null);
      await load();
    } catch (err: any) {
      onError(String(err.message ?? err));
    }
  };

  // 名前と説明の変更。コンテキストの編集とは別。
  const submitInfo = async (title: string, description: string | null) => {
    try {
      await updateEpicInfo(epic.id, title, description);
      setEditingInfo(false);
      await load();
    } catch (err: any) {
      onError(String(err.message ?? err));
    }
  };

  const submitStory = async (values: StoryInput) => {
    setAddingStory(false);
    try {
      await addStory(epic, values);
      await load();
    } catch (err: any) {
      onError(String(err.message ?? err));
    }
  };

  return (
    <div style={{ height: "100%", overflow: "auto", padding: 24, boxSizing: "border-box" }}>
      <Link to={`/backlog?project=${epic.project_id}`} style={{ fontSize: 12, color: "#0972d3", textDecoration: "none" }}>
        ← バックログ{project ? `（${project.name}）` : ""}
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 6px" }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{epic.title}</h2>
        <EpicStateBadge active={active} onPick={(next) => setPendingState(next)} />
        <IdBadge id={epic.id} />
        <button onClick={() => setEditingInfo(true)} style={{ ...btn, marginLeft: "auto" }}>
          変更
        </button>
      </div>
      <div style={{ fontSize: 13, color: epic.description ? "#3b4149" : "#94a0ad" }}>
        {epic.description ?? "（説明なし）"}
      </div>

      <section style={card}>
        <div style={cardHeader}>
          <h3 style={h3}>コンテキスト</h3>
          <span style={{ fontSize: 11, color: "#94a0ad" }}>
            {revision
              ? `版 ${revision.version}・${new Date(revision.created_at).toLocaleString("ja-JP")}・${revision.edited_by_type === "ai" ? "AI" : "人"}が更新`
              : "未作成"}
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            {editing ? (
              <>
                <button onClick={cancel} disabled={saving} style={btn}>
                  キャンセル
                </button>
                <button onClick={save} disabled={saving || !dirty} style={primaryBtn}>
                  {saving ? "保存中…" : "保存"}
                </button>
              </>
            ) : (
              <button onClick={() => setDraft(epic.context ?? "")} style={btn}>
                編集
              </button>
            )}
          </div>
        </div>
        {editing ? (
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={20}
            placeholder={"## 背景・課題\n\n## ゴール\n\n## スコープと非スコープ\n\n## 方針\n\n## 決定事項\n\n## 未決事項"}
            style={textarea}
          />
        ) : epic.context ? (
          <pre style={contextView}>{epic.context}</pre>
        ) : (
          <div style={{ fontSize: 13, color: "#94a0ad", padding: "8px 0" }}>
            コンテキストがまだありません。「編集」から、背景・課題、ゴール、方針などを書いてください。
          </div>
        )}
      </section>

      <section style={card}>
        <div style={cardHeader}>
          <h3 style={h3}>ストーリー</h3>
          <span style={{ fontSize: 11, color: "#94a0ad" }}>{stories.length} 件</span>
          <button onClick={() => setAddingStory(true)} style={{ ...primaryBtn, marginLeft: "auto" }}>
            ストーリーを追加
          </button>
        </div>
        {stories.length === 0 ? (
          <div style={{ fontSize: 13, color: "#94a0ad", padding: "8px 0" }}>ストーリーはまだありません。</div>
        ) : (
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>名前</th>
                <th style={{ ...th, width: 96 }}>ID</th>
                <th style={{ ...th, width: 110 }}>状態</th>
                <th style={{ ...th, width: 200 }}>期間</th>
              </tr>
            </thead>
            <tbody>
              {stories.map((s) => {
                const c = STATUS_COLOR[s.status];
                return (
                  <tr key={s.id}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{s.title}</div>
                      {s.description && <div style={{ fontSize: 12, color: "#5f6b7a", marginTop: 2 }}>{s.description}</div>}
                    </td>
                    <td style={td}>
                      <IdBadge id={s.id} />
                    </td>
                    <td style={td}>
                      <span style={{ ...badge, background: c.bg, color: c.fg, borderColor: c.border }}>{STATUS_LABEL[s.status]}</span>
                    </td>
                    <td style={{ ...td, color: "#5f6b7a" }}>
                      {s.start_date || s.due_date ? `${s.start_date ?? "—"} 〜 ${s.due_date ?? "—"}` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {pendingState !== null && (
        <ConfirmDialog
          message={
            pendingState
              ? `「${epic.title}」を Active にします。エピックとして着手した扱いになります。よろしいですか？`
              : `「${epic.title}」を InActive にします。バックログに戻ります。よろしいですか？`
          }
          onConfirm={() => changeState(pendingState)}
          onCancel={() => setPendingState(null)}
        />
      )}

      {editingInfo && (
        <EpicInfoForm
          initialTitle={epic.title}
          initialDescription={epic.description}
          onSubmit={submitInfo}
          onCancel={() => setEditingInfo(false)}
        />
      )}

      {addingStory && (
        <TaskForm
          heading={`ストーリーを追加（${epic.title}）`}
          submitLabel="追加"
          initial={{ title: "", status: "todo", start_date: null, due_date: null, description: null }}
          onSubmit={submitStory}
          onCancel={() => setAddingStory(false)}
        />
      )}
    </div>
  );
}

// 名前（必須）と説明。コンテキストは詳細画面のエディタで編集する。
function EpicInfoForm({
  initialTitle,
  initialDescription,
  onSubmit,
  onCancel,
}: {
  initialTitle: string;
  initialDescription: string | null;
  onSubmit: (title: string, description: string | null) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription ?? "");
  const [saving, setSaving] = useState(false);
  const trimmed = title.trim();

  const submit = async () => {
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const d = description.trim();
      await onSubmit(trimmed, d ? d : null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={overlay} onMouseDown={onCancel}>
      <div style={dialog} onMouseDown={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>エピックを変更</h3>

        <label style={fieldLabel}>名前</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
            if (e.key === "Escape") onCancel();
          }}
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
          <button onClick={onCancel} disabled={saving} style={btn}>
            キャンセル
          </button>
          <button onClick={submit} disabled={!trimmed || saving} style={primaryBtn}>
            {saving ? "保存中…" : "保存"}
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

const card: CSSProperties = {
  marginTop: 20,
  background: "#fff",
  border: "1px solid #e5e8eb",
  borderRadius: 10,
  padding: 16,
};

const cardHeader: CSSProperties = { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 };

const h3: CSSProperties = { margin: 0, fontSize: 15 };

const btn: CSSProperties = {
  background: "#fff",
  color: "#3b4149",
  border: "1px solid #cbd2d9",
  borderRadius: 6,
  padding: "5px 12px",
  fontSize: 12,
  cursor: "pointer",
};

const primaryBtn: CSSProperties = { ...btn, background: "#0972d3", color: "#fff", borderColor: "#0972d3" };

const textarea: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 13,
  lineHeight: 1.6,
  padding: "10px 12px",
  borderRadius: 6,
  border: "1px solid #cbd2d9",
  resize: "vertical",
};

const contextView: CSSProperties = {
  margin: 0,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 13,
  lineHeight: 1.6,
  color: "#1f2933",
  background: "#f7f8f9",
  borderRadius: 6,
  padding: "10px 12px",
};

const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th: CSSProperties = {
  textAlign: "left",
  padding: "6px 8px",
  fontSize: 12,
  fontWeight: 600,
  color: "#5f6b7a",
  borderBottom: "1px solid #e5e8eb",
};
const td: CSSProperties = { padding: "8px", borderBottom: "1px solid #eef0f2", verticalAlign: "top" };

const badge: CSSProperties = {
  display: "inline-block",
  fontSize: 12,
  padding: "2px 8px",
  borderRadius: 10,
  border: "1px solid",
  whiteSpace: "nowrap",
};
