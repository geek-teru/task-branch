// MCP エンドポイントの Bearer トークン（Supabase Auth が発行した JWT）を検証する。
// service_role キーも JWT secret も使わず、公開鍵（JWKS）で署名だけを確かめる。
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { resourceMetadataUrl, supabaseIssuer, supabaseJwksUrl } from "./env.js";

export type AuthClaims = JWTPayload & { sub: string; client_id: string };
export type Authenticated = { token: string; claims: AuthClaims };

// 鍵のキャッシュを呼び出しをまたいで使い回すため、モジュールの最上位で1回だけ作る（環境変数は初回の呼び出しで読む）。
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
function getJwks() {
  jwks ??= createRemoteJWKSet(new URL(supabaseJwksUrl()));
  return jwks;
}

function unauthorized(req: Request, error?: string): Response {
  const params = error ? `error="${error}", ` : "";
  return new Response(null, {
    status: 401,
    headers: { "WWW-Authenticate": `Bearer ${params}resource_metadata="${resourceMetadataUrl(req)}"` },
  });
}

// 通れば { token, claims }、通らなければ 401 の Response を返す。
export async function authenticate(req: Request): Promise<Authenticated | Response> {
  const match = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  if (!match) return unauthorized(req);
  const token = match[1];

  let claims: JWTPayload;
  try {
    ({ payload: claims } = await jwtVerify(token, getJwks(), {
      algorithms: ["ES256"],
      issuer: supabaseIssuer(),
      audience: "authenticated",
    }));
  } catch (e) {
    console.warn(`[auth] トークンを拒否: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    return unauthorized(req, "invalid_token");
  }

  // MCP 経由の操作を必ず ai として記録するため、OAuth で発行された（client_id 入りの）トークンだけを受け付ける。
  if (typeof claims.client_id !== "string" || !claims.client_id || typeof claims.sub !== "string") {
    console.warn("[auth] トークンを拒否: client_id が無い（画面のセッションのトークン）");
    return unauthorized(req, "invalid_token");
  }

  return { token, claims: claims as AuthClaims };
}
