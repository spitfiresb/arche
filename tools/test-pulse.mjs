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
    const listening = {
      hidden: true, classList: { remove() {} },
      querySelector() { return null; },
    };
    const window = { addEventListener() {} };
    window.top = window.self = window;
    const context = {
      window,
      document: {
        visibilityState: 'visible', addEventListener() {},
        querySelector(selector) { return selector === '.listening' && homepage ? listening : null; },
      },
      // Blocked storage should still allow normal visit counting.
      sessionStorage: { getItem() { throw new Error('blocked'); } },
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
      assert.equal(listening.hidden, true);
    }
  });
}

function musicClient(cached) {
  const values = new Map([['pulse-counted', '1'], ['pulse-status-v1', cached]]);
  const classes = new Set();
  const fields = Object.fromEntries(['hint', 'track', 'by', 'artist'].map(name =>
    [`.listening-${name}`, { textContent: '', hidden: false }]));
  const listening = {
    hidden: true,
    classList: { add: name => classes.add(name), remove: name => classes.delete(name) },
    querySelector: selector => fields[selector],
  };
  let resolveResponse;
  const pending = new Promise(resolve => { resolveResponse = resolve; });
  const window = { addEventListener() {} };
  window.top = window.self = window;
  vm.runInNewContext(client, {
    window,
    document: {
      visibilityState: 'visible', addEventListener() {},
      querySelector: selector => selector === '.listening' ? listening : null,
    },
    sessionStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    requestAnimationFrame() { assert.fail('Music must be visible before the next animation frame'); },
    clearInterval() {}, setInterval() { return 1; },
    fetch: () => pending,
  });
  return {
    listening, fields, classes, values,
    async respond(data) {
      resolveResponse({ ok: true, json: async () => data });
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

const savedTrack = { title: 'Saved song', artist: 'Artist', playing: false, ago: 60 };

test('return navigation paints recent music before the request resolves, then accepts updates', async () => {
  const page = musicClient(JSON.stringify({ at: Date.now() - 60000, place: null, track: savedTrack }));
  assert.equal(page.listening.hidden, false);
  assert.ok(page.classes.has('is-live'));
  assert.equal(page.fields['.listening-track'].textContent, 'Saved song');
  assert.equal(page.fields['.listening-hint'].textContent, 'Last Played · 2 minutes ago');
  await page.respond({ place: null, track: { title: 'New song', artist: 'New artist', playing: true } });
  assert.equal(page.fields['.listening-track'].textContent, 'New song');
  assert.equal(page.fields['.listening-hint'].textContent, 'Now Playing');
  assert.equal(JSON.parse(page.values.get('pulse-status-v1')).track.title, 'New song');
});

test('fresh absent music clears a cached song', async () => {
  const page = musicClient(JSON.stringify({ at: Date.now(), place: null, track: savedTrack }));
  assert.equal(page.listening.hidden, false);
  await page.respond({ place: null, track: null });
  assert.equal(page.listening.hidden, true);
  assert.equal(page.classes.has('is-live'), false);
  assert.equal(JSON.parse(page.values.get('pulse-status-v1')).track, null);
});

for (const cached of ['invalid JSON', JSON.stringify({ at: Date.now() - 180000, track: savedTrack })]) {
  test(`invalid or expired cache waits for live data (${cached === 'invalid JSON' ? 'corrupt' : 'expired'})`, async () => {
    const page = musicClient(cached);
    assert.equal(page.listening.hidden, true);
    await page.respond({ place: null, track: savedTrack });
    assert.equal(page.listening.hidden, false);
  });
}

test('a cached playing flag expires before the cached song does', () => {
  const page = musicClient(JSON.stringify({
    at: Date.now() - 90000, place: null, track: { ...savedTrack, playing: true, ago: null },
  }));
  assert.equal(page.listening.hidden, false);
  // Last seen live when the snapshot was taken, so it ages from there.
  assert.equal(page.fields['.listening-hint'].textContent, 'Last Played · 1 minute ago');
});

test('a failed first beat keeps the visit uncounted until one succeeds', async () => {
  const requests = [], values = new Map(), beats = [];
  const window = { addEventListener() {} };
  window.top = window.self = window;
  let status = 500;
  vm.runInNewContext(client, {
    window,
    document: {
      visibilityState: 'visible', addEventListener() {},
      querySelector: selector => selector === '.listening'
        ? { hidden: true, classList: { remove() {} }, querySelector() { return null; } }
        : null,
    },
    sessionStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    requestAnimationFrame(fn) { fn(); }, clearInterval() {},
    setInterval(fn) { beats.push(fn); return beats.length; },
    async fetch(url, options) {
      requests.push(JSON.parse(options.body));
      return { ok: status === 200, status, async json() { return { place: null, track: null }; } };
    },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(values.get('pulse-counted'), undefined);
  status = 200;
  beats[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(values.get('pulse-counted'), '1');
  beats[0]();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requests, [{ fresh: true }, { fresh: true }, { fresh: false }]);
});
