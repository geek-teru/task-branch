import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ATTACHMENTS_CHANGED_EVENT,
  deleteAttachment,
  forgetSignedUrls,
  listAttachments,
  signedUrls,
  type AttachmentsChangedDetail,
} from "../lib/attachments";
import type { Attachment } from "../lib/types";
import { ConfirmDialog } from "./ConfirmDialog";
import { DeleteIcon } from "./Icons";
import { IconButton } from "./ui/Button";

const fmtDateTime = (s: string) => new Date(s).toLocaleString("ja-JP");

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const displayName = (a: Attachment) => a.original_name ?? "画像";

// The attachments of a task or story, newest first, each with a thumbnail, name, size, date and a
// delete button (confirmed first). Renders nothing while loading or when there are none, so callers
// wrap the list with `frame` (heading, card) only when it has rows. Reloads when an attachment of
// the same task is uploaded or deleted anywhere on the page (ATTACHMENTS_CHANGED_EVENT).
export function AttachmentList({
  taskId,
  frame,
}: {
  taskId: string;
  frame: (count: number, list: ReactNode) => ReactNode;
}) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [urls, setUrls] = useState<Map<string, string> | null>(null); // null until fetched
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Attachment | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Only the latest load may set state (the task can change, or reloads can overlap).
  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const list = await listAttachments(taskId);
      if (seq !== loadSeq.current) return;
      setItems(list);
      setError(null);
      const fetched = list.length > 0 ? await signedUrls(list.map((a) => a.id)) : new Map<string, string>();
      if (seq === loadSeq.current) setUrls(fetched);
    } catch (e) {
      if (seq === loadSeq.current) setError(`添付を読み込めませんでした（${(e as Error).message ?? String(e)}）`);
    }
  }, [taskId]);

  useEffect(() => {
    setItems([]);
    setUrls(null);
    setError(null);
    load();
    const onChanged = (e: Event) => {
      if ((e as CustomEvent<AttachmentsChangedDetail>).detail?.taskId === taskId) load();
    };
    window.addEventListener(ATTACHMENTS_CHANGED_EVENT, onChanged);
    return () => {
      loadSeq.current++; // drop results of loads for the previous task
      window.removeEventListener(ATTACHMENTS_CHANGED_EVENT, onChanged);
    };
  }, [taskId, load]);

  // A thumbnail that failed to load gets one fresh URL; after that it shows the fallback.
  const retryUrl = useCallback(async (id: string) => {
    forgetSignedUrls([id]);
    try {
      const fresh = await signedUrls([id]);
      setUrls((prev) => {
        const next = new Map(prev ?? []);
        const url = fresh.get(id);
        if (url) next.set(id, url);
        else next.delete(id);
        return next;
      });
    } catch {
      setUrls((prev) => {
        const next = new Map(prev ?? []);
        next.delete(id);
        return next;
      });
    }
  }, []);

  async function remove(a: Attachment) {
    setDeleting(null);
    setBusyId(a.id);
    setError(null);
    try {
      await deleteAttachment(a); // fires ATTACHMENTS_CHANGED_EVENT → load()
    } catch (e) {
      setError(`${displayName(a)}: 削除できませんでした（${(e as Error).message ?? String(e)}）`);
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0 && !error) return null;

  const list = (
    <>
      {error && <div className="mb-1.5 text-xs text-danger">{error}</div>}
      <ul className="m-0 list-none divide-y divide-border p-0">
        {items.map((a) => (
          <li key={a.id} className="flex items-center gap-2.5 py-2">
            <Thumbnail
              id={a.id}
              url={urls?.get(a.id) ?? null}
              loading={urls === null}
              name={displayName(a)}
              onError={retryUrl}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-fg" data-tooltip={displayName(a)}>
                {displayName(a)}
              </div>
              <div className="text-[11px] text-fg-muted">
                {formatBytes(a.size_bytes)}・{fmtDateTime(a.created_at)}
              </div>
            </div>
            <IconButton
              label="添付を削除"
              danger
              disabled={busyId === a.id}
              onClick={() => setDeleting(a)}
              className="size-6! shrink-0"
            >
              <DeleteIcon size={12} />
            </IconButton>
          </li>
        ))}
      </ul>
      {deleting && (
        <ConfirmDialog
          message={`「${displayName(deleting)}」を削除しますか？\n本文の参照は残り、『画像を表示できません』と出ます。`}
          confirmLabel="削除する"
          danger
          onConfirm={() => remove(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
  return <>{frame(items.length, list)}</>;
}

// 48px square preview through the signed URL; click opens the image in a new tab.
function Thumbnail({
  id,
  url,
  loading,
  name,
  onError,
}: {
  id: string;
  url: string | null;
  loading: boolean; // URLs not fetched yet: a blank placeholder rather than 表示不可
  name: string;
  onError: (id: string) => Promise<void>;
}) {
  const [retried, setRetried] = useState(false);
  const [failed, setFailed] = useState(false);
  const box = "block size-12 shrink-0 rounded-md border border-border";

  useEffect(() => {
    setRetried(false);
    setFailed(false);
  }, [id]);

  if (!url || failed) {
    return (
      <span
        className={`${box} flex items-center justify-center bg-surface-muted text-[10px] text-fg-muted ${loading ? "animate-pulse" : ""}`}
        aria-label={name}
      >
        {loading && !failed ? "" : "表示不可"}
      </span>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0" data-tooltip="新しいタブで開く">
      <img
        src={url}
        alt={name}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        onError={() => {
          if (retried) {
            setFailed(true);
            return;
          }
          setRetried(true);
          onError(id);
        }}
        className={`${box} bg-surface-muted object-cover`}
      />
    </a>
  );
}
