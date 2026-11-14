import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

// Heading band at the top of every page: the heading and a muted line under it on the left,
// the page's primary action on the right. Work screens (バックログ・ガント・カンバン) put a
// <Toolbar> right under it; reading screens put their max-width body under it.
// On phones (< 768px) the side padding drops to px-4 and the actions wrap under the heading
// when they don't fit beside it.
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
    <div className={cn("flex shrink-0 flex-wrap items-end gap-x-4 gap-y-3 px-4 pt-4 pb-4 md:px-6 md:pt-6", className)}>
      <div className="min-w-0 flex-1">
        {back && <div className="mb-1 text-xs">{back}</div>}
        <h1 className="m-0 break-words text-xl font-medium leading-tight text-fg md:text-2xl">{title}</h1>
        {meta && <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
