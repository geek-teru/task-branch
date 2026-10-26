import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { STATUS_CLASS } from "../../lib/style";
import type { Status } from "../../lib/types";

export type BadgeTone = "neutral" | "brand" | Status;

function toneClass(tone: BadgeTone): string {
  if (tone === "neutral") return "bg-surface-muted border-border-strong text-fg-muted";
  if (tone === "brand") return "bg-accent/10 border-accent text-brand";
  const s = STATUS_CLASS[tone];
  return cn(s.bg, s.border, s.text);
}

type BadgeProps = HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone };

// Small outlined label, like Supabase's "NANO".
export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center whitespace-nowrap rounded border px-1.5 text-[11px] font-medium leading-none",
        toneClass(tone),
        className,
      )}
      {...props}
    />
  );
}
