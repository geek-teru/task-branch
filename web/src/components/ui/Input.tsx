import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../lib/cn";

// Shared by Input / Select / Textarea so the three fields look the same.
export const fieldClass = cn(
  "m-0 w-full rounded-md border border-border-strong bg-surface font-sans text-[13px] text-fg",
  "placeholder:text-fg-muted outline-none transition-colors",
  "focus:border-brand focus:ring-2 focus:ring-brand/20",
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-fg-muted",
);

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  // Placed inside the field on the left (e.g. a magnifier).
  icon?: ReactNode;
};

// className goes on the wrapper, so width / flex utilities size the whole field.
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ icon, className, ...props }, ref) {
  return (
    <div className={cn("relative flex items-center", className)}>
      {icon && (
        <span className="pointer-events-none absolute left-2 flex text-fg-muted">{icon}</span>
      )}
      <input ref={ref} className={cn(fieldClass, "h-8", icon ? "pl-7 pr-2.5" : "px-2.5")} {...props} />
    </div>
  );
});
