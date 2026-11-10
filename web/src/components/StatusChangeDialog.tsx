import { useState } from "react";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { Textarea } from "./ui/Textarea";

// Status change / move confirmation. With withComment, an optional comment field is shown under the message;
// onConfirm receives what was typed (may be empty — the caller decides whether to post it).
// Ctrl/Cmd+Enter in the field confirms. Click-away or Escape cancels.
export function StatusChangeDialog({
  message,
  confirmLabel = "変更する",
  withComment,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
  withComment: boolean;
  onConfirm: (comment: string) => void;
  onCancel: () => void;
}) {
  const [comment, setComment] = useState("");
  const confirm = () => onConfirm(withComment ? comment : "");

  return (
    <Dialog
      onClose={onCancel}
      className={withComment ? "w-[440px]" : "w-[380px]"}
      footer={
        <>
          <Button onClick={onCancel}>キャンセル</Button>
          <Button variant="primary" autoFocus={!withComment} onClick={confirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="whitespace-pre-line">{message}</div>
      {withComment && (
        <label className="mt-3 block">
          <span className="mb-1 block text-xs text-fg-muted">コメント（任意）</span>
          <Textarea
            autoFocus
            rows={4}
            className="w-full"
            value={comment}
            placeholder="やったこと・残したいことを書くと、タスクのコメントとして投稿します"
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                confirm();
              }
            }}
          />
        </label>
      )}
    </Dialog>
  );
}
