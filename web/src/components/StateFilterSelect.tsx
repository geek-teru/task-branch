import { Select } from "./ui/Select";

export type StateFilter = "all" | "active" | "inactive";

// Active / InActive filter, the same options in the same order on every screen.
// The default value stays with each screen (projects: active, backlog: all).
export function StateFilterSelect({ value, onChange }: { value: StateFilter; onChange: (value: StateFilter) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as StateFilter)} aria-label="状態" className="w-32">
      <option value="all">すべて</option>
      <option value="active">Active</option>
      <option value="inactive">InActive</option>
    </Select>
  );
}
