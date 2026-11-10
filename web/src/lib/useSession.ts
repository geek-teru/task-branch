import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createGuestSampleProject } from "./api";
import { isConfigured, supabase } from "./supabase";

// Current auth session. undefined while the first getSession() is pending, null when signed out.
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!isConfigured) {
      setSession(null);
      return;
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  return session;
}

// Back to the app origin unless redirectTo is given; it must be in Supabase's allowed redirect URLs.
export function signInWithGoogle(redirectTo: string = window.location.origin) {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
}

// Anonymous sign-in, then the sample project. A failed sample setup does not undo the login:
// the guest just lands on an empty project list (projectId = null).
export async function signInAsGuest(): Promise<{ error: Error | null; projectId: string | null }> {
  const { error } = await supabase.auth.signInAnonymously();
  if (error) return { error, projectId: null };
  try {
    return { error: null, projectId: await createGuestSampleProject() };
  } catch {
    return { error: null, projectId: null };
  }
}

// Guest → regular user: link a Google identity to the current (anonymous) user. The user id stays
// the same, so the guest's data is kept; on return is_anonymous is false. redirectTo must be in
// Supabase's allowed redirect URLs, otherwise Supabase sends the user back to site_url.
export function linkGoogle(redirectTo: string = window.location.href) {
  return supabase.auth.linkIdentity({
    provider: "google",
    options: { redirectTo },
  });
}

export function signOut() {
  return supabase.auth.signOut();
}
