/* Homepage status: 30-day visits, location, Spotify and the deployed commit.
   Every top-level page registers a visit; pages with status widgets refresh
   them while visible. The strip stays hidden until a response arrives. */
(() => {
  const ENDPOINT = '/api/pulse';
  const BEAT_MS = 30000;      // refresh visible location, music and visit totals
  const SEEN_KEY = 'pulse-counted';

  // Embedded demos should not register independent visits.
  if (window.top !== window.self) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Only the first page load in this session requests a visit write. D1
  // still deduplicates by day and visitor if storage is unavailable.
  let firstBeat = true;
  try {
    firstBeat = !sessionStorage.getItem(SEEN_KEY);
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch (e) {
    // Status remains available when the browser blocks site storage.
  }

  /* ---- Painting -------------------------------------------------------- */

  const strip = document.querySelector('.pulse');
  const fields = {};
  if (strip) {
    for (const el of strip.querySelectorAll('[data-pulse]')) {
      fields[el.dataset.pulse] = el;
    }
  }

  /* The other corner. It comes down the same response, so it is drawn here
     rather than in a file of its own — a second script would mean a second
     request for one line of text. Independent of the strip above: either
     corner can be present, absent, or down without the other noticing. */
  const whereat = document.querySelector('.whereat');
  const placeEl = whereat && whereat.querySelector('.whereat-place');
  const cityEl = whereat && whereat.querySelector('.whereat-city');
  const areaEl = whereat && whereat.querySelector('.whereat-hint');

  /* And the third: what's on Spotify, bottom-left. Same response, same
     rules — either corner can be present, absent, or down alone. */
  const listening = document.querySelector('.listening');
  const hintEl = listening && listening.querySelector('.listening-hint');
  const trackEl = listening && listening.querySelector('.listening-track');
  const byEl = listening && listening.querySelector('.listening-by');
  const artistEl = listening && listening.querySelector('.listening-artist');

  /* Absent is a real state here: no venue means the corner is empty rather
     than showing a placeholder. The sentence itself carries no timestamp —
     "Last seen at" holds whether the reading is a minute or a month old.
     The age lives in the hover hint, next to the neighbourhood, and only
     while the server still sends one: past five days `ago` arrives null
     and the hint says just the neighbourhood, or nothing at all. */
  let placeShown = null;

  /* The hint's indent is a tab past where the city (or, citiless, the
     venue) begins. Measured, not styled: only layout knows where in the
     sentence that is, and offsetLeft is relative to the fixed corner
     itself, which is the box the hint's margin counts from.

     It can only be read while the corner has a layout box, and on phones
     it doesn't: below 40rem the stylesheet hides the corner outright, so
     clearing the [hidden] attribute changes nothing and every offset is
     zero. So the measurement isn't tied to the text. A zero leaves the
     stylesheet's fallback indent standing and is retried on every beat,
     and retried at once when the viewport crosses the breakpoint — a phone
     turned to landscape is wider than 40rem, and the corner appears there
     with whatever indent was last measured. Without the retry it would
     appear with the fallback and keep it until the venue changed. */
  let hintAnchor = null;   // the span the hint tabs in under; null when no hint
  let hintIndented = false;
  function indentHint() {
    if (!areaEl || !hintAnchor || hintIndented) return;
    const x = hintAnchor.offsetLeft;
    if (!x) return;
    areaEl.style.marginLeft = `${x + 15}px`;
    hintIndented = true;
  }
  const narrow = matchMedia('(max-width: 40rem)');
  if (narrow.addEventListener) narrow.addEventListener('change', indentHint);

  /* The hover hint under the sentence: "South Beach · 2 days ago". The
     neighbourhood is one step finer than the sentence, the age one step
     more honest about it. Either half may be missing — a town with no
     mapped neighbourhoods, or a place seen so long ago the server has
     stopped sending its age — and an empty string collapses the hint
     entirely (see .whereat-hint:empty), so there's nothing to open. */
  function placeHint(place) {
    return [place.area, place.ago != null ? since(place.ago) : null]
      .filter(Boolean).join(' · ');
  }

  function paintPlaceHint(place) {
    if (!areaEl) return;
    const text = placeHint(place);
    if (areaEl.textContent !== text) areaEl.textContent = text;
  }

  function paintPlace(place) {
    if (!whereat) return;

    if (!place || !place.label) {
      whereat.hidden = true;
      whereat.classList.remove('is-live');
      placeShown = null;
      return;
    }

    // "in Eugene" — the part that orients a reader who has never been within
    // a thousand miles of the venue. Proper nouns need no dictionary entry.
    const city = place.city ? ` in ${place.city}` : '';
    // Rewriting identical text every 30s would restart the fade for nothing,
    // and the rendered strings are exactly what "changed" means here.
    const key = `${place.label}|${city}|${place.area || ''}`;
    if (key === placeShown) {
      paintPlaceHint(place);   // the age moves even when the place doesn't
      indentHint();            // a no-op once it has succeeded
      return;
    }
    placeShown = key;

    placeEl.textContent = place.label;
    // The city name gets a span of its own so the hint below can find it:
    // the hint sits tabbed in under "San Francisco", not under the "in".
    let cityName = null;
    if (cityEl) {
      cityEl.textContent = place.city ? ' in ' : '';
      if (place.city) {
        cityName = document.createElement('span');
        cityName.textContent = place.city;
        cityEl.appendChild(cityName);
      }
    }
    paintPlaceHint(place);

    if (whereat.hidden) whereat.hidden = false;

    // New text, new measurement: the anchor is the city span when there is
    // one, else the venue. Read after the corner is unhidden, since inside
    // display:none every offset is zero (see indentHint).
    hintAnchor = placeHint(place) ? (cityName || placeEl) : null;
    hintIndented = false;
    if (areaEl) areaEl.style.marginLeft = '';
    indentHint();

    requestAnimationFrame(() => whereat.classList.add('is-live'));
  }

  /* "3 hours ago", at the coarsest unit that isn't zero. The server sends an
     age in seconds (already relative, nothing to reconcile with this clock);
     anything under a minute is close enough to call now. */
  function since(s) {
    const d = Math.floor(s / 86400);
    if (d >= 1) return d === 1 ? '1 day ago' : `${d} days ago`;
    const h = Math.floor(s / 3600);
    if (h >= 1) return h === 1 ? '1 hour ago' : `${h} hours ago`;
    const m = Math.floor(s / 60);
    if (m >= 1) return m === 1 ? '1 minute ago' : `${m} minutes ago`;
    return 'just now';
  }

  /* Mirrors paintPlace: null hides the corner, identical content doesn't
     restart the fade. The line is just the song — "<note> title by artist",
     plain text, no link; whether it's live lives in the hover hint above
     it, which says "Now Playing" while it is and "Last Played · 3 hours ago"
     once it isn't — "Played", not "Song", because a remembered podcast
     episode can hold the corner too. */
  let trackShown = null;
  function paintTrack(track) {
    if (!listening) return;

    if (!track || !track.title) {
      listening.hidden = true;
      listening.classList.remove('is-live');
      trackShown = null;
      return;
    }

    /* The hint rewrites on every beat, outside the dedupe below: the song
       hasn't changed but its age has, and a stale "1 hour ago" on an open
       hover is exactly the kind of wrong a live corner can't afford. Plain
       text swap, no animation to restart. */
    if (hintEl) {
      hintEl.textContent = track.playing
        ? 'Now Playing'
        : `Last Played${track.ago != null ? ` · ${since(track.ago)}` : ''}`;
    }

    const key = `${track.title}|${track.artist}`;
    if (key === trackShown) return;
    trackShown = key;

    trackEl.textContent = track.title;
    if (byEl) byEl.hidden = !track.artist;
    if (artistEl) artistEl.textContent = track.artist || '';

    if (listening.hidden) {
      listening.hidden = false;
      requestAnimationFrame(() => listening.classList.add('is-live'));
    }
  }

  // Digits are held at a fixed width so the strip never re-lays out under a
  // number that grows — the padding is the layout, not decoration.
  const PAD = { visits: 6 };
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
        body: JSON.stringify({ fresh }),
      });
      if (!res.ok) throw new Error(`pulse: ${res.status}`);
      const data = await res.json();

      // Before the early return below: the corners are independent, and
      // a page carrying one but not the others still gets what it has.
      paintPlace(data.place);
      paintTrack(data.track);

      if (!strip) return;
      tick('visits', data.visits);
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

  // Keep personal status current only on pages that display it.
  const hasStatus = !!(strip || whereat || listening);
  function schedule() {
    clearInterval(timer);
    if (!hasStatus || document.visibilityState !== 'visible') return;
    timer = setInterval(() => beat(false), BEAT_MS);
  }

  document.addEventListener('visibilitychange', () => {
    if (hasStatus && document.visibilityState === 'visible') beat(false);
    schedule();
  });

  beat(firstBeat);
  schedule();

  /* ---- The commit row --------------------------------------------------
     The diff stat itself is static — stamped into the markup at deploy time,
     since the page can't know what commit it is — but its age is a clock
     reading, so it's written here from the commit's timestamp and refreshed
     on every beat: an open hover saying "2 hours ago" at hour three is the
     kind of wrong a live corner can't afford. */
  const commitEl = strip && strip.querySelector('[data-committed]');
  const ageEl = commitEl && commitEl.querySelector('.pulse-age');
  function paintAge() {
    if (!ageEl) return;
    const at = Date.parse(commitEl.dataset.committed);
    if (Number.isNaN(at)) return;
    // "18 min ago", not "18 minutes ago": the label is uppercased and
    // letter-spaced, and the long form runs wider than the strip. Hours
    // and days keep their full word — they're short enough already. Only
    // this label; the music corner's hint says "minutes" and stays that way.
    ageEl.textContent = since(Math.max((Date.now() - at) / 1000, 0))
      .replace(/ minutes? /, ' min ');
  }
  paintAge();
  if (ageEl) setInterval(paintAge, BEAT_MS);
})();
