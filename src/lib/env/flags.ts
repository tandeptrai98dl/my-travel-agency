import "server-only";

import { isDesignSystemEnabled } from "./design-system-flag";
import { serverEnv } from "./server";

/** The staff-only /admin/design-system page (see `isDesignSystemEnabled`). */
export function designSystemEnabled(): boolean {
  return isDesignSystemEnabled(process.env.NODE_ENV, serverEnv.SHOW_DESIGN_SYSTEM);
}
