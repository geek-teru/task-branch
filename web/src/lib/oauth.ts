// OAuth 2.1 authorization server (Supabase Auth) calls for the consent page at /oauth/consent.
// MCP clients send the user here with ?authorization_id=...; we approve or deny it as the signed-in user.

import type { OAuthAuthorizationDetails, OAuthRedirect } from "@supabase/supabase-js";
import { supabase } from "./supabase";

// Details to show on the consent screen, or a redirect when the user has already consented.
export async function getAuthorizationDetails(
  authorizationId: string
): Promise<OAuthAuthorizationDetails | OAuthRedirect> {
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error) throw error;
  return data;
}

// The caller navigates to redirect_url itself, so the browser redirect is skipped here.
export async function approveAuthorization(authorizationId: string): Promise<OAuthRedirect> {
  const { data, error } = await supabase.auth.oauth.approveAuthorization(authorizationId, {
    skipBrowserRedirect: true,
  });
  if (error) throw error;
  return data;
}

export async function denyAuthorization(authorizationId: string): Promise<OAuthRedirect> {
  const { data, error } = await supabase.auth.oauth.denyAuthorization(authorizationId, {
    skipBrowserRedirect: true,
  });
  if (error) throw error;
  return data;
}
