import { z } from "zod";

/**
 * Zod settings for code that runs in the browser. Zod 4 probes `Function("")` on its first parse to
 * decide whether to compile fast parsers; under the nonce CSP of checkout, account and the admin
 * (no 'unsafe-eval', ADR-027) that probe is a CSP violation, so parsing runs without it (same
 * results, a little slower). Every client component that parses with Zod imports this module
 * first (`import "@/lib/zod-config";`); a unit test checks that.
 */
z.config({ jitless: true });
