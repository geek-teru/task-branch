import type { ReactNode } from "react";
import type { Project } from "../lib/types";
import { Avatar } from "./Avatar";
import { ChevronUpDownIcon, GitHubIcon, GlobeIcon, ServiceIcon } from "./Icons";
import { Badge } from "./ui/Badge";
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
  pageTitle,
  userName,
  userAvatarUrl,
  userEmail,
  isGuest = false,
  onOpenSettings,
  onLinkGoogle,
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
  // Set on pages that belong to no project (設定): the breadcrumb shows it instead of the switcher.
  pageTitle?: string;
  userName: string;
  // Uploaded image or Google's; null shows the initial.
  userAvatarUrl: string | null;
  userEmail: string | null;
  // Anonymous sign-in: shows a バッジ and no email.
  isGuest?: boolean;
  onOpenSettings: () => void;
  // Guests only: 「Google で本登録」 (same action as the banner's button).
  onLinkGoogle?: () => void;
  onLogout: () => void;
}) {
  const current = projects.find((p) => p.id === currentProjectId);
  // Active projects first; archived ones follow, greyed out.
  const ordered = [...projects.filter((p) => p.is_active), ...projects.filter((p) => !p.is_active)];
  const allItem = (
    <DropdownMenuItem onSelect={onSelectAllProjects} selected={!!allProjectsLabel && !current}>
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
        {pageTitle ? (
          <span className="truncate px-2 text-[13px] font-medium">{pageTitle}</span>
        ) : (
          <DropdownMenu
            variant="ghost"
            size="sm"
            label="プロジェクトを切り替える"
            className="min-w-0"
            triggerClassName="max-w-full"
            menuClassName="max-h-[60vh] min-w-[240px] overflow-y-auto"
            trigger={
              <>
                <span className={current ? "max-w-[320px] truncate" : allProjectsLabel ? undefined : "text-fg-muted"}>
                  {current?.name ?? allProjectsLabel ?? "プロジェクトを選択"}
                </span>
                <span className="flex text-fg-muted">
                  <ChevronUpDownIcon size={12} />
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
              <DropdownMenuItem key={p.id} onSelect={() => onSelectProject(p.id)} selected={p.id === current?.id}>
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
        )}
        {!pageTitle && current?.repository_url && (
          <HeaderLink href={current.repository_url} label="リポジトリを開く">
            <GitHubIcon size={16} />
          </HeaderLink>
        )}
        {!pageTitle && current?.url && (
          <HeaderLink href={current.url} label="サイトを開く">
            <GlobeIcon size={16} />
          </HeaderLink>
        )}
      </div>

      <DropdownMenu
        variant="ghost"
        size="sm"
        align="end"
        label="ユーザーメニュー"
        menuClassName="min-w-[220px]"
        trigger={<Avatar url={userAvatarUrl} name={userName} className="size-7 text-xs" />}
      >
        <div className="px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium text-fg">{userName}</span>
            {isGuest && <Badge className="shrink-0">ゲスト</Badge>}
          </div>
          {!isGuest && userEmail && userEmail !== userName && <div className="truncate text-xs text-fg-muted">{userEmail}</div>}
        </div>
        {isGuest && onLinkGoogle && <DropdownMenuItem onSelect={onLinkGoogle}>Google で本登録</DropdownMenuItem>}
        <DropdownMenuItem onSelect={onOpenSettings}>設定</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onLogout}>ログアウト</DropdownMenuItem>
      </DropdownMenu>
    </header>
  );
}

// Icon-only link next to the project switcher; opens the project's repository or site in a new tab.
function HeaderLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={`${label}: ${href}`}
      className="flex size-7 shrink-0 items-center justify-center rounded text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
    >
      {children}
    </a>
  );
}
