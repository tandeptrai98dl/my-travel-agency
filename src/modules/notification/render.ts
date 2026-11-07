import "server-only";

import { render, toPlainText } from "@react-email/render";
import type { ReactElement } from "react";

/**
 * Renders a React Email template (`emails/`) to HTML and its plain-text alternative. React escapes
 * every value, so names, tour titles and addresses can never inject markup.
 */
export async function renderEmail(element: ReactElement): Promise<{ html: string; text: string }> {
  const html = await render(element);
  return { html, text: toPlainText(html, TEXT_OPTIONS) };
}

/**
 * Plain text leaves out the inbox preview line, keeps the heading's case and puts each table cell (the layout and the label/value
 * details) on its own line, so "Booking code" and its value never run together.
 */
const TEXT_OPTIONS = {
  selectors: [
    { selector: "div[data-preview]", format: "skip" },
    { selector: "h1", options: { uppercase: false } },
    { selector: "td", format: "block" },
    { selector: "div", format: "block" },
  ],
};
