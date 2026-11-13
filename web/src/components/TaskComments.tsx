import { useCallback, useEffect, useRef, useState } from "react";
import { addTaskComment, deleteTaskComment, listTaskComments, updateTaskComment } from "../lib/api";
import type { Assignees, TaskComment } from "../lib/types";
import { commentAuthorOf } from "../lib/types";
import { useSession } from "../lib/useSession";
import { AssigneeIcon } from "./AssigneeLabel";
import { AttachmentTextarea } from "./AttachmentTextarea";
import { Avatar } from "./Avatar";
import { ConfirmDialog } from "./ConfirmDialog";
import { CommentIcon, DeleteIcon, EditIcon } from "./Icons";
import { Markdown } from "./Markdown";
import { Button, IconButton } from "./ui/Button";

const fmtDateTime = (s: string) => new Date(s).toLocaleString("ja-JP");

// The comment's author as an icon and name, like the task's 担当者. A human who cannot be looked up
// (not the signed-in user) gets a "?" icon and ユーザー.
function CommentAuthor({ comment, assignees }: { comment: TaskComment; assignees: Assignees }) {
  const author = commentAuthorOf(comment, assignees);
  const name = author?.name ?? "ユーザー";
  return (
    <span className="flex min-w-0 shrink-0 items-center gap-1.5 text-fg">
      <span data-tooltip={name} className="flex">
        {author ? <AssigneeIcon assignee={author} /> : <Avatar url={null} name="" className="size-5 text-[10px]" />}
      </span>
      <span className="max-w-28 truncate">{name}</span>
    </span>
  );
}

// Comment list + post form for a task, shown at the bottom of the detail panel.
// Fetches on mount / task change and after posting, editing or deleting (no realtime subscription).
// refreshKey: bump it to refetch after a comment was posted from outside (the kanban's status dialog).
// projectId: where images attached to a comment are stored (the attachments belong to the task).
export function TaskComments({
  taskId,
  projectId,
  assignees,
  refreshKey,
}: {
  taskId: string;
  projectId: string;
  assignees: Assignees;
  refreshKey?: number;
}) {
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
  // Image uploads running in the post / edit fields. Posting or saving waits for them.
  const [postUploading, setPostUploading] = useState(false);
  const [editUploading, setEditUploading] = useState(false);

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

  // Refetch only; the draft and the edit in progress are kept. The first run is covered by the effect above.
  const lastRefreshKey = useRef(refreshKey);
  useEffect(() => {
    if (lastRefreshKey.current === refreshKey) return;
    lastRefreshKey.current = refreshKey;
    reload().catch((e) => setError(`コメントを取得できませんでした: ${e.message ?? e}`));
  }, [refreshKey, reload]);

  const body = draft.trim();
  const canPost = body.length > 0 && !posting && !postUploading;

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
  const canSave = !!editing && editBody.length > 0 && editBody !== editing.body && !saving && !editUploading;

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

  return (
    <div className="mt-1 border-t border-border pt-3">
      <div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-fg">
        <CommentIcon size={14} />
        コメント（{comments.length}）
      </div>

      <div className="divide-y divide-border">
        {comments.map((c) => (
          <div key={c.id} className="py-2.5">
            <div className="mb-1 flex items-center gap-2 text-[11px] text-fg-muted">
              <CommentAuthor comment={c} assignees={assignees} />
              <span className="min-w-0 flex-1">
                {fmtDateTime(c.created_at)}
                {c.updated_at !== c.created_at && "（編集済み）"}
              </span>
              {canModify(c) && editingId !== c.id && (
                <span className="flex shrink-0 gap-0.5">
                  <IconButton label="変更" onClick={() => startEdit(c)} className="size-6!">
                    <EditIcon size={12} />
                  </IconButton>
                  <IconButton label="削除" danger onClick={() => setDeletingId(c.id)} className="size-6!">
                    <DeleteIcon size={12} />
                  </IconButton>
                </span>
              )}
            </div>
            {editingId === c.id ? (
              <>
                <AttachmentTextarea
                  value={editDraft}
                  onChange={setEditDraft}
                  projectId={projectId}
                  taskId={taskId}
                  onUploadingChange={setEditUploading}
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
              <div className="text-[13px]">
                <Markdown>{c.body}</Markdown>
              </div>
            )}
          </div>
        ))}
      </div>

      {error && <div className="mb-2 text-xs text-danger">{error}</div>}

      <AttachmentTextarea
        value={draft}
        onChange={setDraft}
        projectId={projectId}
        taskId={taskId}
        onUploadingChange={setPostUploading}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            post();
          }
        }}
        placeholder="コメントを書く（Ctrl+Enter で投稿）"
        rows={3}
        disabled={posting}
        wrapperClassName="mt-2"
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
