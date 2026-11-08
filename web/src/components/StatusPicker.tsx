import type { Status } from "../lib/types";
import { STATUS_LABEL } from "../lib/types";
import { ChevronDownIcon } from "./Icons";
import { Badge } from "./ui/Badge";
import { DropdownMenu, DropdownMenuItem } from "./ui/DropdownMenu";

// Badge that opens a small menu to pick any status.
// メニューは DropdownMenu（固定配置）なので、角丸で overflow: hidden の表の中でも切れない。
export function StatusPicker({
  status,
  statuses,
  onPick,
}: {
  status: Status;
  statuses: Status[];
  onPick: (status: Status) => void;
}) {
  return (
    <DropdownMenu
      variant="ghost"
      size="sm"
      label="ステータスを変更"
      tooltip="クリックでステータスを変更"
      menuClassName="min-w-[120px]"
      className="-mx-2.5"
      trigger={
        <>
          <Badge tone={status}>{STATUS_LABEL[status]}</Badge>
          <span className="flex text-fg-muted">
            <ChevronDownIcon size={12} />
          </span>
        </>
      }
    >
      {statuses.map((s) => (
        <DropdownMenuItem key={s} selected={s === status} onSelect={() => s !== status && onPick(s)}>
          <Badge tone={s}>{STATUS_LABEL[s]}</Badge>
        </DropdownMenuItem>
      ))}
    </DropdownMenu>
  );
}
