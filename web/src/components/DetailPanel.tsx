import { useEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { AssigneeOption, Assignees, Status, Task } from "../lib/types";
import { LEVEL_LABEL, STATUS_LABEL, STORY_STATUSES, TASK_STATUSES, assigneeKey, assigneeOf } from "../lib/types";
import { useIsMobile } from "../lib/useIsMobile";
import { useResizableWidth } from "../lib/useResizableWidth";
import { AssigneeLabel } from "./AssigneeLabel";
import { AttachmentList } from "./AttachmentList";
import { IdBadge } from "./IdBadge";
import { Markdown } from "./Markdown";
import { TaskComments } from "./TaskComments";
import { AttachIcon, ChevronDownIcon, CloseIcon, DeleteIcon, EditIcon } from "./Icons";
import { Badge } from "./ui/Badge";
import { Button, IconButton } from "./ui/Button";
import { DropdownMenu, DropdownMenuItem } from "./ui/DropdownMenu";
import { Select } from "./ui/Select";
import { StatusPicker } from "./StatusPicker";

// A story or task shown in the panel; progress is present for graph nodes only.
export type DetailNode = Task & { progress?: number | null };

// 移動先の候補（ストーリー）。並びは呼び出し側が決める。
export interface StoryOption {
  id: string;
  label: string;
}

const MS_DAY = 24 * 60 * 60 * 1000;

// Comment authors are looked up in the assignees; without them, every author shows as unknown.
const NO_ASSIGNEES: Assignees = { options: [], agentsLoaded: false };
function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00`);
}
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_DAY);
}

// Right-hand detail panel for a selected story / task (shared by the gantt and the kanban).
export function DetailPanel<T extends DetailNode>({
  title,
  node,
  start,
  end,
  onClose,
  onEdit,
  onDelete,
  onStart,
  onComplete,
  onChangeStatus,
  place,
  storyLink,
  storyOptions,
  currentStoryId,
  onPickStory,
  assignees,
  onChangeAssignee,
  commentsVersion,
  closeOnBack = true,
}: {
  title: string;
  node: T | null;
  start: Date | null; // shown as 期間; the gantt passes the bar's (possibly derived) span
  end: Date | null;
  onClose: () => void;
  onEdit?: (node: T) => void;
  onDelete?: (node: T) => void;
  onStart?: (node: T) => void;
  onComplete?: (node: T) => void;
  onChangeStatus?: (node: T, status: Status) => void; // status badge → menu
  place?: { story: string | null }; // the story the node sits in; omitted = not shown
  storyLink?: string; // stories only: path of the story's own page (「ストーリー詳細を開く」)
  storyOptions?: StoryOption[]; // 候補が無い間は表示だけ（プルダウンを出さない）
  currentStoryId?: string | null;
  onPickStory?: (storyId: string) => void; // ストーリー名のプルダウンで選んだ移動先
  assignees?: Assignees; // tasks only: 担当者 is shown when given
  onChangeAssignee?: (node: T, assigneeId: string | null) => void; // null = 未割り当て
  commentsVersion?: number; // 変わったらコメント一覧を読み直す（パネルの外から投稿したとき）
  // スマホの全画面表示で、ブラウザの戻るで閉じられるよう履歴を1つ積む。開いている状態を URL に
  // 持つ画面（タイムラインの ?task=）は、戻るがすでに閉じる操作になるので false を渡す。
  closeOnBack?: boolean;
}) {
  const fmt = (d: Date | null) => (d ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}` : "—");
  const fmtDateTime = (s: string) => new Date(s).toLocaleString("ja-JP");
  const durationDays = start && end ? diffDays(start, end) + 1 : null;
  const canEdit = node != null;
  const canStart = canEdit && node != null && node.status === "todo";
  // 進行中からも完了にできる（レビューが要らないタスクのため）。
  const canComplete = canEdit && node != null && (node.status === "in_progress" || node.status === "in_review");
  const DASH = <span className="text-fg-muted">-</span>;
  // 左端のハンドルで幅を変える。右へドラッグすると狭くなる。
  const { width, startResize } = useResizableWidth("detailPanel.width", 320, 280, 800, { invert: true });
  // スマホ（768px 未満）では右の横並びではなく、画面全体を覆うシートで開く。幅のドラッグは出さない。
  const isMobile = useIsMobile();
  const close = useBackToClose(isMobile && closeOnBack, onClose);

  return (
    <div
      style={isMobile ? undefined : { width }}
      className={
        isMobile
          ? "fixed inset-0 z-40 flex flex-col overflow-hidden bg-surface"
          : "relative flex shrink-0 flex-col overflow-hidden border-l border-border bg-surface"
      }
    >
      {!isMobile && (
        <div
          onMouseDown={startResize}
          data-tooltip="ドラッグで幅を変更"
          className="absolute inset-y-0 left-0 z-[5] w-[7px] cursor-col-resize select-none"
        />
      )}
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-muted">{node ? LEVEL_LABEL[node.level] : "詳細"}</span>
          {node && <IdBadge id={node.id} />}
          <span className="ml-auto flex items-center gap-0.5">
            {node && onEdit && (
              <IconButton label="変更" onClick={() => onEdit(node)} className="max-md:size-10!">
                <EditIcon size={isMobile ? 16 : 14} />
              </IconButton>
            )}
            {node && onDelete && (
              <IconButton label="削除" danger onClick={() => onDelete(node)} className="max-md:size-10!">
                <DeleteIcon size={isMobile ? 16 : 14} />
              </IconButton>
            )}
          </span>
          <IconButton label="閉じる" onClick={close} className="max-md:size-10!">
            <CloseIcon size={isMobile ? 18 : 14} />
          </IconButton>
        </div>
        <div className="mt-1 break-words text-sm font-medium text-fg">{title}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4" onFocus={isMobile ? revealFocusedField : undefined}>
        {node && (
          <Field label="ステータス">
            {onChangeStatus ? (
              <StatusPicker
                status={node.status}
                statuses={node.level === "task" ? TASK_STATUSES : STORY_STATUSES}
                onPick={(s) => onChangeStatus(node, s)}
              />
            ) : (
              <Badge tone={node.status}>{STATUS_LABEL[node.status]}</Badge>
            )}
          </Field>
        )}
        {node?.level === "task" && assignees && (
          <Field label="担当者">
            {onChangeAssignee ? (
              <AssigneePicker
                assigneeId={assigneeKey(node)}
                current={assigneeOf(node, assignees)}
                candidates={assignees.options}
                onPick={(id) => id !== assigneeKey(node) && onChangeAssignee(node, id)}
              />
            ) : (
              <AssigneeLabel assignee={assigneeOf(node, assignees)} />
            )}
          </Field>
        )}
        {storyLink && (
          <Field label="ストーリー詳細">
            <Link to={storyLink} className="text-brand hover:underline">
              ストーリー詳細を開く
            </Link>
          </Field>
        )}
        <Field label="詳細">{node?.description ? <Markdown>{node.description}</Markdown> : DASH}</Field>
        {place && (
          <Field label="ストーリー">
            {storyOptions?.length && onPickStory ? (
              <StoryPicker
                key={node?.id}
                text={place.story}
                options={storyOptions}
                currentStoryId={currentStoryId ?? null}
                onPick={onPickStory}
              />
            ) : (
              place.story ?? DASH
            )}
          </Field>
        )}
        <Field label="開始日">{node?.start_date ? fmt(parseDate(node.start_date)) : DASH}</Field>
        <Field label="期限">{node?.due_date ? fmt(parseDate(node.due_date)) : DASH}</Field>
        <Field label="期間">{durationDays != null ? `${durationDays}日` : DASH}</Field>
        <Field label="進捗">{node?.progress != null ? `${Math.round(node.progress * 100)}%` : DASH}</Field>
        <Field label="作成日時">{node?.created_at ? fmtDateTime(node.created_at) : DASH}</Field>
        <Field label="更新日時">{node?.updated_at ? fmtDateTime(node.updated_at) : DASH}</Field>
        <Field label="完了日時">{node?.completed_at ? fmtDateTime(node.completed_at) : DASH}</Field>
        <Field label="クローズ日時">{node?.closed_at ? fmtDateTime(node.closed_at) : DASH}</Field>
        {node?.level === "task" && (
          <AttachmentList
            taskId={node.id}
            frame={(count, list) => (
              <div className="mt-1 mb-3 border-t border-border pt-3">
                <div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-fg">
                  <AttachIcon size={14} />
                  添付（{count}）
                </div>
                {list}
              </div>
            )}
          />
        )}
        {node?.level === "task" && (
          <TaskComments taskId={node.id} projectId={node.project_id} assignees={assignees ?? NO_ASSIGNEES} refreshKey={commentsVersion} />
        )}
      </div>

      {node && ((canStart && onStart) || (canComplete && onComplete)) && (
        <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-surface p-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {canStart && onStart && (
            <Button
              variant="primary"
              className="max-md:h-11"
              onClick={() => onStart(node)}
              data-tooltip={`この${LEVEL_LABEL[node.level]}を進行中にします`}
            >
              進行中にする
            </Button>
          )}
          {canComplete && onComplete && (
            <Button variant="primary" className="max-md:h-11" onClick={() => onComplete(node)}>
              完了にする
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// While enabled, pushes one history entry so the browser's back button closes the panel. Returns
// the close handler for the panel's own button: it goes back over that entry (the popstate then
// closes the panel), so the entry does not pile up. If the panel unmounts some other way (the
// caller clears the selection, e.g. after a delete), the leftover entry is taken back afterwards —
// deferred so that StrictMode's unmount / remount in development (which pushes a new entry) keeps it.
function useBackToClose(enabled: boolean, onClose: () => void): () => void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const token = crypto.randomUUID();
    tokenRef.current = token;
    window.history.pushState({ ...window.history.state, detailPanel: token }, "");
    const onPop = () => {
      tokenRef.current = null;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (tokenRef.current !== token) return; // already went back
      tokenRef.current = null;
      setTimeout(() => {
        if (window.history.state?.detailPanel === token) window.history.back();
      }, 0);
    };
  }, [enabled]);

  return () => {
    if (enabled && tokenRef.current && window.history.state?.detailPanel === tokenRef.current) {
      window.history.back();
    } else {
      onClose();
    }
  };
}

// Below the focused textarea sits its button row (コメントの「投稿」). When the soft keyboard opens,
// the browser scrolls only the textarea itself into view, which can leave that row under the panel's
// bottom bar. Once the keyboard has settled, scroll the panel so the room below the field shows too.
const ROOM_BELOW_FIELD = 48;
function revealFocusedField(e: FocusEvent<HTMLDivElement>) {
  const field = e.target;
  if (!(field instanceof HTMLTextAreaElement)) return;
  const scroller = e.currentTarget;
  setTimeout(() => {
    if (document.activeElement !== field) return;
    const overflow = field.getBoundingClientRect().bottom + ROOM_BELOW_FIELD - scroller.getBoundingClientRect().bottom;
    if (overflow > 0) scroller.scrollTop += overflow;
  }, 300);
}

// Label above, value below.
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-xs text-fg-muted">{label}</div>
      <div className="text-[13px] text-fg">{children}</div>
    </div>
  );
}

// ストーリー名と編集ボタン。押すとプルダウンに切り替わり、選ぶか Escape / フォーカスが外れると戻る。
function StoryPicker({
  text,
  options,
  currentStoryId,
  onPick,
}: {
  text: string | null;
  options: StoryOption[];
  currentStoryId: string | null;
  onPick: (storyId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <div className="flex items-center gap-1">
        <span className="min-w-0 break-words">{text ?? "-"}</span>
        <IconButton label="ストーリーを変更" onClick={() => setEditing(true)} className="size-6! max-md:size-10!">
          <EditIcon size={13} />
        </IconButton>
      </div>
    );
  }
  return (
    <Select
      defaultOpen
      value={currentStoryId}
      onChange={onPick}
      onClose={() => setEditing(false)}
      options={options.map((story) => ({ value: story.id, label: story.label }))}
      placeholder={text ?? "-"}
      aria-label="ストーリーを変更"
    />
  );
}

// The assignee that opens a small menu to pick 未割り当て or a candidate (same look as StatusPicker).
function AssigneePicker({
  assigneeId,
  current,
  candidates,
  onPick,
}: {
  assigneeId: string | null;
  current: AssigneeOption | null;
  candidates: AssigneeOption[];
  onPick: (assigneeId: string | null) => void;
}) {
  return (
    <DropdownMenu
      variant="ghost"
      size="sm"
      label="担当者を変更"
      menuClassName="min-w-[160px] max-md:[&>button]:min-h-10"
      triggerClassName="max-md:h-10"
      className="-mx-2.5"
      trigger={
        <>
          <AssigneeLabel assignee={current} />
          <span className="flex text-fg-muted">
            <ChevronDownIcon size={12} />
          </span>
        </>
      }
    >
      <DropdownMenuItem selected={assigneeId == null} onSelect={() => onPick(null)}>
        <AssigneeLabel assignee={null} />
      </DropdownMenuItem>
      {candidates.map((a) => (
        <DropdownMenuItem key={a.id} selected={a.id === assigneeId} onSelect={() => onPick(a.id)}>
          <AssigneeLabel assignee={a} />
        </DropdownMenuItem>
      ))}
    </DropdownMenu>
  );
}
