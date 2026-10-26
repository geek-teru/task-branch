import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";

// Small confirmation modal (message + キャンセル / 変更する). Click-away or Escape cancels.
export function ConfirmDialog({
  message,
  confirmLabel = "変更する",
  danger,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
  // Destructive action (e.g. delete): the confirm button turns red.
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      onClose={onCancel}
      className="w-[380px]"
      footer={
        <>
          <Button onClick={onCancel}>キャンセル</Button>
          <Button variant={danger ? "danger" : "primary"} autoFocus onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="whitespace-pre-line">{message}</div>
    </Dialog>
  );
}
