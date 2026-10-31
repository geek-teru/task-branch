import { useCallback, useEffect, useState } from "react";
import { addTaskComment, deleteTaskComment, listTaskComments, updateTaskComment } from "../lib/api";
import type { TaskComment } from "../lib/types";
import { useSession } from "../lib/useSession";
import { ConfirmDialog } from "./ConfirmDialog";
import { DeleteIcon, EditIcon } from "./Icons";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Textarea } from "./ui/Textarea";

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

  // AI comments carry the human's uid (the AI acts on the human's token), so check author_type first.
  const authorLabel = (c: TaskComment) =>
    c.author_type === "ai" ? "AI" : myId && c.author_id === myId ? "自分" : "人";

  return (
    <div className="mt-1 border-t border-border pt-3">
      <div className="mb-1 text-sm font-medium text-fg">コメント（{comments.length}）</div>

      <div className="divide-y divide-border">
        {comments.map((c) => (
          <div key={c.id} className="py-2.5">
            <div className="mb-1 flex items-center gap-2 text-[11px] text-fg-muted">
              <Badge tone={c.author_type === "ai" ? "brand" : "neutral"}>{authorLabel(c)}</Badge>
              <span className="min-w-0 flex-1">
                {fmtDateTime(c.created_at)}
                {c.updated_at !== c.created_at && "（編集済み）"}
              </span>
              {canModify(c) && editingId !== c.id && (
                <span className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<EditIcon size={11} />}
                    onClick={() => startEdit(c)}
                    className="h-5 px-1 text-[11px] text-fg-muted"
                  >
                    編集
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<DeleteIcon size={11} />}
                    onClick={() => setDeletingId(c.id)}
                    className="h-5 px-1 text-[11px] text-fg-muted"
                  >
                    削除
                  </Button>
                </span>
              )}
            </div>
            {editingId === c.id ? (
              <>
                <Textarea
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
                />
                <div className="mt-1.5 flex justify-end gap-1.5">
                  <Button size="sm" onClick={cancelEdit} disabled={saving}>
                    キャンセル
                  </Button>
                  <Button size="sm" variant="primary" onClick={save} disabled={!canSave}>
                    {saving ? "保存中…" : "保存"}
                  </Button>
                </div>
              </>
            ) : (
              <div className="whitespace-pre-wrap break-words text-[13px] text-fg">{c.body}</div>
            )}
          </div>
        ))}
      </div>

      {error && <div className="mb-2 text-xs text-danger">{error}</div>}

      <Textarea
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
        className="mt-2"
      />
      <div className="mt-1.5 flex justify-end">
        <Button size="sm" variant="primary" onClick={post} disabled={!canPost}>
          {posting ? "投稿中…" : "投稿"}
        </Button>
      </div>

      {deletingId && (
        <ConfirmDialog
          message="このコメントを削除しますか？"
          confirmLabel="削除する"
          danger
          onConfirm={() => remove(deletingId)}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}
