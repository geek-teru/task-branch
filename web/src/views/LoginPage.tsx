import { useState } from "react";
import { AuthCard } from "../components/AuthCard";
import { GoogleIcon } from "../components/Icons";
import { Button } from "../components/ui/Button";
import { signInAsGuest, signInWithGoogle } from "../lib/useSession";

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

  // The app loads its project list when the session appears, which is before the sample project
  // exists, so a full navigation to the kanban is what makes it show up.
  const handleGuest = async () => {
    setPending(true);
    setError(null);
    const { error, projectId } = await signInAsGuest();
    if (error) {
      setError(error.message);
      setPending(false);
      return;
    }
    window.location.assign(projectId ? `/kanban?project=${projectId}` : "/projects");
  };

  return (
    <AuthCard error={error}>
      <p className="m-0 mb-6 text-center text-[13px] text-fg-muted">Google アカウントでログインしてください。</p>
      <Button onClick={handleLogin} disabled={pending} icon={<GoogleIcon />} className="h-10 w-full">
        {pending ? "Google へ移動中…" : "Google でログイン"}
      </Button>
      <div className="mt-4 border-t border-border pt-4">
        <Button onClick={handleGuest} disabled={pending} className="h-10 w-full">
          ゲストで試す
        </Button>
        <p className="m-0 mt-2 text-center text-xs text-fg-muted">
          ゲストのデータは 7 日後に削除されます。作ったものは Google で本登録すると引き継げます
        </p>
      </div>
    </AuthCard>
  );
}
