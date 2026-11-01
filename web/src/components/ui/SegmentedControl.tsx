import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export type SegmentedOption<T extends string> = {
  value: T;
  // Tooltip and accessible name; shown as text when there is no icon.
  label: string;
  icon?: ReactNode;
};

type SegmentedControlProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedOption<T>[];
  // Name of the whole group (e.g. 表示).
  label: string;
  className?: string;
};

// One-of-n switch such as grid / list. h-8 outside, like Input / Select / Button.
export function SegmentedControl<T extends string>({ value, onChange, options, label, className }: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex h-8 shrink-0 items-center rounded-md border border-border-strong bg-surface p-0.5", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            title={o.label}
            aria-label={o.label}
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "m-0 flex h-[26px] cursor-pointer items-center justify-center rounded border-0 font-sans text-xs transition-colors",
              o.icon ? "w-7" : "px-2.5",
              active
                ? "bg-surface-muted text-fg shadow-[inset_0_0_0_1px_var(--color-border)]"
                : "bg-transparent text-fg-muted hover:text-fg",
            )}
          >
            {o.icon ?? o.label}
          </button>
        );
      })}
    </div>
  );
}
