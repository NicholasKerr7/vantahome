import { ActivityInboxJournal, INBOX_LIMIT, inboxRevision, parseInboxCache, type InboxEvent, type InboxSnapshot } from '../activityInboxJournal';

/** Build safe delivery metadata without an executable command or credentials. */
function event(overrides: Partial<InboxEvent> = {}): InboxEvent {
  return { id: 'command-one', deviceId: 'light-one', source: 'delivery', status: 'submitted',
    createdAt: 100, updatedAt: 110, attempts: 1, simulated: false, ...overrides };
}

/** Use independent adapters while retaining the same disk content across journal restarts. */
function storageFixture() {
  const values = new Map<string, string>();
  const storage = {
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => { values.set(key, value); }),
  };
  return { storage, values };
}

/** Observe the journal only after its asynchronous private cache has hydrated. */
async function read(journal: ActivityInboxJournal, scope: string): Promise<InboxSnapshot> {
  let unsubscribe = () => {};
  const snapshot = await new Promise<InboxSnapshot>((resolve) => {
    unsubscribe = journal.subscribe(scope, (next) => { if (next.ready) resolve(next); });
  });
  unsubscribe();
  return snapshot;
}

test('persists safe activity and receipts across restarts, isolated by account and home', async () => {
  const { storage } = storageFixture();
  const first = new ActivityInboxJournal(storage);
  const row = event();
  await first.upsert('alice:home-one', [row]);
  await first.acknowledge('alice:home-one', new Map([[row.id, inboxRevision(row)]]), true);
  const restarted = new ActivityInboxJournal(storage);
  expect((await read(restarted, 'alice:home-one')).events).toEqual([
    { ...row, readRevision: inboxRevision(row), dismissedRevision: inboxRevision(row) },
  ]);
  expect((await read(restarted, 'bob:home-one')).events).toEqual([]);
  expect((await read(restarted, 'alice:home-two')).events).toEqual([]);
});

test('a later terminal warning is not hidden by a dismissed queued phase or a stale click', async () => {
  const { storage } = storageFixture();
  const journal = new ActivityInboxJournal(storage);
  const queued = event({ status: 'queued' });
  await journal.upsert('home', [queued]);
  await journal.acknowledge('home', new Map([[queued.id, inboxRevision(queued)]]), true);
  const failed = event({ status: 'failed', updatedAt: 130, attempts: 4 });
  await journal.upsert('home', [failed]);
  await journal.acknowledge('home', new Map([[queued.id, inboxRevision(queued)]]), true);
  const [row] = (await read(journal, 'home')).events;
  expect(row.status).toBe('failed');
  expect(row.dismissedRevision).not.toBe(inboxRevision(row));
  expect(row.readRevision).not.toBe(inboxRevision(row));
});

test('bounds events and strips all unallowlisted content including names and command payloads', async () => {
  const { storage } = storageFixture();
  const journal = new ActivityInboxJournal(storage);
  const events = Array.from({ length: INBOX_LIMIT + 15 }, (_, index) => event({
    id: `event-${index}`, createdAt: index, updatedAt: index,
  }));
  await journal.upsert('home', events);
  const restored = await read(new ActivityInboxJournal(storage), 'home');
  expect(restored.events).toHaveLength(INBOX_LIMIT);
  expect(restored.events[0].id).toBe('event-15');
  const sanitized = parseInboxCache(JSON.stringify({ version: 1, events: [{ ...event(),
    name: 'Private name', payload: { token: 'do-not-store', pin: '9999' }, arbitrary: 'untrusted' }] }));
  expect(sanitized).toEqual([event()]);
});

test('rejects fabricated state claims and invalid dates from a cache', () => {
  expect(parseInboxCache(JSON.stringify({ version: 1, events: [
    event({ status: 'physically-confirmed' as InboxEvent['status'] }),
    event({ updatedAt: -1 }), event({ source: 'simulation', status: 'updated', simulated: false }),
  ] }))).toEqual([]);
  expect(() => parseInboxCache('{broken')).toThrow();
});

test('keeps accepted updates during delayed hydration and serializes older/newer writes', async () => {
  const { storage } = storageFixture();
  let finishHydration!: (raw: string | null) => void;
  storage.getItem.mockImplementationOnce(() => new Promise((resolve) => { finishHydration = resolve; }));
  const journal = new ActivityInboxJournal(storage);
  const first = journal.upsert('home', [event({ status: 'sending' })]);
  const second = journal.upsert('home', [event({ updatedAt: 120 })]);
  finishHydration(JSON.stringify({ version: 1, events: [event({ id: 'older' })] }));
  await Promise.all([first, second]);
  const rows = (await read(new ActivityInboxJournal(storage), 'home')).events;
  expect(rows.map((row) => row.id)).toEqual(['older', 'command-one']);
  expect(rows[1].updatedAt).toBe(120);
  expect(storage.setItem).toHaveBeenCalledTimes(2);
});

test('reports persistence failures while retaining current local activity', async () => {
  const { storage } = storageFixture();
  storage.setItem.mockRejectedValueOnce(new Error('Disk unavailable'));
  const journal = new ActivityInboxJournal(storage);
  await journal.upsert('home', [event()]);
  const result = await read(journal, 'home');
  expect(result.storageError).toBe(true);
  expect(result.events).toEqual([event()]);
});

test.each(['same receipt', 'explicit retry'])('retries a failed dismissal with %s and preserves it across restart', async (method) => {
  const { storage } = storageFixture();
  const journal = new ActivityInboxJournal(storage);
  const row = event();
  const revisions = new Map([[row.id, inboxRevision(row)]]);
  await journal.upsert('home', [row]);
  storage.setItem.mockRejectedValueOnce(new Error('Unavailable'));
  await journal.acknowledge('home', revisions, true);
  expect((await read(journal, 'home')).storageError).toBe(true);
  if (method === 'same receipt') await journal.acknowledge('home', revisions, true);
  else await journal.retry('home');
  expect(storage.setItem).toHaveBeenCalledTimes(3);
  expect((await read(journal, 'home')).storageError).toBe(false);
  expect((await read(new ActivityInboxJournal(storage), 'home')).events[0].dismissedRevision).toBe(inboxRevision(row));
});

test('retains newer changes during a failed write and retries only the latest bytes', async () => {
  const { storage } = storageFixture();
  let reject!: (error: Error) => void;
  storage.setItem.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  const journal = new ActivityInboxJournal(storage);
  const first = journal.upsert('home', [event({ status: 'sending' })]);
  await read(journal, 'home');
  const second = journal.upsert('home', [event({ status: 'failed', updatedAt: 120 })]);
  await Promise.resolve();
  reject(new Error('Unavailable'));
  await Promise.all([first, second]);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  await journal.retry('home');
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  expect((await read(new ActivityInboxJournal(storage), 'home')).events[0].status).toBe('failed');
});

test('explicit retry restores unread history without inventing a new event or crossing scopes', async () => {
  const { storage, values } = storageFixture();
  const saved = JSON.stringify({ version: 1, events: [event()] });
  values.set('vantahome-activity:v1:home', saved);
  storage.getItem.mockRejectedValueOnce(new Error('Unavailable'));
  const journal = new ActivityInboxJournal(storage);
  expect((await read(journal, 'home')).storageError).toBe(true);
  await journal.retry('home');
  expect((await read(journal, 'home')).events).toEqual([event()]);
  expect((await read(journal, 'other')).events).toEqual([]);
  expect(storage.setItem).not.toHaveBeenCalled();
});

test('coalesces a rapid simulated slider gesture without overwriting a later separate change', async () => {
  const { storage } = storageFixture();
  const journal = new ActivityInboxJournal(storage);
  await journal.upsert('home', [event({ id: 'first', source: 'simulation', status: 'updated', simulated: true, updatedAt: 100 })]);
  await journal.upsert('home', [event({ id: 'second', source: 'simulation', status: 'updated', simulated: true, updatedAt: 500 })]);
  await journal.upsert('home', [event({ id: 'third', source: 'simulation', status: 'updated', simulated: true, updatedAt: 3000 })]);
  expect((await read(journal, 'home')).events.map(({ id, updatedAt }) => ({ id, updatedAt }))).toEqual([
    { id: 'first', updatedAt: 500 }, { id: 'third', updatedAt: 3000 },
  ]);
});

test('coalesces rapid changes while a write is pending and always saves the latest revision last', async () => {
  const { storage, values } = storageFixture();
  let releaseFirst!: () => void;
  storage.setItem.mockImplementationOnce((key, value) => new Promise<void>((resolve) => {
    releaseFirst = () => { values.set(key, value); resolve(); };
  }));
  const journal = new ActivityInboxJournal(storage);
  const first = journal.upsert('home', [event({ status: 'sending' })]);
  await read(journal, 'home');
  const second = journal.upsert('home', [event({ status: 'queued', updatedAt: 120 })]);
  const third = journal.upsert('home', [event({ status: 'failed', updatedAt: 130 })]);
  await Promise.resolve();
  releaseFirst();
  await Promise.all([first, second, third]);
  expect(storage.setItem).toHaveBeenCalledTimes(2);
  expect((await read(new ActivityInboxJournal(storage), 'home')).events[0].status).toBe('failed');
});

test('rejects finite timestamps outside the Date range so poisoned rows cannot outrank valid activity', async () => {
  const { storage } = storageFixture();
  storage.getItem.mockResolvedValueOnce(JSON.stringify({ version: 1, events: [
    event({ id: 'invalid-created', createdAt: 1e100, updatedAt: 1e100 }),
    event({ id: 'valid', createdAt: 100, updatedAt: 110 }),
    event({ id: 'invalid-updated', updatedAt: 1e100 }),
  ] }));
  const snapshot = await read(new ActivityInboxJournal(storage), 'home');
  expect(snapshot.events.map((entry) => entry.id)).toEqual(['valid']);
  expect(snapshot.events.every((entry) => Number.isFinite(new Date(entry.updatedAt).getTime()))).toBe(true);
});

test('recovers an initially unreadable cache before saving new activity and preserves its old receipts', async () => {
  const { storage, values } = storageFixture();
  const old = event({ id: 'older' });
  const dismissed = { ...old, readRevision: inboxRevision(old), dismissedRevision: inboxRevision(old) };
  values.set('vantahome-activity:v1:home', JSON.stringify({ version: 1, events: [dismissed] }));
  storage.getItem.mockRejectedValueOnce(new Error('Temporary read failure'));
  const journal = new ActivityInboxJournal(storage);
  expect((await read(journal, 'home')).storageError).toBe(true);
  await journal.upsert('home', [event({ id: 'new', updatedAt: 120 })]);
  const saved = await read(new ActivityInboxJournal(storage), 'home');
  expect(saved.events.map((entry) => entry.id)).toEqual(['older', 'new']);
  expect(saved.events[0].dismissedRevision).toBe(inboxRevision(old));
  expect(saved.storageError).toBe(false);
});

test('keeps unknown disk history untouched and a visible warning until a retry restores it', async () => {
  const { storage, values } = storageFixture();
  const original = JSON.stringify({ version: 1, events: [event({ id: 'older' })] });
  values.set('vantahome-activity:v1:home', original);
  storage.getItem.mockRejectedValueOnce(new Error('Initial read failed'))
    .mockRejectedValueOnce(new Error('Retry failed'));
  const journal = new ActivityInboxJournal(storage);
  await journal.upsert('home', [event({ id: 'first-new', updatedAt: 120 })]);
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(values.get('vantahome-activity:v1:home')).toBe(original);
  const memory = await read(journal, 'home');
  expect(memory.events.map((entry) => entry.id)).toEqual(['first-new']);
  expect(memory.storageError).toBe(true);
  await journal.upsert('home', [event({ id: 'second-new', updatedAt: 130 })]);
  expect((await read(new ActivityInboxJournal(storage), 'home')).events.map((entry) => entry.id))
    .toEqual(['older', 'first-new', 'second-new']);
});

test('a malformed existing cache remains intact instead of being overwritten by an empty restore', async () => {
  const { storage, values } = storageFixture();
  values.set('vantahome-activity:v1:home', '{damaged-but-not-deleted');
  const journal = new ActivityInboxJournal(storage);
  await journal.upsert('home', [event()]);
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(values.get('vantahome-activity:v1:home')).toBe('{damaged-but-not-deleted');
  expect((await read(journal, 'home')).storageError).toBe(true);
});
