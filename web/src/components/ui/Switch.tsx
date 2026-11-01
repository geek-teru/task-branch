import { cn } from "../../lib/cn";

type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
};

// On / off toggle with its label on the right. h-8 so it lines up with the other toolbar parts.
export function Switch({ checked, onChange, label, className }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "group m-0 inline-flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-1 font-sans text-xs text-fg-muted",
        "outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-brand/30",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand" : "bg-border-strong group-hover:bg-fg-muted/50",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-[left]",
            checked ? "left-[14px]" : "left-0.5",
          )}
        />
      </span>
      {label}
    </button>
  );
}
