/** Saves text built on the server as a file in the browser. */
export function downloadFile(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** A CSV with a BOM, so spreadsheet apps read it as UTF-8 (Vietnamese names). */
export function downloadCsv(csv: string, filename: string) {
  downloadFile(`﻿${csv}`, filename, "text/csv;charset=utf-8");
}
