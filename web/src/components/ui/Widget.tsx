import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Card } from "./Card";

type WidgetProps = {
  // パネルの見出し（12px / 500 / fg-muted）。色の印などを前に置くときは ReactNode で渡す。
  title: ReactNode;
  // 見出しの右端に置く補助（期間・粒度など）。
  aside?: ReactNode;
  className?: string;
  // 本文のクラス。省略時は Card に合わせた余白 px-4 py-3。渡すと既定の余白を置き換える（表を端まで出すときは "p-0"）。
  bodyClassName?: string;
  children: ReactNode;
};

// タイトル付きのパネル（ダッシュボードのウィジェット）。ui/Card の上に見出しの帯と本文。
export function Widget({ title, aside, className, bodyClassName, children }: WidgetProps) {
  return (
    <Card className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex min-h-9 items-center gap-2 border-b border-border px-4 py-2">
        {/* 狭いときはタイトルを残し、補助の方を省略する */}
        <div className="flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-fg-muted">{title}</div>
        {aside != null && <div className="min-w-0 flex-1 truncate text-right text-xs text-fg-muted">{aside}</div>}
      </div>
      {/* cn は競合を解決しないので、bodyClassName を渡したら既定の余白は付けない */}
      <div className={cn("min-w-0 flex-1", bodyClassName ?? "px-4 py-3")}>{children}</div>
    </Card>
  );
}
