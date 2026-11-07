import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, type Page, test } from "./support/test";

import { adminApi } from "./support/admin-api";
import { signInAs } from "./support/auth";
import { closeTestDepartures, testDeparture } from "./support/booking";
import { freshCustomer, freshStaff } from "./support/staff";

// Phase 6 PR 6A (docs/specs/phase-6-hardening-launch.md decision 1, "Permissions"): every admin
// route, opened by every role, is either allowed or a 404, exactly as the ARCHITECTURE.md matrix
// says; and one Server Action of each staff module, called directly over HTTP the way the browser
// calls it (`Next-Action`), is refused for a role that lacks the permission. The expectations are
// written out here from the matrix, not imported from src/lib/auth/permissions.ts, so a change in
// either one shows up as a failure.

test.afterAll(closeTestDepartures);

type Role = "customer" | "sales" | "sales_manager" | "operator" | "accountant" | "editor" | "admin";
const STAFF: Role[] = ["sales", "sales_manager", "operator", "accountant", "editor", "admin"];
const SALES: Role[] = ["sales", "sales_manager"];
const BOOKING_READERS: Role[] = [...SALES, "operator", "accountant", "admin"];
const CONTENT: Role[] = ["editor", "admin"];

type Ids = {
  tour: string;
  departure: string;
  destination: string;
  travelStyle: string;
  post: string;
  category: string;
  policy: string;
  booking: string;
  inquiry: string;
  customer: string;
  pageKey: string;
};

const ROUTES: { path: (ids: Ids) => string; allowed: Role[] }[] = [
  { path: () => "/admin", allowed: STAFF },
  { path: () => "/admin/inquiries", allowed: [...SALES, "operator", "admin"] },
  { path: (ids) => `/admin/inquiries/${ids.inquiry}`, allowed: [...SALES, "operator", "admin"] },
  { path: () => "/admin/bookings", allowed: BOOKING_READERS },
  { path: () => "/admin/bookings/attention", allowed: BOOKING_READERS },
  { path: () => "/admin/bookings/new", allowed: [...SALES, "admin"] },
  { path: (ids) => `/admin/bookings/${ids.booking}`, allowed: BOOKING_READERS },
  { path: () => "/admin/payments", allowed: BOOKING_READERS },
  { path: () => "/admin/customers", allowed: BOOKING_READERS },
  { path: (ids) => `/admin/customers/${ids.customer}`, allowed: BOOKING_READERS },
  { path: () => "/admin/tours", allowed: STAFF },
  { path: () => "/admin/tours/new", allowed: CONTENT },
  { path: (ids) => `/admin/tours/${ids.tour}`, allowed: CONTENT },
  { path: (ids) => `/admin/tours/${ids.tour}/preview`, allowed: STAFF },
  { path: () => "/admin/departures", allowed: STAFF },
  { path: () => "/admin/departures/new", allowed: ["operator", "admin"] },
  { path: (ids) => `/admin/departures/${ids.departure}`, allowed: ["operator", "admin"] },
  { path: () => "/admin/destinations", allowed: CONTENT },
  { path: () => "/admin/destinations/new", allowed: CONTENT },
  { path: (ids) => `/admin/destinations/${ids.destination}`, allowed: CONTENT },
  { path: () => "/admin/travel-styles", allowed: CONTENT },
  { path: () => "/admin/travel-styles/new", allowed: CONTENT },
  { path: (ids) => `/admin/travel-styles/${ids.travelStyle}`, allowed: CONTENT },
  { path: () => "/admin/cancellation-policies", allowed: ["admin"] },
  { path: () => "/admin/cancellation-policies/new", allowed: ["admin"] },
  { path: (ids) => `/admin/cancellation-policies/${ids.policy}`, allowed: ["admin"] },
  { path: () => "/admin/journal", allowed: CONTENT },
  { path: () => "/admin/journal/new", allowed: CONTENT },
  { path: (ids) => `/admin/journal/${ids.post}`, allowed: CONTENT },
  { path: () => "/admin/journal/categories", allowed: CONTENT },
  { path: () => "/admin/journal/categories/new", allowed: CONTENT },
  { path: (ids) => `/admin/journal/categories/${ids.category}`, allowed: CONTENT },
  { path: () => "/admin/pages", allowed: CONTENT },
  { path: (ids) => `/admin/pages/${ids.pageKey}`, allowed: CONTENT },
  { path: () => "/admin/reviews", allowed: CONTENT },
  { path: () => "/admin/media", allowed: CONTENT },
  { path: () => "/admin/redirects", allowed: CONTENT },
  { path: () => "/admin/subscribers", allowed: CONTENT },
  { path: () => "/admin/settings", allowed: ["admin"] },
  { path: () => "/admin/staff", allowed: ["admin"] },
  { path: () => "/admin/audit-log", allowed: ["admin"] },
  // Served in CI's build (SHOW_DESIGN_SYSTEM=true) to every staff role; a 404 in production.
  { path: () => "/admin/design-system", allowed: STAFF },
];

/** The route templates, as the folders name them. */
const TEMPLATE_IDS: Ids = {
  tour: "[id]",
  departure: "[id]",
  destination: "[id]",
  travelStyle: "[id]",
  post: "[id]",
  category: "[id]",
  policy: "[id]",
  booking: "[id]",
  inquiry: "[id]",
  customer: "[id]",
  pageKey: "[key]",
};

test("the route list covers every admin page", () => {
  const pages: string[] = [];
  const walk = (dir: string, route: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "page.tsx") pages.push(route || "/");
      else if (!entry.includes(".")) walk(join(dir, entry), /^\(.*\)$/.test(entry) ? route : `${route}/${entry}`);
    }
  };
  walk(join(process.cwd(), "src/app/admin/(protected)"), "/admin");
  const listed = new Set(ROUTES.map((r) => r.path(TEMPLATE_IDS)));
  // /admin/mfa sits outside the protected group: every staff role may enrol there (admin.spec.ts).
  expect(pages.filter((page) => !listed.has(page)).sort()).toEqual([]);
  expect(pages.length).toBe(ROUTES.length);
});



async function realIds(customer: string): Promise<Ids> {
  const db = adminApi();
  const first = async (table: "destinations" | "travel_styles" | "posts" | "post_categories" | "cancellation_policies") => {
    const { data, error } = await db.from(table).select("id").order("id").limit(1).single();
    if (error) throw error;
    return (data as { id: string }).id;
  };
  const { tourId, departureId, price } = await testDeparture(4);
  const key = `perm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const draft = await db.rpc("create_draft_booking", {
    payload: {
      idempotency_key: key,
      tour_id: tourId,
      departure_id: departureId,
      locale: "vi",
      adults: 1,
      children: 0,
      infants: 0,
      single_rooms: 0,
      contact_name: "Khách quyền",
      contact_email: `${key}@example.test`,
      contact_phone: "+84 900 000 000",
      payment_plan: "full",
      subtotal: price,
      total: price,
      deposit_amount: price,
      items: [{ type: "adult", unit_price: price, quantity: 1, amount: price }],
    },
  });
  if (draft.error || !draft.data) throw draft.error ?? new Error("no draft");
  const code = await db.rpc("next_inquiry_code");
  if (code.error) throw code.error;
  // Unassigned, so a seller may open it too (sales work assigned and unassigned inquiries).
  const inquiry = await db
    .from("inquiries")
    .insert({ code: code.data, name: "Khách quyền", email: `${key}@example.test`, locale: "vi", source: "contact" })
    .select("id")
    .single();
  if (inquiry.error) throw inquiry.error;
  return {
    tour: tourId,
    departure: departureId,
    destination: await first("destinations"),
    travelStyle: await first("travel_styles"),
    post: await first("posts"),
    category: await first("post_categories"),
    policy: await first("cancellation_policies"),
    booking: draft.data as string,
    inquiry: inquiry.data.id,
    customer,
    pageKey: "about",
  };
}

/** "ok" when the page renders its heading, "404" when the not-found page is shown. */
async function outcome(page: Page, path: string): Promise<"ok" | "404" | string> {
  await page.goto(path);
  const notFound = page.getByText("This page could not be found.");
  const heading = page.locator("#admin-main h1");
  await expect(notFound.or(heading).first()).toBeVisible({ timeout: 15_000 });
  if (await notFound.isVisible()) return "404";
  const here = new URL(page.url()).pathname;
  return here === path ? "ok" : `redirected to ${here}`;
}

async function walkRoutes(page: Page, role: Role, ids: Ids) {
  const problems: string[] = [];
  for (const route of ROUTES) {
    const path = route.path(ids);
    const want = route.allowed.includes(role) ? "ok" : "404";
    const got = await outcome(page, path);
    if (got !== want) problems.push(`${path}: ${got}, expected ${want}`);
  }
  expect(problems, `${role}: admin routes`).toEqual([]);
}

// Server Actions ---------------------------------------------------------------------------------
type ManifestEntry = { workers: Record<string, unknown>; filename?: string; exportedName?: string };
const MANIFEST = join(process.cwd(), ".next/server/server-reference-manifest.json");

/** The action id and an admin page that serves it, from the production build's manifest. */
function actionRef(file: string, name: string): { id: string; url: string } {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as { node: Record<string, ManifestEntry> };
  const found = Object.entries(manifest.node).find(([, entry]) => entry.filename === file && entry.exportedName === name);
  if (!found) throw new Error(`${file}#${name} is not in the server reference manifest`);
  const worker = Object.keys(found[1].workers).find((key) => key.startsWith("app/admin/")) ?? Object.keys(found[1].workers)[0]!;
  const url = worker
    .replace(/^app/, "")
    .replace(/\/page$/, "")
    .split("/")
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .map((segment) => (segment === "[key]" ? "about" : /^\[.*\]$/.test(segment) ? "00000000-0000-4000-8000-000000000000" : segment))
    .join("/");
  return { id: found[0], url: url || "/" };
}

/** Calls a Server Action the way the React client does, with the page's session cookies. */
async function callAction(page: Page, file: string, name: string, args: unknown[]): Promise<string> {
  const { id, url } = actionRef(file, name);
  const origin = new URL(page.url()).origin;
  const response = await page.request.post(url, {
    headers: { "Next-Action": id, Accept: "text/x-component", "Content-Type": "text/plain;charset=UTF-8", Origin: origin },
    data: JSON.stringify(args),
  });
  expect(response.status(), `${name} answers`).toBe(200);
  return response.text();
}

type Call = { module: string; file: string; name: string; args: (ids: Ids) => unknown[] };

const any = () => [{}];
const REFUSED: Partial<Record<Role, Call[]>> = {
  customer: [{ module: "inquiry", file: "src/modules/inquiry/inquiry-admin.actions.ts", name: "assignInquiryAction", args: any }],
  sales: [
    { module: "content", file: "src/modules/content/content.actions.ts", name: "savePostAction", args: any },
    { module: "media", file: "src/modules/media/media.actions.ts", name: "startMediaUpload", args: () => [{ fileName: "a.jpg", size: 1000, contentType: "image/jpeg" }] },
    { module: "operations", file: "src/modules/operations/passengers.actions.ts", name: "exportPassengersAction", args: (ids) => [{ departureId: ids.departure }] },
    { module: "payment", file: "src/modules/payment/payment-admin.actions.ts", name: "recordManualPaymentAction", args: any },
    { module: "catalog", file: "src/modules/catalog/taxonomy/taxonomy.actions.ts", name: "saveCancellationPolicyAction", args: any },
  ],
  sales_manager: [
    { module: "identity", file: "src/modules/identity/staff.actions.ts", name: "inviteStaffAction", args: any },
    // ADR-016: sales managers do not edit departures or their prices.
    { module: "catalog", file: "src/modules/catalog/departures/departures.actions.ts", name: "createDeparturesAction", args: any },
  ],
  operator: [
    // The booking edits the role-matrix test closed in RLS (20261115100000_role_matrix_fixes.sql).
    { module: "booking", file: "src/modules/booking/booking-admin.actions.ts", name: "updateContactAction", args: any },
    { module: "booking", file: "src/modules/booking/quote.actions.ts", name: "createQuoteAction", args: any },
    { module: "catalog", file: "src/modules/catalog/tours/tours.actions.ts", name: "saveTourAction", args: any },
    { module: "inquiry", file: "src/modules/inquiry/inquiry-admin.actions.ts", name: "addInquiryNoteAction", args: any },
    { module: "content", file: "src/modules/content/redirects.actions.ts", name: "createRedirectAction", args: any },
  ],
  editor: [
    { module: "account", file: "src/modules/account/customers-admin.actions.ts", name: "addCustomerNoteAction", args: any },
    { module: "settings", file: "src/modules/settings/settings.actions.ts", name: "saveSettingsAction", args: any },
    { module: "booking", file: "src/modules/booking/booking-emails.actions.ts", name: "resendEmailAction", args: any },
  ],
};

async function expectRefused(page: Page, role: Role, ids: Ids) {
  const problems: string[] = [];
  for (const call of REFUSED[role] ?? []) {
    const body = await callAction(page, call.file, call.name, call.args(ids));
    if (!body.includes('"error":"forbidden"')) problems.push(`${call.module} ${call.name}: ${body.slice(0, 200)}`);
  }
  expect(problems, `${role}: refused actions`).toEqual([]);
}

test.describe("permissions per role", () => {
  // Against a deployed preview (PLAYWRIGHT_BASE_URL) there is no local build to read action ids
  // from; in CI the build is always local, so a missing manifest is an error, never a silent skip.
  if (process.env.CI && !existsSync(MANIFEST)) throw new Error(`${MANIFEST} is missing: build before the E2E run`);
  test.skip(!existsSync(MANIFEST), "needs the local production build's server reference manifest");

  let ids: Ids;
  test.beforeAll(async () => {
    const { data, error } = await adminApi().from("profiles").select("id").eq("email", "customer@example.test").single();
    if (error) throw error;
    ids = await realIds(data.id);
  });

  for (const role of ["sales", "sales_manager", "operator", "editor"] as const) {
    test(`${role}: admin routes and refused actions`, async ({ page }) => {
      test.setTimeout(180_000);
      await signInAs(page, role);
      await walkRoutes(page, role, ids);
      await expectRefused(page, role, ids);
    });
  }

  for (const role of ["accountant", "admin"] as const) {
    test(`${role} at aal2: admin routes`, async ({ page }) => {
      test.setTimeout(180_000);
      await freshStaff(page, role, "perm");
      await walkRoutes(page, role, ids);
    });
  }

  test("accountant before MFA: the payment actions are refused", async ({ page }) => {
    await signInAs(page, "accountant");
    await expect(page).toHaveURL(/\/admin\/mfa$/);
    const body = await callAction(page, "src/modules/payment/payment-admin.actions.ts", "recordManualPaymentAction", [{}]);
    expect(body).toContain('"error":"forbidden"');
  });

  test("customer: every admin route is a 404 and staff actions are refused", async ({ page }) => {
    test.setTimeout(180_000);
    await freshCustomer(page, "perm");
    await walkRoutes(page, "customer", ids);
    await expectRefused(page, "customer", ids);
  });

  test("the direct call reaches the action: an allowed role gets a validation error, not a refusal", async ({ page }) => {
    await signInAs(page, "sales");
    const body = await callAction(page, "src/modules/booking/booking-admin.actions.ts", "updateContactAction", [{}]);
    expect(body).toContain('"error":"invalid"');
  });
});
