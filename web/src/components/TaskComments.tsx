import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { addTaskComment, deleteTaskComment, listTaskComments, updateTaskComment } from "../lib/api";
import type { TaskComment } from "../lib/types";
import { useSession } from "../lib/useSession";
import { ConfirmDialog } from "./ConfirmDialog";

const fmtDateTime = (s: string) => new Date(s).toLocaleString("ja-JP");

// Comment list + post form for a task, shown at the bottom of the detail panel.
// Fetches on mount / task change and after posting, editing or deleting (no realtime subscription).
export function TaskComments({ taskId }: { taskId: string }) {
  const session = useSession();
  const myId = session?.user.id ?? null;
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One comment is edited at a time.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setComments(await listTaskComments(taskId));
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;
    setComments([]);
    setDraft("");
    setError(null);
    setEditingId(null);
    setEditDraft("");
    setDeletingId(null);
    listTaskComments(taskId)
      .then((list) => !cancelled && setComments(list))
      .catch((e) => !cancelled && setError(`コメントを取得できませんでした: ${e.message ?? e}`));
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const body = draft.trim();
  const canPost = body.length > 0 && !posting;

  async function post() {
    if (!canPost) return;
    setPosting(true);
    setError(null);
    try {
      await addTaskComment(taskId, body);
      setDraft("");
      await reload();
    } catch (e) {
      setError(`投稿できませんでした: ${(e as Error).message ?? e}`);
    } finally {
      setPosting(false);
    }
  }

  // Mirrors the RLS (author_id and author_type both match). The web app always acts as a human.
  // This only decides which buttons to show; RLS has the final say.
  const canModify = (c: TaskComment) => !!myId && c.author_id === myId && c.author_type === "human";

  const editing = comments.find((c) => c.id === editingId) ?? null;
  const editBody = editDraft.trim();
  const canSave = !!editing && editBody.length > 0 && editBody !== editing.body && !saving;

  function startEdit(c: TaskComment) {
    setEditingId(c.id);
    setEditDraft(c.body);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
  }

  async function save() {
    if (!canSave || !editing) return;
    setSaving(true);
    setError(null);
    try {
      await updateTaskComment(editing.id, editBody);
      cancelEdit();
      await reload();
    } catch (e) {
      setError(`編集できませんでした: ${(e as Error).message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setDeletingId(null);
    setError(null);
    try {
      await deleteTaskComment(id);
      if (editingId === id) cancelEdit();
      await reload();
    } catch (e) {
      setError(`削除できませんでした: ${(e as Error).message ?? e}`);
    }
  }

  const authorLabel = (c: TaskComment) =>
    myId && c.author_id === myId ? "自分" : c.author_type === "ai" ? "AI" : "人";

  return (
    <div style={{ marginTop: 4, paddingTop: 12, borderTop: "1px solid #e5e8eb" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#94a0ad", marginBottom: 6 }}>
        コメント（{comments.length}）
      </div>

      {comments.map((c) => (
        <div key={c.id} style={{ marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "baseline", fontSize: 11, color: "#5f6b7a", marginBottom: 2 }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600, color: "#3b4149" }}>{authorLabel(c)}</span>
              {"　"}
              {fmtDateTime(c.created_at)}
              {c.updated_at !== c.created_at && <span style={{ color: "#94a0ad" }}>（編集済み）</span>}
            </span>
            {canModify(c) && editingId !== c.id && (
              <span style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <button onClick={() => startEdit(c)} style={textBtn}>
                  編集
                </button>
                <button onClick={() => setDeletingId(c.id)} style={textBtn}>
                  削除
                </button>
              </span>
            )}
          </div>
          {editingId === c.id ? (
            <>
              <textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    save();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelEdit();
                  }
                }}
                autoFocus
                rows={3}
                disabled={saving}
                style={textarea}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
                <button onClick={cancelEdit} disabled={saving} style={cancelBtn}>
                  キャンセル
                </button>
                <button
                  onClick={save}
                  disabled={!canSave}
                  style={{
                    ...postBtn,
                    ...(canSave ? {} : { opacity: 0.5, cursor: "default" }),
                  }}
                >
                  {saving ? "保存中…" : "保存"}
                </button>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: "#1f2933", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c.body}</div>
          )}
        </div>
      ))}

      {error && <div style={{ fontSize: 12, color: "#a3210b", marginBottom: 8 }}>{error}</div>}

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            post();
          }
        }}
        placeholder="コメントを書く（Ctrl+Enter で投稿）"
        rows={3}
        disabled={posting}
        style={textarea}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
        <button
          onClick={post}
          disabled={!canPost}
          style={{
            ...postBtn,
            ...(canPost ? {} : { opacity: 0.5, cursor: "default" }),
          }}
        >
          {posting ? "投稿中…" : "投稿"}
        </button>
      </div>

      {deletingId && (
        <ConfirmDialog
          message="このコメントを削除しますか？"
          confirmLabel="削除する"
          onConfirm={() => remove(deletingId)}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}

const textarea: CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd2d9",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 13,
  fontFamily: "inherit",
  color: "#1f2933",
  resize: "vertical",
};

const postBtn: CSSProperties = {
  background: "#0972d3",
  color: "#fff",
  border: "1px solid #0972d3",
  borderRadius: 6,
  padding: "6px 14px",
  fontSize: 13,
  cursor: "pointer",
};

const cancelBtn: CSSProperties = {
  background: "#fff",
  color: "#3b4149",
  border: "1px solid #cbd2d9",
  borderRadius: 6,
  padding: "6px 14px",
  fontSize: 13,
  cursor: "pointer",
};

const textBtn: CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  fontSize: 11,
  color: "#5f6b7a",
  cursor: "pointer",
};
