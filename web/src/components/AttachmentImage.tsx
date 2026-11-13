import { useEffect, useState } from "react";
import { forgetSignedUrls, signedUrls } from "../lib/attachments";

// Requests made in the same tick are fetched with one signedUrls call, so a body with several
// images (or a screen with several bodies) asks for its URLs once.
let queue: { id: string; resolve: (url: string | null) => void }[] = [];
let scheduled = false;

function requestSignedUrl(id: string): Promise<string | null> {
  return new Promise((resolve) => {
    queue.push({ id, resolve });
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      const batch = queue;
      queue = [];
      scheduled = false;
      signedUrls(batch.map((r) => r.id)).then(
        (urls) => batch.forEach((r) => r.resolve(urls.get(r.id) ?? null)),
        () => batch.forEach((r) => r.resolve(null)),
      );
    }, 0);
  });
}

const UNAVAILABLE = "画像を表示できません";

// An attached image (![name](attachment:<id>)) shown through a 10-minute signed URL. If it fails to
// load, the URL is fetched once more; after that (or when the attachment is not readable / deleted)
// the same message is shown either way. Rendered with spans only, since it sits inside a <p>.
export function AttachmentImage({ id, alt }: { id: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [retried, setRetried] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    setRetried(false);
    requestSignedUrl(id).then((u) => {
      if (cancelled) return;
      if (u) setUrl(u);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function handleError() {
    if (retried) {
      setFailed(true);
      return;
    }
    setRetried(true);
    setUrl(null);
    forgetSignedUrls([id]);
    requestSignedUrl(id).then((u) => {
      if (u) setUrl(u);
      else setFailed(true);
    });
  }

  if (failed) {
    return (
      <span className="my-1 inline-block rounded-md border border-dashed border-border px-2 py-1 text-xs text-fg-muted">
        {UNAVAILABLE}
      </span>
    );
  }
  if (!url) {
    return (
      <span
        className="my-1 inline-block h-24 w-40 animate-pulse rounded-md border border-border bg-surface-muted align-middle"
        aria-label={alt || "画像"}
      />
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="my-1 inline-block max-w-full align-middle" title={alt || undefined}>
      <img
        src={url}
        alt={alt}
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        onError={handleError}
        className="block h-auto max-h-80 max-w-full rounded-md border border-border object-contain"
      />
    </a>
  );
}
