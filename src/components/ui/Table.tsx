import React from "react";

export interface TableProps {
  /** Visually hidden caption for screen readers. */
  caption?: string;
  children: React.ReactNode;
  className?: string;
}

/** Table container with sticky header support (wraps in a scroll area). */
export const Table: React.FC<TableProps> = ({ caption, children, className = "" }) => (
  <div className={`w-full overflow-x-auto border border-line rounded-card bg-surface-1 ${className}`}>
    <table className="w-full text-sm border-collapse">
      {caption && <caption className="sr-only">{caption}</caption>}
      {children}
    </table>
  </div>
);

export const THead: React.FC<{ children: React.ReactNode; sticky?: boolean }> = ({ children, sticky = false }) => (
  <thead className={sticky ? "sticky top-0 z-10 bg-surface-2" : ""}>{children}</thead>
);

export const TH: React.FC<{ children?: React.ReactNode; numeric?: boolean; className?: string }> = ({
  children,
  numeric = false,
  className = "",
}) => (
  <th
    scope="col"
    className={`
      px-4 h-10 text-left text-[12px] font-medium uppercase tracking-[0.05em] text-muted
      border-b border-line whitespace-nowrap
      ${numeric ? "text-right" : ""}
      ${className}
    `}
  >
    {children}
  </th>
);

export const TR: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = "" }) => (
  <tr className={`transition-colors duration-fast hover:bg-surface-2 ${className}`}>{children}</tr>
);

export const TD: React.FC<{ children?: React.ReactNode; numeric?: boolean; mono?: boolean; className?: string }> = ({
  children,
  numeric = false,
  mono = false,
  className = "",
}) => (
  <td
    className={`
      px-4 h-12 align-middle text-primary
      ${numeric ? "text-right tnum" : ""}
      ${mono ? "font-mono text-[13px]" : ""}
      ${className}
    `}
  >
    {children}
  </td>
);
