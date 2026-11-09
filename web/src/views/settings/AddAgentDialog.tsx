import { useEffect, useRef, useState } from "react";
import { AGENT_PROVIDERS, mcpUrl, type AgentProvider } from "../../lib/agentProviders";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { ProviderIcon } from "../../components/Icons";

// Copies text and shows コピーしました for 2 seconds.
function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-1.5 flex items-start gap-2 rounded-md border border-border bg-surface-muted p-2">
      <code className="min-w-0 flex-1 break-all font-mono text-xs text-fg">{text}</code>
      <Button size="sm" onClick={copy}>
        {copied ? "コピーしました" : "コピー"}
      </Button>
    </div>
  );
}

// Add an agent: pick a provider (cards), then follow its connection steps. The connection itself starts
// from the agent's side and ends on /oauth/consent, so this dialog only explains and offers copy buttons.
export function AddAgentDialog({ onClose }: { onClose: () => void }) {
  const [provider, setProvider] = useState<AgentProvider | null>(null);
  const providers = AGENT_PROVIDERS.filter((p) => p.setup);
  const steps = provider?.setup?.(mcpUrl()) ?? [];

  return (
    <Dialog
      onClose={onClose}
      title={provider ? `${provider.name} をつなぐ` : "エージェントを追加"}
      className="w-[480px]"
      footer={
        provider ? (
          <>
            <Button onClick={() => setProvider(null)}>戻る</Button>
            <Button variant="primary" onClick={onClose}>閉じる</Button>
          </>
        ) : (
          <Button onClick={onClose}>閉じる</Button>
        )
      }
    >
      {provider ? (
        <div className="flex flex-col gap-4">
          <ol className="m-0 flex list-decimal flex-col gap-3 pl-5">
            {steps.map((s, i) => (
              <li key={i}>
                <div>{s.text}</div>
                {s.copy && <CopyBlock text={s.copy} />}
                {s.link && (
                  <a href={s.link.href} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[13px] text-brand hover:underline">
                    {s.link.label}
                  </a>
                )}
              </li>
            ))}
          </ol>
          <p className="m-0 text-xs text-fg-muted">
            エージェントから接続すると task-branch の同意画面が開きます。許可するとこの一覧に出ます。
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[13px] text-fg-muted">つなぐエージェントを選んでください。</p>
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setProvider(p)}
              className="m-0 flex cursor-pointer items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5 text-left font-sans text-sm text-fg hover:bg-surface-muted"
            >
              <ProviderIcon provider={p} />
              <span className="font-medium">{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}
