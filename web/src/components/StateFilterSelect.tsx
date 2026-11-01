import { Select, type SelectOption } from "./ui/Select";

export type StateFilter = "all" | "active" | "inactive";

const OPTIONS: SelectOption<StateFilter>[] = [
  { value: "all", label: "すべて" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "InActive" },
];

// Active / InActive filter, the same options in the same order on every screen.
// The default value stays with each screen (projects: active, backlog: all).
export function StateFilterSelect({ value, onChange }: { value: StateFilter; onChange: (value: StateFilter) => void }) {
  return <Select value={value} onChange={onChange} options={OPTIONS} aria-label="状態" className="w-32" />;
}
