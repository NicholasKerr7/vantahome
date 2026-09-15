// This module has no browser or network dependencies: every navigation target
// crosses the same validation boundary in the page and its regression tests.

/** @typedef {{allowLoopback?: boolean}} ValidationOptions */
/** @typedef {{client_id: string, redirect_uri: string, response_type: 'code', state: string}} LinkRequest */
/** @typedef {LinkRequest & {client: {name: string, provider: 'alexa' | 'google'}}} LinkContext */

const REQUEST_FIELDS = ['client_id', 'redirect_uri', 'response_type', 'state'];

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

/** @param {unknown} value @param {number} maximum @param {boolean} [required] @returns {value is string} */
function isBoundedString(value, maximum, required = true) {
  return typeof value === 'string' && value.length <= maximum && (!required || value.length > 0);
}

/** @param {unknown} value @param {number} maximum @param {ValidationOptions} options */
function canonicalUrl(value, maximum, options) {
  if (!isBoundedString(value, maximum)) throw new Error('Invalid linking URL.');
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid linking URL.');
  }
  // Equality rejects whitespace, backslashes, implicit path normalization, and
  // non-canonical authorities instead of letting the browser reinterpret them.
  if (url.href !== value || url.username || url.password || url.hash || value.includes('#')) {
    throw new Error('Invalid linking URL.');
  }
  const localPreview = options.allowLoopback === true &&
    url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port !== '' &&
    /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\//.test(value);
  if (url.protocol !== 'https:' && !localPreview) throw new Error('Invalid linking URL.');
  return url;
}

/** @param {unknown} value @param {ValidationOptions} options @returns {LinkRequest} */
function validateRequest(value, options) {
  if (!isPlainObject(value) ||
      !isBoundedString(value.client_id, 128) ||
      !isBoundedString(value.redirect_uri, 2048) ||
      value.response_type !== 'code' ||
      !isBoundedString(value.state, 512, false)) {
    throw new Error('Invalid linking request.');
  }
  canonicalUrl(value.redirect_uri, 2048, options);
  return {
    client_id: value.client_id,
    redirect_uri: value.redirect_uri,
    response_type: 'code',
    state: value.state,
  };
}

/** @param {unknown} search @param {ValidationOptions} [options] @returns {LinkRequest} */
export function parseLinkRequest(search, options = {}) {
  if (typeof search !== 'string' || search.length > 32768) throw new Error('Invalid linking request.');
  const params = new URLSearchParams(search);
  for (const key of params.keys()) {
    // In particular, the provider's query cannot choose the password endpoint.
    if (![...REQUEST_FIELDS, 'scope'].includes(key) || params.getAll(key).length !== 1) {
      throw new Error('Invalid linking request.');
    }
  }
  if (params.has('scope') && !isBoundedString(params.get('scope'), 1024, false)) {
    throw new Error('Invalid linking request.');
  }
  return validateRequest({
    client_id: params.get('client_id'),
    redirect_uri: params.get('redirect_uri'),
    response_type: params.get('response_type'),
    state: params.get('state') ?? '',
  }, options);
}

/** @param {unknown} value @param {ValidationOptions} options @returns {LinkContext} */
function validateContext(value, options) {
  const request = validateRequest(value, options);
  if (!isPlainObject(value) || !isPlainObject(value.client) ||
      !isBoundedString(value.client.name, 128) || !value.client.name.trim() ||
      (value.client.provider !== 'alexa' && value.client.provider !== 'google')) {
    throw new Error('Invalid linking response.');
  }
  return { ...request, client: { name: value.client.name, provider: value.client.provider } };
}

/** @param {unknown} data @param {unknown} expected @param {ValidationOptions} [options] @returns {LinkContext} */
export function validateMetadata(data, expected, options = {}) {
  const request = validateRequest(expected, options);
  const context = validateContext(data, options);
  if (REQUEST_FIELDS.some((field) => context[/** @type {keyof LinkRequest} */ (field)] !==
      request[/** @type {keyof LinkRequest} */ (field)])) {
    throw new Error('Invalid linking response.');
  }
  // Return an allowlisted copy, never server-provided URLs or extra properties.
  return context;
}

/** @param {unknown} data @param {unknown} context @param {ValidationOptions} [options] @returns {string} */
export function validateAuthorizationRedirect(data, context, options = {}) {
  const trusted = validateContext(context, options);
  if (!isPlainObject(data) || !isBoundedString(data.redirect, 12288)) {
    throw new Error('Invalid authorization response.');
  }
  const destination = canonicalUrl(data.redirect, 12288, options);
  const codes = destination.searchParams.getAll('code');
  const states = destination.searchParams.getAll('state');
  if (codes.length !== 1 || !isBoundedString(codes[0], 1024) || /[\s\u0000-\u001f\u007f]/u.test(codes[0]) ||
      (trusted.state ? states.length !== 1 || states[0] !== trusted.state : states.length !== 0)) {
    throw new Error('Invalid authorization response.');
  }
  const expected = new URL(trusted.redirect_uri);
  expected.searchParams.set('code', codes[0]);
  expected.searchParams.delete('state');
  if (trusted.state) expected.searchParams.set('state', trusted.state);
  // Matching only the origin would allow another path or extra destination
  // parameters to leak the authorization code. Match the full server handoff.
  if (destination.href !== expected.href) throw new Error('Invalid authorization response.');
  return destination.href;
}

/** @param {unknown} context @param {ValidationOptions} [options] @returns {string} */
export function buildCancellationRedirect(context, options = {}) {
  // Call only after validateMetadata confirms registration. Shape checks alone
  // cannot prove that a callback URL belongs to a registered voice client.
  const trusted = validateContext(context, options);
  const destination = new URL(trusted.redirect_uri);
  destination.searchParams.delete('code');
  destination.searchParams.delete('state');
  destination.searchParams.set('error', 'access_denied');
  if (trusted.state) destination.searchParams.set('state', trusted.state);
  return destination.href;
}

/** @param {unknown} value @param {ValidationOptions} [options] @returns {string} */
export function validateApiEndpoint(value, options = {}) {
  const endpoint = canonicalUrl(value, 2048, options);
  const hosted = endpoint.protocol === 'https:' && endpoint.port === '' &&
    /^[a-z0-9]{20}\.supabase\.co$/.test(endpoint.hostname) &&
    endpoint.pathname === '/functions/v1/voice-authorize';
  const localPreview = options.allowLoopback === true && endpoint.protocol === 'http:' &&
    endpoint.hostname === '127.0.0.1' && endpoint.port !== '' && endpoint.pathname === '/api/voice-authorize';
  if ((!hosted && !localPreview) || endpoint.search !== '?format=json') {
    throw new Error('Invalid service endpoint.');
  }
  return endpoint.href;
}
