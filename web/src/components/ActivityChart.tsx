import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ActivityBucket, ActivityCount } from "../lib/types";

type SeriesKey = "stories_created" | "tasks_created" | "tasks_done";

const SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: "stories_created", label: "ストーリー作成", color: "var(--color-chart-1)" },
  { key: "tasks_created", label: "タスク作成", color: "var(--color-chart-2)" },
  { key: "tasks_done", label: "タスク完了", color: "var(--color-chart-3)" },
];

// M/D（先頭の 0 なし）。bucket_start は YYYY-MM-DD。
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

// 区間の表示。日は「M/D」、週は「M/D〜M/D」（開始日から 6 日後まで）。
function rangeLabel(start: string, bucket: ActivityBucket): string {
  if (bucket === "day") return md(start);
  const end = new Date(`${start}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${md(start)}〜${md(end.toISOString().slice(0, 10))}`;
}

interface TipProps {
  active?: boolean;
  label?: string;
  payload?: { dataKey: SeriesKey; value: number; payload: ActivityCount }[];
  bucket: ActivityBucket;
  hidden: Set<SeriesKey>;
}

function ChartTooltip({ active, payload, bucket, hidden }: TipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const visible = SERIES.filter((s) => !hidden.has(s.key));
  const total = visible.reduce((sum, s) => sum + row[s.key], 0);
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-sm">
      <div className="mb-1.5 font-medium text-fg">{rangeLabel(row.bucket_start, bucket)}</div>
      <div className="flex flex-col gap-1">
        {visible.map((s) => (
          <div key={s.key} className="flex items-center gap-2 text-fg-muted">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="flex-1">{s.label}</span>
            <span className="tabular-nums text-fg">{row[s.key]}</span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between border-t border-border pt-1.5 text-fg-muted">
        <span>合計</span>
        <span className="tabular-nums font-medium text-fg">{total}</span>
      </div>
    </div>
  );
}

// 区間ごとに 3 系列を 1 本に積んだ棒グラフ（Recharts）。凡例を押すと系列を出し入れする。
export function ActivityChart({ counts, bucket }: { counts: ActivityCount[]; bucket: ActivityBucket }) {
  const [hidden, setHidden] = useState<Set<SeriesKey>>(new Set());

  // 全部は消せない: 最後の 1 系列は押しても何も起きない。
  const toggle = (key: SeriesKey) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < SERIES.length - 1) next.add(key);
      return next;
    });

  const yMax = Math.max(
    1,
    ...counts.map((r) => SERIES.filter((s) => !hidden.has(s.key)).reduce((sum, s) => sum + r[s.key], 0)),
  );
  // 縦軸は 0 始まりの整数目盛り（最大 5 本程度）。
  const step = Math.ceil(yMax / 4);
  const top = Math.ceil(yMax / step) * step;
  const yTicks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  // ラベルが重ならないよう、区間が多いときは間引く。
  const interval = Math.max(0, Math.ceil(counts.length / 12) - 1);

  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        {SERIES.map((s) => {
          const off = hidden.has(s.key);
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={!off}
              onClick={() => toggle(s.key)}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-surface-muted ${
                off ? "text-fg-muted line-through opacity-60" : "text-fg-muted"
              }`}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </button>
          );
        })}
      </div>
      <div role="img" aria-label="件数の推移" className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={counts} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeOpacity={0.6} />
            <XAxis
              dataKey="bucket_start"
              tickFormatter={md}
              interval={interval}
              tickLine={false}
              axisLine={{ stroke: "var(--color-border-strong)" }}
              tick={{ fontSize: 11, fill: "var(--color-fg-muted)" }}
            />
            <YAxis
              domain={[0, top]}
              ticks={yTicks}
              allowDecimals={false}
              width={32}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--color-fg-muted)" }}
            />
            <Tooltip
              cursor={{ fill: "var(--color-surface-muted)" }}
              content={<ChartTooltip bucket={bucket} hidden={hidden} />}
              isAnimationActive={false}
            />
            {SERIES.filter((s) => !hidden.has(s.key)).map((s) => (
              <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
