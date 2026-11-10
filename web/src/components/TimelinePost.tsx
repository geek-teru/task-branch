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

// The target of the event as a small card: 「ストーリー名 > タスク名」 and the task's short id.
function TargetCard({ e }: { e: TaskEvent }) {
  const title = e.level === "task" && e.story_title ? `${e.story_title} > ${e.task_title}` : e.task_title;
  return (
    <div className="mt-2 flex min-w-0 items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[13px]">
      {e.story_id ? (
        <Link to={`/stories/${e.story_id}`} className="min-w-0 truncate text-fg hover:underline">
          {title}
        </Link>
      ) : (
        <span className="min-w-0 truncate text-fg">{title}</span>
      )}
      <IdBadge id={e.task_id} />
    </div>
  );
}

// One event of the timeline as a post: the actor's icon on the left; name, time, the action and
// the target on the right.
export function TimelinePost({ event: e, assignees }: { event: TaskEvent; assignees: Assignees }) {
  const actor = actorOf(e, assignees);
  return (
    <li className="flex gap-3 border-b border-border px-4 py-3 hover:bg-surface-muted">
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
        <div className="mt-0.5 text-fg">
          {e.event_type === "commented" ? <CommentBody body={e.comment_body ?? e.comment_excerpt ?? null} /> : <Action e={e} />}
        </div>
        <TargetCard e={e} />
      </div>
    </li>
  );
}
