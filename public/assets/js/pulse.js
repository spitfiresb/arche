/* Homepage status: location, Spotify and the deployed commit.
   Every top-level page registers a visit; pages with status widgets refresh
   them while visible. Recent session data fills the status before revalidation. */
(() => {
  const ENDPOINT = '/api/pulse';
  const BEAT_MS = 30000;      // refresh visible location and music
  const SEEN_KEY = 'pulse-counted';
  const CACHE_KEY = 'pulse-status-v1';
  const CACHE_MS = 120000;

  // Embedded copies should not register independent visits.
  if (window.top !== window.self) return;

  // Only the first page load in this session requests a visit write. The
  // flag is set once a beat carrying it succeeds, so a failed first request
  // retries on the next beat or page load instead of dropping the visit. D1
  // still deduplicates by day and visitor if storage is unavailable.
  let uncounted = true;
  try {
    uncounted = !sessionStorage.getItem(SEEN_KEY);
  } catch (e) {
    // Status remains available when the browser blocks site storage.
  }

  /* ---- Painting -------------------------------------------------------- */

  const strip = document.querySelector('.pulse');
  // Location and music share one response but render independently.
  const whereat = document.querySelector('.whereat');
  const placeEl = whereat && whereat.querySelector('.whereat-place');
  const cityEl = whereat && whereat.querySelector('.whereat-city');
  const areaEl = whereat && whereat.querySelector('.whereat-hint');

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

  /* Align the detail with the actual city text. The status ancestor is
     hidden until .is-live is set, so measurements must follow that update.
     Re-measure after font/layout changes instead of caching the first result. */
  let hintAnchor = null;
  let hintFrame = 0;
  function indentHint() {
    if (!areaEl || !hintAnchor || whereat.hidden) return;
    const row = whereat.getBoundingClientRect();
    const anchor = hintAnchor.getBoundingClientRect();
    if (!row.width || !anchor.width) return;
    const scale = row.width / whereat.offsetWidth;
    const left = Math.max(0, (anchor.left - row.left) / scale);
    areaEl.style.marginLeft = `${left}px`;
  }
  function scheduleHintIndent() {
    if (hintFrame) return;
    hintFrame = requestAnimationFrame(() => {
      hintFrame = 0;
      indentHint();
    });
  }
  let hintObserver;
  if (whereat && areaEl) {
    hintObserver = new ResizeObserver(scheduleHintIndent);
    hintObserver.observe(whereat);
    window.addEventListener('resize', scheduleHintIndent);
    window.addEventListener('pageshow', scheduleHintIndent);
    if (document.fonts) {
      document.fonts.ready.then(scheduleHintIndent);
      document.fonts.addEventListener('loadingdone', scheduleHintIndent);
    }
  }

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
      scheduleHintIndent();
      return;
    }
    placeShown = key;

    placeEl.textContent = place.label;
    // Give the city its own anchor so the detail aligns under
    // "San Francisco", excluding the preceding "in".
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

    if (hintObserver && hintAnchor) hintObserver.unobserve(hintAnchor);
    hintAnchor = cityName || placeEl;
    if (hintObserver && hintAnchor) hintObserver.observe(hintAnchor);
    if (areaEl) areaEl.style.marginLeft = '';

    whereat.classList.add('is-live');
    scheduleHintIndent();
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
      listening.classList.add('is-live');
    }
  }

  // Paint both rows together before the intro animates. Never wait on the
  // network again just to revisit Home; still honor nulls in fresh responses.
  function restoreStatus() {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY));
      if (!cached || !Number.isFinite(cached.at)) return;
      const elapsed = Date.now() - cached.at;
      if (elapsed < 0 || elapsed > CACHE_MS) return;
      const age = value => value && ({
        ...value,
        ago: value.ago == null ? null : value.ago + elapsed / 1000,
      });
      paintPlace(age(cached.place));
      const track = age(cached.track);
      // An old snapshot is a last-known song, not proof it is still playing:
      // the last sighting of it live is as old as the snapshot itself.
      if (track && track.playing && elapsed > BEAT_MS) {
        track.playing = false;
        track.ago = elapsed / 1000;
      }
      paintTrack(track);
    } catch (_) {
      // Corrupt or blocked storage falls back to the normal live request.
    }
  }
  restoreStatus();

  /* ---- The beat -------------------------------------------------------- */

  let timer = 0;
  // A bfcache restore fires pageshow and visibilitychange together; one
  // request answers both.
  let inflight = null;

  function beat() {
    if (!inflight) inflight = send().finally(() => { inflight = null; });
    return inflight;
  }

  async function send() {
    const fresh = uncounted;
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fresh }),
      });
      if (!res.ok) throw new Error(`pulse: ${res.status}`);
      if (fresh) {
        uncounted = false;
        try { sessionStorage.setItem(SEEN_KEY, '1'); } catch (_) {}
      }
      const data = await res.json();
      try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
          at: Date.now(), place: data.place, track: data.track,
        }));
      } catch (_) {}

      // Each status row is independent; pages without them still count visits.
      paintPlace(data.place);
      paintTrack(data.track);

    } catch (e) {
      // Keep any cached status; the next beat will try again.
    }
  }

  // Keep personal status current only on pages that display it.
  const hasStatus = !!(whereat || listening);
  function schedule() {
    clearInterval(timer);
    if (!hasStatus || document.visibilityState !== 'visible') return;
    timer = setInterval(beat, BEAT_MS);
  }

  document.addEventListener('visibilitychange', () => {
    if (hasStatus && document.visibilityState === 'visible') beat();
    schedule();
  });
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    restoreStatus();
    if (hasStatus) beat();
    schedule();
  });

  beat();
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

  /* The footer rule overhangs the LinkedIn mark and the diff stat by the
     same padding, but a digit's box is wider than its ink: Hanken's figures
     are tabular, so a closing "1" sits 2px inside its box and a "6" half a
     pixel. Let the stat overhang by the last glyph's right side bearing so
     the red ink, not its box, matches the gap on the left. Canvas measures
     the same tabular glyph; letter-spacing trails the last glyph in the DOM,
     so it counts toward the advance. */
  const lastNum = commitEl && [...commitEl.querySelectorAll('.pulse-num')].pop();
  function trimInk() {
    const text = lastNum && lastNum.lastChild;
    if (!text || text.nodeType !== Node.TEXT_NODE || !text.length) return;
    const cs = getComputedStyle(lastNum);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = ctx.measureText(text.data.slice(-1));
    const trim = m.width + (parseFloat(cs.letterSpacing) || 0) - m.actualBoundingBoxRight;
    if (trim > 0 && trim < m.width / 2) strip.style.setProperty('--ink-trim', `${trim}px`);
  }
  if (lastNum && document.fonts) document.fonts.ready.then(trimInk);
})();
