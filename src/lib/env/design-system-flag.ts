/**
 * Whether the staff-only /admin/design-system page exists: always in development, and in a
 * production build only when SHOW_DESIGN_SYSTEM is exactly "true" (CI). Never set it in the
 * Vercel Production environment.
 */
export function isDesignSystemEnabled(nodeEnv: string | undefined, flag: boolean): boolean {
  return nodeEnv !== "production" || flag;
}
