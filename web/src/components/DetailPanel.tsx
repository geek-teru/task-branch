import { useState, type ReactNode } from "react";
import type { AssigneeOption, Assignees, Status, Task } from "../lib/types";
import { LEVEL_LABEL, STATUS_LABEL, STATUS_ORDER, assigneeKey, assigneeOf } from "../lib/types";
import { useResizableWidth } from "../lib/useResizableWidth";
import { AssigneeLabel } from "./AssigneeLabel";
import { IdBadge } from "./IdBadge";
import { Markdown } from "./Markdown";
import { TaskComments } from "./TaskComments";
import { ChevronDownIcon, CloseIcon, DeleteIcon, EditIcon } from "./Icons";
import { Badge } from "./ui/Badge";
import { Button, IconButton } from "./ui/Button";
import { DropdownMenu, DropdownMenuItem } from "./ui/DropdownMenu";
import { Select } from "./ui/Select";

// A story or task shown in the panel; progress is present for graph nodes only.
export type DetailNode = Task & { progress?: number | null };

// 移動先の候補（ストーリー）。並びは呼び出し側が決める。
export interface StoryOption {
  id: string;
  label: string;
}

const MS_DAY = 24 * 60 * 60 * 1000;
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
  storyOptions,
  currentStoryId,
  onPickStory,
  assignees,
  onChangeAssignee,
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
  storyOptions?: StoryOption[]; // 候補が無い間は表示だけ（プルダウンを出さない）
  currentStoryId?: string | null;
  onPickStory?: (storyId: string) => void; // ストーリー名のプルダウンで選んだ移動先
  assignees?: Assignees; // tasks only: 担当者 is shown when given
  onChangeAssignee?: (node: T, assigneeId: string | null) => void; // null = 未割り当て
}) {
  const fmt = (d: Date | null) => (d ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}` : "—");
  const fmtDateTime = (s: string) => new Date(s).toLocaleString("ja-JP");
  const durationDays = start && end ? diffDays(start, end) + 1 : null;
  const canEdit = node != null;
  const canStart = canEdit && node != null && node.status === "todo";
  const canComplete = canEdit && node != null && node.status === "in_progress";
  const DASH = <span className="text-fg-muted">-</span>;
  // 左端のハンドルで幅を変える。右へドラッグすると狭くなる。
  const { width, startResize } = useResizableWidth("detailPanel.width", 320, 280, 800, { invert: true });

  return (
    <div style={{ width }} className="relative flex shrink-0 flex-col overflow-hidden border-l border-border bg-surface">
      <div
        onMouseDown={startResize}
        data-tooltip="ドラッグで幅を変更"
        className="absolute inset-y-0 left-0 z-[5] w-[7px] cursor-col-resize select-none"
      />
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-muted">{node ? LEVEL_LABEL[node.level] : "詳細"}</span>
          {node && <IdBadge id={node.id} />}
          <span className="ml-auto flex items-center gap-0.5">
            {node && onEdit && (
              <IconButton label="変更" onClick={() => onEdit(node)}>
                <EditIcon size={14} />
              </IconButton>
            )}
            {node && onDelete && (
              <IconButton label="削除" danger onClick={() => onDelete(node)}>
                <DeleteIcon size={14} />
              </IconButton>
            )}
          </span>
          <IconButton label="閉じる" onClick={onClose}>
            <CloseIcon size={14} />
          </IconButton>
        </div>
        <div className="mt-1 break-words text-sm font-medium text-fg">{title}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {node && (
          <Field label="ステータス">
            {onChangeStatus ? (
              <StatusPicker status={node.status} onPick={(s) => onChangeStatus(node, s)} />
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
        {node?.level === "task" && <TaskComments taskId={node.id} />}
      </div>

      {node && ((canStart && onStart) || (canComplete && onComplete)) && (
        <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-surface p-3">
          {canStart && onStart && (
            <Button
              variant="primary"
              onClick={() => onStart(node)}
              data-tooltip={`この${LEVEL_LABEL[node.level]}を進行中にします`}
            >
              進行中にする
            </Button>
          )}
          {canComplete && onComplete && (
            <Button variant="primary" onClick={() => onComplete(node)}>
              完了にする
            </Button>
          )}
        </div>
      )}
    </div>
  );
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
        <IconButton label="ストーリーを変更" onClick={() => setEditing(true)} className="size-6!">
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
      menuClassName="min-w-[160px]"
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

// Badge that opens a small menu to pick any status.
function StatusPicker({ status, onPick }: { status: Status; onPick: (status: Status) => void }) {
  return (
    <DropdownMenu
      variant="ghost"
      size="sm"
      label="ステータスを変更"
      menuClassName="min-w-[120px]"
      className="-mx-2.5"
      trigger={
        <>
          <Badge tone={status}>{STATUS_LABEL[status]}</Badge>
          <span className="flex text-fg-muted">
            <ChevronDownIcon size={12} />
          </span>
        </>
      }
    >
      {STATUS_ORDER.map((s) => (
        <DropdownMenuItem key={s} selected={s === status} onSelect={() => s !== status && onPick(s)}>
          <Badge tone={s}>{STATUS_LABEL[s]}</Badge>
        </DropdownMenuItem>
      ))}
    </DropdownMenu>
  );
}
