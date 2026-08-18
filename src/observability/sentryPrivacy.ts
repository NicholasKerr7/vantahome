import type { Event } from "@sentry/react-native";

/**
 * Keep crash grouping data while removing app-controlled values that may
 * contain household names, device names, addresses, credentials, or messages.
 */
export function scrubSentryEvent<T extends Event>(event: T): T {
  return {
    ...event,
    message: event.message ? "Application error" : undefined,
    logentry: undefined,
    user: undefined,
    request: undefined,
    extra: undefined,
    contexts: undefined,
    tags: undefined,
    fingerprint: undefined,
    transaction: undefined,
    transaction_info: undefined,
    spans: undefined,
    breadcrumbs: event.breadcrumbs?.map((breadcrumb) => ({
      type: breadcrumb.type,
      category: breadcrumb.category,
      level: breadcrumb.level,
      timestamp: breadcrumb.timestamp,
    })),
    exception: event.exception
      ? {
          values: event.exception.values?.map((exception) => ({
            ...exception,
            value: exception.value ? "Application error" : undefined,
          })),
        }
      : undefined,
  } as T;
}
