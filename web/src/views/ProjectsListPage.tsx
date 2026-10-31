import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import type { Project, ProjectInput } from "../lib/types";
import { cn } from "../lib/cn";
import { ProjectForm } from "../components/ProjectForm";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "../components/ui/DropdownMenu";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import {
  AddIcon,
  BacklogIcon,
  GanttIcon,
  GridIcon,
  KanbanIcon,
  ListIcon,
  MoreIcon,
  ProjectIcon,
  SearchIcon,
} from "../components/Icons";

type StateFilter = "active" | "inactive" | "all";
type SortOrder = "created" | "name";
type ViewMode = "grid" | "list";

const VIEW_KEY = "projects.view";

// Project list: navigate only. Editing / deleting / exporting lives on the detail page.
export function ProjectsListPage({
  projects,
  onCreate,
  onShowDetail,
  onShowBacklog,
  onShowGantt,
  onShowKanban,
}: {
  projects: Project[];
  onCreate: (input: ProjectInput) => void;
  onShowDetail: (projectId: string) => void;
  onShowBacklog: (projectId: string) => void;
  onShowGantt: (projectId: string) => void;
  onShowKanban: (projectId: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("active");
  const [sortOrder, setSortOrder] = useState<SortOrder>("created");
  const [view, setView] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
    } catch {
      return "grid"; // storage can be unavailable (private mode)
    }
  });

  const changeView = (next: ViewMode) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Ignore: the view still applies for this session.
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = projects.filter(
      (p) =>
        (stateFilter === "all" || p.is_active === (stateFilter === "active")) &&
        (!q || p.name.toLowerCase().includes(q)),
    );
    // projects already arrive in creation order.
    return sortOrder === "name" ? [...filtered].sort((a, b) => a.name.localeCompare(b.name, "ja")) : filtered;
  }, [projects, query, stateFilter, sortOrder]);

  const menu = (p: Project) => (
    <ProjectMenu
      onShowDetail={() => onShowDetail(p.id)}
      onShowBacklog={() => onShowBacklog(p.id)}
      onShowGantt={() => onShowGantt(p.id)}
      onShowKanban={() => onShowKanban(p.id)}
    />
  );

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        <h1 className="m-0 mb-6 text-2xl font-medium text-fg">プロジェクト</h1>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <Input
            icon={<SearchIcon size={14} />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="プロジェクトを検索"
            aria-label="プロジェクトを名前で絞り込む"
            className="w-60"
          />
          <Select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as StateFilter)}
            aria-label="状態"
            className="w-36"
          >
            <option value="active">Active</option>
            <option value="inactive">InActive</option>
            <option value="all">すべて</option>
          </Select>
          <Select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            aria-label="並び"
            className="w-32"
          >
            <option value="created">作成順</option>
            <option value="name">名前順</option>
          </Select>

          <div className="ml-auto flex items-center gap-2">
            <div className="inline-flex rounded-md border border-border-strong bg-surface p-0.5">
              <ViewToggle label="グリッド表示" active={view === "grid"} onClick={() => changeView("grid")}>
                <GridIcon size={14} />
              </ViewToggle>
              <ViewToggle label="リスト表示" active={view === "list"} onClick={() => changeView("list")}>
                <ListIcon size={14} />
              </ViewToggle>
            </div>
            <Button variant="primary" icon={<AddIcon size={14} />} onClick={() => setCreating(true)}>
              新規プロジェクト
            </Button>
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="rounded-md border border-dashed border-border-strong px-6 py-12 text-center text-[13px] text-fg-muted">
            {projects.length === 0
              ? "プロジェクトがありません。「新規プロジェクト」から作成してください。"
              : "条件に合うプロジェクトがありません。"}
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4">
            {visible.map((p) => (
              <Card
                key={p.id}
                interactive
                role="link"
                tabIndex={0}
                onClick={() => onShowDetail(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onShowDetail(p.id);
                }}
                className="flex min-h-[148px] flex-col p-4 outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface-muted text-fg-muted">
                    <ProjectIcon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-fg">{p.name}</div>
                    <div
                      className={cn(
                        "mt-1 line-clamp-2 text-[13px] leading-snug",
                        p.description ? "text-fg-muted" : "text-fg-muted/60",
                      )}
                    >
                      {p.description ?? "説明なし"}
                    </div>
                  </div>
                  {menu(p)}
                </div>

                {(p.url || p.repository_url) && (
                  <div className="mt-3 flex flex-col gap-0.5 pl-11 text-xs">
                    {p.url && <ExternalLink href={p.url} />}
                    {p.repository_url && <ExternalLink href={p.repository_url} />}
                  </div>
                )}

                {!p.is_active && (
                  <div className="mt-auto pt-3 pl-11">
                    <Badge>InActive</Badge>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-border bg-surface">
            <table className="w-full table-fixed border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border bg-surface-muted text-left text-xs text-fg-muted">
                  <th className="w-[32%] px-4 py-2 font-medium">名前</th>
                  <th className="px-4 py-2 font-medium">説明</th>
                  <th className="w-28 px-4 py-2 font-medium">状態</th>
                  <th className="w-32 px-4 py-2 font-medium">作成日</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => onShowDetail(p.id)}
                    className="cursor-pointer border-b border-border last:border-b-0 hover:bg-surface-muted"
                  >
                    <td className="truncate px-4 py-2.5 font-medium text-fg">{p.name}</td>
                    <td className="truncate px-4 py-2.5 text-fg-muted">{p.description ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={p.is_active ? "brand" : "neutral"}>{p.is_active ? "Active" : "InActive"}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-fg-muted">{new Date(p.created_at).toLocaleDateString("ja-JP")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <ProjectForm
          initial={null}
          onSubmit={(input) => {
            onCreate(input);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      )}
    </div>
  );
}

// ⋮ on a card: jump to the project's screens. The click must not reach the card.
function ProjectMenu({
  onShowDetail,
  onShowBacklog,
  onShowGantt,
  onShowKanban,
}: {
  onShowDetail: () => void;
  onShowBacklog: () => void;
  onShowGantt: () => void;
  onShowKanban: () => void;
}) {
  return (
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <DropdownMenu
        trigger={<MoreIcon size={14} />}
        label="そのほかの操作"
        variant="ghost"
        size="sm"
        align="end"
        className="-mr-1.5 -mt-1"
      >
        <DropdownMenuItem onSelect={onShowDetail} icon={<ProjectIcon size={14} />}>
          詳細
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onShowBacklog} icon={<BacklogIcon size={14} />}>
          バックログ
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onShowGantt} icon={<GanttIcon size={14} />}>
          ガントチャート
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onShowKanban} icon={<KanbanIcon size={14} />}>
          カンバン
        </DropdownMenuItem>
      </DropdownMenu>
    </div>
  );
}

function ViewToggle({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "m-0 flex h-[26px] w-7 cursor-pointer items-center justify-center rounded border-0 transition-colors",
        active ? "bg-surface-muted text-fg shadow-[inset_0_0_0_1px_var(--color-border)]" : "bg-transparent text-fg-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

// URL shown small on a card; opening it must not open the project.
function ExternalLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={href}
      onClick={(e: MouseEvent) => e.stopPropagation()}
      className="truncate text-fg-muted no-underline hover:text-fg hover:underline"
    >
      {href.replace(/^https?:\/\//, "")}
    </a>
  );
}
