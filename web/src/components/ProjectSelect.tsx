import type { Project } from "../lib/types";
import { Select, type SelectOption } from "./ui/Select";

// "" stands for "all projects" inside the Select (its values are strings).
const ALL = "";

// First part of the toolbar on the backlog / Gantt / Kanban. Works on the same selection as the
// header's switcher. The Kanban and the performance page pass allowAll (null = all projects).
export function ProjectSelect({
  projects,
  value,
  onChange,
  allowAll = false,
}: {
  projects: Project[];
  value: string | null;
  onChange: (projectId: string | null) => void;
  allowAll?: boolean;
}) {
  // Archived projects drop out, except the one being shown.
  const options: SelectOption<string>[] = projects
    .filter((p) => p.is_active || p.id === value)
    .map((p) => ({ value: p.id, label: p.name }));
  if (allowAll) options.unshift({ value: ALL, label: "すべてのプロジェクト" });

  return (
    <Select
      value={value ?? (allowAll ? ALL : null)}
      onChange={(v) => onChange(v === ALL ? null : v)}
      options={options}
      placeholder="プロジェクトを選択"
      aria-label="プロジェクト"
      className="w-56"
    />
  );
}
