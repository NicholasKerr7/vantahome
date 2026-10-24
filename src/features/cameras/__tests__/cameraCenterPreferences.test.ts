import { CameraCenterPreferenceStore, parseCameraCenterPreferences } from '../cameraCenterPreferences';

/** Flush the small persistence queue without relying on wall-clock sleeps. */
async function settle(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

test('accepts only bounded, versioned camera IDs and removes duplicates', () => {
  expect(parseCameraCenterPreferences(null)).toEqual([]);
  expect(parseCameraCenterPreferences('{"version":1,"favoriteIds":["entry","entry","drive"]}')).toEqual(['entry', 'drive']);
});

test.each([
  'not json', '{"version":2,"favoriteIds":[]}', '{"version":1,"favoriteIds":"entry"}',
  '{"version":1,"favoriteIds":["https://private.invalid/image"]}', '{"version":1,"favoriteIds":[123]}',
  '{"version":1,"favoriteIds":[],"thumbnail":"private"}',
  JSON.stringify({ version: 1, favoriteIds: Array.from({ length: 129 }, (_, index) => `camera-${index}`) }),
  JSON.stringify({ version: 1, favoriteIds: ['x'.repeat(161)] }), 'x'.repeat(24_001),
])('rejects invalid, excessive or media-bearing preferences %#', (raw) => {
  expect(parseCameraCenterPreferences(raw)).toBeNull();
});

test('favorite order survives a new store while device settings remain untouched', async () => {
  const records = new Map<string, string>();
  const storage = { getItem: jest.fn(async (key: string) => records.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { records.set(key, value); }) };
  const first = new CameraCenterPreferenceStore(storage);
  await first.load('account/home');
  expect(first.toggleFavorite('account/home', 'drive', ['entry', 'drive'])).toBe(true);
  first.toggleFavorite('account/home', 'entry', ['entry', 'drive']);
  await settle();
  const reopened = new CameraCenterPreferenceStore(storage);
  await reopened.load('account/home');
  expect(reopened.getSnapshot('account/home')).toEqual({ favoriteIds: ['drive', 'entry'], ready: true, status: 'saved' });
  expect([...records.keys()]).toEqual(['vantahome-camera-center:v1:account/home']);
});

test('denied or noncamera IDs cannot be favorited and removed access is dropped on the next edit', async () => {
  const storage = { getItem: jest.fn(async () => '{"version":1,"favoriteIds":["removed","entry"]}'), setItem: jest.fn(async () => undefined) };
  const store = new CameraCenterPreferenceStore(storage);
  await store.load('home');
  expect(store.toggleFavorite('home', 'light', ['entry', 'drive'])).toBe(false);
  expect(store.toggleFavorite('home', 'private', ['entry', 'drive'])).toBe(false);
  store.toggleFavorite('home', 'drive', ['entry', 'drive']);
  await settle();
  expect(store.getSnapshot('home').favoriteIds).toEqual(['entry', 'drive']);
});

test('late hydration of a previous account cannot replace the next account choices', async () => {
  let resolveFirst!: (raw: string | null) => void;
  const firstRead = new Promise<string | null>((resolve) => { resolveFirst = resolve; });
  const store = new CameraCenterPreferenceStore({
    getItem: async (key) => key.endsWith(':first') ? firstRead : '{"version":1,"favoriteIds":["next-camera"]}',
    setItem: async () => undefined,
  });
  const first = store.load('first');
  await store.load('next');
  resolveFirst('{"version":1,"favoriteIds":["old-camera"]}');
  await first;
  expect(store.getSnapshot('next').favoriteIds).toEqual(['next-camera']);
});

test('a corrupt cache stays intact and cannot be overwritten before a successful retry', async () => {
  const storage = { getItem: jest.fn(async () => 'corrupt'), setItem: jest.fn(async () => undefined) };
  const store = new CameraCenterPreferenceStore(storage);
  await store.load('home');
  expect(store.getSnapshot('home')).toMatchObject({ ready: false, status: 'error' });
  expect(store.toggleFavorite('home', 'entry', ['entry'])).toBe(false);
  expect(storage.setItem).not.toHaveBeenCalled();
  storage.getItem.mockResolvedValue('{"version":1,"favoriteIds":["entry"]}');
  store.retry('home');
  await settle();
  expect(store.getSnapshot('home')).toMatchObject({ favoriteIds: ['entry'], ready: true, status: 'saved' });
});

test('a failed write remains visible and retries the latest accepted value', async () => {
  const storage = { getItem: jest.fn(async () => null), setItem: jest.fn(async () => undefined) };
  storage.setItem.mockRejectedValueOnce(new Error('Disk full'));
  const store = new CameraCenterPreferenceStore(storage);
  await store.load('home');
  store.toggleFavorite('home', 'entry', ['entry']);
  await settle();
  expect(store.getSnapshot('home')).toEqual({ favoriteIds: ['entry'], ready: true, status: 'error' });
  store.retry('home');
  await settle();
  expect(store.getSnapshot('home').status).toBe('saved');
  expect(storage.setItem).toHaveBeenCalledTimes(2);
});

test('rapid toggles serialize writes so the last value survives delayed storage', async () => {
  let finishFirst!: () => void;
  const firstWrite = new Promise<void>((resolve) => { finishFirst = resolve; });
  const storage = { getItem: async () => null, setItem: jest.fn(async (_key: string, _value: string): Promise<void> => undefined) };
  storage.setItem.mockImplementationOnce(() => firstWrite);
  const store = new CameraCenterPreferenceStore(storage);
  await store.load('home');
  store.toggleFavorite('home', 'entry', ['entry', 'drive']);
  store.toggleFavorite('home', 'drive', ['entry', 'drive']);
  store.toggleFavorite('home', 'entry', ['entry', 'drive']);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  finishFirst(); await settle();
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  expect(storage.setItem.mock.calls.at(-1)?.[1]).toBe('{"version":1,"favoriteIds":["drive"]}');
  expect(store.getSnapshot('home')).toEqual({ favoriteIds: ['drive'], ready: true, status: 'saved' });
});
