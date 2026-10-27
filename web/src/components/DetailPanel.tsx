import type { ReactNode } from "react";
import type { Status, Task } from "../lib/types";
import { LEVEL_LABEL, STATUS_LABEL, STATUS_ORDER } from "../lib/types";
import { useResizableWidth } from "../lib/useResizableWidth";
import { IdBadge } from "./IdBadge";
import { Markdown } from "./Markdown";
import { TaskComments } from "./TaskComments";
import { DeleteIcon, EditIcon } from "./Icons";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
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
        title="ドラッグで幅を変更"
        className="absolute inset-y-0 left-0 z-[5] w-[7px] cursor-col-resize select-none"
      />
      <div className="shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-muted">{node ? LEVEL_LABEL[node.level] : "詳細"}</span>
          {node && <IdBadge id={node.id} />}
          <Button size="sm" variant="ghost" onClick={onClose} className="ml-auto">
            閉じる
          </Button>
        </div>
        <div className="mt-1 break-words text-sm font-medium text-fg">{title}</div>
        {node && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {onChangeStatus ? (
              <StatusPicker status={node.status} onPick={(s) => onChangeStatus(node, s)} />
            ) : (
              <Badge tone={node.status}>{STATUS_LABEL[node.status]}</Badge>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        <Field label="詳細">{node?.description ? <Markdown>{node.description}</Markdown> : DASH}</Field>
        {place && (
          <Field label="ストーリー">
            {storyOptions?.length && onPickStory ? (
              <Select
                value={currentStoryId ?? ""}
                onChange={(e) => {
                  if (e.target.value !== currentStoryId) onPickStory(e.target.value);
                }}
                title="ストーリーを変更"
              >
                {currentStoryId == null && <option value="">{place.story ?? "-"}</option>}
                {storyOptions.map((story) => (
                  <option key={story.id} value={story.id}>
                    {story.label}
                  </option>
                ))}
              </Select>
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

      {canEdit && node && (
        <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-surface p-3">
          {canStart && onStart && (
            <Button
              variant="primary"
              onClick={() => onStart(node)}
              title={`この${LEVEL_LABEL[node.level]}を進行中にします`}
            >
              進行中にする
            </Button>
          )}
          {canComplete && onComplete && (
            <Button variant="primary" onClick={() => onComplete(node)}>
              完了にする
            </Button>
          )}
          {(onEdit || onDelete) && (
            <div className="flex gap-2">
              {onEdit && (
                <Button icon={<EditIcon size={14} />} onClick={() => onEdit(node)}>
                  変更
                </Button>
              )}
              {onDelete && (
                <Button icon={<DeleteIcon size={14} />} onClick={() => onDelete(node)} className="ml-auto text-danger">
                  削除
                </Button>
              )}
            </div>
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
          <span className="text-[10px] text-fg-muted">▾</span>
        </>
      }
    >
      {STATUS_ORDER.map((s) => (
        <DropdownMenuItem key={s} onSelect={() => s !== status && onPick(s)}>
          <Badge tone={s}>{STATUS_LABEL[s]}</Badge>
        </DropdownMenuItem>
      ))}
    </DropdownMenu>
  );
}
