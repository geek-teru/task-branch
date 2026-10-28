import { useState } from "react";
import { AuthCard } from "../components/AuthCard";
import { GoogleIcon } from "../components/Icons";
import { Button } from "../components/ui/Button";
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
    <AuthCard error={error}>
      <p className="m-0 mb-6 text-center text-[13px] text-fg-muted">Google アカウントでログインしてください。</p>
      <Button onClick={handleLogin} disabled={pending} icon={<GoogleIcon />} className="h-10 w-full">
        {pending ? "Google へ移動中…" : "Google でログイン"}
      </Button>
    </AuthCard>
  );
}
