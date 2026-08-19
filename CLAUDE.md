# arche (zsaeed.com)

Flat-file site served from `public/` on Cloudflare Pages (project name
`zainsaeed`). `functions/` at the repo root holds the three Pages Functions
(`POST /api/detect`, `POST /api/pulse`, `POST /api/where`). `wrangler.toml`
carries the project name, the output directory, and the D1 binding.

## Deployment

**The site does NOT auto-deploy.** The Pages project has no git integration —
pushing to `main` changes nothing on the live site. After pushing, deploy
manually:

```sh
npx wrangler pages deploy
```

No arguments: `wrangler.toml` declares both `pages_build_output_dir` and the
project name. (The old form, `pages deploy public --project-name zainsaeed`,
predates that file.)

Then verify at https://zsaeed.com (use `curl -L`; clean URLs like
`/work/contract` redirect).

## Local preview

Any static server over `public/` works, but it won't rewrite clean URLs —
hit `/work/contract.html` directly. For the Pages Functions, use
`npx wrangler pages dev` (needs `.dev.vars`, see README).

## The stats strip

The three numbers in the bottom-right of the home page. `pulse.js` runs on
every page and beats to `POST /api/pulse` on load and every 30s while the tab
is visible; only `index.html` contains the `.pulse` markup that draws the
result. Counts are stored in the `zainsaeed-pulse` D1 database (`schema.sql`).

Hovering a number opens its label; hovering the live count opens one flag per
country currently reading. The flags are `SELECT DISTINCT country` over the
presence rows inside the online window, so people are deduplicated by country
before they ever reach the browser, and the client turns each two-letter code
into an emoji by shifting its letters into the regional-indicator block.

Three things to remember when touching it:

- **`PULSE_SALT` must be set** in the Pages dashboard and in `.dev.vars`.
  Without it, the visitor hashes are a plain hash of an IP, which is
  enumerable over the whole IPv4 space and therefore not anonymous at all.
- **The beacon has to stay out of iframes.** Nothing on the site frames its
  own pages today (the old folded-corner About preview did), but the
  `window.top` guard in `pulse.js` stays: any future embed is a real page
  load, and every framed copy silently double-counts its visit.
- **Country belongs on `presence`, not `hits`.** Presence rows expire minutes
  after a tab closes; putting the country on the visit log instead would
  quietly turn a counter into a 30-day record of where people were.
- **Never add `Segoe UI Emoji` to the `.pulse-flags` stack.** It *does* have
  glyphs for the regional-indicator range — the boxed capitals — so naming it
  satisfies the lookup on Windows and stops the fallback to the bundled
  Twemoji font, which is the whole reason that font is there. The stack names
  `Apple Color Emoji` (Apple-only, has real flags, so a Mac downloads nothing)
  and then the webfont, and nothing else.

## The music corner

The bottom-left of the home page: "<note icon> <track> by <artist>" — no
lede, nothing clickable, the "by <artist>" pair a step smaller and greyer
than the title. Hovering opens a small grey hint above it, the same way
the stats opposite open their labels: "Now Playing" while something is
live, "Last Played · 3 hours ago" once it isn't. No reporter anywhere —
Spotify's own servers know what's playing, so `/api/pulse` pulls it and
the result rides back on the response every page is already fetching,
same as the venue. `pulse.js` draws it.

The one-row `spotify` table in D1 carries the whole connection: the refresh
token, a cached access token, and the last track as a small JSON blob.
Things to remember when touching it:

- **The refresh token lives in D1, not in an env var, and that's
  load-bearing.** This app's tokens expire 180 days after issue and Spotify
  may rotate them on any refresh; the Function writes the replacement back
  the moment that happens. A token in the dashboard is a token nobody
  rotates, and the corner would die silently in six months. If the token
  ever does die (`invalid_grant` in the logs), re-run
  `node tools/spotify/authorize.mjs` and seed the printed token into both
  databases.
- **Spotify is never on the request path.** `/api/pulse` serves whatever
  track is cached — even stale — and refreshes via `waitUntil` after the
  response is gone, at most once per 25s window regardless of traffic. A
  Spotify outage costs freshness, never latency, and a burst of visitors is
  still one Spotify call.
- **Only `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` are env vars**
  (dashboard + `.dev.vars`). Missing means the corner stays empty; nothing
  else breaks.
- **Podcasts count, but only because we ask — twice.** `currently-playing`
  pretends episodes don't exist unless the request says
  `additional_types=episode` — without it a playing podcast comes back as
  `item: null`, indistinguishable from silence. The show's name stands in
  for the artist. And Spotify's history endpoint doesn't record episodes at
  all, so a finished podcast survives only because we remember it ourselves:
  every refresh that sees something live stamps the cached blob with `seen`,
  and when playback stops that last observation competes with the last
  *song*'s `played_at` — newest wins. The stamp is only as fresh as the last
  beat that saw the episode playing, and visitor traffic can't be trusted to
  supply one, so a scheduled GitHub Actions workflow
  (`.github/workflows/spotify-poll.yml`) POSTs `/api/spotify-poll` every 15
  minutes and runs the same refresh a visitor beat would. The endpoint is
  gated by `SPOTIFY_POLL_TOKEN` (Pages dashboard + `.dev.vars` + a GitHub
  repo secret of the same name). An episode shorter than the poll interval
  can still slip through if no beat lands while it plays.
- **Ages leave the server, timestamps don't.** The payload is title,
  artists, a playing flag, and — for a finished track — `ago` in seconds,
  same convention as `place.ago`, feeding the hover hint. The absolute
  `played_at` stays behind; the browser gets a distance from now, never a
  clock time.

## The location corner

The bottom-left of the home page: "Last seen at <venue>". A LaunchAgent on my
Mac (`tools/where/`) takes a coarse CoreLocation fix every three minutes and
posts it to `POST /api/where`, which asks OpenStreetMap what's there and
writes a venue name only if it clears an allowlist. The result rides back on
the `/api/pulse` response, so the widget costs no extra request, and
`pulse.js` draws both corners.

The reporter has three states, and the middle one is the common one: moved →
send coordinates and a lookup happens; still in the same place → send
`{stay:true}`, which touches the timestamp and nothing else; still somewhere
unpublishable → send nothing at all. An evening at home is zero requests.

Things to remember when touching it:

- **`ALLOW` is an allowlist and must never become a denylist.** A denylist
  publishes every category nobody thought to exclude — the first clinic
  waiting room, the first lawyer's office. The allowlist makes silence the
  default for anywhere new, unmapped, or private, and it's why home needs no
  entry anywhere: a house contains no café, so nothing matches. It's
  currently coffee shops only (`amenity=cafe`, `shop=coffee`), by choice.
- **`PINS` in `where.js` is for venues OSM doesn't know.** A pin within
  `NEARBY_M` beats every OSM candidate; distance only ranks pins against
  each other. Closer-wins was tried and lost to a mislocated OSM footprint
  sitting nearer every Wi-Fi fix than Qamaria's real storefront — the pin
  exists because OSM is wrong there, so OSM can't be allowed to outvote it.
  Pins resolve without Overpass (they survive outages) and skip `VETO` (a
  deliberate entry beats a categorical rule). Pin coordinates come from the
  venue's own site, never from where fixes land. Adding one is a code
  change on purpose, same as `ALLOW`.
- **`VETO` is containment, via `is_in` — not proximity.** Costco's food court
  is legitimately tagged `amenity=fast_food` and sails straight through the
  allowlist; what stops it is that the *containing* way is `shop=wholesale`.
  Malls, hospitals and schools all hide allowed venues the same way. Doing
  this by proximity instead would silence every café across the street from
  a supermarket.
- **Distance filtering belongs in the Overpass query, not in JS.** `around:`
  measures to a feature's real geometry; measuring here means measuring to a
  centroid, which is right for a café pinned as a point and badly wrong for
  anything with area — Golden Gate Park's centroid is half a kilometre from
  most of the people standing in it. The JS distance is a *ranking* key only,
  never a filter.
- **Rank beats distance when choosing which name to publish.** Nearest-wins
  picks embarrassing names: at Berkeley Public Library the library is a mapped
  footprint 30m off and its second-hand bookshop is a pin at 20m, so distance
  alone publishes "Friends' Store". The order is: a feature containing the
  point, then a way/relation (a footprint you're probably inside), then a node
  (a pin near you). Distance breaks ties inside a tier and never across one.
- **Don't add Overpass mirrors.** It looks like the obvious reliability win
  and it isn't: `is_in` is expensive, and both kumi.systems and private.coffee
  serve a trivial query in under two seconds while timing out on this one. A
  mirror list buys twenty seconds of waiting before the same failure.
- **A failed lookup must not return `published:false`.** That's the same
  answer as "nothing here", and the reporter caches that answer and stops
  asking about the spot — so one rate-limited Overpass response would blank a
  café for as long as I sat in it. Lookup failures return 503, which keeps
  `curl -f` failing on the Mac and makes the next beat retry.
- **Coordinates never reach the database.** They live for a few milliseconds
  inside the Function and are never logged or returned. `place` holds one
  label and one timestamp — see the note in `schema.sql`.
- **`WHERE_TOKEN` must be set** in the Pages dashboard and `.dev.vars`. A
  missing token disables the endpoint (503) rather than defaulting open; this
  is the only authenticated write on the site, and unauthenticated it would
  let anyone write a sentence about where I am onto my own home page.

Two macOS traps, both of which cost real time to find once:

- **`locate` has to be an .app, not a bare binary.**
  `requestWhenInUseAuthorization()` reads
  `NSLocationWhenInUseUsageDescription` from the calling bundle's Info.plist
  and does nothing at all when it's absent — no dialog, no error, and no
  entry in System Settings to enable, because macOS doesn't consider it to
  have asked. A command-line executable has no Info.plist and so can never
  be granted location access. `install.sh` assembles `Locate.app` around it;
  don't "simplify" that back to plain `swiftc`.
- **launchd can't execute anything under `~/Desktop`.** This repo lives
  there, and Desktop is TCC-protected, so a LaunchAgent pointed into it dies
  with `Operation not permitted` on every fire. `install.sh` therefore builds
  and copies the two things launchd actually runs into
  `~/.local/libexec/zsaeed-where/`; the copies in `tools/where/` are sources.
  Editing `report.sh` in the repo does nothing until you re-run `install.sh`.

Rebuilding is not free, either: the location grant attaches to the signed
bundle, and a fresh build of identical source hashes differently, so an
unnecessary rebuild silently revokes the permission. `install.sh` skips the
build when the sources aren't newer; `--rebuild` forces it.

Schema changes go to both databases — `--local` for dev, `--remote` for live:

```sh
npx wrangler d1 execute zainsaeed-pulse --remote --file=schema.sql
```
