import { generateConciergeResponse, type ConciergeGeneration } from './conciergeProvider';

const generation: ConciergeGeneration = { question: 'Make a quiet evening scene.', canDraft: true, devices: [
  { id: 'example-device', name: 'Pendant', roomName: 'Living room', kind: 'light', controllable: true, values: { isOn: true, brightness: 60 } },
] };
const answer = { title: 'Evening', answer: 'A draft for your simulated living room.', deviceIds: ['example-device'], scene: null };

/** Wrap the provider REST response, including the per-message completion status. */
function envelope(content: unknown = answer) {
  return { status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed',
    content: [{ type: 'output_text', text: JSON.stringify(content) }] }] };
}

/** Inject fetch so provider requests never leave the test process. */
function provider(body: unknown = envelope(), status = 200) {
  const fetcher = jest.fn(async () => new Response(JSON.stringify(body), { status }));
  const run = (signal?: AbortSignal) => generateConciergeResponse(generation, {
    apiKey: 'example-private-provider-key', model: 'gpt-6.1-sol', fetch: fetcher as unknown as typeof fetch, signal,
  });
  return { fetcher, run };
}

it('uses fixed HTTPS Responses endpoint, strict JSON output, no tools and no stored conversation', async () => {
  const { run, fetcher } = provider();
  expect(await run()).toEqual(answer);
  const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://api.openai.com/v1/responses');
  expect(init.redirect).toBe('error');
  const body = JSON.parse(String(init.body));
  expect(body).toEqual(expect.objectContaining({ model: 'gpt-6.1-sol', store: false, background: false,
    max_output_tokens: 1800, reasoning: { effort: 'low' }, tools: [],
    text: { format: expect.objectContaining({ type: 'json_schema', strict: true, name: 'vantahome_concierge' }) },
  }));
  expect(JSON.parse(body.input)).toEqual({ mode: 'simulation', ...generation });
  expect(body.instructions).toContain('untrusted data');
  expect(body.instructions).toContain('have not run');
  expect(body).not.toHaveProperty('previous_response_id');
  expect(body).not.toHaveProperty('conversation');
});

it('does not call the provider without a server credential', async () => {
  const fetcher = jest.fn();
  await expect(generateConciergeResponse(generation, { apiKey: '', model: 'gpt-6.1-sol', fetch: fetcher }))
    .rejects.toMatchObject({ code: 'unavailable' });
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([401, 429, 500])('hides upstream body on provider HTTP %s', async (status) => {
  const { run } = provider({ error: 'private credential or request content' }, status);
  await expect(run()).rejects.toMatchObject({ code: 'unavailable', message: 'unavailable' });
});

it.each([
  [401, { code: 'invalid_api_key' }, 'auth'],
  [403, { code: 'insufficient_permissions' }, 'permission'],
  [404, { code: 'model_not_found' }, 'model'],
  [400, { code: 'model_not_found' }, 'model'],
  [400, { param: 'model' }, 'model'],
  [429, { code: 'insufficient_quota' }, 'quota'],
  [429, { type: 'insufficient_quota' }, 'quota'],
  [429, { code: 'billing_hard_limit_reached' }, 'quota_billing_limit'],
  [429, { code: 'credit_balance_exhausted' }, 'quota_credit_balance'],
  [429, { code: 'organization_spend_limit_exceeded' }, 'quota_organization_spend'],
  [429, { code: 'project_spend_limit_exceeded' }, 'quota_project_spend'],
  [429, { code: 'organization_usage_limit_exceeded' }, 'quota_organization_usage'],
  [429, { code: 'billing_hard_limit_reached', type: 'insufficient_quota' }, 'quota_billing_limit'],
  [429, { code: 'credit_balance_exhausted', type: 'insufficient_quota' }, 'quota_credit_balance'],
  [429, { code: 'organization_spend_limit_exceeded', type: 'insufficient_quota' }, 'quota_organization_spend'],
  [429, { code: 'project_spend_limit_exceeded', type: 'insufficient_quota' }, 'quota_project_spend'],
  [429, { code: 'organization_usage_limit_exceeded', type: 'insufficient_quota' }, 'quota_organization_usage'],
  [429, { code: 'rate_limit_exceeded' }, 'rate_limit'],
  [400, { code: 'invalid_json_schema' }, 'schema'],
  [400, { param: 'text.format.schema' }, 'schema'],
  [400, { code: 'unsupported_parameter' }, 'request'],
  [500, { code: 'server_error' }, 'service'],
  [503, {}, 'service'],
] as const)('keeps HTTP %s diagnostics payload-free (%j)', async (status, metadata, category) => {
  const privateValue = 'private-key-question-and-provider-message';
  const body = { error: { message: privateValue, details: privateValue, ...metadata }, request_id: privateValue };
  const failure = await provider(body, status).run().catch((error: unknown) => error);
  expect(failure).toMatchObject({ code: 'unavailable', message: 'unavailable',
    diagnosticCode: `provider_${category}_http_${status}` });
  expect(JSON.stringify(failure)).not.toContain(privateValue);
});

it('does not retain arbitrary provider codes, types or parameters', async () => {
  const privateValue = 'private-key-question-and-provider-message';
  const failure = await provider({ error: { code: privateValue, type: privateValue, param: privateValue, message: privateValue } }, 400)
    .run().catch((error: unknown) => error);
  expect(failure).toMatchObject({ diagnosticCode: 'provider_request_http_400' });
  expect(JSON.stringify(failure)).not.toContain(privateValue);
});

it('bounds failed responses before parsing and falls back to their HTTP category', async () => {
  const privateValue = 'private-provider-message';
  const failure = await provider({ error: { code: 'insufficient_quota', message: privateValue.repeat(300) } }, 429)
    .run().catch((error: unknown) => error);
  expect(failure).toMatchObject({ code: 'unavailable', diagnosticCode: 'provider_rate_limit_http_429' });
  expect(JSON.stringify(failure)).not.toContain(privateValue);
});

it('preserves safe HTTP diagnostics when the provider error body is not JSON', async () => {
  const fetcher: typeof fetch = jest.fn(async () => new Response('private HTML error page', { status: 500 }));
  await expect(generateConciergeResponse(generation, { apiKey: 'example-private-provider-key', model: 'gpt-6.1-sol', fetch: fetcher }))
    .rejects.toMatchObject({ code: 'unavailable', message: 'unavailable', diagnosticCode: 'provider_service_http_500' });
});

it('classifies transport failures without retaining private transport details', async () => {
  const privateValue = 'private transport details';
  const fetcher: typeof fetch = jest.fn(async () => { throw new Error(privateValue); });
  const failure = await generateConciergeResponse(generation, { apiKey: 'example-private-provider-key', model: 'gpt-6.1-sol', fetch: fetcher })
    .catch((error: unknown) => error);
  expect(failure).toMatchObject({ code: 'unavailable', diagnosticCode: 'provider_network' });
  expect(JSON.stringify(failure)).not.toContain(privateValue);
});

it.each([
  { status: 'incomplete', output: [] },
  { status: 'completed', output: [] },
  { status: 'completed', output: [{ type: 'function_call', arguments: '{}' }] },
  { status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'refusal', refusal: 'No' }] }] },
  { status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'incomplete', content: [{ type: 'output_text', text: '{}' }] }] },
  { status: 'completed', output: [{ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'not JSON' }] }] },
])('rejects incomplete, unexpected or non-JSON provider output', async (body) => {
  await expect(provider(body).run()).rejects.toMatchObject({ code: 'invalid_response' });
});

it('allows internal reasoning metadata but only one completed assistant text', async () => {
  const body = envelope();
  const output = [{ type: 'reasoning', summary: [] }, ...body.output];
  expect(await provider({ ...body, output }).run()).toEqual(answer);
  await expect(provider({ ...body, output: [...body.output, ...body.output] }).run()).rejects.toMatchObject({ code: 'invalid_response' });
});

it('rejects an oversized provider response without exposing it', async () => {
  await expect(provider({ padding: 'x'.repeat(70_000) }).run()).rejects.toMatchObject({ code: 'invalid_response' });
});

it('rejects a too-long structured text even within the outer body cap', async () => {
  await expect(provider(envelope({ text: 'x'.repeat(17_000) })).run()).rejects.toMatchObject({ code: 'invalid_response' });
});

it('aborts the upstream request at twenty seconds and clears its timer', async () => {
  jest.useFakeTimers();
  try {
    const fetcher: typeof fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('transport cancelled')), { once: true });
    }));
    const pending = generateConciergeResponse(generation, { apiKey: 'example-private-provider-key', model: 'gpt-6.1-sol', fetch: fetcher });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });
    await jest.advanceTimersByTimeAsync(20_000);
    await assertion;
    expect(jest.getTimerCount()).toBe(0);
  } finally { jest.useRealTimers(); }
});

it('forwards caller cancellation and safely replaces transport error text', async () => {
  const abort = new AbortController();
  const fetcher: typeof fetch = jest.fn((_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('private transport details')), { once: true });
  }));
  const pending = generateConciergeResponse(generation, { apiKey: 'example-private-provider-key', model: 'gpt-6.1-sol', fetch: fetcher, signal: abort.signal });
  abort.abort();
  await expect(pending).rejects.toMatchObject({ code: 'timeout', message: 'timeout' });
});
