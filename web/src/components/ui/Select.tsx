import { useCallback, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { ChevronDownIcon } from "../Icons";
import { MenuCheck, menuItemClass, menuPanelClass, useDismiss, useMenuPosition } from "./DropdownMenu";
import { fieldClass } from "./Input";

export type SelectOption<T extends string> = { value: T; label: ReactNode };

type SelectProps<T extends string> = {
  // null shows the placeholder (nothing chosen yet).
  value: T | null;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: ReactNode;
  "aria-label"?: string;
  // Shown as a tooltip on the field.
  tooltip?: string;
  // Goes on the wrapper, so width utilities size the field (as in Input).
  className?: string;
  autoFocus?: boolean;
  // Open the list right away (a field that turns into a Select on click, e.g. the story picker).
  defaultOpen?: boolean;
  // Called whenever the list closes, chosen or not.
  onClose?: () => void;
  disabled?: boolean;
};

// Single-choice field. Looks like Input when closed; the open list is the same panel as DropdownMenu.
// Keyboard: ↑ ↓ Home End move, Enter / Space choose, Escape / Tab close. Focus stays on the button.
export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder = "選択してください",
  "aria-label": ariaLabel,
  tooltip,
  className,
  autoFocus,
  defaultOpen = false,
  onClose,
  disabled,
}: SelectProps<T>) {
  const selectedIndex = options.findIndex((o) => o.value === value);
  const [open, setOpen] = useState(defaultOpen);
  const [active, setActive] = useState(Math.max(selectedIndex, 0));
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const position = useMenuPosition(open, rootRef, panelRef, "start", true);

  const openList = () => {
    setActive(Math.max(selectedIndex, 0));
    setOpen(true);
  };
  const close = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);
  useDismiss(open, rootRef, close);

  const choose = (i: number) => {
    const o = options[i];
    close();
    if (o && o.value !== value) onChange(o.value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    const last = options.length - 1;
    const move: Record<string, number> = {
      ArrowDown: Math.min(active + 1, last),
      ArrowUp: Math.max(active - 1, 0),
      Home: 0,
      End: last,
    };
    if (e.key in move) {
      e.preventDefault();
      setActive(move[e.key]);
      panelRef.current?.children[move[e.key]]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      // Keep a surrounding Dialog from closing too.
      e.stopPropagation();
      close();
    } else if (e.key === "Tab") {
      close();
    }
  };

  return (
    <div ref={rootRef} className={cn("relative flex items-center", className)}>
      <button
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        data-tooltip={tooltip}
        autoFocus={autoFocus || defaultOpen}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className={cn(fieldClass, "flex h-8 cursor-pointer items-center pl-2.5 pr-7 text-left")}
      >
        <span className={cn("truncate", selectedIndex < 0 && "text-fg-muted")}>
          {selectedIndex >= 0 ? options[selectedIndex].label : placeholder}
        </span>
      </button>
      <span className="pointer-events-none absolute right-2 flex text-fg-muted">
        <ChevronDownIcon size={12} />
      </span>
      {open && (
        <div ref={panelRef} id={listId} role="listbox" className={menuPanelClass} style={position}>
          {options.map((o, i) => (
            <div
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              onPointerEnter={() => setActive(i)}
              // Keep focus on the button so the keyboard keeps working.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
              className={cn(menuItemClass, "text-fg", i === active && "bg-surface-muted")}
            >
              <MenuCheck on={o.value === value} />
              <span className="truncate">{o.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
