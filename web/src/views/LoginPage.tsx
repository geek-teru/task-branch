import { useState, type CSSProperties } from "react";
import { signInWithGoogle } from "../lib/useSession";

export function LoginPage() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On success the browser leaves for Google, so pending is only reset on failure.
  const handleLogin = async () => {
    setPending(true);
    setError(null);
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error.message);
      setPending(false);
    }
  };

  return (
    <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={card}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>task-branch</h1>
        <p style={{ margin: "8px 0 24px", color: "#5f6b7a", fontSize: 13 }}>Google アカウントでログインしてください。</p>
        <button onClick={handleLogin} disabled={pending} style={{ ...primaryBtn, opacity: pending ? 0.6 : 1 }}>
          {pending ? "Google へ移動中…" : "Google でログイン"}
        </button>
        {error && <div style={{ marginTop: 12, color: "#a3210b", fontSize: 13 }}>{error}</div>}
      </div>
    </main>
  );
}

const card: CSSProperties = {
  width: 360,
  maxWidth: "calc(100% - 32px)",
  background: "#fff",
  border: "1px solid #e1e4e8",
  borderRadius: 8,
  padding: "32px 28px",
  textAlign: "center",
};

const primaryBtn: CSSProperties = {
  width: "100%",
  background: "#0972d3",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  padding: "10px 14px",
  fontSize: 14,
  cursor: "pointer",
};
