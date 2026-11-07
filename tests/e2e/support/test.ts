import { test as base } from "@playwright/test";

export * from "@playwright/test";

/**
 * Playwright's `test` with a CSP guard (Phase 3 spec decision 13, ADR-027): every page a test
 * opens in its browser context reports `securitypolicyviolation` events, and the test fails if
 * there was any. Specs import `test` and `expect` from here instead of "@playwright/test".
 */
export const test = base.extend<{ cspGuard: void }>({
  cspGuard: [
    async ({ context }, use, testInfo) => {
      const violations: string[] = [];
      await context.exposeBinding("__reportCspViolation", ({ page }, entry: string) => {
        violations.push(`${page.url()}: ${entry}`);
      });
      await context.addInitScript(() => {
        document.addEventListener("securitypolicyviolation", (event) => {
          const report = (window as unknown as { __reportCspViolation?: (entry: string) => void }).__reportCspViolation;
          report?.(`${event.effectiveDirective} blocked ${event.blockedURI || "inline"} at ${event.sourceFile}:${event.lineNumber} ${event.sample}`);
        });
      });
      await use();
      if (violations.length) {
        await testInfo.attach("csp-violations", { body: violations.join("\n"), contentType: "text/plain" });
      }
      base.expect(violations, "Content Security Policy violations").toEqual([]);
    },
    { auto: true },
  ],
});
