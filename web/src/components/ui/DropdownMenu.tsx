import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { cn } from "../../lib/cn";
import { CheckIcon } from "../Icons";
import { Button, type ButtonSize, type ButtonVariant } from "./Button";

// The open list of every dropdown (DropdownMenu, Select). Shared so they look the same.
export const menuPanelClass =
  "fixed z-40 max-h-80 min-w-[160px] overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-md";
export const menuItemClass = cn(
  "m-0 flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-1.5 text-left font-sans text-[13px]",
  "hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50",
);

// Left slot of a single-choice item: a check on the chosen one, blank on the rest, so labels line up.
export function MenuCheck({ on }: { on: boolean }) {
  return <span className="flex w-3.5 shrink-0 text-brand">{on && <CheckIcon size={14} />}</span>;
}

// Places the open list under the anchor with position: fixed, so it is not clipped by a table or a
// scrolling panel (overflow: hidden / auto). Opens upward when there is no room below, and follows
// the anchor while the page scrolls. matchWidth makes the list at least as wide as the anchor (Select).
export function useMenuPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  align: "start" | "end",
  matchWidth = false,
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden" });
  useLayoutEffect(() => {
    if (!open) {
      setStyle({ visibility: "hidden" });
      return;
    }
    const place = () => {
      const a = anchorRef.current?.getBoundingClientRect();
      const h = panelRef.current?.offsetHeight ?? 0;
      const w = Math.max(panelRef.current?.offsetWidth ?? 0, matchWidth && a ? a.width : 0);
      if (!a) return;
      const below = window.innerHeight - a.bottom;
      const top = below < h + 8 && a.top > below ? a.top - h - 4 : a.bottom + 4;
      const minWidth = matchWidth ? a.width : undefined;
      // Keep the list inside the window horizontally (a badge at the right edge of a table).
      const edge = 8;
      setStyle(
        align === "end"
          ? { top, right: Math.max(Math.min(window.innerWidth - a.right, window.innerWidth - w - edge), edge), minWidth }
          : { top, left: Math.max(Math.min(a.left, window.innerWidth - w - edge), edge), minWidth },
      );
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, align, matchWidth, anchorRef, panelRef]);
  return style;
}

// Closes on a pointer down outside root, and on Escape.
export function useDismiss(open: boolean, rootRef: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, rootRef, close]);
}

const CloseContext = createContext<() => void>(() => {});

// A button that opens a menu below it. A click outside or Escape closes it.
export function DropdownMenu({
  trigger,
  align = "start",
  variant = "default",
  size = "md",
  label,
  title,
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
  // Tooltip on the trigger.
  title?: string;
  children: ReactNode;
  className?: string;
  menuClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useRef(() => setOpen(false)).current;
  useDismiss(open, rootRef, close);
  const position = useMenuPosition(open, rootRef, panelRef, align);

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <Button
        variant={variant}
        size={size}
        aria-label={label}
        title={title}
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
          ref={panelRef}
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className={cn(menuPanelClass, menuClassName)}
          style={position}
        >
          <CloseContext.Provider value={close}>{children}</CloseContext.Provider>
        </div>
      )}
    </div>
  );
}

export function DropdownMenuItem({
  onSelect,
  danger,
  icon,
  selected,
  disabled,
  children,
}: {
  onSelect: () => void;
  danger?: boolean;
  icon?: ReactNode;
  // Single-choice menus (project switcher, status): pass true / false and the chosen item gets a check.
  selected?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  const close = useContext(CloseContext);
  const choice = selected !== undefined;
  return (
    <button
      type="button"
      role={choice ? "menuitemradio" : "menuitem"}
      aria-checked={choice ? selected : undefined}
      disabled={disabled}
      onClick={() => {
        close();
        onSelect();
      }}
      className={cn(menuItemClass, danger ? "text-danger" : "text-fg")}
    >
      {choice && <MenuCheck on={selected} />}
      {icon}
      {children}
    </button>
  );
}

export function DropdownMenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-border" />;
}
