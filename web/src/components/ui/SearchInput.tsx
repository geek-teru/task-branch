import { cn } from "../../lib/cn";
import { CloseIcon, SearchIcon } from "../Icons";
import { fieldClass } from "./Input";

type SearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  // 「{object}を検索」の形にする（例: プロジェクトを検索）。
  placeholder: string;
  // Read out as the field's name; falls back to the placeholder.
  label?: string;
  className?: string;
};

// Search box for toolbars: a magnifier on the left, and a × to clear once something is typed.
// className goes on the wrapper as in Input; the default width is w-60.
export function SearchInput({ value, onChange, placeholder, label, className }: SearchInputProps) {
  return (
    <div className={cn("relative flex w-60 items-center", className)}>
      <span className="pointer-events-none absolute left-2 flex text-fg-muted">
        <SearchIcon size={14} />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) onChange("");
        }}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        className={cn(fieldClass, "h-8 pl-7 pr-7 [&::-webkit-search-cancel-button]:appearance-none")}
      />
      {value && (
        <button
          type="button"
          title="検索をクリア"
          aria-label="検索をクリア"
          onClick={() => onChange("")}
          className="absolute right-1 m-0 flex h-6 w-6 cursor-pointer items-center justify-center rounded border-0 bg-transparent p-0 text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
        >
          <CloseIcon size={12} />
        </button>
      )}
    </div>
  );
}
