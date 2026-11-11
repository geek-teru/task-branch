import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { getActivityCounts } from "../lib/api";
import type { ActivityBucket, ActivityCount } from "../lib/types";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { ActivityChart, SERIES, type SeriesKey } from "../components/ActivityChart";
import { Input } from "../components/ui/Input";
import { PageHeader } from "../components/ui/PageHeader";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Toolbar } from "../components/ui/Toolbar";
import { Widget } from "../components/ui/Widget";

type Range = "1m" | "4w" | "12w" | "custom";

const DAY_MS = 86_400_000;

// YYYY-MM-DD in Asia/Tokyo (the zone the RPC buckets in).
function jstDate(d: Date): string {
  return new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

// The day after the same date one month earlier (11/10 → 10/11). A missing day clamps to month end (3/31 → 2/28 → 3/1).
function monthAgoNextDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const prev = new Date(Date.UTC(y, m - 2, Math.min(d, lastDay))).toISOString().slice(0, 10);
  return addDays(prev, 1);
}

const isDate =(v: string | null): v is string => v != null && /^\d{4}-\d{2}-\d{2}$/.test(v);

// ストーリー作成・タスク作成・タスク完了の件数を日 / 週ごとに集計して出す（RPC project_activity_counts）。
// 粒度と期間は URL（?bucket= / ?weeks= / ?from= / ?to=）に持つ。from / to が無ければ ?weeks=4 / 12 で「直近 N 週」、
// どれも無ければ「直近 1 か月」。粒度は ?bucket=week で週、無ければ日。
// projectId が null なら、見えるすべてのプロジェクトを合わせて数える（?project=all）。
export function PerformanceView({
  projectId,
  projectSelect,
  onError,
}: {
  projectId: string | null;
  projectSelect?: ReactNode;
  onError: (message: string) => void;
}) {
  const [params, setParams] = useSearchParams();
  const bucket: ActivityBucket = params.get("bucket") === "week" ? "week" : "day";
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const custom = isDate(fromParam) && isDate(toParam);
  const weeksParam = params.get("weeks");
  const range: Range = custom ? "custom" : weeksParam === "4" ? "4w" : weeksParam === "12" ? "12w" : "1m";

  const today = jstDate(new Date());
  const { from, to } =
    range === "custom"
      ? { from: fromParam!, to: toParam! }
      : range === "1m"
        ? { from: monthAgoNextDay(today), to: today }
        : { from: addDays(today, -(range === "4w" ? 4 : 12) * 7 + 1), to: today };

  const [rows, setRows] = useState<{ key: string; counts: ActivityCount[] } | null>(null);
  const key = `${projectId ?? "all"}|${bucket}|${from}|${to}`;
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
    else update({ from: null, to: null, weeks: r === "4w" ? "4" : r === "12w" ? "12" : null });
  };

  const invalid = from > to;
  const counts = rows && rows.key === key ? rows.counts : null;
  const totals = useMemo(
    () =>
      (counts ?? []).reduce(
        (a, r) => ({
          stories_created: a.stories_created + r.stories_created,
          tasks_created: a.tasks_created + r.tasks_created,
          tasks_done: a.tasks_done + r.tasks_done,
        }),
        { stories_created: 0, tasks_created: 0, tasks_done: 0 } as Record<SeriesKey, number>
      ),
    [counts]
  );
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const period = `${md(from)}〜${md(to)}`;
  const bucketLabel = bucket === "week" ? "週ごと" : "日ごと";

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="パフォーマンス" meta={`${from} 〜 ${to}`} />
      <Toolbar>
        {projectSelect}
        <SegmentedControl<ActivityBucket>
          label="粒度"
          value={bucket}
          onChange={(b) => update({ bucket: b === "day" ? null : b })}
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
            { value: "1m", label: "直近 1 か月" },
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {SERIES.map((s) => (
              <StatWidget key={s.key} label={s.label} color={s.color} value={totals[s.key]} counts={counts} dataKey={s.key} />
            ))}

            <Widget title="件数の推移" aside={`${period} ・ ${bucketLabel}`} className="sm:col-span-3">
              <ActivityChart counts={counts} bucket={bucket} />
            </Widget>

            <Widget title="区間ごとの件数" aside={`${counts.length} 区間`} className="sm:col-span-3" bodyClassName="overflow-hidden rounded-b-md">
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
            </Widget>
          </div>
        )}
      </div>
    </div>
  );
}

// 数値パネル: 期間内の合計（text-2xl）と、区間ごとの推移の小さな線（スパークライン）。
function StatWidget({
  label,
  color,
  value,
  counts,
  dataKey,
}: {
  label: string;
  color: string;
  value: number;
  counts: ActivityCount[];
  dataKey: SeriesKey;
}) {
  return (
    <Widget
      title={
        <>
          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: color }} aria-hidden />
          {label}
        </>
      }
      aside="期間内の合計"
    >
      <div className="flex items-end gap-3">
        <div className="text-2xl font-medium tabular-nums text-fg">{value}</div>
        {counts.length > 1 && (
          <div className="h-8 min-w-0 flex-1" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={counts} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                <YAxis hide domain={[0, "dataMax"]} />
                <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Widget>
  );
}
