import type { ActivityBucket, ActivityCount } from "../lib/types";

const SERIES = [
  { key: "stories_created", label: "ストーリー作成", color: "var(--color-status-in_review-border)" },
  { key: "tasks_created", label: "タスク作成", color: "var(--color-status-in_progress-border)" },
  { key: "tasks_done", label: "タスク完了", color: "var(--color-status-done-border)" },
] as const;

const W = 800;
const H = 240;
const M = { top: 12, right: 12, bottom: 28, left: 36 };

// M/D（先頭の 0 なし）。bucket_start は YYYY-MM-DD。
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

// 目盛りは整数。最大値が小さいときは 1 刻み、大きいときは 4〜5 本に収まる刻み。
function ticks(max: number): number[] {
  const top = Math.max(max, 1);
  const step = Math.ceil(top / 4);
  const out: number[] = [];
  for (let v = 0; v < top + step; v += step) {
    out.push(v);
    if (v >= top) break;
  }
  return out;
}

// 区間ごとに 3 系列を並べた棒グラフ（ライブラリなしの SVG）。幅は viewBox で親に合わせて伸縮する。
export function ActivityChart({ counts, bucket }: { counts: ActivityCount[]; bucket: ActivityBucket }) {
  const ts = ticks(Math.max(0, ...counts.flatMap((r) => SERIES.map((s) => r[s.key]))));
  const yMax = ts[ts.length - 1];
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const y = (v: number) => M.top + plotH - (v / yMax) * plotH;
  const groupW = counts.length ? plotW / counts.length : plotW;
  const pad = Math.min(8, groupW * 0.15);
  const barW = Math.max(1, (groupW - pad * 2) / SERIES.length);
  // ラベルが重ならないよう、区間が多いときは間引く。
  const labelEvery = Math.max(1, Math.ceil(counts.length / 12));

  return (
    <div className="rounded-md border border-border bg-surface px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-fg-muted">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="件数の推移">
        {ts.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--color-border)" />
            <text x={M.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="var(--color-fg-muted)">
              {t}
            </text>
          </g>
        ))}
        {counts.map((r, i) => {
          const gx = M.left + i * groupW;
          return (
            <g key={r.bucket_start}>
              {SERIES.map((s, j) => {
                const v = r[s.key];
                const h = (v / yMax) * plotH;
                return (
                  <rect
                    key={s.key}
                    x={gx + pad + j * barW}
                    y={y(v)}
                    width={Math.max(1, barW - 1)}
                    height={h}
                    fill={s.color}
                    rx={1}
                  >
                    <title>{`${bucket === "week" ? "週 " : ""}${md(r.bucket_start)}・${s.label}・${v} 件`}</title>
                  </rect>
                );
              })}
              {i % labelEvery === 0 && (
                <text x={gx + groupW / 2} y={H - M.bottom + 16} textAnchor="middle" fontSize="11" fill="var(--color-fg-muted)">
                  {md(r.bucket_start)}
                </text>
              )}
            </g>
          );
        })}
        <line x1={M.left} x2={W - M.right} y1={y(0)} y2={y(0)} stroke="var(--color-border-strong)" />
      </svg>
    </div>
  );
}
