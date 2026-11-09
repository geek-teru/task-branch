import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { listBacklogStories, listProjectEvents, TIMELINE_PAGE_SIZE } from "../lib/api";
import { STATUS_LABEL, type BacklogStory, type EventType, type TaskEvent } from "../lib/types";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Select";
import { Toolbar } from "../components/ui/Toolbar";

const EVENT_LABEL: Record<EventType, string> = {
  created: "作成",
  status_changed: "ステータス変更",
  activated: "着手",
  deactivated: "棚上げ",
  commented: "コメント",
  context_updated: "コンテキスト更新",
};

// Filter checkboxes: 着手 and 棚上げ share one box.
const TYPE_FILTERS: { key: string; label: string; types: EventType[] }[] = [
  { key: "created", label: "作成", types: ["created"] },
  { key: "status_changed", label: "ステータス変更", types: ["status_changed"] },
  { key: "activation", label: "着手・棚上げ", types: ["activated", "deactivated"] },
  { key: "commented", label: "コメント", types: ["commented"] },
  { key: "context_updated", label: "コンテキスト更新", types: ["context_updated"] },
];
const ALL_TYPES = TYPE_FILTERS.flatMap((f) => f.types);
const ALL_STORIES = "all";

const ACTOR_LABEL = { human: "人", ai: "AI" } as const;

const timeFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });
const dateFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "short" });
// en-CA gives YYYY-MM-DD: a stable key to group by Asia/Tokyo day.
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });

// The detail of one event: 「未着手 → 進行中」, the head of a comment, or the task title for the rest.
function EventContent({ e }: { e: TaskEvent }): ReactNode {
  if (e.event_type === "status_changed" && e.to_status) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {e.from_status ? <Badge tone={e.from_status}>{STATUS_LABEL[e.from_status]}</Badge> : <span className="text-fg-muted">—</span>}
        <span className="text-fg-muted">→</span>
        <Badge tone={e.to_status}>{STATUS_LABEL[e.to_status]}</Badge>
      </span>
    );
  }
  if (e.event_type === "commented") {
    return <span className="text-fg-muted">{e.comment_excerpt ?? "（削除されたコメント）"}</span>;
  }
  return null;
}

// Events of one project, newest first, grouped by day (Asia/Tokyo). Read 50 at a time:
// 「もっと見る」 passes the oldest occurred_at shown as the next cursor.
// The project is picked in the global header or the toolbar's picker (/timeline?project=).
export function TimelineView({ projectId, projectSelect }: { projectId: string; projectSelect?: ReactNode }) {
  const [events, setEvents] = useState<TaskEvent[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stories, setStories] = useState<BacklogStory[]>([]);

  // Filters live in the URL: ?story=<id>&types=created,commented (no types = all).
  const [searchParams, setSearchParams] = useSearchParams();
  const story = searchParams.get("story");
  const typesParam = searchParams.get("types");
  const types = useMemo(() => {
    const picked = (typesParam ?? "").split(",").filter((t): t is EventType => (ALL_TYPES as string[]).includes(t));
    return picked.length > 0 && picked.length < ALL_TYPES.length ? picked : null;
  }, [typesParam]);
  const typesKey = types?.join(",") ?? "";

  const updateFilter = (patch: { story?: string | null; types?: EventType[] | null }) => {
    const next = new URLSearchParams(searchParams);
    if ("story" in patch) {
      if (patch.story) next.set("story", patch.story);
      else next.delete("story");
    }
    if ("types" in patch) {
      if (patch.types && patch.types.length > 0 && patch.types.length < ALL_TYPES.length) next.set("types", patch.types.join(","));
      else next.delete("types");
    }
    setSearchParams(next);
  };

  useEffect(() => {
    let cancelled = false;
    listBacklogStories(projectId)
      .then((rows) => !cancelled && setStories(rows))
      .catch(() => !cancelled && setStories([]));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setError(null);
    listProjectEvents(projectId, null, { story, types: typesKey ? (typesKey.split(",") as EventType[]) : null })
      .then((rows) => {
        if (cancelled) return;
        setEvents(rows);
        setHasMore(rows.length >= TIMELINE_PAGE_SIZE);
      })
      .catch((e) => !cancelled && setError(String(e.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [projectId, story, typesKey]);

  const loadMore = useCallback(async () => {
    if (!events?.length) return;
    setLoadingMore(true);
    try {
      const rows = await listProjectEvents(projectId, events[events.length - 1].occurred_at, {
        story,
        types: typesKey ? (typesKey.split(",") as EventType[]) : null,
      });
      setEvents((prev) => [...(prev ?? []), ...rows]);
      setHasMore(rows.length >= TIMELINE_PAGE_SIZE);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setLoadingMore(false);
    }
  }, [events, projectId, story, typesKey]);

  const days = useMemo(() => {
    const groups: { key: string; label: string; events: TaskEvent[] }[] = [];
    for (const e of events ?? []) {
      const d = new Date(e.occurred_at);
      const key = dayKeyFmt.format(d);
      const last = groups[groups.length - 1];
      if (last?.key === key) last.events.push(e);
      else groups.push({ key, label: dateFmt.format(d), events: [e] });
    }
    return groups;
  }, [events]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="タイムライン" meta={events && `${events.length} 件${hasMore ? "（続きあり）" : ""}`} />
      <Toolbar>
        {projectSelect}
        <Select
          className="w-56"
          aria-label="ストーリーで絞り込む"
          value={story ?? ALL_STORIES}
          onChange={(v) => updateFilter({ story: v === ALL_STORIES ? null : v })}
          options={[
            { value: ALL_STORIES, label: "すべてのストーリー" },
            ...stories.map((s) => ({ value: s.id, label: s.title })),
          ]}
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]" role="group" aria-label="種別で絞り込む">
          {TYPE_FILTERS.map((f) => {
            const checked = !types || f.types.every((t) => types.includes(t));
            return (
              <label key={f.key} className="inline-flex cursor-pointer items-center gap-1.5 text-fg">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const current = types ?? ALL_TYPES;
                    const next = checked ? current.filter((t) => !f.types.includes(t)) : [...current, ...f.types];
                    // Unchecking the last box would show nothing; treat it as "all" instead.
                    updateFilter({ types: next });
                  }}
                />
                {f.label}
              </label>
            );
          })}
        </div>
      </Toolbar>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {error && <div className="mb-3 text-[13px] text-danger">{error}</div>}
        {!events ? (
          !error && <div className="text-[13px] text-fg-muted">読み込み中…</div>
        ) : events.length === 0 ? (
          <div className="text-[13px] text-fg-muted">まだ操作の履歴がありません。</div>
        ) : (
          <div className="flex flex-col gap-5">
            {days.map((day) => (
              <section key={day.key}>
                <h2 className="m-0 mb-2 text-[13px] font-medium text-fg">{day.label}</h2>
                <ul className="m-0 list-none overflow-hidden rounded-md border border-border bg-surface p-0">
                  {day.events.map((e) => {
                    const target = e.story_id ? (
                      <Link to={`/stories/${e.story_id}`} className="text-fg hover:underline">
                        {e.level === "task" && e.story_title ? `${e.story_title} > ${e.task_title}` : e.task_title}
                      </Link>
                    ) : (
                      <span className="text-fg">{e.task_title}</span>
                    );
                    return (
                      <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2 text-[13px] last:border-b-0 hover:bg-surface-muted">
                        <span className="w-11 shrink-0 text-fg-muted tabular-nums">{timeFmt.format(new Date(e.occurred_at))}</span>
                        <Badge className="w-[112px] shrink-0 justify-center">{EVENT_LABEL[e.event_type]}</Badge>
                        <span className="w-8 shrink-0 text-fg-muted">{e.actor_type ? ACTOR_LABEL[e.actor_type] : "不明"}</span>
                        <span className="min-w-0 truncate">{target}</span>
                        <span className="min-w-0 truncate"><EventContent e={e} /></span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {hasMore && (
              <div>
                <Button onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "読み込み中…" : "もっと見る"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
