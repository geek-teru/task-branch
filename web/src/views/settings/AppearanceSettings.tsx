import { useTheme, type ThemePreference } from "../../lib/theme";
import { SegmentedControl } from "../../components/ui/SegmentedControl";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
  { value: "system", label: "システム" },
];

// /settings/appearance: the color theme. Saved per browser (lib/theme.ts); the header's user menu
// changes the same value.
export function AppearanceSettings() {
  const { preference, resolved, setPreference } = useTheme();
  return (
    <div className="flex flex-col gap-2">
      <h3 className="m-0 text-sm font-medium text-fg">テーマ</h3>
      <SegmentedControl label="テーマ" value={preference} onChange={setPreference} options={OPTIONS} className="self-start" />
      {preference === "system" && (
        <p className="m-0 text-xs text-fg-muted">
          いまは OS の設定に合わせて{resolved === "dark" ? "ダーク" : "ライト"}で表示しています
        </p>
      )}
    </div>
  );
}
