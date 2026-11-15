import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { ChevronDownIcon } from "../Icons";
import {
  setMobileHeaderExpanded,
  useHasToolbar,
  useMobileHeaderExpanded,
  useResetOnUnmount,
} from "../../lib/useMobileHeader";

// Heading band at the top of every page: the heading and a muted line under it on the left,
// the page's primary action on the right. Work screens (バックログ・ガント・カンバン) put a
// <Toolbar> right under it; reading screens put their max-width body under it.
// On phones (< 768px) the band is folded to one short line (the heading, cut off when long) with a
// toggle on the right; the toggle opens the back link, meta, actions and the page's <Toolbar>.
// The side padding drops to px-4 and the actions wrap under the heading when they don't fit.
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
  useResetOnUnmount();
  const expanded = useMobileHeaderExpanded();
  const hasToolbar = useHasToolbar();
  const foldable = Boolean(meta || back || actions || hasToolbar);
  // Classes for the parts that only show on the phone once the band is open.
  const folded = foldable && !expanded ? "max-md:hidden" : "";

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-end gap-x-4 gap-y-3 px-4 pt-4 pb-4 md:px-6 md:pt-6",
        folded && "max-md:items-center max-md:pt-2 max-md:pb-2",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {back && <div className={cn("mb-1 text-xs", folded)}>{back}</div>}
        <h1
          className={cn(
            "m-0 break-words text-xl font-medium leading-tight text-fg md:text-2xl",
            folded && "max-md:truncate max-md:text-base",
          )}
        >
          {title}
        </h1>
        {meta && (
          <div className={cn("mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-muted", folded)}>{meta}</div>
        )}
      </div>
      {actions && <div className={cn("flex shrink-0 items-center gap-2", folded)}>{actions}</div>}
      {foldable && (
        <button
          type="button"
          onClick={() => setMobileHeaderExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? "見出しと絞り込みを畳む" : "見出しと絞り込みを開く"}
          title={expanded ? "畳む" : "開く"}
          className={cn(
            "m-0 inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-transparent p-0 text-fg-muted hover:bg-surface-muted hover:text-fg md:hidden",
            "outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
            expanded && "self-start",
          )}
        >
          <span className={cn("inline-flex transition-transform", expanded && "rotate-180")}>
            <ChevronDownIcon size={16} />
          </span>
        </button>
      )}
    </div>
  );
}
