import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn";

export type ButtonVariant = "primary" | "default" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white border-brand hover:bg-brand-hover hover:border-brand-hover",
  default: "bg-surface text-fg border-border-strong hover:bg-surface-muted",
  ghost: "bg-transparent text-fg border-transparent hover:bg-surface-muted",
  danger: "bg-danger text-white border-danger hover:brightness-90",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-[13px] gap-1",
  md: "h-8 px-3 text-sm gap-1.5",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  // Placed before the label (e.g. <AddIcon />).
  icon?: ReactNode;
};

// Preflight is off, so the classes also clear the browser's button border, background and margin.
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "md", icon, type = "button", className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "m-0 inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-md border font-sans font-medium leading-none transition-colors",
        "outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
});
