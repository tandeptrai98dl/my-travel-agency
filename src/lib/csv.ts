/**
 * CSV for spreadsheet exports (RFC 4180, CRLF). Every cell is quoted, and cells a spreadsheet
 * would run as a formula (=, +, -, @, tab, CR) get a leading apostrophe (OWASP CSV injection).
 */
export function csvCell(value: string | number | null | undefined): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
