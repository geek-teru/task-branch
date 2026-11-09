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

// One line of the connection guide: a sentence, optionally with a snippet to copy and a link to open.
export type AgentSetupStep = {
  text: string;
  copy?: string;
  link?: { label: string; href: string };
};

// Providers without setup are not offered in the add-agent dialog.
export type AgentSetup = (mcpUrl: string) => AgentSetupStep[];

export const MCP_SERVER_NAME = "task-branch";

// The MCP endpoint of the app being viewed (production, preview and local use the same code).
export const mcpUrl = () => `${window.location.origin}/api/mcp`;

export type AgentProvider = {
  id: AgentProviderId;
  name: string;
  // The provider's image (under web/public), or a colored tile with letters when there is none (see ProviderIcon).
  icon: { color: string; label: string; image?: string };
  match: (client: AgentClientInfo) => boolean;
  setup?: AgentSetup;
};

export const AGENT_PROVIDERS: AgentProvider[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    icon: { color: "#d97757", label: "CC", image: "/agents/claude.png" },
    // Confirmed 2026-11-06: client_name "Claude Code (<MCP server name>)", redirect_uri http://localhost:<port>/callback.
    match: (c) =>
      c.name.startsWith("Claude Code (") && (c.redirectUri === undefined || c.redirectUri.startsWith("http://localhost:")),
    setup: (url) => [
      { text: "ターミナルで次のコマンドを実行して MCP サーバーを追加します。", copy: `claude mcp add --transport http ${MCP_SERVER_NAME} ${url}` },
      { text: `Claude Code で /mcp を開き、${MCP_SERVER_NAME} を選んで Authenticate を押します。ブラウザで同意画面が開きます。` },
    ],
  },
  {
    id: "claude-ai",
    name: "claude.ai",
    icon: { color: "#d97757", label: "C", image: "/agents/claude.png" },
    // Confirmed 2026-11-05: client_name "Claude", redirect_uri https://claude.ai/api/mcp/auth_callback.
    match: (c) =>
      c.name === "Claude" &&
      (c.redirectUri === undefined || c.redirectUri === "https://claude.ai/api/mcp/auth_callback"),
    setup: (url) => [
      { text: "MCP の URL をコピーします。", copy: url },
      {
        text: "claude.ai の「設定 → コネクタ → カスタムコネクタを追加」を開き、名前に task-branch、URL にコピーした値を入れて追加します。",
        link: { label: "claude.ai のコネクタ設定を開く", href: "https://claude.ai/settings/connectors" },
      },
      { text: "追加したコネクタの「接続」を押すと、ブラウザで同意画面が開きます。" },
    ],
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
    // The command shape is from the Codex docs and not yet run against a real Codex CLI.
    setup: (url) => [
      { text: "ターミナルで次のコマンドを実行して MCP サーバーを追加します。", copy: `codex mcp add ${MCP_SERVER_NAME} --url ${url}` },
      { text: "続けてログインします。ブラウザで同意画面が開きます。", copy: `codex mcp login ${MCP_SERVER_NAME}` },
    ],
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
