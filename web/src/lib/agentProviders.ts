// AI agents (MCP clients) that connect to task-branch over OAuth. Shared by the agents settings tab,
// the add-agent dialog and the consent screen.
//
// match tells which provider a registered OAuth client belongs to. Only rules confirmed against the
// real client are filled in; the rest stay false (shown as その他) until the verification lands in
// docs/DESIGN.md §7.2.

export type AgentProviderId = "claude-code" | "claude-ai" | "chatgpt" | "cursor" | "vscode";

// What we know about a client. The grant list only carries the name; the consent screen also knows
// the redirect_uri, which it passes so a client can't pass itself off as a provider by name alone.
export type AgentClientInfo = { name: string; redirectUri?: string };

export type AgentProvider = {
  id: AgentProviderId;
  name: string;
  // Tile color and the letters on it (see ProviderIcon).
  icon: { color: string; label: string };
  match: (client: AgentClientInfo) => boolean;
};

export const AGENT_PROVIDERS: AgentProvider[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    icon: { color: "#d97757", label: "CC" },
    match: () => false, // client_name not confirmed yet
  },
  {
    id: "claude-ai",
    name: "claude.ai",
    icon: { color: "#c15f3c", label: "C" },
    // Confirmed 2026-11-05: client_name "Claude", redirect_uri https://claude.ai/api/mcp/auth_callback.
    match: (c) =>
      c.name === "Claude" &&
      (c.redirectUri === undefined || c.redirectUri === "https://claude.ai/api/mcp/auth_callback"),
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    icon: { color: "#10a37f", label: "G" },
    match: () => false, // not verified yet
  },
  {
    id: "cursor",
    name: "Cursor",
    icon: { color: "#1f1f1f", label: "Cu" },
    match: () => false, // not verified yet
  },
  {
    id: "vscode",
    name: "VS Code",
    icon: { color: "#0078d4", label: "VS" },
    match: () => false, // not verified yet
  },
];

// The provider a client belongs to, or null for その他.
export function findAgentProvider(client: AgentClientInfo): AgentProvider | null {
  return AGENT_PROVIDERS.find((p) => p.match(client)) ?? null;
}
