import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../lib/cn";
import { commentAuthorOf, STATUS_LABEL, type AssigneeOption, type Assignees, type TaskEvent } from "../lib/types";
import { AssigneeIcon } from "./AssigneeLabel";
import { Avatar } from "./Avatar";
import { IdBadge } from "./IdBadge";
import { Markdown } from "./Markdown";
import { Badge } from "./ui/Badge";

const fullFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const monthDayFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "long", day: "numeric" });
const yearMonthDayFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" });
const yearFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric" });

// 「今」「N分」「N時間」, then 「M月D日」 (「YYYY年M月D日」 for another year), as on X.
export function relativeTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const minutes = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (minutes < 1) return "今";
  if (minutes < 60) return `${minutes}分`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}時間`;
  return yearFmt.format(d) === yearFmt.format(now) ? monthDayFmt.format(d) : yearMonthDayFmt.format(d);
}

// Who did it, resolved like a comment's author: a human by actor_id, an agent by actor_client_id
// (null = AI（未指定）). actor_type null (filled in for old events) is 不明.
function actorOf(e: TaskEvent, assignees: Assignees): { icon: ReactNode; name: string } {
  if (!e.actor_type) return { icon: <Avatar url={null} name="?" className="size-8 text-xs" />, name: "不明" };
  const actor: AssigneeOption | null = commentAuthorOf(
    { author_type: e.actor_type, author_id: e.actor_id, author_client_id: e.actor_client_id },
    assignees,
  );
  if (!actor) return { icon: <Avatar url={null} name="?" className="size-8 text-xs" />, name: "ユーザー" };
  return { icon: <AssigneeIcon assignee={actor} size={32} />, name: actor.name };
}

// The action as a sentence. Comments show their body instead (CommentBody).
function Action({ e }: { e: TaskEvent }): ReactNode {
  switch (e.event_type) {
    case "created":
      return e.level === "story" ? "ストーリーを作成" : "タスクを作成";
    case "status_changed":
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          ステータスを変更
          {e.from_status ? <Badge tone={e.from_status}>{STATUS_LABEL[e.from_status]}</Badge> : <span className="text-fg-muted">—</span>}
          <span className="text-fg-muted">→</span>
          {e.to_status ? <Badge tone={e.to_status}>{STATUS_LABEL[e.to_status]}</Badge> : <span className="text-fg-muted">—</span>}
        </span>
      );
    case "activated":
      return "着手";
    case "deactivated":
      return "棚上げ";
    case "context_updated":
      return "コンテキストを更新";
    case "commented":
      return null;
  }
}

// A comment's body as Markdown. Longer than about 6 lines, it is folded with 「さらに表示」.
function CommentBody({ body }: { body: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !expanded) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [body, expanded]);

  if (body === null) return <span className="text-fg-muted">（削除されたコメント）</span>;
  return (
    <div>
      <div ref={ref} className={cn("[&>div>:last-child]:mb-0", !expanded && "max-h-[8.5rem] overflow-hidden")}>
        <Markdown>{body}</Markdown>
      </div>
      {overflows && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="m-0 cursor-pointer border-0 bg-transparent p-0 text-[13px] text-brand hover:underline"
        >
          さらに表示
        </button>
      )}
    </div>
  );
}

// Where the event happened, as a breadcrumb under the name: 「プロジェクト > ストーリー > タスク」
// (a story's event ends at the story). The story links to its page.
function TargetPath({ e, projectName }: { e: TaskEvent; projectName: string }) {
  const storyTitle = e.level === "task" ? e.story_title : e.task_title;
  const story = storyTitle && (
    e.story_id ? (
      <Link to={`/stories/${e.story_id}`} onClick={(ev) => ev.stopPropagation()} className="min-w-0 max-w-[40%] shrink truncate text-fg-muted hover:text-fg hover:underline">
        {storyTitle}
      </Link>
    ) : (
      <span className="min-w-0 max-w-[40%] shrink truncate">{storyTitle}</span>
    )
  );
  const sep = <span className="shrink-0">&gt;</span>;
  const fullPath = [projectName, storyTitle, e.level === "task" ? e.task_title : null].filter(Boolean).join(" > ");
  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-fg-muted" data-tooltip={fullPath}>
      {projectName && <span className="min-w-0 max-w-[30%] shrink truncate">{projectName}</span>}
      {projectName && story && sep}
      {story}
      {e.level === "task" && (
        <>
          {sep}
          <span className="min-w-0 truncate">{e.task_title}</span>
        </>
      )}
      <span className="ml-1 shrink-0">
        <IdBadge id={e.task_id} />
      </span>
    </div>
  );
}

// One event of the timeline as a post: the actor's icon on the left; on the right the name and
// time, then where it happened, then what was done.
export function TimelinePost({
  event: e,
  projectName,
  assignees,
  selected,
  onSelect,
}: {
  event: TaskEvent;
  projectName: string;
  assignees: Assignees;
  selected?: boolean;
  onSelect?: (taskId: string) => void;
}) {
  const actor = actorOf(e, assignees);
  return (
    <li
      onClick={onSelect ? () => onSelect(e.task_id) : undefined}
      className={cn(
        "flex gap-3 border-b border-border px-4 py-3",
        onSelect && "cursor-pointer",
        selected ? "bg-brand/10 shadow-[inset_2px_0_0_var(--color-brand)]" : "hover:bg-surface-muted",
      )}
    >
      <span className="flex shrink-0" data-tooltip={actor.name}>
        {actor.icon}
      </span>
      <div className="min-w-0 flex-1 text-[13px]">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate font-medium text-fg">{actor.name}</span>
          <span className="text-fg-muted">·</span>
          <time dateTime={e.occurred_at} data-tooltip={fullFmt.format(new Date(e.occurred_at))} className="shrink-0 text-fg-muted">
            {relativeTime(e.occurred_at)}
          </time>
        </div>
        <TargetPath e={e} projectName={projectName} />
        <div className="mt-1.5 text-fg">
          {e.event_type === "commented" ? <CommentBody body={e.comment_body ?? e.comment_excerpt ?? null} /> : <Action e={e} />}
        </div>
      </div>
    </li>
  );
}
