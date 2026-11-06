import { z } from "zod";

/**
 * Redirects (docs/specs/phase-2-catalog-admin.md step 20, decisions 4 and 5). Paths are
 * site-relative; supabase/migrations/*_redirect_rules.sql repeats the format and chain rules.
 */
export const REDIRECTS_PAGE_SIZE = 50;
export const REDIRECT_STATUS_CODES = [301, 302] as const;

/** Lower-level check shared with the form: a path on this site, no query or fragment for sources. */
export function isSitePath(value: string, { source }: { source: boolean }): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || value.length > 500) return false;
  if (/[\s\\]/.test(value)) return false;
  if (source && (value === "/" || /[?#]/.test(value))) return false;
  return true;
}

/**
 * Trims, adds the leading slash people forget, and drops a trailing slash (not from "/"). A full
 * URL keeps its scheme, so validation refuses it instead of turning it into a path.
 */
export function normalizePath(value: string): string {
  let path = value.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  if (path && !path.startsWith("/")) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path;
}

export const redirectSchema = z
  .object({
    fromPath: z.string().max(500, "tooLong").transform(normalizePath),
    toPath: z.string().max(500, "tooLong").transform(normalizePath),
    statusCode: z.union([z.literal(301), z.literal(302)]),
  })
  .superRefine((value, ctx) => {
    if (!value.fromPath) ctx.addIssue({ code: "custom", path: ["fromPath"], message: "required" });
    else if (!isSitePath(value.fromPath, { source: true })) ctx.addIssue({ code: "custom", path: ["fromPath"], message: "pathInvalid" });
    if (!value.toPath) ctx.addIssue({ code: "custom", path: ["toPath"], message: "required" });
    else if (!isSitePath(value.toPath, { source: false })) ctx.addIssue({ code: "custom", path: ["toPath"], message: "pathInvalid" });
    if (value.fromPath && value.fromPath === value.toPath) {
      ctx.addIssue({ code: "custom", path: ["toPath"], message: "redirectToItself" });
    }
  });
export type RedirectInput = z.input<typeof redirectSchema>;
export type RedirectValues = z.output<typeof redirectSchema>;

export const redirectIdSchema = z.object({ id: z.uuid() });
