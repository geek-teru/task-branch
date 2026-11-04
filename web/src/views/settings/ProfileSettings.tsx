import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { AVATAR_MAX_BYTES, AVATAR_TYPES, avatarUrl, getProfile, removeAvatar, saveProfile, uploadAvatar } from "../../lib/profile";
import type { Profile } from "../../lib/types";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Avatar } from "../../components/Avatar";

const DISPLAY_NAME_MAX = 50;

// What the icon becomes on save: unchanged, a newly picked file, or back to the Google image.
type AvatarChoice = { kind: "keep" } | { kind: "file"; file: File; preview: string } | { kind: "google" };

// /settings/profile: the display name and the icon. Picking an image or going back to Google's only
// changes the preview; 保存 applies both. onSaved lets the header reload the profile.
export function ProfileSettings({ session, onSaved }: { session: Session; onSaved?: () => void }) {
  const meta = session.user.user_metadata ?? {};
  const googleName: string = meta.full_name ?? meta.name ?? session.user.email ?? "";
  const googleAvatar: string | null = meta.avatar_url ?? meta.picture ?? null;

  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState<AvatarChoice>({ kind: "keep" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getProfile()
      .then((p) => {
        setProfile(p);
        setDisplayName(p?.display_name ?? "");
      })
      .catch((e) => {
        setProfile(null);
        setError(String(e.message ?? e));
      });
  }, []);

  // Free the preview's object URL when it is replaced or the page goes away.
  useEffect(() => {
    if (avatar.kind !== "file") return;
    return () => URL.revokeObjectURL(avatar.preview);
  }, [avatar]);

  if (profile === undefined) return <div className="text-[13px] text-fg-muted">読み込み中…</div>;

  const savedPath = profile?.avatar_path ?? null;
  const shownUrl =
    avatar.kind === "file"
      ? avatar.preview
      : avatar.kind === "keep" && savedPath
        ? avatarUrl(savedPath)
        : googleAvatar;
  // 戻す only makes sense while an uploaded (or about to be uploaded) image is in place.
  const hasOwnImage = avatar.kind === "file" || (avatar.kind === "keep" && savedPath !== null);
  const nameTooLong = [...displayName.trim()].length > DISPLAY_NAME_MAX;

  const handlePick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // picking the same file again still fires change
    if (!file) return;
    setSaved(false);
    if (!AVATAR_TYPES[file.type]) {
      setError("png / jpeg / webp の画像を選んでください。");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setError("画像は 2MB までです。");
      return;
    }
    setError(null);
    setAvatar({ kind: "file", file, preview: URL.createObjectURL(file) });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const nextPath =
        avatar.kind === "file" ? await uploadAvatar(avatar.file) : avatar.kind === "google" ? null : savedPath;
      const trimmed = displayName.trim();
      const next = await saveProfile({ display_name: trimmed ? trimmed : null, avatar_path: nextPath });
      // The row no longer points at the old file, so it can go.
      if (savedPath && savedPath !== nextPath) await removeAvatar(savedPath);
      setProfile(next);
      setDisplayName(next.display_name ?? "");
      setAvatar({ kind: "keep" });
      setSaved(true);
      onSaved?.();
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-w-[480px] flex-col gap-6">
      <Field label="アイコン">
        <div className="flex items-center gap-4">
          <Avatar url={shownUrl} name={displayName.trim() || googleName} className="size-20 text-2xl" />
          <div className="flex flex-col items-start gap-2">
            <div className="flex gap-2">
              <Button size="sm" onClick={() => fileRef.current?.click()} disabled={saving}>
                画像を選ぶ
              </Button>
              {hasOwnImage && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSaved(false);
                    setAvatar({ kind: "google" });
                  }}
                  disabled={saving}
                >
                  Google の画像に戻す
                </Button>
              )}
            </div>
            <span className="text-xs text-fg-muted">png / jpeg / webp、2MB まで</span>
            <input
              ref={fileRef}
              type="file"
              accept={Object.keys(AVATAR_TYPES).join(",")}
              className="hidden"
              onChange={handlePick}
            />
          </div>
        </div>
      </Field>

      <Field label="表示名">
        <Input
          value={displayName}
          onChange={(e) => {
            setSaved(false);
            setDisplayName(e.target.value);
          }}
          placeholder={googleName}
          maxLength={DISPLAY_NAME_MAX}
        />
        {nameTooLong && <span className="text-[11px] text-danger">表示名は {DISPLAY_NAME_MAX} 文字までです。</span>}
      </Field>

      <Field label="メールアドレス">
        <span className="text-[13px] text-fg">{session.user.email}</span>
      </Field>

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={handleSave} disabled={saving || nameTooLong}>
          {saving ? "保存中…" : "保存"}
        </Button>
        {saved && <span className="text-[13px] text-fg-muted">保存しました</span>}
        {error && <span className="text-[13px] text-danger">{error}</span>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-fg-muted">{label}</span>
      {children}
    </div>
  );
}
