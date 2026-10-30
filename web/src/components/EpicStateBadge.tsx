import { useState } from "react";
import { cn } from "../lib/cn";
import { Badge } from "./ui/Badge";

// Active / InActive のバッジ。onPick があるとクリックでプルダウンを出し、
// 選んだ状態を返す（確認モーダルは呼び出し側が出す）。
export function EpicStateBadge({ active, onPick }: { active: boolean; onPick?: (next: boolean) => void }) {
  // 表の中でも隠れないよう、メニューはボタンの位置に合わせた固定配置で出す
  // （表は角丸のため overflow: hidden になっている）。
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const label = active ? "Active" : "InActive";
  const badge = <Badge tone={active ? "brand" : "neutral"}>{label}</Badge>;

  if (!onPick) return badge;

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          if (at) return setAt(null);
          const r = e.currentTarget.getBoundingClientRect();
          setAt({ left: r.left, top: r.bottom + 4 });
        }}
        title="クリックで状態を変更"
        className="m-0 inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0"
      >
        {badge}
        <span className="text-[10px] text-fg-muted">▾</span>
      </button>
      {at && (
        <>
          {/* click-away closes the menu */}
          <span onClick={() => setAt(null)} className="fixed inset-0 z-[19]" />
          <span
            className="fixed z-20 min-w-24 rounded-md border border-border bg-surface p-1 shadow-md"
            style={{ left: at.left, top: at.top }}
          >
            {[true, false].map((value) => (
              <button
                type="button"
                key={String(value)}
                onClick={() => {
                  setAt(null);
                  if (value !== active) onPick(value);
                }}
                className={cn(
                  "m-0 block w-full cursor-pointer whitespace-nowrap rounded border-0 px-2.5 py-1 text-left text-[13px] text-fg hover:bg-surface-muted",
                  value === active ? "bg-surface-muted" : "bg-transparent",
                )}
              >
                {value ? "Active" : "InActive"}
              </button>
            ))}
          </span>
        </>
      )}
    </span>
  );
}
