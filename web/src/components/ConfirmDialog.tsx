import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";

// Small confirmation modal (message + キャンセル / 変更する). Click-away or Escape cancels.
export function ConfirmDialog({
  message,
  confirmLabel = "変更する",
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
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
          <Button variant="primary" autoFocus onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="whitespace-pre-line">{message}</div>
    </Dialog>
  );
}
