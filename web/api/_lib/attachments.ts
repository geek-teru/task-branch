// 添付画像（task_attachments・非公開バケット attachments）の MCP ツール用の共通処理。
//   制限と Markdown の規則は web/src/lib/attachments.ts と揃える（画面側は window / document を使うので import しない）。
//   本当の守りはバケットの MIME・サイズ制限と RLS（0036_task_attachments.sql・0039_ai_attachments.sql）。

export const ATTACHMENT_BUCKET = "attachments";

// バケットの file_size_limit と同じ。
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

// バケットの allowed_mime_types と、task_attachments の storage_path の check の拡張子。
export const ATTACHMENT_TYPES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
} as const;

export type AttachmentMimeType = keyof typeof ATTACHMENT_TYPES;

export const ATTACHMENT_MIME_TYPES = Object.keys(ATTACHMENT_TYPES) as [AttachmentMimeType, ...AttachmentMimeType[]];

// 読み取り用の署名付き URL の有効期限（画面と同じ 10 分）。
export const SIGNED_URL_SECONDS = 600;

// バケット内のパス: <project_id>/<添付の id>.<拡張子>
export function attachmentPath(projectId: string, id: string, mimeType: AttachmentMimeType): string {
  return `${projectId}/${id}.${ATTACHMENT_TYPES[mimeType]}`;
}

// 表示用の名前（char_length <= 255）。空なら null。
export function originalName(name: string | undefined): string | null {
  const trimmed = (name ?? "").trim();
  return trimmed ? trimmed.slice(0, 255) : null;
}

// 本文に差し込む Markdown: ![<名前>](attachment:<id>)。名前の [ ] \ はエスケープし、改行は空白にする（画面の attachmentMarkdown と同じ）。
export function attachmentMarkdown(a: { id: string; original_name: string | null }): string {
  const name = (a.original_name ?? "")
    .replace(/[\r\n\u2028\u2029]+/g, " ")
    .replace(/[\\[\]]/g, (c) => `\\${c}`)
    .trim();
  return `![${name || "画像"}](attachment:${a.id})`;
}

// シェルの単一引用符で囲む（curl の例に入れる値用）。
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
