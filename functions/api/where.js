// Cloudflare Pages Function: POST /api/where
//
// Feeds the one line in the bottom-left corner of the home page: the last
// public place I was seen at. A launchd job on my Mac (tools/where/) beats
// here every few minutes while I'm logged in, carrying a coordinate; this
// decides whether that coordinate is somewhere worth saying out loud, and
// writes a venue name if — and only if — it is.
//
// This is the only authenticated write on the site. Everything else here is
// either public or writes rows that are anonymous by construction; this one
// writes a sentence about a specific person, so it takes a bearer token.
//
// Required bindings (wrangler.toml / Pages dashboard):
//   PULSE_DB     D1 database, schema in schema.sql at the repo root
//   WHERE_TOKEN  random string, secret. Shared with the Mac reporter.
//   WHERE_MUTE   optional. Semicolon-separated "lat,lon,radius" circles that
//                are always silent regardless of what OSM says is there.
//
// The coordinate's whole life is inside this function: it arrives in the
// request body, it is handed to OpenStreetMap to ask what building it falls
// in, and it goes out of scope. It is never written to the database, never
// logged, and never returned. What survives is a venue name that already
// passed the allowlist below — see schema.sql for why that distinction is
// the entire design.

// One endpoint, deliberately. The obvious reliability move is to list the
// public mirrors and fail over between them, and it was tried: kumi.systems
// and private.coffee both serve a trivial query in under two seconds and both
// time out on this one. The difference is is_in — computing which areas
// contain a point is expensive, and the smaller mirrors won't do it.
//
// So a mirror list would buy nothing except twenty-odd seconds of waiting
// before returning the same failure. When the main instance is having a bad
// afternoon the honest answer is 503, which leaves the last known place on
// the page and has the Mac try again in three minutes.
const OVERPASS = "https://overpass-api.de/api/interpreter";
// How close a venue has to be before I'll claim to be in it. This is the
// only distance test, and it's done by Overpass rather than here on purpose:
// "around" measures to a feature's actual geometry, so it means 50m from the
// edge of a building or a park. Measuring here instead would mean measuring
// to a centroid, which is the same thing for a cafe pinned as a point and
// wildly wrong for anything with area — the centroid of Golden Gate Park is
// half a kilometre from most of the people standing in it.
const NEARBY_M = 50;

// How far to look for a neighbourhood label node. Neighbourhoods in OSM are
// mostly place=* *nodes* — a pin near the area's centre, not a polygon — so
// unlike venues there is no geometry to measure to and no is_in to ask;
// nearest-centre is the only test there is. The radius has to reach a big
// district's centre from its edge (SoMa's node sits 700m from South Park)
// without being so wide that a town with no neighbourhoods borrows one from
// the city next door.
const AREA_M = 1500;

// One attempt, and then the whole lookup.
//
// Overpass sits behind its own CDN, and that CDN intermittently answers 521
// — the edge saying it could not reach the backend at all. Measured from a
// Worker it came back on about a third of calls in an afternoon, against
// none at all from a laptop on a home connection, so it is not this query
// being expensive: it is the hop from one CDN to another. A 521 arrives in
// under two seconds, which makes giving up after one attempt the wrong
// trade — it spends the cheapest possible failure and then leaves the corner
// three minutes stale waiting for the next beat. Three attempts inside one
// request take a beat's odds of failing from roughly a third to a fiftieth.
//
// The budget is the real limit and the attempt count is a formality: the
// Mac's curl gives up at twenty seconds, so everything here has to be done
// before then. That falls out about right, because the failures worth
// retrying are the fast ones — an attempt that burns the full LOOKUP_MS has
// nearly nothing left to hand the next one, and shouldn't.
const LOOKUP_MS = 12000;
const LOOKUP_BUDGET_MS = 15000;
const LOOKUP_TRIES = 3;

// ---- What counts as somewhere public -------------------------------------
//
// An ALLOWLIST, not a denylist, and that direction is the whole privacy
// story. A denylist publishes everywhere I haven't thought to exclude yet —
// the first time I sit in a clinic waiting room, or a lawyer's office, or a
// venue type nobody anticipated, it goes on the internet. An allowlist
// publishes nothing until I've decided the category is fine, so the default
// for anywhere new, anywhere unmapped, and anywhere private is silence.
//
// Home needs no entry here and no coordinate anywhere in this repo: a house
// contains no cafe, so nothing matches, so nothing is written. "At home" is
// not a state this system can represent — it's the absence of a write.
//
// Editing these is the intended way to tune the feature. Adding a key is
// deliberately a code change rather than a setting, because every addition
// is a decision about what the internet gets to know.
const ALLOW = {
  amenity: ["cafe"],
  shop: ["coffee"],
};

// ---- What silences everything inside it ----------------------------------
//
// The allowlist alone is not enough, and there's a concrete case that proves
// it: Costco's food court is tagged amenity=fast_food in OSM, which is a
// perfectly correct tag and sails straight through ALLOW. Malls, hospitals,
// airports and schools all contain legitimately-tagged cafes the same way.
//
// So before any candidate is considered, Overpass is asked what *contains*
// the point (is_in), and if any containing feature carries one of these tags
// the answer is silence no matter what sits inside it. Containment rather
// than proximity is deliberate: a cafe across the street from a supermarket
// is still a cafe, and only a cafe genuinely inside one is a problem.
const VETO = {
  shop: [
    "wholesale", "department_store", "supermarket", "mall", "doityourself",
    "hardware", "car", "car_repair", "furniture", "storage_rental",
  ],
  amenity: [
    "hospital", "clinic", "doctors", "dentist", "pharmacy", "place_of_worship",
    "school", "kindergarten", "police", "fire_station", "courthouse", "prison",
    "social_facility", "veterinary", "funeral_directors", "nursing_home",
  ],
  building: [
    "residential", "house", "apartments", "dormitory", "detached",
    "semidetached_house", "terrace", "bungalow",
  ],
  // Any value at all is disqualifying for these two — there is no kind of
  // office or healthcare facility I want announced.
  office: true,
  healthcare: true,
};

// ---- Places OSM doesn't know ---------------------------------------------
//
// Manual pins: venues I want the corner to be able to name that
// OpenStreetMap hasn't mapped, or maps under a neighbour's name. OSM data
// only ever gets as good as its last volunteer, and a strip-mall coffee
// shop that opened last year routinely isn't in it at all.
//
// A pin in range wins outright; distance only ranks pins against each
// other. Letting OSM candidates out-compete a pin was tried first and lost
// to its own premise: the pin exists because OSM's answer in that
// neighbourhood is wrong, and Qamaria proved it — a mislocated footprint
// named for a café at a different address sat closer to every Wi-Fi fix
// than the real storefront, and closer-wins kept publishing it. Two of my
// venues inside one 50m circle is finer than the positioning can resolve
// anyway, so the hand-placed name owns the circle. Pins also resolve
// without Overpass (so they survive the outages that blank real lookups)
// and skip the veto list — a deliberate entry beats a categorical rule.
//
// In code rather than configuration, same as ALLOW and VETO: each pin is a
// decision about what the internet gets to know, and the diff is the audit
// trail. Nothing here is sensitive the way WHERE_MUTE's circles are — a pin
// only exists to be published.
const PINS = [
  // Storefront coordinate from Qamaria's own ordering page, not from a
  // Wi-Fi fix — a pin placed where the fixes happen to land just bakes one
  // day's drift into the contest.
  { name: "Qamaria Yemeni Coffee Co.", city: "Pleasanton", lat: 37.6996289, lon: -121.9034303 },
  // OSM has this one at the right address but the wrong tag — amenity=restaurant,
  // not amenity=cafe — so it fails ALLOW outright rather than losing a distance
  // contest. Coordinate is OSM's own node for the venue (102 South Park St).
  { name: "Caffe Centro", city: "San Francisco", lat: 37.7817082, lon: -122.3942534 },
];

export async function onRequestPost({ request, env }) {
  try {
    const db = env.PULSE_DB;
    if (!db) return json({ error: "PULSE_DB is not bound" }, 500);

    // A missing token would otherwise mean "no auth required", which is the
    // one failure mode this endpoint must never have: it would let anyone on
    // the internet write a sentence about where I am onto my own home page.
    // Refuse to work rather than work insecurely.
    if (!env.WHERE_TOKEN) {
      console.error("WHERE_TOKEN is not set — /api/where is disabled");
      return json({ error: "Not configured" }, 503);
    }
    const auth = request.headers.get("Authorization") || "";
    if (!safeEqual(auth.replace(/^Bearer\s+/i, ""), env.WHERE_TOKEN)) {
      return json({ error: "Forbidden" }, 403);
    }

    let body = {};
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "Bad request" }, 400);
    }

    // The panic button. Also what the reporter sends when it's uninstalled,
    // so removing the job takes the widget down with it rather than leaving
    // a stale place sitting on the page.
    if (body.clear === true) {
      await db.prepare("DELETE FROM place").run();
      return json({ published: false, cleared: true }, 200);
    }

    // "Still here." The Mac sends this instead of a coordinate when it hasn't
    // moved since the last successful publish, which is most of the time —
    // sitting somewhere for three hours is one lookup and sixty of these.
    // It touches the timestamp and nothing else, so it can't change where I
    // am, only confirm it. That's what keeps the corner reading as live
    // while I'm there and starts it counting the moment I leave.
    if (body.stay === true) {
      const r = await db
        .prepare("UPDATE place SET seen = unixepoch() WHERE id = 1")
        .run();
      return json({ published: (r.meta?.changes ?? 0) > 0 }, 200);
    }

    const lat = Number(body.lat);
    const lon = Number(body.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
        Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return json({ error: "Bad request" }, 400);
    }

    // Explicit silent circles, for the cases OSM can't be expected to encode
    // — living above a cafe being the obvious one, where every tag in the
    // world says "cafe" and the honest answer is still nothing. Kept in an
    // environment variable rather than in git, because a list of coordinates
    // I want hidden is exactly as sensitive as the thing it's hiding.
    if (isMuted(lat, lon, env.WHERE_MUTE)) {
      return json({ published: false, reason: "muted" }, 200);
    }

    const found = await resolve(lat, lon);

    // A lookup that didn't happen is not the same answer as a lookup that
    // found nothing, and conflating them would be a real bug: the reporter
    // caches "nothing publishable here" and stops asking about a spot, so a
    // rate-limited Overpass would permanently blank a cafe I'm sitting in.
    // 503 keeps curl failing on the Mac, which is what makes it retry the
    // same coordinate on the next beat instead of writing off the place.
    if (!found.ok) return json({ error: "Lookup unavailable" }, 503);
    if (!found.venue) return json({ published: false }, 200);
    const venue = found.venue;

    // The venue name repeating its own city ("Eugene Public Library in
    // Eugene") reads like a stutter, so the city stays home in that case.
    const city =
      found.city && !venue.toLowerCase().includes(found.city.toLowerCase())
        ? found.city
        : null;
    // Same stutter guard for the area: "Blue Bottle Coffee" hinting "South
    // Beach" earns its keep; "South Park Cafe" hinting "South Park" doesn't.
    const area =
      found.area && !venue.toLowerCase().includes(found.area.toLowerCase())
        ? found.area
        : null;

    await db
      .prepare(
        `INSERT INTO place (id, label, city, area, seen)
           VALUES (1, ?1, ?2, ?3, unixepoch())
           ON CONFLICT(id) DO UPDATE SET label = excluded.label,
                                         city  = excluded.city,
                                         area  = excluded.area,
                                         seen  = excluded.seen`,
      )
      .bind(venue, city, area)
      .run();

    return json({ published: true, label: venue, city, area }, 200);
  } catch (error) {
    console.error("Where Error:", error);
    return json({ error: "Internal Server Error" }, 500);
  }
}

// Coordinate in, venue name out. The only place coordinates are ever used,
// and they leave no trace behind them.
//
// Returns { ok: false } when the question couldn't be asked and
// { ok: true, venue } when it could — including { venue: null }, which is a
// real and common answer meaning "nowhere here is worth mentioning".
async function resolve(lat, lon) {
  // The nearest in-range pin, before anything goes over the network. It
  // still has to survive the distance contest at the bottom; what it never
  // has to survive is Overpass having a bad afternoon.
  const pin = nearestPin(lat, lon);

  // One round trip does both jobs. is_in returns every area containing the
  // point — the veto check. The nwr(around) clauses return named features
  // nearby, already filtered to the allowlist by the query itself so the
  // response stays small.
  //
  // Because those clauses only ever match allowed tags, any veto-tagged
  // element in the response can only have come from is_in, which is to say
  // it contains me. That's what makes the single pass below sound.
  const near = Object.entries(ALLOW)
    .map(([key, values]) =>
      `nwr(around:${NEARBY_M},${lat},${lon})["name"]["${key}"~"^(${values.join("|")})$"];`)
    .join("\n  ");

  // Two out statements, and the split is load-bearing. `out tags` emits no
  // geometry, so anything from is_in comes back with no lat and no center,
  // while everything from the around clauses carries one. That absence is
  // how the code below tells "this contains me" from "this is near me" —
  // Overpass has no other way to say it, and the difference decides which
  // name gets published when several are in range.
  // The neighbourhood label, in the same round trip. place=suburb is a big
  // city's named quarters (SoMa, the Mission), place=neighbourhood and
  // place=quarter the finer grain inside them (South Beach, Rincon Hill).
  // All three tiers are asked for and the nearest node of any tier wins —
  // see the selection below for why.
  const query = `[out:json][timeout:20];
is_in(${lat},${lon});
out tags;
(
  ${near}
  node(around:${AREA_M},${lat},${lon})["name"]["place"~"^(neighbourhood|quarter|suburb)$"];
);
out center tags;`;

  // 521, 429 and 504 are the ones to expect: the CDN unable to reach the
  // backend, a throttle, or a backend having a moment. Say so rather than
  // reporting an empty result — an empty result reads identically to
  // "there's nothing here", and the reporter caches that and stops asking.
  const payload = await askOverpass(query);
  if (!payload) {
    // With a pin in range there's still an answer worth giving: it can't be
    // beaten by candidates nobody got to see, and returning ok keeps the
    // reporter from retrying a lookup whose result we already hold.
    if (pin) return { ok: true, venue: pin.name, city: pin.city };
    return { ok: false };
  }

  const elements = payload.elements || [];

  // Veto first, and unconditionally for OSM candidates: if anything
  // containing this point is on the list, nothing Overpass returned is good
  // enough to override it. A pin walks past the veto on purpose — the veto
  // exists to catch categories nobody vetted, and a pin is nothing but
  // vetting.
  if (elements.some((el) => vetoed(el.tags))) {
    return { ok: true, venue: pin ? pin.name : null, city: pin ? pin.city : null };
  }

  // The city, for free. is_in already returned every administrative boundary
  // containing the point — city, county, state, country — so the name that
  // gives a faraway reader their bearings is sitting in the response we
  // already paid for. admin_level 8 is a municipality in most of the world;
  // the fallback down to 6 catches the places (Dublin, much of Asia) where
  // the city sits at a coarser level. Anything finer comes from the district
  // pass below, not from admin boundaries — most cities don't map their
  // quarters as boundaries at all.
  let city = null;
  let cityLevel = 0;
  for (const el of elements) {
    const tags = el.tags || {};
    if (tags.boundary !== "administrative" || !tags.name) continue;
    const lvl = Number(tags.admin_level);
    if (lvl >= 6 && lvl <= 8 && lvl > cityLevel) {
      city = tags.name;
      cityLevel = lvl;
    }
  }

  // The neighbourhood, when the city is big enough to have them. "Blue
  // Bottle Coffee in San Francisco" is true of half a dozen cafes; "South
  // Beach" is what narrows it down, and it feeds the hover hint rather than
  // the sentence — the city keeps orienting the faraway reader, the hint
  // answers the local's "which one". Nearest label node of any tier wins:
  // the tiers nest (South Beach sits inside SoMa), so the nearest node is
  // simply the finest area whose centre the fix is close to, and a town
  // with no place nodes at all gets no hint rather than a guess. See
  // AREA_M for why proximity is the only available test.
  let area = null;
  for (const el of elements) {
    const tags = el.tags || {};
    if (!tags.place || !tags.name) continue;
    if (!Number.isFinite(el.lat) || !Number.isFinite(el.lon)) continue;
    const m = metres(lat, lon, el.lat, el.lon);
    if (!area || m < area.m) area = { m, name: areaName(tags) };
  }
  area = area ? area.name : null;

  // Everything still standing is either within NEARBY_M of me or contains me
  // outright, so distance ranks candidates but never excludes them.
  //
  // Rank beats distance, because nearest-thing-wins picks embarrassingly
  // wrong names. Standing in Berkeley Public Library, the library contains
  // you while its little second-hand bookshop sits ten metres off, and pure
  // distance publishes "Friends' Store".
  let best = null;
  for (const el of elements) {
    const tags = el.tags || {};
    if (!tags.name || !allowed(tags)) continue;
    // No geometry means this came from is_in — see the query above.
    const contains = !Number.isFinite(el.lat) && !el.center;
    const p = el.center || el;
    const m = Number.isFinite(p.lat) && Number.isFinite(p.lon)
      ? metres(lat, lon, p.lat, p.lon)
      : Infinity;
    const r = rank(contains, el.type);
    if (!best || r < best.r || (r === best.r && m < best.m)) {
      best = { r, m, name: tags.name };
    }
  }
  // The pin's turn, above the tiers rather than in them: the tiers order
  // kinds of OSM evidence against each other, and a pin isn't OSM evidence
  // — it's me stating a fact the map lacks. See the note on PINS for why it
  // outranks even a closer OSM candidate. The derived city still fills in
  // when the pin doesn't carry its own, and the area rides along the same
  // way it does for an OSM venue.
  if (pin) {
    return { ok: true, venue: pin.name, city: pin.city || city, area };
  }

  // The city and area ride along only when there's a venue to anchor them —
  // on their own they'd turn "nothing worth saying" into a coarse tracker.
  return {
    ok: true,
    venue: best ? best.name : null,
    city: best ? city : null,
    area: best ? area : null,
  };
}

// The query, asked until it's answered or the budget runs out. Returns the
// parsed response, or null when Overpass never managed to give one.
//
// Every retry goes back to the same endpoint, which is not the mirror list
// this file rules out elsewhere and shouldn't grow into one: the mirrors
// can't serve is_in at all, so failing over to one buys a slower version of
// the same failure. What this retries is the endpoint that does work,
// through a CDN that intermittently doesn't.
async function askOverpass(query) {
  const deadline = Date.now() + LOOKUP_BUDGET_MS;
  let last = "network";

  for (let attempt = 0; attempt < LOOKUP_TRIES; attempt++) {
    const left = deadline - Date.now();
    if (left <= 0) break;

    const res = await fetch(OVERPASS, {
      method: "POST",
      // Overpass asks callers to identify themselves and throttles the ones
      // that don't. This is a handful of requests a day — only when I've
      // actually moved — but it should still say who it is.
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "zsaeed.com-where/1.0 (+https://zsaeed.com)",
      },
      body: new URLSearchParams({ data: query }),
      // Never past the deadline, so the last attempt can't overrun the
      // budget just because it started near the end of it.
      signal: AbortSignal.timeout(Math.min(LOOKUP_MS, left)),
    }).catch(() => null);

    // Overpass serves its own "server is probably too busy" notice as an
    // HTML body under a 200, so a success code isn't an answer until the
    // JSON parses. That case retries like any other failure.
    const payload = res && res.ok ? await res.json().catch(() => null) : null;
    if (payload) return payload;

    last = res ? res.status : "network";
    // A 4xx is not worth asking twice. 400 means the query itself is wrong,
    // and no amount of repetition fixes that; 429 means the slots are full,
    // and hammering is the one response guaranteed to keep them that way.
    // Dropped connections, timeouts and 5xx get another go.
    if (res && !res.ok && res.status < 500) break;
  }

  console.warn(`overpass unavailable: ${last}`);
  return null;
}

// Ordering candidates. Distance breaks ties within a tier but never crosses
// one, because nearest-thing-wins publishes the wrong name in exactly the
// situations that matter.
//
// The node/way split is the interesting tier. A way or relation is a mapped
// footprint, so being within 50m of one usually means being inside the
// building; a node is just a pin dropped somewhere in it. At Berkeley Public
// Library the library is a footprint 30m off and its little second-hand
// bookshop is a pin at 20m — by distance the bookshop wins, by shape the
// library does, and the library is the true answer.
function rank(contains, type) {
  if (contains) return 0;                   // inside beats everything
  if (type !== "node") return 1;            // a footprint beats a pin
  return 2;
}

// What to call an area. OSM's formal name is often longer than anything
// a person says — SoMa's node is name="South of Market", alt_name="SoMa" —
// so of the names the node offers, the shortest wins. old_name stays
// excluded on purpose: it's the one field that holds names nobody uses
// anymore.
function areaName(tags) {
  const names = [tags.name, tags.short_name, tags.alt_name]
    .filter(Boolean)
    .flatMap((n) => n.split(";"))
    .map((n) => n.trim())
    .filter(Boolean);
  return names.reduce((a, b) => (b.length < a.length ? b : a));
}

function allowed(tags = {}) {
  return Object.entries(ALLOW).some(([k, values]) => values.includes(tags[k]));
}

function vetoed(tags = {}) {
  return Object.entries(VETO).some(([k, values]) =>
    tags[k] != null && (values === true || values.includes(tags[k])));
}

// Equirectangular approximation. Exact enough by a wide margin at the tens of
// metres this compares, and it avoids a pile of trigonometry for a decision
// that is really "same building or not".
function metres(aLat, aLon, bLat, bLon) {
  const x = (bLon - aLon) * Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
  const y = bLat - aLat;
  return Math.sqrt(x * x + y * y) * 111320;
}

// The closest pin within NEARBY_M, or null. The same radius as the Overpass
// around: clauses on purpose — a pin is a candidate, not a zone, and it
// should be reachable from exactly as far away as any mapped venue is.
// Centre-distance is fine here where it wouldn't be for OSM features: a pin
// is a point I placed on a storefront, so it has no geometry to be wrong
// about.
function nearestPin(lat, lon) {
  let best = null;
  for (const p of PINS) {
    const m = metres(lat, lon, p.lat, p.lon);
    if (m > NEARBY_M) continue;
    if (!best || m < best.m) best = { name: p.name, city: p.city || null, m };
  }
  return best;
}

// "lat,lon,radius;lat,lon,radius" — malformed entries are skipped rather than
// throwing, because a typo here should cost one silent circle, not the
// endpoint.
function isMuted(lat, lon, spec) {
  if (!spec) return false;
  return String(spec).split(";").some((entry) => {
    const [a, b, r] = entry.split(",").map(Number);
    if (![a, b, r].every(Number.isFinite)) return false;
    return metres(lat, lon, a, b) <= r;
  });
}

// Constant-time compare, so a wrong token can't be sharpened one character at
// a time by watching how long the rejection takes.
function safeEqual(a, b) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
