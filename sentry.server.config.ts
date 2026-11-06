// Sentry for the Node.js runtime (Server Components, Route Handlers, Server Actions, proxy).
import * as Sentry from "@sentry/nextjs";

import { sentryOptions } from "./src/lib/monitoring/sentry-options";

Sentry.init(sentryOptions(process.env.SENTRY_DSN));
