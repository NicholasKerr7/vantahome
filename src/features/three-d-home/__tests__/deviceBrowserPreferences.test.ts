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
  "preserves malformed storage %s and blocks edits until its baseline can be recovered",
  async (raw) => {
    const storage = {
      getItem: jest.fn(async () => raw),
      setItem: jest.fn(async () => undefined),
    };
    const favorites = new ModelDeviceFavorites(storage);
    await favorites.load();
    expect(favorites.getSnapshot()).toEqual({ ids: [], status: "error", error: "load" });
    favorites.toggle("living-light");
    await favorites.retry();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.getItem).toHaveBeenCalledTimes(2);
    expect(favorites.getSnapshot()).toEqual({ ids: [], status: "error", error: "load" });
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

test("a transient failed read retries and preserves saved favorites before permitting edits", async () => {
  let cache = JSON.stringify({ version: 1, ids: ["living-light"] });
  const storage = { getItem: jest.fn(async () => cache), setItem: jest.fn(async (_key: string, value: string) => { cache = value; }) };
  storage.getItem.mockRejectedValueOnce(new Error("Unavailable"));
  const favorites = new ModelDeviceFavorites(storage);
  await favorites.load();
  favorites.toggle("living-fan");
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(JSON.parse(cache).ids).toEqual(["living-light"]);
  await favorites.load();
  favorites.toggle("living-fan");
  await waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(1));
  expect(JSON.parse(cache).ids).toEqual(["living-light", "living-fan"]);
});

test("save retry retains local edits without reloading an older disk baseline", async () => {
  let cache: string | null = null;
  const storage = { getItem: jest.fn(async () => cache), setItem: jest.fn(async (_key: string, value: string) => { cache = value; }) };
  storage.setItem.mockRejectedValueOnce(new Error("Unavailable"));
  const favorites = new ModelDeviceFavorites(storage);
  await favorites.load();
  favorites.toggle("living-light");
  await waitFor(() => expect(favorites.getSnapshot().error).toBe("save"));
  await favorites.retry();
  expect(favorites.getSnapshot()).toEqual({ ids: ["living-light"], status: "saved" });
  expect(storage.getItem).toHaveBeenCalledTimes(1);
  expect(JSON.parse(cache!).ids).toEqual(["living-light"]);
});
