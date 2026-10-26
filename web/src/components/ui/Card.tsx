import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  // Clickable card: the border darkens on hover.
  interactive?: boolean;
};

export function Card({ interactive, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-border bg-surface",
        interactive && "cursor-pointer transition-colors hover:border-border-strong",
        className,
      )}
      {...props}
    />
  );
}
