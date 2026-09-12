import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { onRequestPost } from '../functions/api/pulse.js';

function database() {
  const queries = [];
  return {
    queries,
    prepare(sql) {
      return { sql, args: [], bind(...args) { this.args = args; return this; } };
    },
    async batch(statements) {
      queries.push(...statements);
      return statements.map(({ sql }) => {
        if (sql.includes('COUNT(*)')) return { results: [{ n: 125 }] };
        if (sql.includes('FROM place')) return { results: [{ label: 'Cafe', city: 'City', area: 'Downtown', ago: 60 }] };
        if (sql.includes('FROM spotify')) return { results: [{ age: 0, track: JSON.stringify({ title: 'Song', artist: 'Artist', playing: true }) }] };
        assert.match(sql, /^(INSERT OR IGNORE INTO hits|DELETE FROM hits)/);
        return { results: [] };
      });
    },
  };
}

for (const fresh of [true, false]) {
  test(`API preserves visitor and personal status data (fresh=${fresh})`, async () => {
    const db = database();
    const response = await onRequestPost({
      request: new Request('https://example.com/api/pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'CF-Connecting-IP': '192.0.2.1' },
        // Older cached clients may still supply a tab ID. It must be ignored.
        body: JSON.stringify({ fresh, tab: '12345678-1234-4234-8234-123456789abc' }),
      }),
      env: { PULSE_DB: db, PULSE_SALT: 'test-salt' },
      waitUntil() { assert.fail('Fresh Spotify cache should not refresh'); },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      visits: 125,
      place: { label: 'Cafe', city: 'City', area: 'Downtown', ago: 60 },
      track: { title: 'Song', artist: 'Artist', playing: true, ago: null },
    });
    assert.equal(db.queries.length, fresh ? 5 : 3);
    assert.ok(db.queries.every(({ sql }) => !/presence|country/i.test(sql)));
    if (fresh) {
      assert.match(db.queries[0].args[1], /^[a-f0-9]{20}$/);
      assert.notEqual(db.queries[0].args[1], '192.0.2.1');
    }
  });
}

test('cross-origin writes remain forbidden', async () => {
  const db = database();
  const response = await onRequestPost({
    request: new Request('https://example.com/api/pulse', { method: 'POST', headers: { Origin: 'https://other.example' } }),
    env: { PULSE_DB: db },
  });
  assert.equal(response.status, 403);
  assert.equal(db.queries.length, 0);
});

const client = await readFile(new URL('../public/assets/js/pulse.js', import.meta.url), 'utf8');
for (const homepage of [true, false]) {
  test(`client sends only a visit flag and polls only visible widgets (homepage=${homepage})`, async () => {
    const requests = [], timers = [];
    const visits = { dataset: { pulse: 'visits' }, textContent: '' };
    const strip = {
      hidden: true, classList: { add() {} },
      querySelectorAll() { return [visits]; }, querySelector() { return null; },
    };
    const window = { addEventListener() {} };
    window.top = window.self = window;
    const context = {
      window,
      document: {
        visibilityState: 'visible', addEventListener() {},
        querySelector(selector) { return selector === '.pulse' && homepage ? strip : null; },
      },
      // Blocked storage should still allow normal visit counting.
      sessionStorage: { getItem() { throw new Error('blocked'); } },
      matchMedia() { return { matches: true, addEventListener() {} }; },
      requestAnimationFrame(fn) { fn(); }, clearInterval() {},
      setInterval(fn, ms) { timers.push(ms); return timers.length; },
      async fetch(url, options) {
        requests.push({ url, body: JSON.parse(options.body) });
        return { ok: true, async json() { return { visits: 125, place: null, track: null }; } };
      },
    };
    vm.runInNewContext(client, context);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(requests, [{ url: '/api/pulse', body: { fresh: true } }]);
    assert.deepEqual(timers, homepage ? [30000] : []);
    if (homepage) {
      assert.equal(visits.textContent, '000125');
      assert.equal(strip.hidden, false);
    }
  });
}
