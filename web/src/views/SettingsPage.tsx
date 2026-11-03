import { NavLink } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { cn } from "../lib/cn";
import { PageHeader } from "../components/ui/PageHeader";
import { ProfileSettings } from "./settings/ProfileSettings";

export type SettingsTab = "profile" | "agents";

const TABS: { key: SettingsTab; label: string }[] = [
  { key: "profile", label: "プロフィール" },
  { key: "agents", label: "AI エージェント" },
];

// /settings/:tab. The tabs are links in a left column (each tab has its own URL). The agents tab
// comes in its own task, so it shows a placeholder for now.
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
      <div className="flex max-w-[960px] gap-8 px-6 pb-6">
        <nav aria-label="設定の項目" className="flex w-48 shrink-0 flex-col gap-0.5">
          {TABS.map((t) => (
            <NavLink
              key={t.key}
              to={`/settings/${t.key}`}
              className={({ isActive }) =>
                cn(
                  "flex h-8 items-center rounded-md px-2.5 text-sm no-underline transition-colors",
                  isActive ? "bg-[#ededed] font-medium text-fg" : "text-fg-muted hover:bg-surface-muted hover:text-fg",
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <section className="min-w-0 flex-1">
          <h2 className="m-0 mb-4 text-base font-medium text-fg">{TABS.find((t) => t.key === tab)?.label}</h2>
          {tab === "profile" ? (
            <ProfileSettings session={session} onSaved={onProfileSaved} />
          ) : (
            <div className="rounded-md border border-dashed border-border-strong px-6 py-12 text-center text-[13px] text-fg-muted">
              準備中
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
