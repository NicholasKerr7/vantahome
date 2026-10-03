import {
  beginInvitationPasswordSetup,
  bindInvitationPasswordSetup,
  completeInvitationPasswordSetup,
  discardInvitationPasswordIntent,
  needsInvitationPasswordSetup,
} from "../invitationPasswordSetup";
import { secureSessionStorage } from "../secureSessionStorage";
import { supabase } from "../supabaseClient";

const mockSaved = new Map<string, string>();
jest.mock("../secureSessionStorage", () => ({
  secureSessionStorage: {
    getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn(),
  },
}));
jest.mock("../supabaseClient", () => ({ supabase: { auth: { getUser: jest.fn() } } }));

const pendingKey = "vantahome.auth.invitation-password.pending";
const inviteeKey = "vantahome.auth.invitation-password.user.invitee";
const anotherKey = "vantahome.auth.invitation-password.user.another";
const auth = supabase!.auth;

beforeEach(() => {
  jest.resetAllMocks();
  mockSaved.clear();
  (secureSessionStorage.getItem as jest.Mock).mockImplementation(async (key: string) => mockSaved.get(key) ?? null);
  (secureSessionStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => { mockSaved.set(key, value); });
  (secureSessionStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => { mockSaved.delete(key); });
  (auth.getUser as jest.Mock).mockResolvedValue({
    data: { user: { id: "invitee", email: "invited@example.test", email_confirmed_at: new Date().toISOString() } }, error: null,
  });
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test("restores the interval between SDK sign-in and final user binding", async () => {
  await beginInvitationPasswordSetup("invited@example.test");
  expect(await needsInvitationPasswordSetup("invitee")).toBe(true);
});

test("restores bound setup after a restart and retains it across other invitation attempts", async () => {
  const intent = await beginInvitationPasswordSetup("invited@example.test");
  await bindInvitationPasswordSetup(intent, "invitee");
  expect(mockSaved.has(pendingKey)).toBe(false);
  const other = await beginInvitationPasswordSetup("another@example.test");
  await discardInvitationPasswordIntent(other);
  expect(await needsInvitationPasswordSetup("invitee")).toBe(true);
});

test("normal startup without a marker does not make an additional Auth network call", async () => {
  expect(await needsInvitationPasswordSetup("invitee")).toBe(false);
  expect(auth.getUser).not.toHaveBeenCalled();
});

test("does not apply another email's intent to the current account", async () => {
  await beginInvitationPasswordSetup("another@example.test");
  expect(await needsInvitationPasswordSetup("invitee")).toBe(false);
});

test("does not reuse a bound marker under a different account ID", async () => {
  const intent = await beginInvitationPasswordSetup("invited@example.test");
  await bindInvitationPasswordSetup(intent, "invitee");
  expect(await needsInvitationPasswordSetup("another")).toBe(false);
  expect(auth.getUser).not.toHaveBeenCalled();
});

test.each([
  { id: "different", email: "invited@example.test", email_confirmed_at: "2026-10-01T00:00:00Z" },
  { id: "invitee", email: "invited@example.test", email_confirmed_at: null },
])("requires the current verified identity before restoring setup", async (user) => {
  await beginInvitationPasswordSetup("invited@example.test");
  (auth.getUser as jest.Mock).mockResolvedValue({ data: { user }, error: null });
  await expect(needsInvitationPasswordSetup("invitee")).rejects.toThrow("account changed");
});

test("expires unbound intent and rejects future-dated markers", async () => {
  const now = Date.now();
  await beginInvitationPasswordSetup("invited@example.test");
  const clock = jest.spyOn(Date, "now").mockReturnValue(now + 61 * 60_000);
  expect(await needsInvitationPasswordSetup("invitee")).toBe(false);
  clock.mockReturnValue(now - 1_000);
  expect(await needsInvitationPasswordSetup("invitee")).toBe(false);
});

test("expires a stale bound marker after the continuity window", async () => {
  const intent = await beginInvitationPasswordSetup("invited@example.test");
  await bindInvitationPasswordSetup(intent, "invitee");
  jest.spyOn(Date, "now").mockReturnValue(intent.createdAt + 31 * 24 * 60 * 60_000);
  expect(await needsInvitationPasswordSetup("invitee")).toBe(false);
});

test("damaged or unavailable storage rejects rather than silently skipping setup", async () => {
  mockSaved.set(inviteeKey, "invalid json");
  await expect(needsInvitationPasswordSetup("invitee")).rejects.toThrow("Unable to read");
  (secureSessionStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("Keychain unavailable"));
  await expect(needsInvitationPasswordSetup("invitee")).rejects.toThrow("Keychain unavailable");
});

test("bounds an unresponsive startup check to five seconds", async () => {
  jest.useFakeTimers();
  (secureSessionStorage.getItem as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
  const check = needsInvitationPasswordSetup("invitee");
  const rejection = expect(check).rejects.toThrow("timed out");
  await jest.advanceTimersByTimeAsync(5_000);
  await rejection;
});

test("clears only the verified account's marker after password setup", async () => {
  const invitee = await beginInvitationPasswordSetup("invited@example.test");
  await bindInvitationPasswordSetup(invitee, "invitee");
  const another = await beginInvitationPasswordSetup("another@example.test");
  await bindInvitationPasswordSetup(another, "another");
  await completeInvitationPasswordSetup("invitee");
  expect(mockSaved.has(inviteeKey)).toBe(false);
  expect(mockSaved.has(anotherKey)).toBe(true);
});

test("completion also clears a matching pre-binding intent after a cold start", async () => {
  await beginInvitationPasswordSetup("invited@example.test");
  await completeInvitationPasswordSetup("invitee");
  expect(mockSaved.has(pendingKey)).toBe(false);
});

test("verified password completion repairs corrupt global intent without removing another user's setup", async () => {
  const another = await beginInvitationPasswordSetup("another@example.test");
  await bindInvitationPasswordSetup(another, "another");
  mockSaved.set(pendingKey, "corrupt setup intent");
  await expect(needsInvitationPasswordSetup("invitee")).rejects.toThrow("Unable to read");
  await completeInvitationPasswordSetup("invitee");
  expect(mockSaved.has(pendingKey)).toBe(false);
  expect(mockSaved.has(anotherKey)).toBe(true);
  expect(await needsInvitationPasswordSetup("invitee")).toBe(false);
});

test("repairing corrupt intent preserves a valid replacement created during completion", async () => {
  const replacement = JSON.stringify({
    requestId: "replacement", email: "another@example.test", userId: null, createdAt: Date.now(),
  });
  mockSaved.set(pendingKey, "corrupt setup intent");
  (secureSessionStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
    mockSaved.delete(key);
    if (key === inviteeKey) mockSaved.set(pendingKey, replacement);
  });
  await completeInvitationPasswordSetup("invitee");
  expect(mockSaved.get(pendingKey)).toBe(replacement);
});

test("bounds an unresponsive completion storage operation to five seconds", async () => {
  jest.useFakeTimers();
  (secureSessionStorage.getItem as jest.Mock).mockImplementationOnce(() => new Promise(() => {}));
  const completion = completeInvitationPasswordSetup("invitee");
  const rejection = expect(completion).rejects.toThrow("timed out");
  await jest.advanceTimersByTimeAsync(5_000);
  await rejection;
});

test("completion for another account cannot remove the saved marker", async () => {
  const intent = await beginInvitationPasswordSetup("invited@example.test");
  await bindInvitationPasswordSetup(intent, "invitee");
  (auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: "another" } }, error: null });
  await expect(completeInvitationPasswordSetup("invitee")).rejects.toThrow("account changed");
  expect(mockSaved.has(inviteeKey)).toBe(true);
});

test("discarding an older attempt leaves the replacement intent in place", async () => {
  const old = await beginInvitationPasswordSetup("old@example.test");
  const replacement = await beginInvitationPasswordSetup("invited@example.test");
  await discardInvitationPasswordIntent(old);
  expect(JSON.parse(mockSaved.get(pendingKey)!)).toEqual(replacement);
});
