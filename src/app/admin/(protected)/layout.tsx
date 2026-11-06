import { Suspense } from "react";

import { STAFF_ROLES } from "@/lib/auth/permissions";

import { requireAdminAccess } from "../admin-gate";

async function Gate({ children }: { children: React.ReactNode }) {
  // Every staff role may enter; admin and accountant only at aal2 (ADR-009). Each page and
  // action still checks its own permission.
  await requireAdminAccess(STAFF_ROLES);
  return children;
}

/** Everything under /admin except /admin/mfa. Reads the session, so it renders in Suspense. */
export default function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
