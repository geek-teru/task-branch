import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Button, type ButtonSize, type ButtonVariant } from "./Button";

const CloseContext = createContext<() => void>(() => {});

// A button that opens a menu below it. A click outside or Escape closes it.
export function DropdownMenu({
  trigger,
  align = "start",
  variant = "default",
  size = "md",
  label,
  children,
  className,
  menuClassName,
}: {
  // What the button shows (text, icon, or both).
  trigger: ReactNode;
  // Which edge of the button the menu lines up with.
  align?: "start" | "end";
  variant?: ButtonVariant;
  size?: ButtonSize;
  // aria-label for icon-only triggers such as ⋮.
  label?: string;
  children: ReactNode;
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <Button
        variant={variant}
        size={size}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {trigger}
      </Button>
      {open && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "absolute top-full z-40 mt-1 min-w-[160px] rounded-md border border-border bg-surface py-1 shadow-md",
            align === "end" ? "right-0" : "left-0",
            menuClassName,
          )}
        >
          <CloseContext.Provider value={() => setOpen(false)}>{children}</CloseContext.Provider>
        </div>
      )}
    </div>
  );
}

export function DropdownMenuItem({
  onSelect,
  danger,
  icon,
  disabled,
  children,
}: {
  onSelect: () => void;
  danger?: boolean;
  icon?: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}) {
  const close = useContext(CloseContext);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        close();
        onSelect();
      }}
      className={cn(
        "m-0 flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left font-sans text-[13px]",
        "hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50",
        danger ? "text-danger" : "text-fg",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function DropdownMenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-border" />;
}
