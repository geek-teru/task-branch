import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  ORG_SLUG_PATTERN,
  createOrgInvitation,
  deleteOrganization,
  listOrgInvitations,
  listOrgMembers,
  orgInvitationUrl,
  removeOrgMember,
  revokeOrgInvitation,
  updateOrgMemberRole,
  updateOrganization,
} from "../../lib/api";
import { cn } from "../../lib/cn";
import { avatarUrl } from "../../lib/profile";
import { useIsMobile } from "../../lib/useIsMobile";
import type { OrgInvitation, OrgMember, OrgRole, Organization } from "../../lib/types";
import { Avatar } from "../../components/Avatar";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { PageHeader } from "../../components/ui/PageHeader";
import { Select } from "../../components/ui/Select";

export type OrgSettingsTab = "general" | "members";

const TABS: { key: OrgSettingsTab; label: string }[] = [
  { key: "general", label: "一般" },
  { key: "members", label: "メンバー" },
];

const ROLE_LABEL: Record<OrgRole, string> = { owner: "owner", member: "member" };
const ROLE_OPTIONS = (["owner", "member"] as const).map((r) => ({ value: r, label: ROLE_LABEL[r] }));
const LAST_OWNER_REASON = "最後の owner です。先にほかのメンバーを owner にしてください";

// /orgs/:slug/settings/:tab. Same layout as the personal settings (SettingsPage): tabs on the left,
// a row of tabs above the body on phones. Only members reach the page (the organization comes from
// the user's own list); owner-only controls are hidden for members, and RLS stops them anyway.
export function OrgSettingsPage({
  tab,
  slug,
  orgs,
  orgsLoaded,
  userId,
  selfName,
  selfAvatarUrl,
  projectCount,
  onUpdated,
  onDeleted,
  onLeft,
}: {
  tab: OrgSettingsTab;
  slug: string;
  orgs: Organization[];
  orgsLoaded: boolean;
  userId: string;
  // The signed-in user's own name / icon (the header's), used for their row in the member list.
  selfName: string;
  selfAvatarUrl: string | null;
  // Projects under the organization (archived included): deletion needs 0.
  projectCount: (orgId: string) => number;
  onUpdated: (org: Organization, previousSlug: string) => void;
  onDeleted: (orgId: string) => void;
  onLeft: (orgId: string) => void;
}) {
  const org = orgs.find((o) => o.slug === slug) ?? null;

  if (!orgsLoaded) {
    return <div className="p-6 text-fg-muted">読み込み中…</div>;
  }
  if (!org) {
    return <div className="p-6 text-fg-muted">組織が見つかりません（メンバーではないか、削除されました）。</div>;
  }

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="組織の設定" meta={<span>{org.name}</span>} />
      <div className="flex max-w-[960px] flex-col gap-4 px-4 pb-6 md:flex-row md:gap-8 md:px-6">
        <nav aria-label="組織の設定の項目" className="flex shrink-0 gap-1 overflow-x-auto max-md:border-b max-md:border-border max-md:pb-2 md:w-48 md:flex-col md:gap-0.5">
          {TABS.map((t) => (
            <NavLink
              key={t.key}
              to={`/orgs/${encodeURIComponent(org.slug)}/settings/${t.key}`}
              className={({ isActive }) =>
                cn(
                  "flex h-8 shrink-0 items-center whitespace-nowrap rounded-md px-2.5 text-sm no-underline transition-colors",
                  isActive ? "bg-selected font-medium text-fg" : "text-fg-muted hover:bg-surface-muted hover:text-fg",
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <section className="min-w-0 flex-1">
          <h2 className="m-0 mb-4 text-base font-medium text-fg max-md:sr-only">{TABS.find((t) => t.key === tab)?.label}</h2>
          {tab === "general" ? (
            <GeneralSettings
              key={org.id}
              org={org}
              projectCount={projectCount(org.id)}
              onUpdated={onUpdated}
              onDeleted={onDeleted}
            />
          ) : (
            <MembersSettings
              key={org.id}
              org={org}
              userId={userId}
              selfName={selfName}
              selfAvatarUrl={selfAvatarUrl}
              onUpdated={onUpdated}
              onLeft={onLeft}
            />
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 一般: name / slug (owner), delete (owner, only with no projects)
// ---------------------------------------------------------------------------
function GeneralSettings({
  org,
  projectCount,
  onUpdated,
  onDeleted,
}: {
  org: Organization;
  projectCount: number;
  onUpdated: (org: Organization, previousSlug: string) => void;
  onDeleted: (orgId: string) => void;
}) {
  const isOwner = org.role === "owner";
  const [name, setName] = useState(org.name);
  const [slug, setSlug] = useState(org.slug);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const trimmedName = name.trim();
  const slugProblem = !slug
    ? "slug を入力してください"
    : !ORG_SLUG_PATTERN.test(slug)
      ? "英小文字・数字・ハイフンで 2〜39 文字（先頭は英数字）にしてください"
      : null;
  const changed = trimmedName !== org.name || slug !== org.slug;
  const canSave = isOwner && changed && !!trimmedName && trimmedName.length <= 100 && !slugProblem && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateOrganization(org, { name: trimmedName, slug });
      setSaved(true);
      onUpdated(updated, org.slug);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const submitOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) void handleSave();
  };

  const handleDelete = async () => {
    setConfirmingDelete(false);
    setDeleteError(null);
    try {
      await deleteOrganization(org.id);
      onDeleted(org.id);
    } catch (e: any) {
      setDeleteError(String(e?.message ?? e));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 p-4 md:p-5">
        <Field label="組織名">
          <Input
            value={name}
            maxLength={100}
            disabled={!isOwner}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            onKeyDown={submitOnEnter}
          />
        </Field>
        <Field
          label="slug（URL に使う識別子）"
          hint={slugProblem ?? `URL: /orgs/${slug}/settings`}
          invalid={!!slugProblem}
        >
          <Input
            value={slug}
            maxLength={39}
            disabled={!isOwner}
            onChange={(e) => {
              setSlug(e.target.value.toLowerCase());
              setSaved(false);
            }}
            onKeyDown={submitOnEnter}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>
        {isOwner ? (
          <p className="m-0 text-xs text-fg-muted">slug を変えると、組織の設定の URL と ?org= のリンクが変わります。</p>
        ) : (
          <p className="m-0 text-xs text-fg-muted">名前と slug を変えられるのは owner だけです。</p>
        )}
        {error && <ErrorBox>{error}</ErrorBox>}
        {isOwner && (
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={() => void handleSave()} disabled={!canSave}>
              {saving ? "保存中…" : "保存"}
            </Button>
            {saved && !changed && <span className="text-[13px] text-fg-muted">保存しました</span>}
          </div>
        )}
      </Card>

      {isOwner && (
        <Card className="flex flex-col gap-3 border-danger/40 p-4 md:p-5">
          <div>
            <h3 className="m-0 text-sm font-medium text-fg">組織の削除</h3>
            <p className="m-0 mt-1 text-[13px] text-fg-muted">
              組織とメンバーの情報を削除します。元に戻せません。
            </p>
          </div>
          {projectCount > 0 && (
            <p className="m-0 text-[13px] text-fg-muted">
              プロジェクトが {projectCount} 件あるため削除できません。先にプロジェクトを削除してください。
            </p>
          )}
          {deleteError && <ErrorBox>{deleteError}</ErrorBox>}
          <div>
            <Button variant="danger" disabled={projectCount > 0} onClick={() => setConfirmingDelete(true)}>
              組織を削除
            </Button>
          </div>
        </Card>
      )}

      {confirmingDelete && (
        <ConfirmDialog
          message={`組織「${org.name}」を削除します。元に戻せません。よろしいですか？`}
          confirmLabel="削除する"
          danger
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// メンバー: list, role change / removal (owner), leave (everyone)
// ---------------------------------------------------------------------------
type PendingAction =
  | { kind: "role"; member: OrgMember; role: OrgRole }
  | { kind: "remove"; member: OrgMember }
  | { kind: "leave" };

function MembersSettings({
  org,
  userId,
  selfName,
  selfAvatarUrl,
  onUpdated,
  onLeft,
}: {
  org: Organization;
  userId: string;
  selfName: string;
  selfAvatarUrl: string | null;
  onUpdated: (org: Organization, previousSlug: string) => void;
  onLeft: (orgId: string) => void;
}) {
  const isMobile = useIsMobile();
  const isOwner = org.role === "owner";
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listOrgMembers(org.id)
      .then(setMembers)
      .catch((e) => {
        setMembers([]);
        setError(String(e?.message ?? e));
      });
  }, [org.id]);
  useEffect(load, [load]);

  if (members === null) return <div className="text-[13px] text-fg-muted">読み込み中…</div>;

  const ownerCount = members.filter((m) => m.role === "owner").length;
  const isLastOwner = (m: OrgMember) => m.role === "owner" && ownerCount <= 1;
  const me = members.find((m) => m.user_id === userId) ?? null;
  const nameOf = (m: OrgMember) =>
    m.user_id === userId ? m.display_name ?? selfName : m.display_name ?? "名前未設定のメンバー";
  const iconOf = (m: OrgMember) =>
    m.avatar_path ? avatarUrl(m.avatar_path) : m.user_id === userId ? selfAvatarUrl : null;

  const run = async () => {
    if (!pending) return;
    const action = pending;
    setPending(null);
    setBusy(true);
    setError(null);
    try {
      if (action.kind === "role") {
        await updateOrgMemberRole(org.id, action.member.user_id, action.role);
        // Demoting yourself makes you a member: the org list (and this page's controls) follow.
        if (action.member.user_id === userId) onUpdated({ ...org, role: action.role }, org.slug);
        load();
      } else if (action.kind === "remove") {
        await removeOrgMember(org.id, action.member.user_id);
        load();
      } else {
        await removeOrgMember(org.id, userId);
        onLeft(org.id);
      }
    } catch (e: any) {
      setError(String(e?.message ?? e));
      load();
    } finally {
      setBusy(false);
    }
  };

  const roleControl = (m: OrgMember) =>
    isOwner ? (
      <span data-tooltip={isLastOwner(m) ? LAST_OWNER_REASON : undefined} className="inline-block">
        <Select<OrgRole>
          value={m.role}
          options={ROLE_OPTIONS}
          aria-label={`${nameOf(m)} のロール`}
          className="w-28"
          disabled={busy || isLastOwner(m)}
          onChange={(role) => {
            if (role !== m.role) setPending({ kind: "role", member: m, role });
          }}
        />
      </span>
    ) : (
      <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{ROLE_LABEL[m.role]}</Badge>
    );

  // Owners remove others here; anyone leaves with the button under the list.
  const removeControl = (m: OrgMember) =>
    isOwner && m.user_id !== userId ? (
      <Button size="sm" disabled={busy} onClick={() => setPending({ kind: "remove", member: m })}>
        削除
      </Button>
    ) : null;

  const joined = (m: OrgMember) => new Date(m.joined_at).toLocaleDateString("ja-JP");

  return (
    <div className="flex flex-col gap-6">
      {error && <ErrorBox>{error}</ErrorBox>}

      {isMobile ? (
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <Card key={m.user_id} className="flex flex-col gap-3 p-3">
              <div className="flex items-center gap-3">
                <Avatar url={iconOf(m)} name={nameOf(m)} className="size-9 text-sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-fg">
                    {nameOf(m)}
                    {m.user_id === userId && <span className="ml-1 text-xs font-normal text-fg-muted">（自分）</span>}
                  </div>
                  <div className="text-xs text-fg-muted">参加日 {joined(m)}</div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                {roleControl(m)}
                {removeControl(m)}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full table-fixed border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-left text-xs text-fg-muted">
                <th className="px-4 py-2 font-normal">メンバー</th>
                <th className="w-36 px-4 py-2 font-normal">ロール</th>
                <th className="w-28 px-4 py-2 font-normal">参加日</th>
                <th className="w-20 px-4 py-2 font-normal">
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar url={iconOf(m)} name={nameOf(m)} className="size-7 text-xs" />
                      <span className="truncate font-medium text-fg">{nameOf(m)}</span>
                      {m.user_id === userId && <span className="shrink-0 text-xs text-fg-muted">（自分）</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">{roleControl(m)}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{joined(m)}</td>
                  <td className="px-4 py-2.5 text-right">{removeControl(m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isOwner && <InvitationsSection org={org} nameOfUser={(id) => {
        const m = members.find((x) => x.user_id === id);
        return m ? nameOf(m) : "元のメンバー";
      }} />}

      {me && (
        <Card className="flex flex-col gap-3 p-4 md:p-5">
          <div>
            <h3 className="m-0 text-sm font-medium text-fg">組織を抜ける</h3>
            <p className="m-0 mt-1 text-[13px] text-fg-muted">
              抜けると、この組織のプロジェクトを開けなくなり、あなたが担当のタスクは未割り当てに戻ります。
            </p>
          </div>
          {isLastOwner(me) && <p className="m-0 text-[13px] text-fg-muted">{LAST_OWNER_REASON}。</p>}
          <div>
            <Button variant="danger" disabled={busy || isLastOwner(me)} onClick={() => setPending({ kind: "leave" })}>
              組織を抜ける
            </Button>
          </div>
        </Card>
      )}

      {pending && (
        <ConfirmDialog
          message={
            pending.kind === "role"
              ? pending.member.user_id === userId
                ? `あなたのロールを ${ROLE_LABEL[pending.role]} に変更します。owner の操作ができなくなります。よろしいですか？`
                : `${nameOf(pending.member)} のロールを ${ROLE_LABEL[pending.role]} に変更しますか？`
              : pending.kind === "remove"
                ? `${nameOf(pending.member)} を組織から削除します。この人が担当のタスクは未割り当てに戻ります。よろしいですか？`
                : `組織「${org.name}」を抜けます。よろしいですか？`
          }
          confirmLabel={pending.kind === "role" ? "変更する" : pending.kind === "remove" ? "削除する" : "抜ける"}
          danger={pending.kind !== "role"}
          onConfirm={() => void run()}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 招待リンク (owner only): issue with a role and a validity, show the link once, list the usable
// links, revoke. Expired and revoked links drop out of the list.
// ---------------------------------------------------------------------------
type ValidDays = "1" | "7" | "30";
const VALID_DAYS_OPTIONS: { value: ValidDays; label: string }[] = [
  { value: "1", label: "1日" },
  { value: "7", label: "7日" },
  { value: "30", label: "30日" },
];

function InvitationsSection({ org, nameOfUser }: { org: Organization; nameOfUser: (userId: string | null) => string }) {
  const isMobile = useIsMobile();
  const [invitations, setInvitations] = useState<OrgInvitation[] | null>(null);
  const [role, setRole] = useState<OrgRole>("member");
  const [days, setDays] = useState<ValidDays>("7");
  const [issuing, setIssuing] = useState(false);
  const [issued, setIssued] = useState<{ url: string; role: OrgRole; expires_at: string } | null>(null);
  const [revoking, setRevoking] = useState<OrgInvitation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listOrgInvitations(org.id)
      .then(setInvitations)
      .catch((e) => {
        setInvitations([]);
        setError(String(e?.message ?? e));
      });
  }, [org.id]);
  useEffect(load, [load]);

  const issue = async () => {
    setIssuing(true);
    setError(null);
    try {
      const inv = await createOrgInvitation(org.id, role, Number(days));
      setIssued({ url: orgInvitationUrl(inv.token), role: inv.role, expires_at: inv.expires_at });
      load();
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setIssuing(false);
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    const target = revoking;
    setRevoking(null);
    setError(null);
    try {
      await revokeOrgInvitation(target.id);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
    load();
  };

  const expires = (iso: string) =>
    new Date(iso).toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const roleBadge = (r: OrgRole) => <Badge tone={r === "owner" ? "brand" : "neutral"}>{ROLE_LABEL[r]}</Badge>;
  const revokeButton = (inv: OrgInvitation) => (
    <Button size="sm" onClick={() => setRevoking(inv)}>
      失効
    </Button>
  );

  return (
    <section aria-labelledby="org-invitations-heading" className="flex flex-col gap-3">
      <div>
        <h3 id="org-invitations-heading" className="m-0 text-sm font-medium text-fg">
          招待リンク
        </h3>
        <p className="m-0 mt-1 text-[13px] text-fg-muted">
          リンクを開いて Google でログインした人が、選んだロールで組織に参加します。期限内なら何人でも使えます。
        </p>
      </div>

      <Card className="flex flex-col gap-3 p-4 md:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-fg-muted">ロール</span>
            <Select<OrgRole> value={role} options={ROLE_OPTIONS} aria-label="招待するロール" className="w-32" onChange={setRole} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-fg-muted">期限</span>
            <Select<ValidDays> value={days} options={VALID_DAYS_OPTIONS} aria-label="招待リンクの期限" className="w-28" onChange={setDays} />
          </label>
          <Button variant="primary" disabled={issuing} onClick={() => void issue()}>
            {issuing ? "発行中…" : "招待リンクを発行"}
          </Button>
        </div>
        {issued && <IssuedLink {...issued} expiresLabel={expires(issued.expires_at)} onClose={() => setIssued(null)} />}
      </Card>

      {error && <ErrorBox>{error}</ErrorBox>}

      {invitations === null ? (
        <div className="text-[13px] text-fg-muted">読み込み中…</div>
      ) : invitations.length === 0 ? (
        <p className="m-0 text-[13px] text-fg-muted">有効な招待リンクはありません。</p>
      ) : isMobile ? (
        <div className="flex flex-col gap-2">
          {invitations.map((inv) => (
            <Card key={inv.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0 flex-1 text-xs text-fg-muted">
                <div className="mb-1">{roleBadge(inv.role)}</div>
                <div className="truncate">発行者 {nameOfUser(inv.created_by)}</div>
                <div>期限 {expires(inv.expires_at)}・参加 {inv.accepted_count} 人</div>
              </div>
              {revokeButton(inv)}
            </Card>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full table-fixed border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-muted text-left text-xs text-fg-muted">
                <th className="w-28 px-4 py-2 font-normal">ロール</th>
                <th className="px-4 py-2 font-normal">発行者</th>
                <th className="w-40 px-4 py-2 font-normal">期限</th>
                <th className="w-20 px-4 py-2 font-normal">参加人数</th>
                <th className="w-20 px-4 py-2 font-normal">
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {invitations.map((inv) => (
                <tr key={inv.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-2.5">{roleBadge(inv.role)}</td>
                  <td className="truncate px-4 py-2.5 text-fg">{nameOfUser(inv.created_by)}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{expires(inv.expires_at)}</td>
                  <td className="px-4 py-2.5 text-fg-muted">{inv.accepted_count} 人</td>
                  <td className="px-4 py-2.5 text-right">{revokeButton(inv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {revoking && (
        <ConfirmDialog
          message={`この招待リンク（${ROLE_LABEL[revoking.role]}・期限 ${expires(revoking.expires_at)}）を失効します。リンクは使えなくなり、元に戻せません。すでに参加した人はそのまま残ります。よろしいですか？`}
          confirmLabel="失効する"
          danger
          onConfirm={() => void revoke()}
          onCancel={() => setRevoking(null)}
        />
      )}
    </section>
  );
}

// The link just issued, with a copy button. The token is not stored, so it cannot be shown again.
function IssuedLink({
  url,
  role,
  expiresLabel,
  onClose,
}: {
  url: string;
  role: OrgRole;
  expires_at: string;
  expiresLabel: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div role="status" className="flex flex-col gap-2 rounded-md border border-brand/40 bg-brand/5 p-3">
      <p className="m-0 text-[13px] text-fg">
        招待リンクを発行しました（{ROLE_LABEL[role]}・期限 {expiresLabel}）。
        <span className="font-medium">このリンクは今だけ表示されます。あとから再表示できないので、ここでコピーしてください。</span>
      </p>
      <div className="flex items-start gap-2 rounded-md border border-border bg-surface p-2">
        <code className="min-w-0 flex-1 break-all font-mono text-xs text-fg">{url}</code>
        <Button size="sm" onClick={() => void copy()}>
          {copied ? "コピーしました" : "コピー"}
        </Button>
      </div>
      <div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          閉じる
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  invalid,
  children,
}: {
  label: string;
  hint?: string;
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-fg-muted">{label}</span>
      {children}
      {hint && <span className={invalid ? "text-xs text-danger-fg" : "text-xs text-fg-muted"}>{hint}</span>}
    </label>
  );
}

function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger-fg">
      {children}
    </div>
  );
}
