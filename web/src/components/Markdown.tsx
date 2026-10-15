import type { CSSProperties } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// 説明文をマークダウンとして描画する。生の HTML は描画しない（react-markdown の既定）。
// 単独の改行も改行として見せる（pre-wrap で書かれてきた説明が崩れないように）。
export function Markdown({ children }: { children: string }) {
  return (
    <div style={{ color: "#3b4149", lineHeight: 1.6, overflowWrap: "anywhere" }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

const block: CSSProperties = { margin: "0 0 8px" };
const heading: CSSProperties = { margin: "12px 0 6px", fontWeight: 600, color: "#1f2933", lineHeight: 1.4 };
const cell: CSSProperties = { border: "1px solid #e5e8eb", padding: "3px 6px", textAlign: "left", verticalAlign: "top" };

const components: Components = {
  p: ({ node: _node, ...props }) => <p style={{ ...block, whiteSpace: "pre-line" }} {...props} />,
  h1: ({ node: _node, ...props }) => <h1 style={{ ...heading, fontSize: 15 }} {...props} />,
  h2: ({ node: _node, ...props }) => <h2 style={{ ...heading, fontSize: 14 }} {...props} />,
  h3: ({ node: _node, ...props }) => <h3 style={{ ...heading, fontSize: 13 }} {...props} />,
  h4: ({ node: _node, ...props }) => <h4 style={{ ...heading, fontSize: 13 }} {...props} />,
  ul: ({ node: _node, ...props }) => <ul style={{ ...block, paddingLeft: 20 }} {...props} />,
  ol: ({ node: _node, ...props }) => <ol style={{ ...block, paddingLeft: 20 }} {...props} />,
  // チェックリストの項目は、チェックボックスがあるので黒丸を出さない。
  li: ({ node: _node, className, ...props }) => (
    <li
      className={className}
      style={{ margin: "2px 0", listStyle: className?.includes("task-list-item") ? "none" : undefined }}
      {...props}
    />
  ),
  a: ({ node: _node, ...props }) => (
    <a style={{ color: "#0972d3" }} target="_blank" rel="noopener noreferrer" {...props} />
  ),
  blockquote: ({ node: _node, ...props }) => (
    <blockquote style={{ ...block, padding: "0 10px", borderLeft: "3px solid #cbd2d9", color: "#5f6b7a" }} {...props} />
  ),
  pre: ({ node: _node, ...props }) => (
    <pre
      style={{ ...block, padding: 8, background: "#f4f5f6", borderRadius: 4, overflowX: "auto", fontSize: 12 }}
      {...props}
    />
  ),
  code: ({ node: _node, className, ...props }) =>
    className ? (
      <code className={className} {...props} />
    ) : (
      <code style={{ background: "#f4f5f6", borderRadius: 3, padding: "1px 4px", fontSize: 12 }} {...props} />
    ),
  table: ({ node: _node, ...props }) => (
    <div style={{ ...block, overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12 }} {...props} />
    </div>
  ),
  th: ({ node: _node, style, ...props }) => <th style={{ ...cell, ...style, background: "#f7f9fa", fontWeight: 600 }} {...props} />,
  td: ({ node: _node, style, ...props }) => <td style={{ ...cell, ...style }} {...props} />,
  hr: ({ node: _node, ...props }) => <hr style={{ border: "none", borderTop: "1px solid #e5e8eb", margin: "10px 0" }} {...props} />,
};
