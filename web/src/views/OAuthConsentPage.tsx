import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { OAuthAuthorizationDetails, Session } from "@supabase/supabase-js";
import { approveAuthorization, denyAuthorization, getAuthorizationDetails } from "../lib/oauth";
import { signInWithGoogle } from "../lib/useSession";

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
    body = <p style={lead}>認可のリクエストがありません。</p>;
  } else if (!session) {
    body = (
      <>
        <p style={lead}>MCP クライアントを接続するにはログインしてください。</p>
        <button onClick={handleLogin} disabled={pending} style={{ ...primaryBtn, width: "100%", opacity: pending ? 0.6 : 1 }}>
          {pending ? "Google へ移動中…" : "Google でログイン"}
        </button>
      </>
    );
  } else if (error) {
    // Expired or invalid requests can't be retried from here; the client has to start over.
    body = null;
  } else if (!details) {
    body = <p style={lead}>読み込み中…</p>;
  } else {
    const clientName = details.client.name || details.client.id;
    body = (
      <>
        <p style={{ ...lead, color: "#1f2933", fontSize: 14 }}>
          <b>{clientName}</b> があなたの task-branch のデータを読み書きすることを許可しますか？
        </p>
        <dl style={info}>
          <dt style={infoLabel}>ログイン中</dt>
          <dd style={infoValue}>{session.user.email}</dd>
          <dt style={infoLabel}>戻り先</dt>
          <dd style={infoValue}>{details.redirect_uri}</dd>
          <dt style={infoLabel}>スコープ</dt>
          <dd style={infoValue}>{details.scope || "-"}</dd>
        </dl>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => decide(denyAuthorization)} disabled={pending} style={{ ...secondaryBtn, opacity: pending ? 0.6 : 1 }}>
            拒否
          </button>
          <button onClick={() => decide(approveAuthorization)} disabled={pending} style={{ ...primaryBtn, opacity: pending ? 0.6 : 1 }}>
            許可
          </button>
        </div>
      </>
    );
  }

  return (
    <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={card}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, textAlign: "center" }}>task-branch</h1>
        {body}
        {error && <div style={{ marginTop: 12, color: "#a3210b", fontSize: 13 }}>{error}</div>}
      </div>
    </main>
  );
}

const card: CSSProperties = {
  width: 360,
  maxWidth: "calc(100% - 32px)",
  background: "#fff",
  border: "1px solid #e1e4e8",
  borderRadius: 8,
  padding: "32px 28px",
};

const lead: CSSProperties = { margin: "8px 0 24px", color: "#5f6b7a", fontSize: 13, textAlign: "center" };

const info: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: "6px 12px",
  margin: "0 0 24px",
  fontSize: 13,
};

const infoLabel: CSSProperties = { color: "#5f6b7a", fontSize: 12 };

const infoValue: CSSProperties = { margin: 0, color: "#1f2933", wordBreak: "break-all" };

const primaryBtn: CSSProperties = {
  flex: 1,
  background: "#0972d3",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "10px 14px",
  fontSize: 14,
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  flex: 1,
  background: "#fff",
  color: "#3b4149",
  border: "1px solid #cbd2d9",
  borderRadius: 6,
  padding: "10px 14px",
  fontSize: 14,
  cursor: "pointer",
};
