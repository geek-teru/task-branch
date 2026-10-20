// MCP エンドポイントの保護リソースメタデータ（RFC 9728）。
// /.well-known/oauth-protected-resource と /.well-known/oauth-protected-resource/api/mcp の両方から rewrite で呼ばれる。
import { requestOrigin, supabaseIssuer } from "./_lib/env.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export function GET(req: Request): Response {
  return Response.json(
    {
      resource: `${requestOrigin(req)}/api/mcp`,
      authorization_servers: [supabaseIssuer()],
      bearer_methods_supported: ["header"],
    },
    { headers: CORS },
  );
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
