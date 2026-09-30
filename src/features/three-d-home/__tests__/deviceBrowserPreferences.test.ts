import { waitFor } from "@testing-library/react-native";
import {
  MODEL_FAVORITES_STORAGE_KEY,
  ModelDeviceFavorites,
  parseDeviceFavorites,
} from "../deviceBrowserPreferences";

test("reloads only deduplicated canonical IDs from a versioned offline key", async () => {
  let cache: string | null = JSON.stringify({
    version: 1,
    ids: ["living-light", "unknown", "living-light"],
  });
  const storage = {
    getItem: jest.fn(async () => cache),
    setItem: jest.fn(async (_key: string, value: string) => {
      cache = value;
    }),
  };
  const favorites = new ModelDeviceFavorites(storage);
  await favorites.load();
  expect(favorites.getSnapshot()).toEqual({
    ids: ["living-light"],
    status: "saved",
  });
  favorites.toggle("living-fan");
  favorites.toggle("living-light");
  await waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(2));
  const reopened = new ModelDeviceFavorites(storage);
  await reopened.load();
  expect(reopened.getSnapshot().ids).toEqual(["living-fan"]);
  expect(storage.getItem).toHaveBeenCalledWith(MODEL_FAVORITES_STORAGE_KEY);
  expect(
    storage.setItem.mock.calls.every(
      ([key]) => key === MODEL_FAVORITES_STORAGE_KEY,
    ),
  ).toBe(true);
});

test("does not overwrite saved favorites while they are still loading", async () => {
  let resolve!: (value: string | null) => void;
  const storage = {
    getItem: jest.fn(
      () =>
        new Promise<string | null>((done) => {
          resolve = done;
        }),
    ),
    setItem: jest.fn(async () => undefined),
  };
  const favorites = new ModelDeviceFavorites(storage);
  const loading = favorites.load();
  favorites.toggle("living-fan");
  expect(storage.setItem).not.toHaveBeenCalled();
  resolve(JSON.stringify({ version: 1, ids: ["living-light"] }));
  await loading;
  expect(favorites.getSnapshot().ids).toEqual(["living-light"]);
});

test.each(["not json", '{"version":2,"ids":[]}', '{"version":1,"ids":[12]}'])(
  "recovers malformed storage %s with a usable empty session",
  async (raw) => {
    const storage = {
      getItem: jest.fn(async () => raw),
      setItem: jest.fn(async () => undefined),
    };
    const favorites = new ModelDeviceFavorites(storage);
    await favorites.load();
    expect(favorites.getSnapshot()).toEqual({ ids: [], status: "error" });
    favorites.toggle("living-light");
    await waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(1));
    expect(favorites.getSnapshot()).toEqual({
      ids: ["living-light"],
      status: "saved",
    });
  },
);

test("keeps accepted favorites in the session after storage fails", async () => {
  const favorites = new ModelDeviceFavorites({
    getItem: async () => null,
    setItem: async () => {
      throw new Error("Storage unavailable");
    },
  });
  await favorites.load();
  favorites.toggle("living-light");
  await waitFor(() => expect(favorites.getSnapshot().status).toBe("error"));
  expect(favorites.getSnapshot().ids).toEqual(["living-light"]);
  expect(parseDeviceFavorites(null)).toEqual([]);
});
