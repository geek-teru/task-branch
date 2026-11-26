import { useState, type KeyboardEvent, type ReactNode } from "react";
import type { Organization, Project, ProjectInput } from "../lib/types";
import { projectOwnerName } from "../lib/projectOwner";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { Input } from "./ui/Input";
import { Select, type SelectOption } from "./ui/Select";
import { Textarea } from "./ui/Textarea";

// "" stands for 個人 inside the owner Select (its values are strings).
const PERSONAL = "";

// Create / edit form for a project. Shared by the list page (create) and the detail page (edit).
// The owner (個人 / an organization) is chosen on create only; the edit form just shows it.
export function ProjectForm({
  initial,
  orgs = [],
  defaultOrgId = null,
  onSubmit,
  onCancel,
}: {
  initial: Project | null;
  // Organizations the user belongs to (the owner choices besides 個人).
  orgs?: Organization[];
  // Owner picked in the header; preselected on create (null = 個人).
  defaultOrgId?: string | null;
  onSubmit: (input: ProjectInput) => void;
  onCancel: () => void;
}) {
  const [orgId, setOrgId] = useState<string>(
    defaultOrgId && orgs.some((o) => o.id === defaultOrgId) ? defaultOrgId : PERSONAL
  );
  const ownerOptions: SelectOption<string>[] = [
    { value: PERSONAL, label: "個人" },
    ...orgs.map((o) => ({ value: o.id, label: o.name })),
  ];
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
      // Only on create, and only when an organization is chosen: older DBs have no org_id column.
      ...(!initial && orgId !== PERSONAL ? { org_id: orgId } : {}),
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
      className="md:w-[440px]"
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
        {initial ? (
          <Field label="所有者">
            <span className="text-sm text-fg">
              {projectOwnerName(initial, orgs)}
              <span className="ml-2 text-xs text-fg-muted">作成後は変更できません</span>
            </span>
          </Field>
        ) : (
          orgs.length > 0 && (
            <Field label="所有者">
              <Select value={orgId} onChange={setOrgId} options={ownerOptions} aria-label="所有者" />
            </Field>
          )
        )}
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
      <span className="text-xs text-fg-muted">{label}</span>
      {children}
    </label>
  );
}
