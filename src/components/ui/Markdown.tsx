import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

export interface MarkdownProps {
  content: string;
  /** Extra classes for the wrapper (typography only). */
  className?: string;
}

/** Schemes we are willing to turn into a clickable link. */
const SAFE_SCHEME = /^(https?:|mailto:|tel:|#|\/)/i;

function safeHref(href?: string): string | undefined {
  if (!href) return undefined;
  const value = href.trim();
  if (!SAFE_SCHEME.test(value)) return undefined;
  return value;
}

/**
 * Markdown for user-authored text (project summaries, comments, chat, event
 * descriptions, judge comments, bios).
 *
 * Safety: `react-markdown` builds a React tree instead of an HTML string and
 * raw HTML is **not** enabled (no `rehype-raw`), so `<script>`, `<iframe>` and
 * `onerror=` payloads are dropped rather than rendered. Link hrefs are checked
 * against a scheme allowlist so `javascript:` URLs stay inert, and every link
 * opens in a new tab with `rel="noopener noreferrer"`.
 */
export function Markdown({ content, className = "" }: MarkdownProps) {
  const components: Components = {
    h1: ({ children }) => <h3 className="text-h3 text-primary mt-6 mb-2 first:mt-0">{children}</h3>,
    h2: ({ children }) => <h3 className="text-h3 text-primary mt-6 mb-2 first:mt-0">{children}</h3>,
    h3: ({ children }) => <h4 className="text-[15px] font-semibold text-primary mt-5 mb-1.5 first:mt-0">{children}</h4>,
    h4: ({ children }) => <h4 className="text-[15px] font-semibold text-primary mt-5 mb-1.5 first:mt-0">{children}</h4>,
    h5: ({ children }) => <h5 className="text-[14px] font-semibold text-primary mt-4 mb-1 first:mt-0">{children}</h5>,
    h6: ({ children }) => <h6 className="text-[14px] font-semibold text-primary mt-4 mb-1 first:mt-0">{children}</h6>,
    p: ({ children }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
    a: ({ href, children }) => {
      const target = safeHref(href);
      if (!target) return <span>{children}</span>;
      return (
        <a
          href={target}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline decoration-accent/40 underline-offset-2 hover:text-accent-hover transition-colors duration-fast"
        >
          {children}
        </a>
      );
    },
    strong: ({ children }) => <strong className="font-semibold text-primary">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    del: ({ children }) => <del className="line-through text-muted">{children}</del>,
    ul: ({ children }) => <ul className="list-disc pl-5 mb-3 flex flex-col gap-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 flex flex-col gap-1">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-accent/60 pl-4 my-3 text-secondary italic">{children}</blockquote>
    ),
    hr: () => <hr className="border-line my-5" />,
    code: ({ children, className: codeClass }) => (
      <code
        className={`font-mono text-[12px] bg-surface-2 border border-line rounded-[4px] px-1.5 py-0.5 text-primary ${codeClass ?? ""}`}
      >
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre className="bg-surface-2 border border-line rounded-input p-3.5 my-3 overflow-x-auto text-[12px] leading-relaxed [&>code]:bg-transparent [&>code]:border-0 [&>code]:p-0">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto my-4">
        <table className="w-full text-[13px] border-collapse">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="text-left px-3 py-2 border-b border-line text-[12px] font-medium uppercase tracking-[0.05em] text-muted">
        {children}
      </th>
    ),
    td: ({ children }) => <td className="px-3 py-2 border-b border-line align-top">{children}</td>,
  };

  return (
    <div className={`text-sm text-secondary leading-relaxed break-words ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content ?? ""}
      </ReactMarkdown>
    </div>
  );
}
