import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/** Locale-aware Link, redirect and hooks; use these instead of next/link on public pages. */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
