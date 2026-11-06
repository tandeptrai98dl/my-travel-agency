/** Newsletter subscribers (docs/specs/phase-2-catalog-admin.md step 20): read-only list. */
export const SUBSCRIBERS_PAGE_SIZE = 50;
export const SUBSCRIBER_STATES = ["active", "pending", "unsubscribed"] as const;
export type SubscriberState = (typeof SUBSCRIBER_STATES)[number];
export const subscriberListFilters = { state: SUBSCRIBER_STATES } as const;
