/* The live numbers in the corner of the home page.

   Two of them come from the site itself, over /api/pulse: how many distinct
   people have visited in the last 30 days, and how many are reading right
   now. The third, load time, is measured here and never leaves the browser.

   This script runs on every page but only draws on the one that has the
   strip in it, so the counts cover the whole site while the corner stays
   empty everywhere else.

   The strip stays hidden until the first response lands. If the endpoint is
   unreachable there is no widget rather than a row of zeros, which would
   read as "nobody has ever been here" instead of "the counter is down". */
(() => {
  const ENDPOINT = '/api/pulse';
  const BEAT_MS = 30000;      // must stay under the server's 70s online window
  const TAB_KEY = 'pulse-tab';
  const SEEN_KEY = 'pulse-counted';

  /* The home page holds the About page open in an iframe behind the folded
     corner (see the .peel markup in index.html). That iframe is a real load
     of a real page, so without this every home visit would beat twice and
     show up as two people. */
  if (window.top !== window.self) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Blocking site data outright makes sessionStorage throw on access rather
     than hand back null, and this file is a single IIFE: one uncaught throw
     up here takes the whole strip down, and takes it down silently, since a
     widget that never appears looks exactly like a widget that isn't there.

     Falling back to a plain object costs one thing — the tab forgets its id
     when you move between pages, so it re-registers as a new tab and holds a
     second slot in the online count until the first one ages out. A minute of
     being double-counted, against the widget not existing. */
  const memory = {};
  const store = {
    get(key) {
      try {
        return sessionStorage.getItem(key);
      } catch (e) {
        return key in memory ? memory[key] : null;
      }
    },
    set(key, value) {
      try {
        sessionStorage.setItem(key, value);
      } catch (e) {
        memory[key] = value;
      }
    },
  };

  /* A v4 UUID, from the platform wherever it offers one. randomUUID needs a
     secure context, so it is simply absent over plain http — which never
     happens on the live site, but does the moment the dev server is opened
     from a phone on the same network, and the failure there is the whole
     strip vanishing rather than anything you'd notice as a bug.

     The shape matters as much as the randomness: the server checks tab ids
     against the v4 pattern and drops whatever doesn't match, so a bare hex
     string would be silently ignored and nobody would ever register as
     online. Hence the version and variant bits below.

     Math.random is the last resort and is fine here. This is a handle for
     telling one open tab from another, not a secret — nothing is authorised
     with it, and a collision costs one person off the online count. */
  function uuid() {
    const c = self.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    const b = c && c.getRandomValues
      ? c.getRandomValues(new Uint8Array(16))
      : Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
    b[6] = (b[6] & 0x0f) | 0x40;   // version 4
    b[8] = (b[8] & 0x3f) | 0x80;   // variant 1
    const h = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  /* One id per tab, not per person: sessionStorage is scoped to the tab, so
     the id survives navigation between pages but a second window is a second
     reader. It never identifies anyone — it's a random value the server uses
     only to tell one open tab from another, and it dies with the tab. */
  let tab = store.get(TAB_KEY);
  if (!tab) {
    tab = uuid();
    store.set(TAB_KEY, tab);
  }

  /* Whether this session has already asked to be counted. The server dedupes
     properly, by day and visitor, so this is only here to keep 120 heartbeats
     an hour from being 120 attempted writes. */
  const firstBeat = !store.get(SEEN_KEY);
  store.set(SEEN_KEY, '1');

  /* ---- Painting -------------------------------------------------------- */

  const strip = document.querySelector('.pulse');
  const fields = {};
  if (strip) {
    for (const el of strip.querySelectorAll('[data-pulse]')) {
      fields[el.dataset.pulse] = el;
    }
  }

  const flagRow = strip && strip.querySelector('.pulse-flags');

  /* A country's flag emoji is just its two letters moved into the regional
     indicator block at U+1F1E6 — "US" becomes the pair the font draws as one
     glyph. No lookup table and no images; the server sends "US" and this
     turns it into a flag. (Windows ships no flag glyphs at all, so there it
     degrades to the two letters in boxes, which still reads as a country.) */
  function flagOf(cc) {
    return String.fromCodePoint(
      ...[...cc].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
    );
  }

  // The set only changes when someone arrives or leaves, which is rare next to
  // how often we ask; rewriting it every beat would restart the fade for no
  // reason.
  let flagsShown = null;
  function paintFlags(list) {
    if (!flagRow) return;
    const key = (list || []).join(',');
    if (key === flagsShown) return;
    flagsShown = key;
    flagRow.textContent = (list || []).map(flagOf).join(' ');
  }

  // Digits are held at a fixed width so the strip never re-lays out under a
  // number that grows — the padding is the layout, not decoration.
  const PAD = { visits: 6, online: 3, load: 4 };
  const shown = {};

  function write(key, value) {
    const el = fields[key];
    if (!el) return;
    el.textContent = String(Math.round(value)).padStart(PAD[key] || 1, '0');
  }

  /* Numbers arrive by counting up to themselves rather than appearing. It
     costs nothing, and it's the difference between a number that was fetched
     and a number that's alive. Later changes (someone else opening the page)
     run the same way from wherever the display currently sits. */
  function tick(key, target) {
    if (!(key in fields)) return;
    const from = shown[key] ?? 0;
    shown[key] = target;
    if (reduced || from === target) return write(key, target);

    const ms = from === 0 ? 750 : 320;
    const start = performance.now();
    (function frame(now) {
      const t = Math.min((now - start) / ms, 1);
      // ease-out cubic: fast off the mark, settling onto the final digit
      write(key, from + (target - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(frame);
    })(start);
  }

  /* ---- The beat -------------------------------------------------------- */

  let live = false;
  let timer = 0;

  async function beat(fresh) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tab, fresh }),
      });
      if (!res.ok) throw new Error(`pulse: ${res.status}`);
      const data = await res.json();

      if (!strip) return;
      tick('visits', data.visits);
      tick('online', data.online);
      paintFlags(data.countries);
      if (!live) {
        live = true;
        strip.hidden = false;
        // on the next frame, so the fade has an initial state to leave from
        requestAnimationFrame(() => strip.classList.add('is-live'));
      }
    } catch (e) {
      /* Offline, rate-limited, or the endpoint is down. The strip simply
         doesn't appear, and the next beat will try again. */
    }
  }

  // Only while the tab is on screen: a backgrounded tab isn't someone
  // reading, and browsers throttle its timers into uselessness anyway. Coming
  // back beats immediately, so returning to the tab doesn't sit at a stale
  // count for half a minute.
  function schedule() {
    clearInterval(timer);
    if (document.visibilityState !== 'visible') return;
    timer = setInterval(() => beat(false), BEAT_MS);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') beat(false);
    schedule();
  });

  beat(firstBeat);
  schedule();

  /* ---- Load time -------------------------------------------------------
     Wall-clock from navigation start to the load event, which is what a
     reader actually waited through. Read after load has fired, or the entry's
     end timestamps are still zero. */
  if ('load' in fields) {
    addEventListener('load', () => {
      // one turn later: loadEventEnd is only written once the handler returns
      setTimeout(() => {
        const nav = performance.getEntriesByType('navigation')[0];
        if (!nav) return;
        const ms = Math.max(Math.round(nav.loadEventEnd - nav.startTime), 0);
        if (ms > 0) tick('load', ms);
      }, 0);
    });
  }
})();
