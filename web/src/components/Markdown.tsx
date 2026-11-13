import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../lib/cn";
import { AttachmentImage } from "./AttachmentImage";

// 説明文をマークダウンとして描画する。生の HTML は描画しない（react-markdown の既定）。
// 単独の改行も改行として見せる（pre-wrap で書かれてきた説明が崩れないように）。
export function Markdown({ children }: { children: string }) {
  return (
    <div className="leading-relaxed text-fg [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={urlTransform}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

const ATTACHMENT_PREFIX = "attachment:";
const ATTACHMENT_URL_RE = /^attachment:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

// Besides the default safe protocols, only attachment:<uuid> is let through (anything else that
// starts with attachment: becomes empty).
function urlTransform(url: string): string {
  if (url.toLowerCase().startsWith(ATTACHMENT_PREFIX)) return ATTACHMENT_URL_RE.test(url) ? url : "";
  return defaultUrlTransform(url);
}

// Only attached images are drawn as <img>. External images (http(s) etc.) become a link, so viewing
// a body does not leak the viewer's IP to, or let them be tracked by, a third-party host.
function MarkdownImage({ src, alt }: { src?: string; alt?: string }) {
  const label = alt ?? "";
  const attachment = typeof src === "string" ? ATTACHMENT_URL_RE.exec(src) : null;
  if (attachment) return <AttachmentImage id={attachment[1].toLowerCase()} alt={label} />;
  if (!src) return <span className="text-fg-muted">{label || "画像を表示できません"}</span>;
  return (
    <a href={src} className="text-brand no-underline hover:underline" target="_blank" rel="noopener noreferrer">
      {label ? `${label}（${src}）` : src}
    </a>
  );
}

// Preflight resets margins and list markers, so every block sets its own.
const block = "m-0 mb-2";
const heading = "m-0 mb-1.5 mt-4 font-medium leading-snug text-fg first:mt-0";
const cell = "border border-border px-2 py-1 text-left align-top";

const components: Components = {
  p: ({ node: _node, ...props }) => <p className={cn(block, "whitespace-pre-line")} {...props} />,
  h1: ({ node: _node, ...props }) => <h1 className={cn(heading, "text-[15px]")} {...props} />,
  h2: ({ node: _node, ...props }) => <h2 className={cn(heading, "text-sm")} {...props} />,
  h3: ({ node: _node, ...props }) => <h3 className={cn(heading, "text-[13px]")} {...props} />,
  h4: ({ node: _node, ...props }) => <h4 className={cn(heading, "text-xs")} {...props} />,
  ul: ({ node: _node, ...props }) => <ul className={cn(block, "list-disc pl-5")} {...props} />,
  ol: ({ node: _node, ...props }) => <ol className={cn(block, "list-decimal pl-5")} {...props} />,
  // チェックリストの項目は、チェックボックスがあるので黒丸を出さない。
  li: ({ node: _node, className, ...props }) => (
    <li className={cn(className, "my-0.5", className?.includes("task-list-item") && "list-none")} {...props} />
  ),
  a: ({ node: _node, ...props }) => (
    <a className="text-brand no-underline hover:underline" target="_blank" rel="noopener noreferrer" {...props} />
  ),
  blockquote: ({ node: _node, ...props }) => (
    <blockquote className={cn(block, "border-0 border-l-[3px] border-solid border-border-strong px-2.5 text-fg-muted")} {...props} />
  ),
  // The code inside a block drops the inline-code background.
  pre: ({ node: _node, ...props }) => (
    <pre
      className={cn(
        block,
        "overflow-x-auto rounded-md border border-border bg-surface-muted p-2.5 font-mono text-xs leading-relaxed",
        "[&>code]:bg-transparent [&>code]:p-0",
      )}
      {...props}
    />
  ),
  code: ({ node: _node, className, ...props }) =>
    className ? (
      <code className={className} {...props} />
    ) : (
      <code className="rounded bg-surface-muted px-1 py-px font-mono text-xs" {...props} />
    ),
  table: ({ node: _node, ...props }) => (
    <div className={cn(block, "overflow-x-auto")}>
      <table className="border-collapse text-[13px]" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => <th className={cn(cell, "bg-surface-muted text-xs font-medium")} {...props} />,
  td: ({ node: _node, ...props }) => <td className={cell} {...props} />,
  img: ({ node: _node, src, alt }) => <MarkdownImage src={typeof src === "string" ? src : undefined} alt={alt} />,
  hr: ({ node: _node, ...props }) => <hr className="my-2.5 border-0 border-t border-solid border-border" {...props} />,
};
