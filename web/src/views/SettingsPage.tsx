import { NavLink } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { cn } from "../lib/cn";
import { PageHeader } from "../components/ui/PageHeader";
import { AgentSettings } from "./settings/AgentSettings";
import { AppearanceSettings } from "./settings/AppearanceSettings";
import { ProfileSettings } from "./settings/ProfileSettings";

export type SettingsTab = "profile" | "agents" | "appearance";

const TABS: { key: SettingsTab; label: string }[] = [
  { key: "profile", label: "プロフィール" },
  { key: "agents", label: "AI エージェント" },
  { key: "appearance", label: "表示" },
];

// /settings/:tab. The tabs are links in a left column (each tab has its own URL). On phones (< 768px)
// they become a row of tabs above the body, which stacks under them.
export function SettingsPage({
  tab,
  session,
  onProfileSaved,
}: {
  tab: SettingsTab;
  session: Session;
  onProfileSaved?: () => void;
}) {
  return (
    <div className="h-full overflow-auto">
      <PageHeader title="設定" />
      <div className="flex max-w-[960px] flex-col gap-4 px-4 pb-6 md:flex-row md:gap-8 md:px-6">
        <nav aria-label="設定の項目" className="flex shrink-0 gap-1 overflow-x-auto max-md:border-b max-md:border-border max-md:pb-2 md:w-48 md:flex-col md:gap-0.5">
          {TABS.map((t) => (
            <NavLink
              key={t.key}
              to={`/settings/${t.key}`}
              className={({ isActive }) =>
                cn(
                  "flex h-8 shrink-0 items-center whitespace-nowrap rounded-md px-2.5 text-sm no-underline transition-colors",
                  isActive ? "bg-selected font-medium text-fg" : "text-fg-muted hover:bg-surface-muted hover:text-fg",
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <section className="min-w-0 flex-1">
          <h2 className="m-0 mb-4 text-base font-medium text-fg max-md:sr-only">{TABS.find((t) => t.key === tab)?.label}</h2>
          {tab === "profile" ? (
            <ProfileSettings session={session} onSaved={onProfileSaved} />
          ) : tab === "agents" ? (
            <AgentSettings />
          ) : (
            <AppearanceSettings />
          )}
        </section>
      </div>
    </div>
  );
}
