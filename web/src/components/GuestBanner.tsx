import type { ReactNode } from "react";

const GUEST_DAYS = 7;

// The day a guest's data is deleted: created_at + 7 days (see 「ゲストの制約の実装」).
export function guestExpiryLabel(createdAt: string): string {
  const d = new Date(createdAt);
  d.setDate(d.getDate() + GUEST_DAYS);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// Strip across the top of the signed-in shell, shown only to guests. `action` is the right-hand
// slot reserved for the 「Google で本登録」 button.
export function GuestBanner({ createdAt, action }: { createdAt: string; action?: ReactNode }) {
  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-3 border-b border-border bg-surface-muted px-4 py-1.5 text-[13px] text-fg"
    >
      <span className="min-w-0 flex-1">
        ゲストとして利用中です。データは {guestExpiryLabel(createdAt)} に削除されます
      </span>
      {action}
    </div>
  );
}
