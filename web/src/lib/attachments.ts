// Attached images (task_attachments table, private attachments bucket). Errors are thrown, as in api.ts.
//
// The checks here (magic bytes, size, redraw) are a convenience: they can be bypassed, so the bucket's
// MIME / size limits and RLS (0036_task_attachments.sql) are the real guard.

import { supabase } from "./supabase";
import type { Attachment, AttachmentMimeType } from "./types";

const ATTACHMENT_BUCKET = "attachments";

// Same limits as the bucket (file_size_limit / allowed_mime_types).
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_TYPES: Record<AttachmentMimeType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
// Longer side above this is scaled down when redrawing (png / jpeg / webp).
export const ATTACHMENT_MAX_SIDE = 4096;
// Signed URLs live 10 minutes. Cached until shortly before they expire.
const SIGNED_URL_SECONDS = 600;
const SIGNED_URL_MARGIN_MS = 60 * 1000;

export const ATTACHMENT_TYPE_ERROR = "png / jpeg / webp / gif の画像だけ添付できます";
export const ATTACHMENT_SIZE_ERROR = "5MB までの画像を選んでください";
export const ATTACHMENT_DECODE_ERROR = "画像を読み込めませんでした";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isAttachmentType(type: string): type is AttachmentMimeType {
  return Object.prototype.hasOwnProperty.call(ATTACHMENT_TYPES, type);
}

function startsWith(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  if (bytes.length < offset + expected.length) return false;
  return expected.every((b, i) => bytes[offset + i] === b);
}

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

// The image type from the leading bytes, or null when it is none of the four.
export function detectImageType(bytes: Uint8Array): AttachmentMimeType | null {
  if (startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, 0, ascii("GIF87a")) || startsWith(bytes, 0, ascii("GIF89a"))) return "image/gif";
  if (startsWith(bytes, 0, ascii("RIFF")) && startsWith(bytes, 8, ascii("WEBP"))) return "image/webp";
  return null;
}

// Width / height that fit within ATTACHMENT_MAX_SIDE, keeping the aspect ratio.
export function fitWithin(width: number, height: number, maxSide = ATTACHMENT_MAX_SIDE): { width: number; height: number } {
  const longer = Math.max(width, height);
  if (longer <= maxSide) return { width, height };
  const scale = maxSide / longer;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function toBlob(canvas: HTMLCanvasElement, type: AttachmentMimeType): Promise<Blob | null> {
  const quality = type === "image/png" ? undefined : 0.9;
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Checks a file and returns what to upload. png / jpeg / webp are redrawn on a canvas, which drops
// metadata (EXIF location etc.) and anything smuggled after the image data; gif is kept as is so
// animations survive.
export async function prepareImage(file: File): Promise<{ blob: Blob; type: AttachmentMimeType }> {
  if (file.size > ATTACHMENT_MAX_BYTES) throw new Error(ATTACHMENT_SIZE_ERROR);
  if (file.size === 0) throw new Error(ATTACHMENT_DECODE_ERROR);
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const type = detectImageType(head);
  if (!type || file.type !== type) throw new Error(ATTACHMENT_TYPE_ERROR);
  if (type === "image/gif") return { blob: file, type };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(ATTACHMENT_DECODE_ERROR);
  }
  let blob: Blob | null;
  try {
    const size = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(ATTACHMENT_DECODE_ERROR);
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    blob = await toBlob(canvas, type);
  } finally {
    bitmap.close();
  }
  if (!blob || blob.size === 0) throw new Error(ATTACHMENT_DECODE_ERROR);
  // A browser that cannot encode the type (e.g. webp) falls back to png; upload what we actually got.
  const outType = blob.type;
  if (!isAttachmentType(outType)) throw new Error(ATTACHMENT_DECODE_ERROR);
  if (blob.size > ATTACHMENT_MAX_BYTES) throw new Error(ATTACHMENT_SIZE_ERROR);
  return { blob, type: outType };
}

// Display name kept in original_name (char_length <= 255). null when the file has no name.
function originalName(name: string): string | null {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 255) : null;
}

// Checks / redraws the file, records the row, then uploads to its storage_path (the bucket only
// accepts paths that have a row). If the upload fails the row is removed again.
export async function uploadAttachment({
  projectId,
  taskId,
  file,
}: {
  projectId: string;
  taskId: string;
  file: File;
}): Promise<Attachment> {
  const { blob, type } = await prepareImage(file);
  const id = crypto.randomUUID();
  const storagePath = `${projectId}/${id}.${ATTACHMENT_TYPES[type]}`;
  const { data, error } = await supabase
    .from("task_attachments")
    .insert({
      id,
      project_id: projectId,
      task_id: taskId,
      storage_path: storagePath,
      mime_type: type,
      size_bytes: blob.size,
      original_name: originalName(file.name),
    })
    .select()
    .single();
  if (error) throw error;

  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(storagePath, blob, { contentType: type, upsert: false });
  if (uploadError) {
    await supabase.from("task_attachments").delete().eq("id", id);
    throw uploadError;
  }
  notifyAttachmentsChanged(taskId);
  return data as Attachment;
}

// Fired on window after an attachment is uploaded or deleted, so lists of that task reload.
export const ATTACHMENTS_CHANGED_EVENT = "attachments:changed";
export type AttachmentsChangedDetail = { taskId: string };

function notifyAttachmentsChanged(taskId: string): void {
  window.dispatchEvent(new CustomEvent<AttachmentsChangedDetail>(ATTACHMENTS_CHANGED_EVENT, { detail: { taskId } }));
}

// Attachments of a task or story, newest first.
export async function listAttachments(taskId: string): Promise<Attachment[]> {
  const { data, error } = await supabase
    .from("task_attachments")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Attachment[];
}

// File first, then the row: the storage delete policy needs the row to still exist.
export async function deleteAttachment(a: Pick<Attachment, "id" | "storage_path" | "task_id">): Promise<void> {
  const { error: removeError } = await supabase.storage.from(ATTACHMENT_BUCKET).remove([a.storage_path]);
  if (removeError) throw removeError;
  const { error } = await supabase.from("task_attachments").delete().eq("id", a.id);
  if (error) throw error;
  signedUrlCache.delete(a.id);
  notifyAttachmentsChanged(a.task_id);
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

// Signed URLs (10 minutes) keyed by attachment id, fetched in one createSignedUrls call and cached
// until shortly before they expire. Ids that are not uuids, deleted, or not readable are left out.
export async function signedUrls(ids: readonly string[]): Promise<Map<string, string>> {
  const now = Date.now();
  const result = new Map<string, string>();
  const missing: string[] = [];
  for (const id of new Set(ids)) {
    if (!UUID_RE.test(id)) continue;
    const cached = signedUrlCache.get(id);
    if (cached && cached.expiresAt - SIGNED_URL_MARGIN_MS > now) result.set(id, cached.url);
    else missing.push(id);
  }
  if (missing.length === 0) return result;

  const { data: rows, error } = await supabase
    .from("task_attachments")
    .select("id, storage_path")
    .in("id", missing);
  if (error) throw error;
  if (!rows || rows.length === 0) return result;

  const idByPath = new Map(rows.map((r) => [r.storage_path as string, r.id as string]));
  const { data, error: signError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrls([...idByPath.keys()], SIGNED_URL_SECONDS);
  if (signError) throw signError;
  const expiresAt = now + SIGNED_URL_SECONDS * 1000;
  for (const entry of data ?? []) {
    const id = entry.path ? idByPath.get(entry.path) : undefined;
    if (!id || entry.error || !entry.signedUrl) continue;
    signedUrlCache.set(id, { url: entry.signedUrl, expiresAt });
    result.set(id, entry.signedUrl);
  }
  return result;
}

// Drops cached URLs so the next signedUrls call fetches fresh ones (e.g. after an <img> failed to load).
export function forgetSignedUrls(ids: readonly string[]): void {
  for (const id of ids) signedUrlCache.delete(id);
}

// The Markdown that embeds an attachment: ![<name>](attachment:<id>). Brackets and backslashes in
// the name are escaped and line breaks removed so the name cannot end the image syntax early.
export function attachmentMarkdown(a: Pick<Attachment, "id" | "original_name">): string {
  const name = (a.original_name ?? "")
    .replace(/[\r\n\u2028\u2029]+/g, " ")
    .replace(/[\\[\]]/g, (c) => `\\${c}`)
    .trim();
  return `![${name || "画像"}](attachment:${a.id})`;
}
