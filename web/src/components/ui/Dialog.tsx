import { useEffect, type ReactNode } from "react";
import { cn } from "../../lib/cn";

// Centered modal. Render it conditionally; Escape or a click on the backdrop calls onClose.
export function Dialog({
  title,
  children,
  footer,
  onClose,
  className,
}: {
  title?: ReactNode;
  children: ReactNode;
  // The button row at the bottom, right-aligned.
  footer?: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-[400px] max-w-[90vw] rounded-md border border-border bg-surface shadow-lg",
          className,
        )}
      >
        {title && (
          <div className="border-b border-border px-5 py-3 text-sm font-medium text-fg">{title}</div>
        )}
        <div className="px-5 py-4 text-sm leading-relaxed text-fg">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
