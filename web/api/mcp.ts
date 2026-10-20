// MCP エンドポイント。いまは認証だけで、MCP の処理は「MCP エンドポイントと確認用ツールの追加」で入れる。
import { authenticate } from "./_lib/auth.js";

export async function POST(req: Request): Promise<Response> {
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  return Response.json({ error: "not_implemented" }, { status: 501 });
}
