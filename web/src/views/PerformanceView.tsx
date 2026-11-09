import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { getActivityCounts } from "../lib/api";
import type { ActivityBucket, ActivityCount } from "../lib/types";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Toolbar } from "../components/ui/Toolbar";

type Range = "4w" | "12w" | "custom";

const DAY_MS = 86_400_000;

// YYYY-MM-DD in Asia/Tokyo (the zone the RPC buckets in).
function jstDate(d: Date): string {
  return new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

const isDate = (v: string | null): v is string => v != null && /^\d{4}-\d{2}-\d{2}$/.test(v);

// ストーリー作成・タスク作成・タスク完了の件数を日 / 週ごとに集計して出す（RPC project_activity_counts）。
// 粒度と期間は URL（?bucket= / ?from= / ?to=）に持つ。from / to が無ければ「直近 N 週」。
export function PerformanceView({
  projectId,
  projectSelect,
  onError,
}: {
  projectId: string;
  projectSelect?: ReactNode;
  onError: (message: string) => void;
}) {
  const [params, setParams] = useSearchParams();
  const bucket: ActivityBucket = params.get("bucket") === "day" ? "day" : "week";
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const custom = isDate(fromParam) && isDate(toParam);
  const weeksParam = params.get("weeks") === "4" ? 4 : 12;
  const range: Range = custom ? "custom" : weeksParam === 4 ? "4w" : "12w";

  const today = jstDate(new Date());
  const { from, to } = custom
    ? { from: fromParam, to: toParam }
    : { from: addDays(today, -weeksParam * 7 + 1), to: today };

  const [rows, setRows] = useState<{ key: string; counts: ActivityCount[] } | null>(null);
  const key = `${projectId}|${bucket}|${from}|${to}`;
  useEffect(() => {
    if (from > to) return;
    let cancelled = false;
    getActivityCounts(projectId, bucket, from, to)
      .then((counts) => {
        if (!cancelled) setRows({ key, counts });
      })
      .catch((e) => {
        if (cancelled) return;
        setRows({ key, counts: [] });
        onError(String(e.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, bucket, from, to, key, onError]);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const onRange = (r: Range) => {
    if (r === "custom") update({ from, to, weeks: null });
    else update({ from: null, to: null, weeks: r === "4w" ? "4" : null });
  };

  const invalid = from > to;
  const counts = rows && rows.key === key ? rows.counts : null;
  const totals = useMemo(
    () =>
      (counts ?? []).reduce(
        (a, r) => ({
          stories: a.stories + r.stories_created,
          tasks: a.tasks + r.tasks_created,
          done: a.done + r.tasks_done,
        }),
        { stories: 0, tasks: 0, done: 0 }
      ),
    [counts]
  );

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="パフォーマンス" meta={`${from} 〜 ${to}`} />
      <Toolbar>
        {projectSelect}
        <SegmentedControl<ActivityBucket>
          label="粒度"
          value={bucket}
          onChange={(b) => update({ bucket: b === "week" ? null : b })}
          options={[
            { value: "day", label: "日" },
            { value: "week", label: "週" },
          ]}
        />
        <SegmentedControl<Range>
          label="期間"
          value={range}
          onChange={onRange}
          options={[
            { value: "4w", label: "直近 4 週" },
            { value: "12w", label: "直近 12 週" },
            { value: "custom", label: "任意" },
          ]}
        />
        {range === "custom" && (
          <>
            <Input type="date" aria-label="開始日" value={from} onChange={(e) => e.target.value && update({ from: e.target.value })} className="w-40" />
            <span className="text-[13px] text-fg-muted">〜</span>
            <Input type="date" aria-label="終了日" value={to} onChange={(e) => e.target.value && update({ to: e.target.value })} className="w-40" />
          </>
        )}
      </Toolbar>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {invalid ? (
          <div className="text-[13px] text-danger">開始日は終了日以前にしてください。</div>
        ) : !counts ? (
          <div className="text-[13px] text-fg-muted">読み込み中…</div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <TotalCard label="ストーリー作成" value={totals.stories} />
              <TotalCard label="タスク作成" value={totals.tasks} />
              <TotalCard label="タスク完了" value={totals.done} />
            </div>

            <div className="overflow-hidden rounded-md border border-border bg-surface">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-surface-muted text-left text-xs text-fg-muted">
                    <th className="px-3 py-2 font-medium">{bucket === "week" ? "週の開始日" : "日付"}</th>
                    <th className="px-3 py-2 text-right font-medium">ストーリー作成</th>
                    <th className="px-3 py-2 text-right font-medium">タスク作成</th>
                    <th className="px-3 py-2 text-right font-medium">タスク完了</th>
                  </tr>
                </thead>
                <tbody>
                  {counts.map((r) => (
                    <tr key={r.bucket_start} className="border-b border-border last:border-b-0 hover:bg-surface-muted">
                      <td className="whitespace-nowrap px-3 py-2">{r.bucket_start}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.stories_created}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.tasks_created}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.tasks_done}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TotalCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="px-4 py-3">
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="mt-1 text-2xl font-medium tabular-nums text-fg">{value}</div>
    </Card>
  );
}
