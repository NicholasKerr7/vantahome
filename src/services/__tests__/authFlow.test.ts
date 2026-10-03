import {
  beginAuthFlow,
  cancelAuthFlow,
  completeAuthCallback,
  waitForAuthExchange,
  verifyInvitationCode,
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
      verifyOtp: jest.fn(),
      signOut: jest.fn(),
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
  (auth.verifyOtp as jest.Mock).mockResolvedValue({
    data: {
      session: { user: { id: "invitee", email: "invited@example.test" } },
      user: { id: "invitee", email: "invited@example.test" },
    },
    error: null,
  });
  (auth.signOut as jest.Mock).mockResolvedValue({ error: null });
});

describe("explicit invitation code verification", () => {
  test("verifies a deliberately entered email and six-digit invite code", async () => {
    const session = await verifyInvitationCode(" Invited@Example.Test ", " 123456 ");
    expect(session.user.id).toBe("invitee");
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      email: "invited@example.test", token: "123456", type: "invite",
    });
    expect(auth.setSession).not.toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  test.each([
    ["missing", "123456"],
    ["invited@example.test", "12345"],
    ["invited@example.test", "1234567"],
    ["invited@example.test", "12a456"],
    ["invited@example.test", "token_hash=secret"],
  ])("does not verify malformed invitation input", async (email, code) => {
    await expect(verifyInvitationCode(email, code)).rejects.toThrow("six-digit");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  test("cannot replace an existing signed-in identity", async () => {
    (auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: "current-person" } } }, error: null,
    });
    await expect(verifyInvitationCode("invited@example.test", "123456"))
      .rejects.toThrow("Sign out");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  test.each(["expired", "already used", "incorrect code"])(
    "keeps failed %s verification signed out without a fallback", async (reason) => {
      (auth.verifyOtp as jest.Mock).mockResolvedValue({
        data: { session: null, user: null }, error: new Error(reason),
      });
      await expect(verifyInvitationCode("invited@example.test", "123456"))
        .rejects.toThrow("invalid or has expired");
      expect(auth.setSession).not.toHaveBeenCalled();
      expect(auth.signOut).not.toHaveBeenCalled();
    },
  );

  test("removes an unexpected session for the wrong email", async () => {
    const otherSession = { user: { id: "other-person", email: "other@example.test" } };
    (auth.verifyOtp as jest.Mock).mockResolvedValue({
      data: { session: otherSession, user: otherSession.user }, error: null,
    });
    (auth.getSession as jest.Mock)
      .mockResolvedValueOnce({ data: { session: null }, error: null })
      .mockResolvedValueOnce({ data: { session: otherSession }, error: null });
    await expect(verifyInvitationCode("invited@example.test", "123456"))
      .rejects.toThrow("your email address");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  test("does not remove a different account when rejecting a mismatched response", async () => {
    const otherSession = { user: { id: "unexpected", email: "other@example.test" } };
    (auth.verifyOtp as jest.Mock).mockResolvedValue({
      data: { session: otherSession, user: otherSession.user }, error: null,
    });
    (auth.getSession as jest.Mock)
      .mockResolvedValueOnce({ data: { session: null }, error: null })
      .mockResolvedValueOnce({ data: { session: { user: { id: "different-account" } } }, error: null });
    await expect(verifyInvitationCode("invited@example.test", "123456"))
      .rejects.toThrow("your email address");
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  test("does not send a code when the signed-out session cannot be confirmed", async () => {
    (auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: null }, error: new Error("Session unavailable"),
    });
    await expect(verifyInvitationCode("invited@example.test", "123456"))
      .rejects.toThrow("Session unavailable");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  test("explicit invitation entry cancels a previously pending browser callback", async () => {
    await beginAuthFlow("oauth");
    await verifyInvitationCode("invited@example.test", "123456");
    expect(await completeAuthCallback("vantahome://auth-callback?code=previous"))
      .toBeNull();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  test("rejects unrequested invitation URL credentials without authentication", async () => {
    for (const url of [
      "vantahome://join-home?token_hash=secret&type=invite",
      "vantahome://join-home#access_token=secret&refresh_token=secret",
      "vantahome://auth-callback?token_hash=secret&type=invite",
    ]) expect(await completeAuthCallback(url)).toBeNull();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(auth.setSession).not.toHaveBeenCalled();
  });

  test("blocks duplicate and browser flows while invitation verification is active", async () => {
    let finish: (value: unknown) => void = () => {};
    let verifying = false;
    (auth.verifyOtp as jest.Mock).mockImplementation(() => new Promise((resolve) => {
      finish = resolve;
      verifying = true;
    }));
    const verification = verifyInvitationCode("invited@example.test", "123456");
    while (!verifying) await Promise.resolve();
    await expect(verifyInvitationCode("invited@example.test", "123456"))
      .rejects.toThrow("finishing");
    await expect(beginAuthFlow("oauth")).rejects.toThrow("finishing");
    let passwordEntryReady = false;
    const passwordEntry = waitForAuthExchange().then(() => { passwordEntryReady = true; });
    await Promise.resolve();
    expect(passwordEntryReady).toBe(false);
    finish({
      data: {
        session: { user: { id: "invitee", email: "invited@example.test" } },
        user: { id: "invitee" },
      }, error: null,
    });
    await verification;
    await passwordEntry;
    expect(passwordEntryReady).toBe(true);
    expect(auth.verifyOtp).toHaveBeenCalledTimes(1);
  });

  test("cancellation before the session check resolves prevents verification", async () => {
    let finish: (value: unknown) => void = () => {};
    let checking = false;
    (auth.getSession as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve;
      checking = true;
    }));
    const verification = verifyInvitationCode("invited@example.test", "123456");
    const rejected = expect(verification).rejects.toThrow("cancelled");
    while (!checking) await Promise.resolve();
    await cancelAuthFlow();
    finish({ data: { session: null }, error: null });
    await rejected;
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  test("cancellation clears a session already saved by the in-flight SDK request", async () => {
    const invitationSession = { user: { id: "invitee", email: "invited@example.test" } };
    let finish: (value: unknown) => void = () => {};
    let verifying = false;
    (auth.verifyOtp as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve;
      verifying = true;
    }));
    const verification = verifyInvitationCode("invited@example.test", "123456");
    const rejected = expect(verification).rejects.toThrow("cancelled");
    while (!verifying) await Promise.resolve();
    await cancelAuthFlow();
    (auth.getSession as jest.Mock).mockResolvedValue({ data: { session: invitationSession }, error: null });
    finish({ data: { session: invitationSession, user: invitationSession.user }, error: null });
    await rejected;
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    await expect(waitForAuthExchange()).resolves.toBeUndefined();
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
