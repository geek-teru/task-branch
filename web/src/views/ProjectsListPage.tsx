import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import type { Project, ProjectInput } from "../lib/types";
import { cn } from "../lib/cn";
import { ProjectForm } from "../components/ProjectForm";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "../components/ui/DropdownMenu";
import { SearchInput } from "../components/ui/SearchInput";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { Select } from "../components/ui/Select";
import { Toolbar, ToolbarEnd } from "../components/ui/Toolbar";
import { StateFilterSelect, type StateFilter } from "../components/StateFilterSelect";
import {
  AddIcon,
  BacklogIcon,
  GanttIcon,
  GitHubIcon,
  GlobeIcon,
  GridIcon,
  KanbanIcon,
  ListIcon,
  MoreIcon,
  ProjectIcon,
} from "../components/Icons";

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
      <PageHeader
        title="プロジェクト"
        meta={`${visible.length} 件`}
        actions={
          <Button variant="primary" icon={<AddIcon size={14} />} onClick={() => setCreating(true)}>
            New Project
          </Button>
        }
      />
      <div className="max-w-[1200px] px-6 pb-6">
        <Toolbar variant="inline" className="mb-4">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="プロジェクトを検索"
            label="プロジェクトを名前で絞り込む"
          />
          <StateFilterSelect value={stateFilter} onChange={setStateFilter} />
          <Select
            value={sortOrder}
            onChange={setSortOrder}
            options={[
              { value: "created", label: "作成順" },
              { value: "name", label: "名前順" },
            ]}
            aria-label="並び"
            className="w-32"
          />

          <ToolbarEnd>
            <SegmentedControl
              value={view}
              onChange={changeView}
              label="表示"
              options={[
                { value: "grid", label: "グリッド表示", icon: <GridIcon size={14} /> },
                { value: "list", label: "リスト表示", icon: <ListIcon size={14} /> },
              ]}
            />
          </ToolbarEnd>
        </Toolbar>

        {visible.length === 0 ? (
          <div className="rounded-md border border-dashed border-border-strong px-6 py-12 text-center text-[13px] text-fg-muted">
            {projects.length === 0
              ? "プロジェクトがありません。「New Project」から作成してください。"
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
                  <div className="mt-3 flex items-center gap-1 pl-11">
                    {p.url && (
                      <ExternalLink href={p.url} label="Web サイト">
                        <GlobeIcon size={16} />
                      </ExternalLink>
                    )}
                    {p.repository_url && (
                      <ExternalLink href={p.repository_url} label="リポジトリ">
                        <GitHubIcon size={16} />
                      </ExternalLink>
                    )}
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

// URL shown as an icon on a card (the URL itself is in the tooltip); opening it must not open the project.
function ExternalLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      data-tooltip={href}
      aria-label={`${label}: ${href}`}
      onClick={(e: MouseEvent) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="flex h-7 w-7 items-center justify-center rounded text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg"
    >
      {children}
    </a>
  );
}
