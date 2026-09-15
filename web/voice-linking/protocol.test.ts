import { URL as StandardURL, URLSearchParams as StandardURLSearchParams } from 'node:url';
import {
  buildCancellationRedirect,
  parseLinkRequest,
  validateApiEndpoint,
  validateAuthorizationRedirect,
  validateMetadata,
} from './protocol';

const originalURL = global.URL;
const originalURLSearchParams = global.URLSearchParams;
beforeAll(() => {
  // This is a browser-only module; use WHATWG URL behavior, not the mobile
  // preset's URL shim, which retains noncanonical uppercase hostnames.
  global.URL = StandardURL as typeof URL;
  global.URLSearchParams = StandardURLSearchParams as typeof URLSearchParams;
});
afterAll(() => {
  global.URL = originalURL;
  global.URLSearchParams = originalURLSearchParams;
});

const request = {
  client_id: 'provider-client',
  redirect_uri: 'https://provider.example/link?existing=one%20two&repeat=1&repeat=2',
  response_type: 'code' as const,
  state: ' provider state: 雪 + / ? & = % # ',
};
const context = { ...request, client: { name: 'Alexa', provider: 'alexa' as const } };
const query = (values: Record<string, string | undefined> = request) => new URLSearchParams(
  Object.entries(values).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
).toString();
const responseFor = (values = request, code = 'authorization-code') => {
  const url = new URL(values.redirect_uri);
  url.searchParams.set('code', code);
  url.searchParams.delete('state');
  if (values.state) url.searchParams.set('state', values.state);
  return { redirect: url.href };
};

describe('linking request validation', () => {
  it('preserves opaque whitespace, Unicode, and punctuation without trimming', () => {
    const opaque = { ...request, client_id: ' client 雪 ' };
    expect(parseLinkRequest(`?${query(opaque)}`)).toEqual(opaque);
  });

  it('accepts omitted state and an ignored bounded provider scope', () => {
    const params = new URLSearchParams(query());
    params.delete('state');
    params.set('scope', 'lights rooms');
    expect(parseLinkRequest(params.toString())).toEqual({ ...request, state: '' });
  });

  it.each(['client_id', 'redirect_uri', 'response_type', 'state', 'scope'])(
    'rejects duplicate %s parameters, including matching copies', (field) => {
      const params = new URLSearchParams(query());
      if (field === 'scope') params.set(field, 'lights');
      params.append(field, params.get(field)!);
      expect(() => parseLinkRequest(params.toString())).toThrow();
    },
  );

  it.each(['api', 'url', 'config', 'endpoint', 'redirect', 'unknown'])(
    'rejects caller-controlled %s configuration', (field) => {
      expect(() => parseLinkRequest(`${query()}&${field}=https%3A%2F%2Fevil.example`)).toThrow();
    },
  );

  it.each([
    { client_id: '' }, { client_id: 'a'.repeat(129) },
    { state: 's'.repeat(513) }, { scope: 's'.repeat(1025) },
    { response_type: 'token' }, { redirect_uri: '' },
    { redirect_uri: `https://provider.example/${'x'.repeat(2048)}` },
  ])('rejects malformed or oversized request fields %#', (changes) => {
    expect(() => parseLinkRequest(query({ ...request, ...changes }))).toThrow();
  });

  it.each([
    'http://provider.example/link', 'javascript:alert(1)', '//provider.example/link',
    'https://name:password@provider.example/link', 'https://provider.example/link#',
    'https://provider.example/link#fragment', ' https://provider.example/link',
    'https://provider.example/a/../link', 'https://PROVIDER.example/link',
    'https://provider.example:443/link', 'https:\\provider.example\\link',
    'https://provider.example', 'https://provider.example/link\n',
  ])('rejects unsafe or noncanonical redirect %s', (redirect_uri) => {
    expect(() => parseLinkRequest(query({ ...request, redirect_uri }))).toThrow();
  });

  it('requires explicit preview permission for a literal loopback address and port', () => {
    const local = { ...request, redirect_uri: 'http://127.0.0.1:4321/provider/callback' };
    expect(() => parseLinkRequest(query(local))).toThrow();
    expect(parseLinkRequest(query(local), { allowLoopback: true })).toEqual(local);
  });

  it.each(['http://localhost:4321/callback', 'http://127.1:4321/callback',
    'http://[::1]:4321/callback', 'http://127.0.0.1/callback',
    'http://127.0.0.1:80/callback', 'http://127.0.0.1.evil.example:4321/callback'])(
    'does not expand the preview exception to %s', (redirect_uri) => {
      expect(() => parseLinkRequest(query({ ...request, redirect_uri }), { allowLoopback: true })).toThrow();
    },
  );
});

describe('server-validated linking metadata', () => {
  it('returns a detached allowlisted context with exact request values', () => {
    const data = { ...context, api: 'https://evil.example/', client: { ...context.client, url: 'ignored' } };
    const result = validateMetadata(data, request);
    expect(result).toEqual(context);
    expect(result).not.toBe(data);
    expect(result.client).not.toBe(data.client);
  });

  it.each([
    { client_id: 'other-client' }, { redirect_uri: 'https://provider.example/other' },
    { state: request.state.trim() }, { response_type: 'token' }, { state: null },
    { client: { name: 'Alexa', provider: 'other' } },
    { client: { name: '', provider: 'alexa' } },
    { client: { name: '   ', provider: 'alexa' } },
    { client: { name: 'x'.repeat(129), provider: 'alexa' } },
  ])('rejects mismatched or malformed metadata %#', (change) => {
    expect(() => validateMetadata({ ...context, ...change }, request)).toThrow();
  });

  it.each([null, [], 'metadata', new Date()])('rejects a non-object response %j', (data) => {
    expect(() => validateMetadata(data, request)).toThrow();
  });

  it('accepts Google metadata', () => {
    const google = { ...context, client: { name: 'Google Home', provider: 'google' } };
    expect(validateMetadata(google, request)).toEqual(google);
  });
});

describe('authorization navigation boundary', () => {
  it('accepts only the exact server-built registered redirect and opaque state', () => {
    const data = responseFor();
    expect(validateAuthorizationRedirect(data, context)).toBe(data.redirect);
    expect(new URL(data.redirect).searchParams.getAll('repeat')).toEqual(['1', '2']);
  });

  it('replaces registered code/state fields, including an empty request state', () => {
    const value = { ...request, redirect_uri: 'https://provider.example/link?code=old&state=old&x=1', state: '' };
    const trusted = { ...value, client: context.client };
    expect(validateAuthorizationRedirect(responseFor(value), trusted)).toBe(responseFor(value).redirect);
  });

  it.each([
    (url: URL) => { url.host = 'evil.example'; },
    (url: URL) => { url.pathname = '/other'; },
    (url: URL) => { url.searchParams.append('next', 'https://evil.example'); },
    (url: URL) => { url.searchParams.set('state', request.state.trim()); },
    (url: URL) => { url.searchParams.append('state', request.state); },
    (url: URL) => { url.searchParams.append('code', 'another'); },
    (url: URL) => { url.searchParams.delete('state'); },
    (url: URL) => { url.searchParams.delete('code'); },
    (url: URL) => { url.searchParams.set('existing', 'changed'); },
    (url: URL) => { url.hash = 'leaked'; },
    (url: URL) => { url.username = 'user'; },
    (url: URL) => { url.protocol = 'http:'; },
  ])('rejects a modified handoff target %#', (mutate) => {
    const url = new URL(responseFor().redirect);
    mutate(url);
    expect(() => validateAuthorizationRedirect({ redirect: url.href }, context)).toThrow();
  });

  it.each(['', ' ', 'contains spaces', 'new\nline', 'null\u0000byte', '\u007f', '\u00a0', 'x'.repeat(1025)])(
    'rejects invalid authorization code %#', (code) => {
      expect(() => validateAuthorizationRedirect(responseFor(request, code), context)).toThrow();
    },
  );

  it('rejects any state parameter when the request state is empty', () => {
    const value = { ...request, state: '' };
    const data = responseFor(value);
    expect(() => validateAuthorizationRedirect({ redirect: `${data.redirect}&state=` },
      { ...context, state: '' })).toThrow();
  });

  it.each([null, [], { redirect: 1 }, { redirect: 'x'.repeat(12289) }])(
    'rejects an invalid authorization response %#', (data) => {
      expect(() => validateAuthorizationRedirect(data, context)).toThrow();
    },
  );

  it('allows explicit local callback preview without weakening the normal boundary', () => {
    const local = { ...request, redirect_uri: 'http://127.0.0.1:4321/provider/callback' };
    const data = responseFor(local);
    expect(() => validateAuthorizationRedirect(data, { ...context, ...local })).toThrow();
    expect(validateAuthorizationRedirect(data, { ...context, ...local }, { allowLoopback: true })).toBe(data.redirect);
  });

  it('builds cancellation with exact state and no inherited authorization code', () => {
    const trusted = { ...context, redirect_uri: 'https://provider.example/link?code=old&code=older&state=old&x=1' };
    const result = new URL(buildCancellationRedirect(trusted));
    expect(result.origin + result.pathname).toBe('https://provider.example/link');
    expect(result.searchParams.get('error')).toBe('access_denied');
    expect(result.searchParams.getAll('state')).toEqual([request.state]);
    expect(result.searchParams.has('code')).toBe(false);
    expect(result.searchParams.get('x')).toBe('1');
  });

  it('omits cancellation state for an empty request and refuses unvalidated context shapes', () => {
    expect(new URL(buildCancellationRedirect({ ...context, state: '' })).searchParams.has('state')).toBe(false);
    expect(() => buildCancellationRedirect(request)).toThrow();
    expect(() => buildCancellationRedirect({ ...context, redirect_uri: 'javascript:alert(1)' })).toThrow();
  });
});

describe('pinned password API endpoint', () => {
  const endpoint = 'https://dcevusczjtmdpzrxpdou.supabase.co/functions/v1/voice-authorize?format=json';
  it('accepts only a canonical Supabase authorization JSON endpoint', () => {
    expect(validateApiEndpoint(endpoint)).toBe(endpoint);
  });

  it.each([
    endpoint.replace('https:', 'http:'),
    endpoint.replace('.supabase.co', '.supabase.co.evil.example'),
    endpoint.replace('voice-authorize', 'voice-token'),
    endpoint.replace('?format=json', ''),
    `${endpoint}&format=json`, `${endpoint}&url=https://evil.example/`,
    `${endpoint}#`, endpoint.replace('https://', 'https://user:password@'),
    endpoint.replace('.supabase.co/', '.supabase.co:8443/'),
    'https://evil.example/functions/v1/voice-authorize?format=json',
    'https://short.supabase.co/functions/v1/voice-authorize?format=json',
    'http://127.0.0.1:4321/api/voice-authorize?format=json',
  ])('rejects an untrusted service endpoint %#', (value) => {
    expect(() => validateApiEndpoint(value)).toThrow();
  });

  it('supports only explicit loopback API previews', () => {
    const local = 'http://127.0.0.1:4321/api/voice-authorize?format=json';
    expect(validateApiEndpoint(local, { allowLoopback: true })).toBe(local);
    expect(() => validateApiEndpoint(local.replace('127.0.0.1', 'localhost'), { allowLoopback: true })).toThrow();
    expect(() => validateApiEndpoint(local.replace('/api/', '/other/'), { allowLoopback: true })).toThrow();
  });
});
