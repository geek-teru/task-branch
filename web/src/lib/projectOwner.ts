import type { Organization, Project } from "./types";

// Display name of a project's owner: 個人, or the organization's name. A project of an organization
// missing from the list (shouldn't happen: RLS shows organization projects to members only) gets 組織.
export function projectOwnerName(project: Project, orgs: Organization[]): string {
  if (!project.org_id) return "個人";
  return orgs.find((o) => o.id === project.org_id)?.name ?? "組織";
}
