import { useEffect, useRef, useState, type ReactNode } from "react";
import type { OAuthAuthorizationDetails, Session } from "@supabase/supabase-js";
import { AuthCard } from "../components/AuthCard";
import { GoogleIcon } from "../components/Icons";
import { Button } from "../components/ui/Button";
import { approveAuthorization, denyAuthorization, getAuthorizationDetails } from "../lib/oauth";
import { signInWithGoogle } from "../lib/useSession";

const lead = "m-0 mb-6 text-center text-[13px] text-fg-muted";

// Consent screen for MCP clients. Supabase Auth sends the user here with ?authorization_id=...
export function OAuthConsentPage({ session }: { session: Session | null }) {
  const authorizationId = new URLSearchParams(window.location.search).get("authorization_id");
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const userId = session?.user.id;
  const requested = useRef<string | null>(null);

  useEffect(() => {
    if (!authorizationId || !userId) return;
    // For an already-consented client the first call consumes the request and a second one fails,
    // so fetch once per authorization_id (StrictMode runs effects twice in development).
    if (requested.current === authorizationId) return;
    requested.current = authorizationId;
    getAuthorizationDetails(authorizationId)
      .then((d) => {
        // Already consented: Supabase hands back the client's redirect right away.
        if ("redirect_url" in d) window.location.assign(d.redirect_url);
        else setDetails(d);
      })
      .catch((e) => setError(String(e.message ?? e)));
  }, [authorizationId, userId]);

  // Come back to this same URL so the authorization_id survives the Google round trip.
  const handleLogin = async () => {
    setPending(true);
    setError(null);
    const { error } = await signInWithGoogle(window.location.href);
    if (error) {
      setError(error.message);
      setPending(false);
    }
  };

  // On success the browser leaves for the client, so pending is only reset on failure.
  const decide = async (decision: typeof approveAuthorization) => {
    if (!authorizationId) return;
    setPending(true);
    setError(null);
    try {
      const { redirect_url } = await decision(authorizationId);
      window.location.assign(redirect_url);
    } catch (e: any) {
      setError(String(e.message ?? e));
      setPending(false);
    }
  };

  let body;
  if (!authorizationId) {
    body = <p className={lead}>認可のリクエストがありません。</p>;
  } else if (!session) {
    body = (
      <>
        <p className={lead}>MCP クライアントを接続するにはログインしてください。</p>
        <Button onClick={handleLogin} disabled={pending} icon={<GoogleIcon />} className="h-10 w-full">
          {pending ? "Google へ移動中…" : "Google でログイン"}
        </Button>
      </>
    );
  } else if (error) {
    // Expired or invalid requests can't be retried from here; the client has to start over.
    body = null;
  } else if (!details) {
    body = <p className={lead}>読み込み中…</p>;
  } else {
    const clientName = details.client.name || details.client.id;
    const scopes = details.scope ? details.scope.split(" ").filter(Boolean) : [];
    body = (
      <>
        <p className="m-0 mb-4 text-center text-sm text-fg">
          <span className="font-medium">{clientName}</span> があなたの task-branch のデータを読み書きすることを許可しますか？
        </p>
        <dl className="m-0 mb-6 divide-y divide-border rounded-md border border-border text-[13px]">
          <InfoRow label="クライアント">{clientName}</InfoRow>
          <InfoRow label="ログイン中">{session.user.email}</InfoRow>
          <InfoRow label="戻り先">{details.redirect_uri}</InfoRow>
          <InfoRow label="スコープ">
            {scopes.length === 0
              ? "-"
              : scopes.map((s) => (
                  <div key={s} className="font-mono text-xs">
                    {s}
                  </div>
                ))}
          </InfoRow>
        </dl>
        <div className="flex gap-2">
          <Button onClick={() => decide(denyAuthorization)} disabled={pending} className="h-9 flex-1">
            拒否
          </Button>
          <Button variant="primary" onClick={() => decide(approveAuthorization)} disabled={pending} className="h-9 flex-1">
            許可
          </Button>
        </div>
      </>
    );
  }

  return <AuthCard error={error}>{body}</AuthCard>;
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-3 px-3 py-2">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="m-0 break-all text-fg">{children}</dd>
    </div>
  );
}
