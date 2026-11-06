import { type ClassValue, clsx } from "clsx";

/**
 * Joins class names without tailwind-merge (about 7 KB gzip). For the public site's initial client
 * components (header, menus, consent), whose classes never conflict, so nothing needs merging
 * (Phase 3 spec decision 16). Everywhere else, use `cn()` from `@/lib/utils`.
 */
export function cx(...inputs: ClassValue[]) {
  return clsx(inputs);
}
