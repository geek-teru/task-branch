import { useEffect, useState } from "react";
import { getUsageTotals } from "../lib/api";
import type { UsageTotals } from "../lib/types";
import { cn } from "../lib/cn";
import { Card } from "./ui/Card";

// "AI の使用量" card: cumulative tokens / cost of the AI agents' API responses tied to a project,
// or with storyId to a story and its tasks (RPC usage_totals). Loads its own data; a failure is
// shown inside the card so the rest of the page keeps working.
export function UsageSummary({
  projectId,
  storyId = null,
  className,
}: {
  projectId: string;
  storyId?: string | null;
  className?: string;
}) {
  const [totals, setTotals] = useState<UsageTotals | null | undefined>(undefined); // undefined = loading, null = failed

  useEffect(() => {
    let cancelled = false;
    setTotals(undefined);
    getUsageTotals(projectId, storyId)
      .then((t) => !cancelled && setTotals(t))
      .catch(() => !cancelled && setTotals(null));
    return () => {
      cancelled = true;
    };
  }, [projectId, storyId]);

  const scope = storyId ? "このストーリーと配下のタスク" : "このプロジェクトのタスク";

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex min-h-12 items-center gap-3 border-b border-border px-5 py-2">
        <h2 className="m-0 shrink-0 whitespace-nowrap text-sm font-medium text-fg">AI の使用量</h2>
        <span className="text-[11px] text-fg-muted">{scope}にひも付いた累計</span>
      </div>
      {totals === undefined ? (
        <div className="px-5 py-4 text-[13px] text-fg-muted">読み込み中…</div>
      ) : totals === null ? (
        <div className="px-5 py-4 text-[13px] text-fg-muted">使用量を取得できませんでした。</div>
      ) : totals.responses === 0 ? (
        <div className="px-5 py-4 text-[13px] text-fg-muted">まだ記録がありません。</div>
      ) : (
        <>
          <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-4">
            <Stat label="費用" value={fmtCost(totals.cost_usd)} strong />
            <Stat label="合計トークン" value={fmtNum(totalTokens(totals))} strong />
            <Stat label="応答数" value={fmtNum(totals.responses)} />
            <Stat label="期間" value={fmtPeriod(totals.first_at, totals.last_at)} />
            <Stat label="入力" value={fmtNum(totals.input_tokens)} />
            <Stat label="出力" value={fmtNum(totals.output_tokens)} />
            <Stat label="キャッシュ読み" value={fmtNum(totals.cache_read_input_tokens)} />
            <Stat label="キャッシュ作成" value={fmtNum(totals.cache_creation_input_tokens)} />
          </dl>
          {totals.uncosted_responses > 0 && (
            <div className="border-t border-border px-5 py-2 text-[11px] text-fg-muted">
              費用が記録されていない応答が {fmtNum(totals.uncosted_responses)} 件あり、費用には含まれていません。
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className={cn("m-0 mt-0.5 truncate tabular-nums text-fg", strong ? "text-lg font-medium" : "text-[13px]")}>
        {value}
      </dd>
    </div>
  );
}

function totalTokens(t: UsageTotals): number {
  return t.input_tokens + t.output_tokens + t.cache_read_input_tokens + t.cache_creation_input_tokens;
}

function fmtNum(n: number): string {
  return n.toLocaleString("ja-JP");
}

function fmtCost(usd: number | null): string {
  if (usd === null) return "—";
  return `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPeriod(first: string | null, last: string | null): string {
  if (!first || !last) return "—";
  const d = (iso: string) => new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
  const a = d(first);
  const b = d(last);
  return a === b ? a : `${a} 〜 ${b}`;
}
