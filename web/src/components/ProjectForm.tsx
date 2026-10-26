import { useState, type KeyboardEvent, type ReactNode } from "react";
import type { Project, ProjectInput } from "../lib/types";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { Input } from "./ui/Input";
import { Textarea } from "./ui/Textarea";

// Create / edit form for a project. Shared by the list page (create) and the detail page (edit).
export function ProjectForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: Project | null;
  onSubmit: (input: ProjectInput) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [repositoryUrl, setRepositoryUrl] = useState(initial?.repository_url ?? "");
  const trimmedName = name.trim();
  const trim = (v: string) => (v.trim() ? v.trim() : null);

  const handleSubmit = () => {
    if (!trimmedName) return;
    onSubmit({
      name: trimmedName,
      description: trim(description),
      url: trim(url),
      repository_url: trim(repositoryUrl),
    });
  };

  // Enter in a single-line field submits (Escape is handled by the Dialog).
  const submitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSubmit();
  };

  return (
    <Dialog
      title={initial ? "プロジェクトを変更" : "新規プロジェクト"}
      onClose={onCancel}
      className="w-[440px]"
      footer={
        <>
          <Button onClick={onCancel}>キャンセル</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!trimmedName}>
            {initial ? "保存" : "作成"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="プロジェクト名">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={submitOnEnter}
            placeholder="例: AWS移行 Phase1 アプリケーション移行"
          />
        </Field>
        <Field label="概要（任意）">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="プロジェクトの説明"
          />
        </Field>
        <Field label="URL（任意）">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={submitOnEnter}
            placeholder="https://example.vercel.app"
          />
        </Field>
        <Field label="リポジトリ（任意）">
          <Input
            value={repositoryUrl}
            onChange={(e) => setRepositoryUrl(e.target.value)}
            onKeyDown={submitOnEnter}
            placeholder="https://github.com/owner/repo"
          />
        </Field>
      </div>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      {children}
    </label>
  );
}
