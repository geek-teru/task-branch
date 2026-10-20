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
