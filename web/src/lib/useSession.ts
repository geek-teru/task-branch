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

// Error params Supabase appends to the redirect URL (query for PKCE, hash for the implicit flow)
// when an OAuth sign-in or linkIdentity fails. supabase-js reports it but leaves the URL as is.
const AUTH_ERROR_PARAMS = ["error", "error_code", "error_description"];

function hashParams(hash: string) {
  return new URLSearchParams(hash.replace(/^#/, ""));
}

// error_code of a failed OAuth redirect in `href`, e.g. "identity_already_exists" when the Google
// account a guest tried to link is already registered as another user. null when there is none.
export function authRedirectErrorCode(href: string): string | null {
  const url = new URL(href);
  return url.searchParams.get("error_code") ?? hashParams(url.hash).get("error_code");
}

// `href` without the auth error params, as a path (pathname + search + hash) for the router.
export function withoutAuthRedirectError(href: string): string {
  const url = new URL(href);
  const hash = hashParams(url.hash);
  for (const key of AUTH_ERROR_PARAMS) {
    url.searchParams.delete(key);
    hash.delete(key);
  }
  const h = hash.toString();
  return url.pathname + url.search + (h ? `#${h}` : "");
}

// Read once at load: the router may rewrite the URL (e.g. the redirect to /login) before the app
// gets to show the guidance.
export const initialAuthRedirectError: string | null =
  typeof window === "undefined" ? null : authRedirectErrorCode(window.location.href);

// The Google account is already someone's: the guest's data cannot move there (no merge; it is
// deleted after 7 days). Sign out of the guest and sign in with that account instead.
export async function switchToGoogleAccount() {
  const { error } = await signOut();
  if (error) return { error };
  return signInWithGoogle();
}

export function signOut() {
  return supabase.auth.signOut();
}
