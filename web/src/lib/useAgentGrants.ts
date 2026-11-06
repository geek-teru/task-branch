import { useCallback, useEffect, useState } from "react";
import type { OAuthGrant } from "@supabase/supabase-js";
import { listGrants } from "./oauth";

// The agents the signed-in user has connected, or undefined until they could be read. The list is
// read again when the user comes back to this tab (agents connect in another tab) and whenever
// refreshKey changes. A failed read keeps what was read before.
export function useAgentGrants(userId: string | undefined, refreshKey: unknown): OAuthGrant[] | undefined {
  const [grants, setGrants] = useState<OAuthGrant[] | undefined>(undefined);

  const load = useCallback(() => {
    if (!userId) return;
    listGrants()
      .then(setGrants)
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    setGrants(undefined);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  return grants;
}
