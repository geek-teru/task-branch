import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";
import { fieldClass } from "./Input";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

// Native <select> with the browser arrow replaced by our own ▾. className goes on the wrapper, as in Input.
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, children, ...props }, ref) {
  return (
    <div className={cn("relative flex items-center", className)}>
      <select ref={ref} className={cn(fieldClass, "h-8 cursor-pointer appearance-none pl-2.5 pr-7")} {...props}>
        {children}
      </select>
      <svg
        width="12"
        height="12"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="pointer-events-none absolute right-2 text-fg-muted"
      >
        <path d="M4 6l4 4 4-4" />
      </svg>
    </div>
  );
});
