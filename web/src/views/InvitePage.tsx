import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthCard } from "../components/AuthCard";
import { GoogleIcon } from "../components/Icons";
import { Button } from "../components/ui/Button";
import { acceptOrgInvitation, getOrgInvitation } from "../lib/api";
import type { OrgInvitationPreview, OrgRole } from "../lib/types";
import { initialAuthRedirectError, linkGoogle, signInWithGoogle, signOut } from "../lib/useSession";

const lead = "m-0 mb-6 text-center text-[13px] text-fg-muted";

const ROLE_LABEL: Record<OrgRole, string> = { owner: "owner", member: "member" };

// Why a link cannot be used, by get_org_invitation's status.
const UNUSABLE: Record<"expired" | "revoked" | "invalid", string> = {
  expired: "この招待リンクは期限切れです。",
  revoked: "この招待リンクは失効しています。",
  invalid: "この招待リンクは無効です。URL が正しいか確かめてください。",
};

// The organization's project list. A full navigation, so the app reloads the organizations it
// belongs to (the one just joined included) and ?org= resolves to it.
function goToOrg(slug: string) {
  window.location.assign(`/projects?org=${encodeURIComponent(slug)}`);
}

// /invite/<token>: join an organization through an invitation link. Stands alone like the login and
// consent pages, and handles sign-in itself so the token survives the Google round trip.
export function InvitePage({ session, token }: { session: Session | null; token: string }) {
  const [invitation, setInvitation] = useState<OrgInvitationPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A guest tried to register with a Google account that already has a user (no merge possible).
  const [identityConflict] = useState(() => initialAuthRedirectError === "identity_already_exists");
  const userId = session?.user.id;
  const isGuest = !!session?.user.is_anonymous;
  // Where Google sends the user back: this page, without any error params.
  const returnTo = `${window.location.origin}/invite/${encodeURIComponent(token)}`;

  // Read again when the user changes (sign-in, guest → registered).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setInvitation(null);
    getOrgInvitation(token)
      .then((inv) => {
        if (cancelled) return;
        // Already a member: nothing to accept, go straight to the organization.
        if (inv.status === "valid" && inv.is_member && inv.org_slug) goToOrg(inv.org_slug);
        else setInvitation(inv);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, [token, userId]);

  // On success the browser leaves for Google, so pending is only reset on failure.
  const run = async (action: () => Promise<{ error: { message: string } | null }>) => {
    setPending(true);
    setError(null);
    const { error } = await action();
    if (error) {
      setError(error.message);
      setPending(false);
    }
  };
  const handleLogin = () => run(() => signInWithGoogle(returnTo));
  const handleLinkGoogle = () => run(() => linkGoogle(returnTo));
  // Leave the guest and sign in with the already registered account; the guest's data stays behind.
  const handleSwitchAccount = () =>
    run(async () => {
      const { error } = await signOut();
      if (error) return { error };
      return signInWithGoogle(returnTo);
    });

  const handleAccept = async () => {
    setPending(true);
    setError(null);
    try {
      goToOrg(await acceptOrgInvitation(token));
    } catch (e: any) {
      setError(String(e.message ?? e));
      setPending(false);
    }
  };

  let body: ReactNode;
  if (!session) {
    body = (
      <>
        <p className={lead}>組織への招待を受けるには、Google アカウントでログインしてください。</p>
        <Button onClick={handleLogin} disabled={pending} icon={<GoogleIcon />} className="h-10 w-full">
          {pending ? "Google へ移動中…" : "Google でログイン"}
        </Button>
      </>
    );
  } else if (!invitation) {
    body = error ? null : <p className={lead}>読み込み中…</p>;
  } else if (invitation.status !== "valid") {
    body = (
      <>
        <p className="m-0 mb-2 text-center text-sm text-fg">{UNUSABLE[invitation.status]}</p>
        <p className={lead}>組織の owner に新しいリンクを依頼してください。</p>
        <BackToApp />
      </>
    );
  } else {
    const summary = (
      <>
        <p className="m-0 mb-4 text-center text-sm text-fg">
          <span className="font-medium">{invitation.org_name}</span> に{" "}
          <span className="font-medium">{ROLE_LABEL[invitation.role ?? "member"]}</span> として参加します
        </p>
        <dl className="m-0 mb-6 divide-y divide-border rounded-md border border-border text-[13px]">
          <InfoRow label="組織">{invitation.org_name}</InfoRow>
          <InfoRow label="ロール">{ROLE_LABEL[invitation.role ?? "member"]}</InfoRow>
          {invitation.expires_at && <InfoRow label="リンクの期限">{formatDateTime(invitation.expires_at)}</InfoRow>}
          <InfoRow label="ログイン中">{isGuest ? "ゲスト" : session.user.email}</InfoRow>
        </dl>
      </>
    );
    if (isGuest && identityConflict) {
      body = (
        <>
          {summary}
          <p className={lead}>
            この Google アカウントは登録済みです。ゲストのデータは引き継げません。そのアカウントでログインし直して参加できます。
          </p>
          <Button variant="primary" onClick={handleSwitchAccount} disabled={pending} icon={<GoogleIcon />} className="h-10 w-full">
            {pending ? "Google へ移動中…" : "そのアカウントでログインし直す"}
          </Button>
        </>
      );
    } else if (isGuest) {
      body = (
        <>
          {summary}
          <p className={lead}>
            ゲストは組織に参加できません。Google で本登録すると、ゲストのデータを引き継いだまま参加できます。
          </p>
          <Button variant="primary" onClick={handleLinkGoogle} disabled={pending} icon={<GoogleIcon />} className="h-10 w-full">
            {pending ? "Google へ移動中…" : "Google で本登録"}
          </Button>
        </>
      );
    } else {
      body = (
        <>
          {summary}
          <div className="flex gap-2">
            <Button onClick={() => window.location.assign("/projects")} disabled={pending} className="h-10 flex-1 md:h-9">
              参加しない
            </Button>
            <Button variant="primary" onClick={handleAccept} disabled={pending} className="h-10 flex-1 md:h-9">
              {pending ? "参加中…" : "参加する"}
            </Button>
          </div>
        </>
      );
    }
  }

  return <AuthCard error={error}>{body}</AuthCard>;
}

function BackToApp() {
  return (
    <Button onClick={() => window.location.assign("/projects")} className="h-10 w-full">
      プロジェクト一覧へ
    </Button>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-3 px-3 py-2">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="m-0 break-all text-fg">{children}</dd>
    </div>
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
