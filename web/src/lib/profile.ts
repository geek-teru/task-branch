// Profile and avatar image access (profiles table, avatars bucket). Errors are thrown, as in api.ts.

import { supabase } from "./supabase";
import type { Profile, ProfileInput } from "./types";

const AVATAR_BUCKET = "avatars";

// Same limits as the bucket (file_size_limit / allowed_mime_types), checked before uploading.
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("ログインしていません");
  return data.user.id;
}

// The signed-in user's row; null until the first save.
export async function getProfile(): Promise<Profile | null> {
  const userId = await currentUserId();
  const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

// The row is created by the first save (no trigger on auth.users), hence upsert.
export async function saveProfile(input: ProfileInput): Promise<Profile> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from("profiles")
    .upsert({ user_id: userId, ...input }, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Uploads to avatars/<uid>/<random>.<ext> and returns the path. The path changes on every upload
// so browsers never show a cached old image.
export async function uploadAvatar(file: File): Promise<string> {
  const ext = AVATAR_TYPES[file.type];
  if (!ext) throw new Error("png / jpeg / webp の画像を選んでください");
  const userId = await currentUserId();
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, { contentType: file.type });
  if (error) throw error;
  return path;
}

// Deletes a replaced / dropped image. Call after the profile no longer points at it.
export async function removeAvatar(path: string): Promise<void> {
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) throw error;
}

// The bucket is public, so a plain URL works in <img> without signing.
export function avatarUrl(path: string): string {
  return supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
}
