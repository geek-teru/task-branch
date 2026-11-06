import { useState } from "react";
import type { Assignees, Status, StoryInput } from "../lib/types";
import { STATUS_LABEL, STATUS_ORDER, assigneeFields, assigneeKey, assigneeOf } from "../lib/types";
import { UNASSIGNED, assigneeSelectOptions } from "./AssigneeLabel";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { Input } from "./ui/Input";
import { Select } from "./ui/Select";
import { Textarea } from "./ui/Textarea";

const fieldLabel = "mb-1.5 block text-xs text-fg-muted";

// Modal form to create or edit a story or task (title / status / dates / description, and the
// assignee when assignees is given).
export function TaskForm({
  heading,
  noun = "ストーリー",
  submitLabel,
  initial,
  todoHint,
  assignees,
  onSubmit,
  onCancel,
}: {
  heading: string;
  noun?: string; // used in field labels, e.g. "タスク" → "タスク名"
  submitLabel: string;
  initial: StoryInput;
  todoHint?: string; // shown under the status select while 未着手 is picked
  assignees?: Assignees; // tasks only: shows the 担当者 select with these candidates
  onSubmit: (values: StoryInput) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState<Status>(initial.status);
  const [start, setStart] = useState(initial.start_date ?? "");
  const [due, setDue] = useState(initial.due_date ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const initialAssignee = assigneeKey(initial) ?? UNASSIGNED;
  const [assignee, setAssignee] = useState(initialAssignee);
  const trimmedTitle = title.trim();

  const handleSubmit = () => {
    if (!trimmedTitle) return;
    const d = description.trim();
    onSubmit({
      title: trimmedTitle,
      status,
      start_date: start || null,
      due_date: due || null,
      description: d ? d : null,
      // Only a changed assignee is sent, so an untouched one (e.g. an AI's) stays as it is.
      ...(assignees && assignee !== initialAssignee ? assigneeFields(assignee || null) : {}),
    });
  };

  return (
    <Dialog
      title={heading}
      onClose={onCancel}
      className="w-[440px]"
      footer={
        <>
          <Button onClick={onCancel}>キャンセル</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!trimmedTitle}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <label className={fieldLabel}>{noun}名</label>
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSubmit();
        }}
        placeholder="例: 認証基盤の移行"
      />

      <label className={`${fieldLabel} mt-3.5`}>ステータス</label>
      <Select
        value={status}
        onChange={setStatus}
        options={STATUS_ORDER.map((s) => ({ value: s, label: <Badge tone={s}>{STATUS_LABEL[s]}</Badge> }))}
        aria-label="ステータス"
      />
      {todoHint && status === "todo" && <div className="mt-1.5 text-[11px] text-fg-muted">{todoHint}</div>}

      {assignees && (
        <>
          <label className={`${fieldLabel} mt-3.5`}>担当者</label>
          <Select
            value={assignee}
            onChange={setAssignee}
            options={assigneeSelectOptions(assignees.options, assigneeOf(initial, assignees))}
            aria-label="担当者"
          />
        </>
      )}

      <div className="mt-3.5 flex gap-3">
        <div className="flex-1">
          <label className={fieldLabel}>開始日</label>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="flex-1">
          <label className={fieldLabel}>期限</label>
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>

      <label className={`${fieldLabel} mt-3.5`}>詳細（任意）</label>
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder={`${noun}の説明`}
      />
    </Dialog>
  );
}
