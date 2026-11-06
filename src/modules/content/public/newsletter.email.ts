import { escapeHtml } from "@/modules/notification/email.service";

type Strings = { subject: string; greeting: string; body: string; button: string; expiry: string; ignore: string };

/**
 * The confirmation email (plain, branded HTML with a text part). React Email arrives with the
 * Phase 4 booking emails; this single message does not need it yet.
 */
export function confirmationEmail({ brand, url, strings, locale }: { brand: string; url: string; strings: Strings; locale: "vi" | "en" }) {
  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="${locale}">
<body style="margin:0;padding:0;background:#F7F3EC;color:#0F1B2D;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F3EC;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E2DBCF;">
        <tr><td style="background:#0F1B2D;padding:24px 32px;color:#F7F3EC;font-family:Georgia,'Times New Roman',serif;font-size:22px;">${e(brand)}</td></tr>
        <tr><td style="padding:32px;font-size:16px;line-height:26px;">
          <p style="margin:0 0 16px;">${e(strings.greeting)}</p>
          <p style="margin:0 0 24px;">${e(strings.body)}</p>
          <p style="margin:0 0 24px;"><a href="${e(url)}" style="display:inline-block;background:#0F1B2D;color:#F7F3EC;text-decoration:none;padding:12px 24px;border-radius:2px;">${e(strings.button)}</a></p>
          <p style="margin:0 0 8px;font-size:14px;line-height:22px;color:#726D65;">${e(strings.expiry)}</p>
          <p style="margin:0;font-size:14px;line-height:22px;color:#726D65;">${e(strings.ignore)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  const text = [strings.greeting, "", strings.body, "", `${strings.button}: ${url}`, "", strings.expiry, strings.ignore, "", brand].join("\n");
  return { subject: strings.subject, html, text };
}
