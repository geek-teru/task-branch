import type { Project } from "../lib/types";
import { ServiceIcon } from "./Icons";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "./ui/DropdownMenu";

export const HEADER_H = 48;

// Full-width bar across the top of every signed-in page: breadcrumb with the project switcher on
// the left, the user menu on the right.
export function GlobalHeader({
  projects,
  currentProjectId,
  allProjectsLabel,
  onSelectProject,
  onSelectAllProjects,
  userName,
  userEmail,
  onLogout,
}: {
  projects: Project[];
  // The project the page shows; null when the page has none.
  currentProjectId: string | null;
  // Set on pages where "all projects" is itself a choice (the Kanban): the switcher shows it when
  // no project is picked, and the menu offers it first instead of linking to the project list.
  allProjectsLabel?: string;
  onSelectProject: (projectId: string) => void;
  // Clears the project (Kanban) or opens the project list (other pages).
  onSelectAllProjects: () => void;
  userName: string;
  userEmail: string | null;
  onLogout: () => void;
}) {
  const current = projects.find((p) => p.id === currentProjectId);
  // Active projects first; archived ones follow, greyed out.
  const ordered = [...projects.filter((p) => p.is_active), ...projects.filter((p) => !p.is_active)];
  const allItem = (
    <DropdownMenuItem onSelect={onSelectAllProjects} icon={<Check on={!!allProjectsLabel && !current} />}>
      すべてのプロジェクト
    </DropdownMenuItem>
  );

  return (
    <header
      className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 text-fg"
      style={{ height: HEADER_H }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="flex shrink-0 items-center gap-2 text-[15px] font-medium whitespace-nowrap">
          <ServiceIcon />
          task-branch
        </span>
        <span className="shrink-0 text-lg text-border-strong" aria-hidden>
          /
        </span>
        <DropdownMenu
          variant="ghost"
          size="sm"
          label="プロジェクトを切り替える"
          className="min-w-0"
          menuClassName="max-h-[60vh] min-w-[240px] overflow-y-auto"
          trigger={
            <>
              <span className={current ? "max-w-[320px] truncate" : allProjectsLabel ? undefined : "text-fg-muted"}>
                {current?.name ?? allProjectsLabel ?? "プロジェクトを選択"}
              </span>
              <span className="text-fg-muted" aria-hidden>
                ⇅
              </span>
            </>
          }
        >
          {allProjectsLabel && (
            <>
              {allItem}
              <DropdownMenuSeparator />
            </>
          )}
          {ordered.map((p) => (
            <DropdownMenuItem key={p.id} onSelect={() => onSelectProject(p.id)} icon={<Check on={p.id === current?.id} />}>
              <span className={p.is_active ? "truncate" : "truncate text-fg-muted"}>{p.name}</span>
            </DropdownMenuItem>
          ))}
          {ordered.length === 0 && <div className="px-3 py-1.5 text-[13px] text-fg-muted">プロジェクトがありません</div>}
          {!allProjectsLabel && (
            <>
              <DropdownMenuSeparator />
              {allItem}
            </>
          )}
        </DropdownMenu>
      </div>

      <DropdownMenu
        variant="ghost"
        size="sm"
        align="end"
        label="ユーザーメニュー"
        menuClassName="min-w-[220px]"
        trigger={
          <span className="flex size-7 items-center justify-center rounded-full border border-border bg-surface-muted text-xs font-medium text-fg">
            {initial(userName)}
          </span>
        }
      >
        <div className="px-3 py-2">
          <div className="truncate text-[13px] font-medium text-fg">{userName}</div>
          {userEmail && userEmail !== userName && <div className="truncate text-xs text-fg-muted">{userEmail}</div>}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout}>ログアウト</DropdownMenuItem>
      </DropdownMenu>
    </header>
  );
}

// Fixed-width slot so checked and unchecked items line up.
function Check({ on }: { on: boolean }) {
  return (
    <span className="w-3 shrink-0 text-brand" aria-hidden>
      {on ? "✓" : ""}
    </span>
  );
}

function initial(name: string): string {
  const first = [...name.trim()][0];
  return first ? first.toUpperCase() : "?";
}
