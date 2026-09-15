import { execFileSync } from "node:child_process";
import path from "node:path";

test("local preview exercises HTTP headers, origin checks, bounded synthetic login and provider handoff", () => {
  // A Node child keeps this loopback-only HTTP test independent of Expo's
  // mobile URL/fetch shims. It never addresses a real cloud service.
  const script = `
    const assert = require('node:assert/strict');
    const http = require('node:http');
    const { startPreview } = require('./scripts/preview-voice-linking');
    (async () => {
      const p = await startPreview();
      try {
        const page = await fetch(p.url);
        assert.equal(page.headers.get('content-type'), 'text/html; charset=utf-8');
        assert.equal(page.headers.get('cache-control'), 'no-store');
        assert.equal(page.headers.get('x-frame-options'), 'DENY');
        assert(page.headers.get('content-security-policy').includes('connect-src ' + p.apiOrigin));
        assert((await page.text()).includes('Local verification'));
        const query = new URL(p.url).searchParams;
        const target = new URL(p.apiOrigin + '/api/voice-authorize?format=json');
        for (const [key, value] of query) target.searchParams.set(key, value);
        assert.equal((await fetch(target)).status, 403);
        const meta = await fetch(target, { headers: { Origin: p.pageOrigin } });
        assert.equal(meta.status, 200);
        assert.equal(meta.headers.get('access-control-allow-origin'), p.pageOrigin);
        const data = await meta.json();
        assert.equal(data.state, ' local state + 雪 ');
        const endpoint = p.apiOrigin + '/api/voice-authorize?format=json';
        const preflight = await fetch(endpoint, { method: 'OPTIONS', headers: { Origin: p.pageOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Content-Type' } });
        assert.equal(preflight.status, 204);
        const rejected = await fetch(endpoint, { method: 'OPTIONS', headers: { Origin: p.pageOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Authorization' } });
        assert.equal(rejected.status, 403);
        const body = { ...Object.fromEntries(query), email: 'linking@example.test', password: 'local-fixture-only' };
        const bad = await fetch(endpoint, { method: 'POST', headers: { Origin: p.pageOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, password: 'wrong' }) });
        assert.equal(bad.status, 401);
        const bytes = Buffer.from(JSON.stringify(body));
        const split = bytes.indexOf(Buffer.from('雪')) + 1;
        const result = await new Promise((resolve, reject) => {
          const req = http.request(endpoint, { method: 'POST', headers: { Origin: p.pageOrigin, 'Content-Type': 'application/json' } }, (res) => {
            let text = ''; res.on('data', (chunk) => { text += chunk; }); res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(text) }));
          });
          req.on('error', reject); req.write(bytes.subarray(0, split)); setTimeout(() => req.end(bytes.subarray(split)), 10);
        });
        assert.equal(result.status, 200);
        const callback = await fetch(result.data.redirect);
        assert.equal(callback.status, 200);
        assert((await callback.text()).includes('Local handoff verified'));
        assert.equal(p.stats.completed, 1);
        assert.equal(p.stats.submissions, 2);
        assert.equal((await fetch(p.pageOrigin + '/../../package.json')).status, 404);
        assert.equal((await fetch(p.pageOrigin + '/', { method: 'POST' })).status, 405);
        // Fetch normalizes Host in some runtimes; use a raw HTTP request so the
        // negative actually reaches the server with the challenged authority.
        const foreignHostStatus = await new Promise((resolve, reject) => {
          const req = http.get(p.pageOrigin + '/', { headers: { Host: 'untrusted.example.test' } }, (res) => {
            res.resume(); resolve(res.statusCode);
          });
          req.on('error', reject);
        });
        assert.equal(foreignHostStatus, 403);
        console.log('local-preview-boundaries-passed');
      } finally { await p.close(); }
    })().catch((error) => { console.error('local-preview-boundaries-failed:', error.message); process.exitCode = 1; });
  `;
  const result = execFileSync(process.execPath, ["-e", script], { cwd: path.resolve(__dirname, ".."), encoding: "utf8", timeout: 15000 });
  expect(result.trim()).toBe("local-preview-boundaries-passed");
}, 20000);
