import { toast } from "sonner";

/** CSV generation and download utilities (Issue 28). */

export function toCsv(headers: string[], rows: any[][]): string {
  const escape = (val: any): string => {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };
  const headerLine = headers.map(escape).join(",");
  const bodyLines = rows.map((row) => row.map(escape).join(","));
  return [headerLine, ...bodyLines].join("\r\n") + "\r\n";
}

export function downloadRawCsv(filename: string, csvContent: string) {
  if (!csvContent || csvContent.trim().length === 0) {
    toast.error("No data to export yet");
    return;
  }
  const cleanFilename = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = cleanFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, headers: string[], rows: any[][]) {
  if (!rows || rows.length === 0) {
    toast.error("No data to export yet");
    return;
  }
  const csvContent = toCsv(headers, rows);
  downloadRawCsv(filename, csvContent);
}
