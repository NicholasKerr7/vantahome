import type { Event } from "@sentry/react-native";
import { scrubSentryEvent } from "./sentryPrivacy";

describe("scrubSentryEvent", () => {
  test("removes user, request, context, and breadcrumb payloads", () => {
    const privateValue = "resident@example.com";
    const event: Event = {
      message: `Failed for ${privateValue}`,
      user: { email: privateValue, ip_address: "192.0.2.1" },
      request: {
        url: "https://example.com/home/resident",
        headers: { authorization: "Bearer private-token" },
        data: { password: "private-password" },
      },
      contexts: { household: { name: "Private household" } },
      extra: { inviteEmail: privateValue },
      tags: { memberName: "Private resident" },
      transaction: "/homes/private-id",
      spans: [
        {
          span_id: "span",
          trace_id: "trace",
          start_timestamp: 1,
          data: {},
        },
      ],
      breadcrumbs: [
        {
          category: "console",
          message: `Invited ${privateValue}`,
          data: { token: "private-token" },
        },
      ],
      exception: {
        values: [{ type: "Error", value: `Failure for ${privateValue}` }],
      },
    };

    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed.message).toBe("Application error");
    expect(scrubbed.user).toBeUndefined();
    expect(scrubbed.request).toBeUndefined();
    expect(scrubbed.contexts).toBeUndefined();
    expect(scrubbed.extra).toBeUndefined();
    expect(scrubbed.tags).toBeUndefined();
    expect(scrubbed.transaction).toBeUndefined();
    expect(scrubbed.spans).toBeUndefined();
    expect(scrubbed.breadcrumbs).toEqual([{ category: "console" }]);
    expect(scrubbed.exception?.values?.[0]).toEqual({
      type: "Error",
      value: "Application error",
    });
    expect(JSON.stringify(scrubbed)).not.toContain(privateValue);
    expect(JSON.stringify(scrubbed)).not.toContain("private-token");
  });

  test("preserves stack traces used for crash grouping", () => {
    const event: Event = {
      exception: {
        values: [
          {
            type: "TypeError",
            value: "private details",
            stacktrace: {
              frames: [{ filename: "App.tsx", function: "App", lineno: 42 }],
            },
          },
        ],
      },
    };

    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed.exception?.values?.[0]?.stacktrace).toEqual(
      event.exception?.values?.[0]?.stacktrace,
    );
  });
});
