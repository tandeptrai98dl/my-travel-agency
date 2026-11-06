// Sentry for the edge runtime (any route that opts into `runtime = "edge"`).
import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "./src/lib/monitoring/sentry-options";

Sentry.init(sentryOptions(process.env.SENTRY_DSN, "server"));
