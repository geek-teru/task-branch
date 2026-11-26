import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { listMyOrganizations } from "./api";
import type { Organization } from "./types";

// The owner picked in the header (個人 or one of the user's organizations), remembered per browser.
const SELECTED_ORG_KEY = "org.selected";

function readStoredSlug(): string | null {
  try {
    return localStorage.getItem(SELECTED_ORG_KEY);
  } catch {
    return null; // storage can be unavailable (private mode)
  }
}

function writeStoredSlug(slug: string | null) {
  try {
    if (slug) localStorage.setItem(SELECTED_ORG_KEY, slug);
    else localStorage.removeItem(SELECTED_ORG_KEY);
  } catch {
    // Ignore: the selection still applies for this session.
  }
}

export interface OrgContext {
  // Organizations the user is a member of; [] until loaded.
  orgs: Organization[];
  loaded: boolean;
  // The selected organization; null = 個人.
  current: Organization | null;
  // Slug the URL / storage asks for (null = 個人), even before the organizations are loaded.
  requestedSlug: string | null;
  // Remember the choice (null = 個人). Moving to the URL is up to the caller.
  select: (slug: string | null) => void;
  // Add a just-created organization to the list.
  add: (org: Organization) => void;
  // Swap in an updated organization (renamed / new slug), matched by id.
  replace: (org: Organization) => void;
  // Drop an organization the user deleted or left.
  remove: (orgId: string) => void;
}

// The owner (個人 / 組織) the project list is scoped to. The URL's ?org=<slug> wins (個人 has no
// parameter); without it the last choice from localStorage applies. A slug the user is not a member
// of counts as 個人.
export function useOrgContext(userId: string | undefined): OrgContext {
  const [searchParams] = useSearchParams();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [storedSlug, setStoredSlug] = useState<string | null>(readStoredSlug);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    listMyOrganizations(userId)
      .then((list) => {
        if (!cancelled) setOrgs(list);
      })
      .catch(() => {
        if (!cancelled) setOrgs([]); // the switcher then offers 個人 only
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const urlSlug = searchParams.get("org");
  const requestedSlug = urlSlug ?? storedSlug;
  const current = orgs.find((o) => o.slug === requestedSlug) ?? null;

  // A valid ?org= in the URL becomes the remembered choice when the URL changes (not when the
  // remembered choice does: select() runs before the navigation that drops the old ?org=, and
  // syncing then would write the old slug back). A remembered slug that is no longer ours is dropped.
  const syncedUrlSlug = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded) return;
    if (urlSlug !== syncedUrlSlug.current) {
      syncedUrlSlug.current = urlSlug;
      if (urlSlug && orgs.some((o) => o.slug === urlSlug) && urlSlug !== storedSlug) {
        writeStoredSlug(urlSlug);
        setStoredSlug(urlSlug);
        return;
      }
    }
    if (storedSlug && !orgs.some((o) => o.slug === storedSlug)) {
      writeStoredSlug(null);
      setStoredSlug(null);
    }
  }, [loaded, urlSlug, storedSlug, orgs]);

  const select = useCallback((slug: string | null) => {
    writeStoredSlug(slug);
    setStoredSlug(slug);
  }, []);

  const add = useCallback((org: Organization) => {
    setOrgs((prev) => (prev.some((o) => o.id === org.id) ? prev : [...prev, org]));
  }, []);

  const replace = useCallback((org: Organization) => {
    setOrgs((prev) => prev.map((o) => (o.id === org.id ? org : o)));
  }, []);

  const remove = useCallback((orgId: string) => {
    setOrgs((prev) => prev.filter((o) => o.id !== orgId));
  }, []);

  return { orgs, loaded, current, requestedSlug, select, add, replace, remove };
}
