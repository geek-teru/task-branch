import { useState, type ReactNode } from "react";
import { cn } from "../lib/cn";
import { useResizableWidth } from "../lib/useResizableWidth";
import { BacklogIcon, GanttIcon, KanbanIcon, OrgIcon, PerformanceIcon, ProjectIcon, TimelineIcon } from "./Icons";
import { Button } from "./ui/Button";

export type MenuKey = "projects" | "backlog" | "gantt" | "kanban" | "timeline" | "performance";

// icon: shown next to the label, and alone while the sidebar is collapsed.
// Shared with BottomTabBar (the phone layout's menu).
export const MENU: { key: MenuKey; label: string; icon: ReactNode }[] = [
  { key: "projects", label: "Projects", icon: <ProjectIcon /> },
  { key: "backlog", label: "Backlog", icon: <BacklogIcon /> },
  { key: "gantt", label: "Gantt", icon: <GanttIcon /> },
  { key: "kanban", label: "Board", icon: <KanbanIcon /> },
  { key: "timeline", label: "Timeline", icon: <TimelineIcon /> },
  { key: "performance", label: "Performance", icon: <PerformanceIcon /> },
];

const COLLAPSED_W = 52;
const COLLAPSE_KEY = "sidebar.collapsed";

export function Sidebar({
  active,
  onNavigate,
  onOpenOrgSettings,
  orgSettingsActive,
}: {
  active: MenuKey | null;
  onNavigate: (key: MenuKey) => void;
  // Set while an organization is picked in the header: shows 「組織の設定」 under the menu.
  onOpenOrgSettings?: () => void;
  orgSettingsActive?: boolean;
}) {
  const { width, startResize } = useResizableWidth("sidebar.width", 220, 160, 480);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false; // storage can be unavailable (private mode)
    }
  });

  const toggle = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      } catch {
        // Ignore: the state still applies for this session.
      }
      return !v;
    });
  };

  const toggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

  return (
    <aside
      className="relative flex shrink-0 flex-col border-r border-border bg-bg"
      style={{ width: collapsed ? COLLAPSED_W : width }}
    >
      <nav className="flex flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto p-2">
        {MENU.map((m) => (
          <NavButton
            key={m.key}
            label={m.label}
            icon={m.icon}
            active={m.key === active}
            collapsed={collapsed}
            onClick={() => onNavigate(m.key)}
          />
        ))}
        {onOpenOrgSettings && (
          <>
            <div className="mx-1 my-1.5 h-px shrink-0 bg-border" role="separator" />
            <NavButton
              label="組織の設定"
              icon={<OrgIcon />}
              active={!!orgSettingsActive}
              collapsed={collapsed}
              onClick={onOpenOrgSettings}
            />
          </>
        )}
      </nav>

      <div className={cn("flex items-center border-t border-border py-2", collapsed ? "justify-center" : "justify-end px-2")}>
        <Button variant="ghost" size="sm" onClick={toggle} data-tooltip={toggleLabel} aria-label={toggleLabel} className="w-7 px-0 text-fg-muted">
          {collapsed ? "»" : "«"}
        </Button>
      </div>

      {!collapsed && (
        <div
          onMouseDown={startResize}
          data-tooltip="Drag to resize"
          className="absolute inset-y-0 -right-[3px] z-5 w-[7px] cursor-col-resize select-none"
        />
      )}
    </aside>
  );
}

function NavButton({
  label,
  icon,
  active,
  collapsed,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-tooltip={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "m-0 flex h-8 w-full shrink-0 cursor-pointer items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-md border-0 font-sans text-sm transition-colors",
        collapsed ? "justify-center px-0" : "justify-start px-2.5 text-left",
        active ? "bg-selected font-medium text-fg" : "bg-transparent text-fg-muted hover:bg-surface-muted hover:text-fg",
      )}
    >
      {icon}
      {!collapsed && label}
    </button>
  );
}
