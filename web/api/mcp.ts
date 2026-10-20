// MCP エンドポイント（Streamable HTTP）。ステートレスで、リクエストごとにサーバーとトランスポートを作る。
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import pkg from "../package.json" with { type: "json" };
import { authenticate } from "./_lib/auth.js";
import { createUserClient } from "./_lib/supabase.js";
import { registerTools } from "./_lib/tools.js";

export async function POST(req: Request): Promise<Response> {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;

  const server = new McpServer({ name: "task-branch", version: pkg.version });
  registerTools(server, createUserClient(auth.token));

  // セッション ID を発行せず、SSE ではなく JSON で応答する。
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await server.close();
  }
}

// サーバーから通知を送らないので、GET（SSE のストリーム）と DELETE（セッションの終了）は受けない。
function methodNotAllowed(): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
