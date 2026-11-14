import { useEffect, useRef, useState, type DragEvent, type TextareaHTMLAttributes } from "react";
import {
  ATTACHMENT_DECODE_ERROR,
  ATTACHMENT_SIZE_ERROR,
  ATTACHMENT_TYPE_ERROR,
  ATTACHMENT_TYPES,
  attachmentMarkdown,
  uploadAttachment,
} from "../lib/attachments";
import { cn } from "../lib/cn";
import { useSession } from "../lib/useSession";
import { AttachIcon } from "./Icons";
import { IconButton } from "./ui/Button";
import { Textarea } from "./ui/Textarea";

// At most this many files per pick / paste / drop. The rest are skipped with a message.
export const ATTACHMENT_MAX_FILES = 5;
export const ATTACHMENT_COUNT_ERROR = `一度に添付できるのは ${ATTACHMENT_MAX_FILES} ファイルまでです`;
const ACCEPT = Object.keys(ATTACHMENT_TYPES).join(",");
// Messages from the client-side checks, shown as they are. Anything else (RLS, network) gets a prefix.
const CHECK_ERRORS = new Set([ATTACHMENT_TYPE_ERROR, ATTACHMENT_SIZE_ERROR, ATTACHMENT_DECODE_ERROR]);

type AttachmentTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  // The whole new text: typed by the user, or with an attachment's Markdown inserted / replaced.
  onChange: (value: string) => void;
  // Where the attachments go. Without both, this is a plain Textarea (no attach UI).
  projectId?: string | null;
  taskId?: string | null;
  // True while any upload is running, so the caller can disable its post / save button.
  onUploadingChange?: (uploading: boolean) => void;
  // Classes for the outer box (margins). className goes to the textarea itself.
  wrapperClassName?: string;
};

let placeholderSeq = 0;

// A Textarea that also takes images from the clip button, paste and drop. Each file gets a placeholder
// at the cursor while it uploads; it is then replaced with ![name](attachment:<id>), or removed with an
// error shown under the field. Guests (anonymous users) and callers without a task id get no attach UI.
export function AttachmentTextarea({
  value,
  onChange,
  projectId,
  taskId,
  onUploadingChange,
  wrapperClassName,
  className,
  disabled,
  ...props
}: AttachmentTextareaProps) {
  const session = useSession();
  const canAttach = !!projectId && !!taskId && !!session && !session.user.is_anonymous;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The latest text, also updated right after our own onChange so two uploads finishing in the same
  // tick do not overwrite each other.
  const latest = useRef(value);
  latest.current = value;
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const onUploadingChangeRef = useRef(onUploadingChange);
  onUploadingChangeRef.current = onUploadingChange;
  useEffect(() => {
    onUploadingChangeRef.current?.(uploading > 0);
  }, [uploading]);
  // Tell the caller uploads are over if this unmounts mid-upload (e.g. the comment edit is cancelled).
  useEffect(() => () => onUploadingChangeRef.current?.(false), []);

  function update(fn: (text: string) => string) {
    const next = fn(latest.current);
    latest.current = next;
    onChange(next);
  }

  async function attach(list: FileList | File[]) {
    const all = Array.from(list);
    if (all.length === 0 || !projectId || !taskId) return;
    const files = all.slice(0, ATTACHMENT_MAX_FILES);
    const errors: string[] = all.length > ATTACHMENT_MAX_FILES ? [ATTACHMENT_COUNT_ERROR] : [];
    setError(errors[0] ?? null);

    // Insert every placeholder at the cursor (end of text when the field was never focused).
    const placeholders = files.map(() => `![アップロード中…${++placeholderSeq}]()`);
    const el = textareaRef.current;
    const text = latest.current;
    const focused = el && document.activeElement === el;
    const start = focused ? el.selectionStart : text.length;
    const end = focused ? el.selectionEnd : text.length;
    const before = text.slice(0, start);
    const after = text.slice(end);
    // Each image on its own line: break before / after when the neighbouring text is on the same line.
    const lead = before && !before.endsWith("\n") ? "\n" : "";
    const trail = after && !after.startsWith("\n") ? "\n" : "";
    const inserted = lead + placeholders.join("\n") + trail;
    update((t) => t.slice(0, start) + inserted + t.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = start + inserted.length - trail.length;
      el.setSelectionRange(pos, pos);
    });

    setUploading((n) => n + files.length);
    await Promise.all(
      files.map(async (file, i) => {
        const placeholder = placeholders[i];
        try {
          const a = await uploadAttachment({ projectId, taskId, file });
          update((t) => t.replace(placeholder, attachmentMarkdown(a)));
        } catch (e) {
          // Drop the placeholder and the line break we added in front of it, if any.
          update((t) => (t.includes(`\n${placeholder}`) ? t.replace(`\n${placeholder}`, "") : t.replace(placeholder, "")));
          const message = (e as Error).message ?? String(e);
          const label = file.name ? `${file.name}: ` : "";
          errors.push(`${label}${CHECK_ERRORS.has(message) ? message : `添付できませんでした（${message}）`}`);
          setError(errors.join(" / "));
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
  }

  if (!canAttach) {
    return (
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(wrapperClassName, className)}
        disabled={disabled}
        {...props}
      />
    );
  }

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  return (
    <div className={wrapperClassName}>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          const files = e.clipboardData.files;
          if (files.length > 0) {
            e.preventDefault();
            attach(files);
          }
        }}
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          setDragging(false);
          if (!hasFiles(e) || e.dataTransfer.files.length === 0) return;
          e.preventDefault();
          attach(e.dataTransfer.files);
        }}
        disabled={disabled}
        className={cn(className, dragging && "border-brand ring-2 ring-brand/20")}
        {...props}
      />
      <div className="mt-1 flex min-h-6 items-center gap-1.5">
        <IconButton
          label="画像を添付"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          className="size-6! max-md:size-10!"
        >
          <AttachIcon size={13} />
        </IconButton>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            e.target.value = ""; // the same file can be picked again
            attach(files);
          }}
        />
        <span className="text-[11px] text-fg-muted">
          {uploading > 0 ? `画像をアップロード中…（${uploading}）` : "画像は貼り付け・ドロップでも添付できます"}
        </span>
      </div>
      {error && <div className="mt-0.5 text-xs text-danger">{error}</div>}
    </div>
  );
}
