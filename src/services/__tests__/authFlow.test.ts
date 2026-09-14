import {
  beginAuthFlow,
  cancelAuthFlow,
  completeAuthCallback,
  waitForAuthExchange,
} from "../authFlow";
import { secureSessionStorage } from "../secureSessionStorage";
import { supabase } from "../supabaseClient";

jest.mock("../secureSessionStorage", () => {
  const saved = new Map<string, string>();
  return {
    secureSessionStorage: {
      getItem: jest.fn(async (key: string) => saved.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        saved.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        saved.delete(key);
      }),
    },
  };
});
jest.mock("../supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      setSession: jest.fn(),
    },
  },
}));

const auth = supabase!.auth;
beforeEach(async () => {
  jest.clearAllMocks();
  await cancelAuthFlow();
  (auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: null },
    error: null,
  });
  (auth.exchangeCodeForSession as jest.Mock).mockResolvedValue({
    data: { session: { user: { id: "alice" } } },
    error: null,
  });
});

test("a locally initiated PKCE callback exchanges once across duplicate deliveries", async () => {
  await beginAuthFlow("oauth");
  const results = await Promise.all([
    completeAuthCallback("vantahome://auth-callback?code=test-code"),
    completeAuthCallback("vantahome://auth-callback?code=test-code"),
  ]);
  expect(results[0]?.user.id).toBe("alice");
  expect(results[1]?.user.id).toBe("alice");
  expect(auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
  expect(auth.setSession).not.toHaveBeenCalled();
});

test.each([
  "vantahome://auth-callback#access_token=test&refresh_token=test",
  "vantahome://other/auth-callback?code=test",
  "vantahome://auth-callback?code=one&code=two",
  "vantahome://auth-callback#code=test",
])("does not exchange a malformed or implicit callback: %s", async (url) => {
  await beginAuthFlow("oauth");
  expect(await completeAuthCallback(url)).toBeNull();
  expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  expect(auth.setSession).not.toHaveBeenCalled();
});

test("an unsolicited callback is ignored", async () => {
  expect(
    await completeAuthCallback("vantahome://auth-callback?code=test"),
  ).toBeNull();
  expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
});

test("expiry and cancellation prevent code exchange", async () => {
  await beginAuthFlow("recovery");
  const now = jest
    .spyOn(Date, "now")
    .mockReturnValue(Date.now() + 61 * 60 * 1000);
  expect(
    await completeAuthCallback("vantahome://auth-callback?code=expired"),
  ).toBeNull();
  now.mockRestore();
  await beginAuthFlow("oauth");
  await cancelAuthFlow();
  expect(
    await completeAuthCallback("vantahome://auth-callback?code=cancelled"),
  ).toBeNull();
  expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
});

test("a session change after initiation cannot be replaced by an old flow", async () => {
  await beginAuthFlow("oauth");
  (auth.getSession as jest.Mock).mockResolvedValue({
    data: { session: { user: { id: "bob" } } },
  });
  expect(
    await completeAuthCallback("vantahome://auth-callback?code=old"),
  ).toBeNull();
  expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
});

test("a persisted recovery flow supports cold start and chooses recovery before exchange", async () => {
  await secureSessionStorage.setItem(
    "vantahome.auth.pending-flow",
    JSON.stringify({
      kind: "recovery",
      createdAt: Date.now(),
      userId: null,
    }),
  );
  const onRecovery = jest.fn();
  (auth.exchangeCodeForSession as jest.Mock).mockImplementation(async () => {
    expect(onRecovery).toHaveBeenCalledTimes(1);
    return { data: { session: { user: { id: "alice" } } }, error: null };
  });
  expect(
    (
      await completeAuthCallback(
        "vantahome://auth-callback?code=recovery",
        onRecovery,
      )
    )?.user.id,
  ).toBe("alice");
});

test("a failed PKCE exchange cannot fall back to the existing session", async () => {
  await beginAuthFlow("oauth");
  (auth.exchangeCodeForSession as jest.Mock).mockResolvedValue({
    data: { session: null },
    error: new Error("Invalid verifier"),
  });
  expect(
    await completeAuthCallback("vantahome://auth-callback?code=invalid"),
  ).toBeNull();
  expect(auth.setSession).not.toHaveBeenCalled();
});

test("cancellation while initiation is waiting cannot leave an accepted pending flow", async () => {
  let finish: (result: unknown) => void = () => {};
  (auth.getSession as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const beginning = beginAuthFlow("oauth");
  const rejected = expect(beginning).rejects.toThrow("cancelled");
  await cancelAuthFlow();
  finish({ data: { session: null }, error: null });
  await rejected;
  expect(
    await completeAuthCallback("vantahome://auth-callback?code=late"),
  ).toBeNull();
  expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
});

test("a new request supersedes a callback still checking the prior session", async () => {
  await beginAuthFlow("oauth");
  let finish: (result: unknown) => void = () => {};
  let checking = false;
  (auth.getSession as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        checking = true;
        finish = resolve;
      }),
  );
  const previous = completeAuthCallback(
    "vantahome://auth-callback?code=previous",
  );
  while (!checking) await Promise.resolve();
  await beginAuthFlow("recovery");
  finish({ data: { session: null }, error: null });
  expect(await previous).toBeNull();
  expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  const recover = jest.fn();
  expect(
    (
      await completeAuthCallback(
        "vantahome://auth-callback?code=current",
        recover,
      )
    )?.user.id,
  ).toBe("alice");
  expect(recover).toHaveBeenCalledTimes(1);
});

test("an in-flight SDK exchange blocks a second browser flow and serializes password entry", async () => {
  await beginAuthFlow("oauth");
  let finish: (result: unknown) => void = () => {};
  let exchanging = false;
  (auth.exchangeCodeForSession as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        exchanging = true;
        finish = resolve;
      }),
  );
  const callback = completeAuthCallback(
    "vantahome://auth-callback?code=active",
  );
  while (!exchanging) await Promise.resolve();
  await expect(beginAuthFlow("recovery")).rejects.toThrow("finishing");
  let settled = false;
  const passwordEntry = waitForAuthExchange().then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  finish({ data: { session: { user: { id: "alice" } } }, error: null });
  await callback;
  await passwordEntry;
  expect(settled).toBe(true);
});
