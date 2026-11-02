import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

// Heading band at the top of every page: the heading and a muted line under it on the left,
// the page's primary action on the right. Work screens (バックログ・ガント・カンバン) put a
// <Toolbar> right under it; reading screens put their max-width body under it.
export function PageHeader({
  title,
  meta,
  back,
  actions,
  className,
}: {
  title: ReactNode;
  // One line under the heading (件数, badges and period, ...).
  meta?: ReactNode;
  // Link back to the parent page, above the heading.
  back?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 flex-wrap items-end gap-4 px-6 pt-6 pb-4", className)}>
      <div className="min-w-0 flex-1">
        {back && <div className="mb-1 text-xs">{back}</div>}
        <h1 className="m-0 text-2xl font-medium leading-tight text-fg">{title}</h1>
        {meta && <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">{meta}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
