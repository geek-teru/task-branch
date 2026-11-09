import { useCallback, useEffect, useState } from "react";
import type { OAuthGrant } from "@supabase/supabase-js";
import { agentClientLabel, findAgentProvider } from "../../lib/agentProviders";
import { listGrants, revokeGrant } from "../../lib/oauth";
import { Button } from "../../components/ui/Button";
import { AddAgentDialog } from "./AddAgentDialog";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ProviderIcon } from "../../components/Icons";

const fmtDateTime = (s: string) => new Date(s).toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });

// /settings/agents: the AI agents (OAuth clients) the user has consented to, with a way to revoke each.
// Consent happens in another tab (the agent opens /oauth/consent), so the list reloads when the user
// comes back to this tab.
export function AgentSettings() {
  const [grants, setGrants] = useState<OAuthGrant[] | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<OAuthGrant | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    listGrants()
      .then((g) => {
        setGrants(g);
        setError(null);
      })
      .catch((e) => {
        setGrants((prev) => prev ?? []);
        setError(String(e.message ?? e));
      });
  }, []);

  useEffect(() => {
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const handleRevoke = async (grant: OAuthGrant) => {
    setConfirming(null);
    setRevoking(grant.client.id);
    try {
      await revokeGrant(grant.client.id);
      setError(null);
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setRevoking(null);
      load();
    }
  };

  return (
    <div className="flex max-w-[640px] flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="m-0 text-[13px] font-medium text-fg">接続中のエージェント</h3>
        <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
          エージェントを追加
        </Button>
      </div>
      {error && <div className="text-[13px] text-danger">{error}</div>}
      {grants === undefined ? (
        <div className="text-[13px] text-fg-muted">読み込み中…</div>
      ) : grants.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-strong px-6 py-10 text-center text-[13px] text-fg-muted">
          <div>まだ接続したエージェントはありません</div>
          <Button size="sm" className="mt-3" onClick={() => setAdding(true)}>
            エージェントを追加
          </Button>
        </div>
      ) : (
        <ul className="m-0 list-none divide-y divide-border rounded-md border border-border p-0">
          {grants.map((g) => {
            const provider = findAgentProvider({ name: g.client.name });
            return (
              <li key={g.client.id} className="flex items-center gap-3 px-4 py-3">
                <ProviderIcon provider={provider} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-fg">{agentClientLabel(g.client)}</span>
                  <span className="text-xs text-fg-muted">
                    {provider ? provider.name : "その他"}・{fmtDateTime(g.granted_at)} に同意
                  </span>
                </div>
                <Button size="sm" onClick={() => setConfirming(g)} disabled={revoking === g.client.id}>
                  {revoking === g.client.id ? "解除中…" : "接続を解除"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {adding && <AddAgentDialog onClose={() => setAdding(false)} />}
      {confirming && (
        <ConfirmDialog
          message={`${agentClientLabel(confirming.client)} の接続を解除しますか？\n再び使うにはエージェント側からつなぎ直して同意します。\n発行済みのトークンは、解除後も最大 1 時間は使える場合があります。`}
          confirmLabel="接続を解除"
          danger
          onConfirm={() => handleRevoke(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
