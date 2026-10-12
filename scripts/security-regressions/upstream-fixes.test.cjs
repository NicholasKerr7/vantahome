'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const test = require('node:test');
const zlib = require('node:zlib');
const compression = require('compression');
const shellQuote = require('shell-quote');
const { SourceMapConsumer } = require('source-map-js');

test('compression releases its native gzip stream after a prematurely closed response', () => {
  const descriptor = Object.getOwnPropertyDescriptor(zlib, 'createGzip');
  let gzip;
  Object.defineProperty(zlib, 'createGzip', { ...descriptor, value: (...args) => {
    gzip = descriptor.value(...args);
    return gzip;
  } });
  const socket = new net.Socket();
  try {
    const request = new http.IncomingMessage(socket);
    request.method = 'GET';
    request.headers['accept-encoding'] = 'gzip';
    const response = new http.ServerResponse(request);
    compression({ threshold: 0 })(request, response, () => {
      response.setHeader('Content-Type', 'text/plain');
      response.write('A response whose client disconnects before end.');
    });
    assert.ok(gzip, 'The regression must create a real compression stream.');
    response.emit('close');
    assert.equal(gzip.destroyed, true);
    assert.equal(gzip._handle, null, 'The native zlib allocation must be released.');
  } finally {
    gzip?.destroy();
    socket.destroy();
    Object.defineProperty(zlib, 'createGzip', descriptor);
  }
});

test('shell-quote rejects line terminators following comment tokens and preserves ordinary quoting', () => {
  for (const terminator of ['\n', '\r', '\u2028', '\u2029']) {
    assert.throws(() => shellQuote.quote([{ comment: 'comment' }, `${terminator}printf untrusted`]), /line terminators/);
  }
  const values = ['file with spaces', 'ordinary', '$literal', "quoted'value"];
  assert.deepEqual(shellQuote.parse(shellQuote.quote(values)), values);
});

/** Construct a small indexed map whose section offset is the only untrusted field. */
function indexedMap(line, column = 0) {
  return { version: 3, sections: [{ offset: { line, column }, map: { version: 3, sources: ['input.js'], names: [], mappings: 'AAAA' } }] };
}

test('source-map-js rejects unbounded and malformed section offsets before mapping work', () => {
  for (const line of [Number.MAX_SAFE_INTEGER, Infinity, NaN, -1, 0.5, '2']) {
    assert.throws(() => new SourceMapConsumer(indexedMap(line)), /offset/i);
  }
  assert.throws(() => new SourceMapConsumer(indexedMap(0, Infinity)), /offset/i);
  const consumer = new SourceMapConsumer(indexedMap(2, 3));
  assert.deepEqual(consumer.originalPositionFor({ line: 3, column: 4 }), { source: 'input.js', line: 1, column: 0, name: null });
});
