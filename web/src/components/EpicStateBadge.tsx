import { ChevronDownIcon } from "./Icons";
import { Badge } from "./ui/Badge";
import { DropdownMenu, DropdownMenuItem } from "./ui/DropdownMenu";

// Active / InActive のバッジ。onPick があるとクリックでメニューを出し、
// 選んだ状態を返す（確認モーダルは呼び出し側が出す）。
// メニューは DropdownMenu（固定配置）なので、角丸で overflow: hidden の表の中でも切れない。
export function EpicStateBadge({ active, onPick }: { active: boolean; onPick?: (next: boolean) => void }) {
  const badge = (value: boolean) => <Badge tone={value ? "brand" : "neutral"}>{value ? "Active" : "InActive"}</Badge>;

  if (!onPick) return badge(active);

  return (
    <DropdownMenu
      variant="ghost"
      size="sm"
      label="状態を変更"
      tooltip="クリックで状態を変更"
      menuClassName="min-w-[120px]"
      className="-mx-2.5"
      trigger={
        <>
          {badge(active)}
          <span className="flex text-fg-muted">
            <ChevronDownIcon size={12} />
          </span>
        </>
      }
    >
      {[true, false].map((value) => (
        <DropdownMenuItem key={String(value)} selected={value === active} onSelect={() => value !== active && onPick(value)}>
          {badge(value)}
        </DropdownMenuItem>
      ))}
    </DropdownMenu>
  );
}
