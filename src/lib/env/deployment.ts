/**
 * Deployment guards (docs/specs/phase-6-hardening-launch.md decision 11, ADR-040): production uses
 * only production values and previews never use production ones. They read the raw environment
 * (public and server values together, and variable names), run after the schemas at server start
 * and in Vercel builds, and name variables, never their values.
 *
 * The owner lists the hosts of each hosted environment once, in every Vercel environment:
 * - `STAGING_HOSTS`: the staging Supabase host (`<ref>.supabase.co`), the staging Upstash host and
 *   any staging site host. Production refuses to start with any of them.
 * - `PRODUCTION_HOSTS`: the production Supabase and Upstash hosts and the production domain.
 *   Production must use a listed Supabase and Upstash host; a preview refuses every listed host.
 */

export type DeploymentIssue = { path: string[]; message: string };

type Env = Record<string, string | undefined>;

/** Cloudflare's documented Turnstile test keys (always pass, always fail, …): never in production. */
const TURNSTILE_TEST_KEY = /^[123]x0{20,}[A-F]{2}$/;
/** The fake GA4 measurement ID of CI's build (ci.yml). */
const FAKE_GA_IDS = new Set(["G-E2ETEST000"]);
/** Variables only test tooling reads (Playwright, `npm run seed:users`). */
const TOOLING_PREFIXES = ["E2E_", "SEED_"];
const HOSTNAME = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?:\.(?!-)[a-z0-9-]{1,63})+$/;
const VNPAY_SANDBOX_HOST = "sandbox.vnpayment.vn";
const VNPAY_PRODUCTION_HOST = "pay.vnpay.vn";

function value(env: Env, name: string): string | undefined {
  const raw = env[name];
  return raw === undefined || raw.trim() === "" ? undefined : raw.trim();
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    // A fully qualified name ("host.example.") is the same host: compare without the final dot.
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return null;
  }
}

function hostList(env: Env, name: string, issues: DeploymentIssue[]): Set<string> {
  const hosts = new Set<string>();
  const bad: number[] = [];
  (value(env, name) ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean)
    .forEach((entry, index) => (HOSTNAME.test(entry) ? hosts.add(entry) : bad.push(index + 1)));
  if (bad.length) {
    issues.push({
      path: [name],
      message: `entries ${bad.join(", ")} are not host names (comma-separated hosts such as abcdefghijklmnopqrst.supabase.co, no scheme or path)`,
    });
  }
  return hosts;
}

/** The `ref` claim of a legacy JWT key (anon or service_role), if the key is one. */
function legacyKeyRef(key: string | undefined): string | null {
  const payload = key?.split(".")[1];
  if (!payload || key?.split(".").length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { ref?: unknown };
    return typeof claims.ref === "string" ? claims.ref : null;
  } catch {
    return null;
  }
}

/** Every reason this environment must not serve, as variable names and messages. */
export function deploymentIssues(env: Env): DeploymentIssue[] {
  const issues: DeploymentIssue[] = [];
  const vercelEnv = value(env, "VERCEL_ENV");
  const staging = hostList(env, "STAGING_HOSTS", issues);
  const production = hostList(env, "PRODUCTION_HOSTS", issues);

  const both = [...staging].filter((host) => production.has(host));
  if (both.length) {
    issues.push({ path: ["STAGING_HOSTS"], message: `${both.length} host(s) are listed in both STAGING_HOSTS and PRODUCTION_HOSTS` });
  }

  const services = [
    ["NEXT_PUBLIC_SUPABASE_URL", hostOf(value(env, "NEXT_PUBLIC_SUPABASE_URL"))],
    ["UPSTASH_REDIS_REST_URL", hostOf(value(env, "UPSTASH_REDIS_REST_URL"))],
    ["NEXT_PUBLIC_SITE_URL", hostOf(value(env, "NEXT_PUBLIC_SITE_URL"))],
  ] as const;

  // Any environment: a legacy JWT key must belong to the project in the URL, so a production key
  // pasted next to the staging URL (or the reverse) fails at start, not at the first request.
  const supabaseRef = /^([a-z]{20})\.supabase\.co$/.exec(services[0][1] ?? "")?.[1];
  if (supabaseRef) {
    for (const name of ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"]) {
      const ref = legacyKeyRef(value(env, name));
      if (ref && ref !== supabaseRef) {
        issues.push({ path: [name], message: `${name} is a key of another Supabase project than NEXT_PUBLIC_SUPABASE_URL` });
      }
    }
  }

  if (vercelEnv === "production") {
    if (!staging.size) {
      issues.push({ path: ["STAGING_HOSTS"], message: "STAGING_HOSTS is required in production (the staging Supabase and Upstash hosts), so staging values are refused" });
    }
    if (!production.size) {
      issues.push({ path: ["PRODUCTION_HOSTS"], message: "PRODUCTION_HOSTS is required in production (the production Supabase and Upstash hosts and the domain)" });
    }
    for (const [name, host] of services) {
      if (host && staging.has(host)) {
        issues.push({ path: [name], message: `${name} points at a staging host (listed in STAGING_HOSTS); production uses production values only` });
      }
    }
    for (const [name, host] of services.slice(0, 2)) {
      if (host && production.size && !production.has(host)) {
        issues.push({ path: [name], message: `${name} must use a host listed in PRODUCTION_HOSTS` });
      }
    }
    const site = value(env, "NEXT_PUBLIC_SITE_URL");
    if (!site || !site.startsWith("https://") || ["localhost", "127.0.0.1"].includes(hostOf(site) ?? "")) {
      issues.push({ path: ["NEXT_PUBLIC_SITE_URL"], message: "NEXT_PUBLIC_SITE_URL must be the https production domain in production" });
    }

    // Development and test switches.
    if (value(env, "SHOW_DESIGN_SYSTEM") === "true") {
      issues.push({ path: ["SHOW_DESIGN_SYSTEM"], message: "SHOW_DESIGN_SYSTEM is a CI and preview switch, never on in production" });
    }
    if (FAKE_GA_IDS.has(value(env, "NEXT_PUBLIC_GA_MEASUREMENT_ID") ?? "")) {
      issues.push({ path: ["NEXT_PUBLIC_GA_MEASUREMENT_ID"], message: "NEXT_PUBLIC_GA_MEASUREMENT_ID is CI's fake ID; use the real GA4 ID or none" });
    }
    for (const name of ["NEXT_PUBLIC_TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"]) {
      if (TURNSTILE_TEST_KEY.test(value(env, name) ?? "")) {
        issues.push({ path: [name], message: `${name} is one of Cloudflare's Turnstile test keys` });
      }
    }
    for (const name of Object.keys(env).sort()) {
      if (TOOLING_PREFIXES.some((prefix) => name.startsWith(prefix)) && value(env, name)) {
        issues.push({ path: [name], message: `${name} belongs to test tooling (E2E_*, SEED_*) and must not be set in production` });
      }
    }
    if (value(env, "VNPAY_TMN_CODE") && (hostOf(value(env, "VNPAY_PAYMENT_URL")) ?? VNPAY_SANDBOX_HOST) === VNPAY_SANDBOX_HOST) {
      issues.push({ path: ["VNPAY_PAYMENT_URL"], message: "VNPay is configured with the sandbox gateway; production uses VNPay's production URL and keys (or leaves VNPay off)" });
    }
  }

  if (vercelEnv === "preview") {
    for (const [name, host] of services) {
      if (host && production.has(host)) {
        issues.push({ path: [name], message: `${name} points at a production host (listed in PRODUCTION_HOSTS); previews use staging values only` });
      }
    }
    if (hostOf(value(env, "VNPAY_PAYMENT_URL")) === VNPAY_PRODUCTION_HOST) {
      issues.push({ path: ["VNPAY_PAYMENT_URL"], message: "previews never use VNPay's production gateway (or its keys)" });
    }
  }

  return issues;
}
