import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { avatarUrl, getProfile } from "./profile";
import type { Profile } from "./types";

// The signed-in user's name and icon for the header. The profiles row wins; without one (or with
// empty fields) Google's full_name / avatar_url are used. reload re-reads the row after a save.
export function useProfile(session: Session | null | undefined): {
  displayName: string;
  avatarUrl: string | null;
  reload: () => void;
} {
  const userId = session?.user.id;
  const [profile, setProfile] = useState<Profile | null>(null);

  const reload = useCallback(() => {
    if (!userId) return;
    getProfile()
      .then(setProfile)
      // Keep the Google name / image when the row cannot be read.
      .catch(() => setProfile(null));
  }, [userId]);

  useEffect(() => {
    setProfile(null);
    reload();
  }, [reload]);

  const meta = session?.user.user_metadata ?? {};
  const displayName: string = profile?.display_name ?? meta.full_name ?? meta.name ?? session?.user.email ?? (session?.user.is_anonymous ? "ゲスト" : "");
  const url = profile?.avatar_path ? avatarUrl(profile.avatar_path) : (meta.avatar_url ?? meta.picture ?? null);

  return { displayName, avatarUrl: url, reload };
}
