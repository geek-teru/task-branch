import { useState } from "react";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { Input } from "./ui/Input";

// Modal form to add or rename a story group (name only).
export function GroupForm({
  heading,
  submitLabel,
  initialName = "",
  onSubmit,
  onCancel,
}: {
  heading: string;
  submitLabel: string;
  initialName?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  const handleSubmit = () => {
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <Dialog
      title={heading}
      onClose={onCancel}
      className="w-[420px]"
      footer={
        <>
          <Button onClick={onCancel}>キャンセル</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!trimmed}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <label className="mb-1.5 block text-xs text-fg-muted">グループ名</label>
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSubmit();
        }}
        placeholder="例: リリース 1"
      />
    </Dialog>
  );
}
