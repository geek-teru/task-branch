import type { ReactNode } from "react";
import { cn } from "../lib/cn";
import { MoreIcon } from "./Icons";
import { MENU, type MenuKey } from "./Sidebar";
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from "./ui/DropdownMenu";

// Tabs shown directly on the bar (at most 4, so 「その他」 makes 5). The rest of MENU and 設定 go into
// 「その他」. Order follows how often each page is opened on a phone (check progress → report).
const TAB_KEYS: MenuKey[] = ["kanban", "backlog", "timeline", "projects"];

const tabClass =
  "m-0 flex h-14 min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-transparent px-1 font-sans text-[11px] leading-none transition-colors";

// Phone layout's menu (< 768px): replaces the sidebar with a bar fixed to the bottom of the screen.
// It sits as the last row of the h-dvh column, so the page above never slides under it; the bottom
// padding keeps the tabs clear of the iOS home indicator (index.html sets viewport-fit=cover).
export function BottomTabBar({
  active,
  settingsActive,
  onNavigate,
  onOpenSettings,
}: {
  // Same value the sidebar gets; null on pages outside MENU (設定).
  active: MenuKey | null;
  settingsActive: boolean;
  onNavigate: (key: MenuKey) => void;
  onOpenSettings: () => void;
}) {
  const tabs = TAB_KEYS.map((k) => MENU.find((m) => m.key === k)!);
  const rest = MENU.filter((m) => !TAB_KEYS.includes(m.key));
  const moreActive = settingsActive || (active !== null && !TAB_KEYS.includes(active));

  return (
    <nav
      aria-label="メニュー"
      className="flex shrink-0 items-stretch border-t border-border bg-surface"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {tabs.map((m) => {
        const isActive = m.key === active;
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => onNavigate(m.key)}
            aria-current={isActive ? "page" : undefined}
            className={cn(tabClass, isActive ? "font-medium text-brand" : "text-fg-muted hover:text-fg")}
          >
            <TabIcon>{m.icon}</TabIcon>
            <span className="max-w-full truncate">{m.label}</span>
          </button>
        );
      })}
      <DropdownMenu
        variant="ghost"
        align="end"
        label="その他のメニュー"
        className="min-w-0 flex-1"
        // ! overrides the Button's own height / padding / layout so it looks like the other tabs.
        triggerClassName={cn(
          "h-14! w-full! flex-col! gap-0.5! rounded-none! px-1! text-[11px]! hover:bg-transparent!",
          moreActive ? "text-brand!" : "font-normal! text-fg-muted! hover:text-fg!",
        )}
        menuClassName="min-w-[200px]"
        trigger={
          <>
            <TabIcon>
              <MoreIcon size={20} />
            </TabIcon>
            <span>その他</span>
          </>
        }
      >
        {rest.map((m) => (
          <DropdownMenuItem key={m.key} icon={m.icon} onSelect={() => onNavigate(m.key)} selected={m.key === active}>
            {m.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onOpenSettings} selected={settingsActive}>
          設定
        </DropdownMenuItem>
      </DropdownMenu>
    </nav>
  );
}

// MENU's icons are drawn at 16px; scale them up a little for a thumb-sized tab.
function TabIcon({ children }: { children: ReactNode }) {
  return <span className="flex size-5 items-center justify-center [&>svg]:size-5">{children}</span>;
}
