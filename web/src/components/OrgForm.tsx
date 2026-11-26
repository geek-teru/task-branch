import { useState, type KeyboardEvent, type ReactNode } from "react";
import { ORG_SLUG_PATTERN } from "../lib/api";
import type { OrganizationInput } from "../lib/types";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { Input } from "./ui/Input";

// Slug candidate from the name: ASCII letters and digits kept (lowercased), everything else becomes a
// hyphen, at most 39 characters. A name with no ASCII letters (e.g. Japanese only) gives "".
export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, 39)
    .replace(/-+$/, "");
}

function slugProblem(slug: string): string | null {
  if (!slug) return "slug を入力してください";
  if (!ORG_SLUG_PATTERN.test(slug)) return "英小文字・数字・ハイフンで 2〜39 文字（先頭は英数字）にしてください";
  return null;
}

// Create-organization dialog. The slug follows the name until it is edited by hand.
// onSubmit rejects with a readable message (duplicate slug etc.), which is shown in the dialog.
export function OrgForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (input: OrganizationInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmedName = name.trim();
  const problem = slugProblem(slug);
  const canSubmit = !!trimmedName && trimmedName.length <= 100 && !problem && !saving;

  const handleSubmit = async () => {
    setTouched(true);
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: trimmedName, slug });
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setSaving(false);
    }
  };

  // Enter in a single-line field submits (Escape is handled by the Dialog).
  const submitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) void handleSubmit();
  };

  return (
    <Dialog
      title="組織を作成"
      onClose={onCancel}
      className="md:w-[440px]"
      footer={
        <>
          <Button onClick={onCancel}>キャンセル</Button>
          <Button variant="primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {saving ? "作成中…" : "作成"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="組織名">
          <Input
            autoFocus
            value={name}
            maxLength={100}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugEdited) setSlug(slugFromName(e.target.value));
            }}
            onKeyDown={submitOnEnter}
            placeholder="例: Acme 開発チーム"
          />
        </Field>
        <Field
          label="slug（URL に使う識別子）"
          hint={
            touched || slugEdited || slug
              ? problem ?? `URL: /orgs/${slug}/settings`
              : "英小文字・数字・ハイフンで 2〜39 文字"
          }
          invalid={(touched || slugEdited) && !!problem}
        >
          <Input
            value={slug}
            maxLength={39}
            onChange={(e) => {
              setSlug(e.target.value.toLowerCase());
              setSlugEdited(true);
            }}
            onKeyDown={submitOnEnter}
            placeholder="例: acme-dev"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
        <p className="m-0 text-xs text-fg-muted">作成したあなたが owner になります。</p>
        {error && (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger-fg">
            {error}
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  invalid,
  children,
}: {
  label: string;
  hint?: string;
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-fg-muted">{label}</span>
      {children}
      {hint && <span className={invalid ? "text-xs text-danger-fg" : "text-xs text-fg-muted"}>{hint}</span>}
    </label>
  );
}
