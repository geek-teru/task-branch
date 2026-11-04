import { useEffect, useState } from "react";
import { cn } from "../lib/cn";

// The user's icon as a circle. Google's images are read without a referrer
// (lh3.googleusercontent.com may answer 403); a missing or broken image falls back to the initial.
// className sets the size and the initial's font size (e.g. "size-7 text-xs").
export function Avatar({ url, name, className }: { url: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-muted font-medium text-fg",
        className,
      )}
    >
      {url && !failed ? (
        <img src={url} alt="" referrerPolicy="no-referrer" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initial(name)
      )}
    </span>
  );
}

function initial(name: string): string {
  const first = [...name.trim()][0];
  return first ? first.toUpperCase() : "?";
}
