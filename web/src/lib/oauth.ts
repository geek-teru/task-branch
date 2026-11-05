// OAuth 2.1 authorization server (Supabase Auth) calls for the consent page at /oauth/consent.
// MCP clients send the user here with ?authorization_id=...; we approve or deny it as the signed-in user.

import type { OAuthAuthorizationDetails, OAuthGrant, OAuthRedirect } from "@supabase/supabase-js";
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

// Clients the signed-in user has consented to (GET /auth/v1/user/oauth/grants). Shown on /settings/agents.
export async function listGrants(): Promise<OAuthGrant[]> {
  const { data, error } = await supabase.auth.oauth.listGrants();
  if (error) throw error;
  return data;
}

// Withdraws the consent for one client: its sessions and refresh tokens are invalidated, so the agent
// has to connect and be approved again.
export async function revokeGrant(clientId: string): Promise<void> {
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
  if (error) throw error;
}
