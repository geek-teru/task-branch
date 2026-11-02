import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/cn";
import type { SortState } from "../../lib/useTableSort";
import { ArrowDownIcon, ArrowUpIcon, ChevronUpDownIcon } from "../Icons";

// A table header cell that sorts its column on click (pair with useTableSort).
// The label is a button so extra children (a resize handle) do not trigger the sort.
// className carries the cell's width and padding.
export function SortableTh<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className,
  style,
  children,
}: {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const dir = sort?.key === sortKey ? sort.dir : null;
  return (
    <th
      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}
      className={cn("font-medium", className)}
      style={style}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        data-tooltip={dir === "asc" ? "降順にする" : dir === "desc" ? "並べ替えを解除" : "昇順に並べ替え"}
        className={cn(
          "group -mx-1 inline-flex max-w-full cursor-pointer items-center gap-1 rounded px-1 font-medium transition-colors hover:text-fg",
          dir && "text-fg",
        )}
      >
        <span className="truncate">{label}</span>
        {dir === "asc" ? (
          <ArrowUpIcon size={12} />
        ) : dir === "desc" ? (
          <ArrowDownIcon size={12} />
        ) : (
          <span className="opacity-0 transition-opacity group-hover:opacity-60">
            <ChevronUpDownIcon size={12} />
          </span>
        )}
      </button>
      {children}
    </th>
  );
}
