import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { listBacklogStories, listProjectEvents, TIMELINE_PAGE_SIZE } from "../lib/api";
import type { Assignees, BacklogStory, EventType, TaskEvent } from "../lib/types";
import { TimelinePost } from "../components/TimelinePost";
import { PageHeader } from "../components/ui/PageHeader";
import { Select } from "../components/ui/Select";
import { Toolbar } from "../components/ui/Toolbar";

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

// Events of one project as a single-column feed, newest first. Read 50 at a time: when the end of
// the feed scrolls into view, the oldest occurred_at shown is passed as the next cursor.
// The project is picked in the global header or the toolbar's picker (/timeline?project=).
export function TimelineView({
  projectId,
  projectSelect,
  assignees,
}: {
  projectId: string;
  projectSelect?: ReactNode;
  assignees: Assignees;
}) {
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
      setHasMore(false); // stop the observer from retrying in a loop
    } finally {
      setLoadingMore(false);
    }
  }, [events, projectId, story, typesKey]);

  // Infinite scroll: read the next page when the sentinel after the last post comes into view
  // (a little early, so the feed keeps going while scrolling).
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || loadingMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { rootMargin: "200px 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

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
        <div className="max-w-[600px]">
          {error && <div className="mb-3 text-[13px] text-danger">{error}</div>}
          {!events ? (
            !error && <div className="text-[13px] text-fg-muted">読み込み中…</div>
          ) : events.length === 0 ? (
            <div className="text-[13px] text-fg-muted">まだ操作の履歴がありません。</div>
          ) : (
            <>
              <ul className="m-0 list-none overflow-hidden rounded-md border border-b-0 border-border bg-surface p-0">
                {events.map((e) => (
                  <TimelinePost key={e.id} event={e} assignees={assignees} />
                ))}
              </ul>
              <div ref={sentinel} aria-hidden="true" className="h-px" />
              {loadingMore && <div className="py-3 text-center text-[13px] text-fg-muted">読み込み中…</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
