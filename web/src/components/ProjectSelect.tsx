import type { Organization, Project } from "../lib/types";
import { projectOwnerName } from "../lib/projectOwner";
import { Select, type SelectOption } from "./ui/Select";

// "" stands for "all projects" inside the Select (its values are strings).
const ALL = "";

// First part of the toolbar on the backlog / Gantt / Kanban. Works on the same selection as the
// header's switcher. The Kanban and the performance page pass allowAll (null = all projects).
// When some project belongs to an organization, the list is grouped under 個人 / <組織名>.
export function ProjectSelect({
  projects,
  orgs = [],
  value,
  onChange,
  allowAll = false,
}: {
  projects: Project[];
  // Organizations the user belongs to: their names head the groups, in this order.
  orgs?: Organization[];
  value: string | null;
  onChange: (projectId: string | null) => void;
  allowAll?: boolean;
}) {
  // Archived projects drop out, except the one being shown.
  const shown = projects.filter((p) => p.is_active || p.id === value);
  const grouped = shown.some((p) => p.org_id);
  // 個人 first, then the organizations in the user's order (unknown ones last). Stable within a group.
  const rank = (p: Project) => {
    if (!p.org_id) return -1;
    const i = orgs.findIndex((o) => o.id === p.org_id);
    return i < 0 ? orgs.length : i;
  };
  const ordered = grouped ? [...shown].sort((a, b) => rank(a) - rank(b)) : shown;
  const options: SelectOption<string>[] = ordered.map((p) => ({
    value: p.id,
    label: p.name,
    group: grouped ? projectOwnerName(p, orgs) : undefined,
  }));
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
