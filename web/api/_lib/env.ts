// Vercel の関数が読む環境変数。値が無ければ起動時ではなく呼び出し時に失敗させる。
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
  return value;
}

export function supabaseUrl(): string {
  return required("SUPABASE_URL").replace(/\/$/, "");
}

export function supabaseAnonKey(): string {
  return required("SUPABASE_ANON_KEY");
}

// Supabase Auth の issuer（ローカルは http://127.0.0.1:54321/auth/v1）。
export function supabaseIssuer(): string {
  return `${supabaseUrl()}/auth/v1`;
}

// Supabase Auth が公開する署名鍵（ES256 の公開鍵）。
export function supabaseJwksUrl(): string {
  return `${supabaseIssuer()}/.well-known/jwks.json`;
}

// 呼ばれた URL の origin。本番・プレビュー・ローカルで同じコードにするため、環境変数ではなくリクエストから作る。
export function requestOrigin(req: Request): string {
  const url = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() || url.protocol.replace(/:$/, "");
  const host = req.headers.get("x-forwarded-host")?.split(",")[0].trim() || req.headers.get("host") || url.host;
  return `${proto}://${host}`;
}

// MCP エンドポイントの保護リソースメタデータ（RFC 9728）の URL。WWW-Authenticate で案内する。
export function resourceMetadataUrl(req: Request): string {
  return `${requestOrigin(req)}/.well-known/oauth-protected-resource/api/mcp`;
}
