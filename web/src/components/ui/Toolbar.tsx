import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

const VARIANT = {
  // Top of a full-height screen (バックログ, カンバン): white bar with a bottom border.
  bar: "shrink-0 border-b border-border bg-surface px-3 py-2",
  // Inside a page's body, under its heading (プロジェクト一覧): no bar.
  inline: "",
};

// Order on the left: search → filter Select → sort Select → Switch. Put the view switch and
// the primary add button in <ToolbarEnd> on the right. Every part is h-8.
export function Toolbar({
  variant = "bar",
  className,
  children,
}: {
  variant?: keyof typeof VARIANT;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("flex flex-wrap items-center gap-2", VARIANT[variant], className)}>{children}</div>;
}

export function ToolbarEnd({ children }: { children: ReactNode }) {
  return <div className="ml-auto flex items-center gap-2">{children}</div>;
}
