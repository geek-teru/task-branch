// AI agents (MCP clients) that connect to task-branch over OAuth. Shared by the agents settings tab,
// the add-agent dialog and the consent screen.
//
// match tells which provider a registered OAuth client belongs to. Only rules confirmed against the
// real client are filled in; the rest stay false (shown as その他) until the verification lands in
// docs/DESIGN.md §7.2.

export type AgentProviderId = "claude-code" | "claude-ai" | "chatgpt" | "codex" | "cursor" | "vscode";

// What we know about a client. The grant list only carries the name; the consent screen also knows
// the redirect_uri, which it passes so a client can't pass itself off as a provider by name alone.
export type AgentClientInfo = { name: string; redirectUri?: string };

export type AgentProvider = {
  id: AgentProviderId;
  name: string;
  // The provider's image (under web/public), or a colored tile with letters when there is none (see ProviderIcon).
  icon: { color: string; label: string; image?: string };
  match: (client: AgentClientInfo) => boolean;
};

export const AGENT_PROVIDERS: AgentProvider[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    icon: { color: "#d97757", label: "CC", image: "/agents/claude.png" },
    // Confirmed 2026-11-06: client_name "Claude Code (<MCP server name>)", redirect_uri http://localhost:<port>/callback.
    match: (c) =>
      c.name.startsWith("Claude Code (") && (c.redirectUri === undefined || c.redirectUri.startsWith("http://localhost:")),
  },
  {
    id: "claude-ai",
    name: "claude.ai",
    icon: { color: "#d97757", label: "C", image: "/agents/claude.png" },
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
    id: "codex",
    name: "Codex",
    icon: { color: "#1f1f1f", label: "Cx", image: "/agents/codex.png" },
    // From the Codex source (rmcp-client), 2026-11-06: client_name "Codex", redirect_uri http://127.0.0.1:<port>/callback.
    match: (c) =>
      c.name === "Codex" &&
      (c.redirectUri === undefined || /^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):/.test(c.redirectUri)),
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

// How a connected client is called on screen.
export const agentClientLabel = (client: { id: string; name: string }) => client.name || client.id;

// The provider a client belongs to, or null for その他.
export function findAgentProvider(client: AgentClientInfo): AgentProvider | null {
  return AGENT_PROVIDERS.find((p) => p.match(client)) ?? null;
}
