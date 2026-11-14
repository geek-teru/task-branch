import { useEffect, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { CloseIcon } from "../Icons";
import { IconButton } from "./Button";

// Centered modal. Render it conditionally; Escape or a click on the backdrop calls onClose.
// Below 768px it fills the screen (no rounded corners) with the title and a close button on top
// and the body scrolling between them. Widths passed in className should be `md:` ones
// (e.g. `md:w-[440px]`) so they apply only to the centered modal.
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
          "flex flex-col bg-surface",
          "max-md:h-dvh max-md:w-full",
          "md:w-[400px] md:max-w-[90vw] md:rounded-md md:border md:border-border md:shadow-lg",
          className,
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center gap-2 border-b border-border px-5 text-sm font-medium text-fg",
            "max-md:min-h-12 max-md:pr-2 max-md:pt-[env(safe-area-inset-top)] md:py-3",
            !title && "md:hidden",
          )}
        >
          <span className="min-w-0 flex-1">{title}</span>
          <IconButton label="閉じる" onClick={onClose} className="size-10! md:hidden">
            <CloseIcon size={18} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4 text-sm leading-relaxed text-fg">{children}</div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
