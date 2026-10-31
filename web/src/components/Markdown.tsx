import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "../lib/cn";

// 説明文をマークダウンとして描画する。生の HTML は描画しない（react-markdown の既定）。
// 単独の改行も改行として見せる（pre-wrap で書かれてきた説明が崩れないように）。
export function Markdown({ children }: { children: string }) {
  return (
    <div className="leading-relaxed text-fg [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
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
      <table className="border-collapse text-xs" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => <th className={cn(cell, "bg-surface-muted font-medium")} {...props} />,
  td: ({ node: _node, ...props }) => <td className={cell} {...props} />,
  hr: ({ node: _node, ...props }) => <hr className="my-2.5 border-0 border-t border-solid border-border" {...props} />,
};
