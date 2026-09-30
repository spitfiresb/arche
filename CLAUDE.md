# arche (zsaeed.com)

Flat-file personal site served from `public/` on Cloudflare Pages (project
`zainsaeed`). Current pages are Home, `/projects/`, and the custom 404.
`functions/api/` contains the pulse, where, and spotify-poll Pages Functions.
`wrangler.toml` declares the output directory and D1 binding.

## Development and deployment

Run `python3 tools/serve.py` for http://localhost:8712. An optional positional
port or `PORT` overrides it. The server honors `public/_redirects`, supports
clean HTML URLs, and disables caching. `?edit` injects the local text editor.
`tools/agentation/` provides a separate optional annotation preview.

The preview bridges `POST /api/pulse` to public production status, cached for
20 seconds. It sends an empty body upstream and never forwards visitor-counting
flags, cookies, or headers. Other Pages Functions need Wrangler and `.dev.vars`.

The site does not auto-deploy. `tools/deploy.sh` stamps the footer commit link,
timestamp, and diff numbers from HEAD, deploys with Wrangler, and restores the
HTML on exit. `--dry-run` shows the stamped diff without deploying. It refuses
a dirty tree. The commit links to GitHub only when the repository is public
and HEAD is pushed; otherwise it links to the owner's profile.

## Current frontend

- `public/index.html` is hand-written: name, Bay Area clock, location/music,
  four work entries, two featured projects, social previews, and commit footer.
- Edit `PROJECTS` in `tools/build-work.py`, then run it to regenerate
  `public/projects/index.html`. Commit source and output together.
- `site.css` contains the shared layout, typography, theme, links, entrance
  animations, and 404 content styles. Home and Projects use a 576px outer column
  with fluid insets and self-hosted Hanken Grotesk.
- `home-socials.css` / `home-socials.js` implement LinkedIn/GitHub hover previews.
  Footer cards expand upward; on touch, the icons open profiles directly.
  Profile images use `data-src` and load on hover or keyboard focus. Keep their
  dimensions to reserve space. The email link sits immediately after GitHub.
- `home-status.css` styles inline location/music, the clock, and commit footer.
  `pulse.js` renders status and commit age; `home-clock.js` keeps Pacific time.
- `theme.js` restores and switches light/dark mode. `prefetch.js` warms internal
  destinations on pointer hover; navigation uses ordinary browser links.
- `home-back.css` styles the 404's return-home control.

The retired About page, project demos/detail pages, translations, and landscape
implementation are removed from this working tree. Git history preserves them;
`bottom-artwork` also preserves the earlier visible illustration. Do not restore
those features as dependencies of the current pages. Keep old-URL redirects:
they remain useful to bookmarks and inbound links.

## Visitor counting and status

Home and Projects register a visit through `POST /api/pulse`. Pages showing
location/music refresh every 30 seconds while visible. The API returns
`{ visits, place, track }`; visitor totals are no longer displayed, but counting
and storage remain active. `schema.sql` defines hits, place, and spotify.

- Keep `.whereat-line`, `.listening-line`, and hint spans. The location hint is
  measured against the city text after fonts, status, or layout change.
- Location/music hints expand on hover; touch shows details in normal flow.
- `PULSE_SALT` must exist in the Pages dashboard and `.dev.vars`. Without it,
  visitor hashes fall back to guessable unsalted hashes.
- Keep the top-level-window guard: embedded copies must not register visits.
- Recent status is restored from session storage, then revalidated. Null data
  hides its row; an unavailable endpoint leaves cached status intact.
- The footer commit is static HTML stamped by deployment; only its age changes
  in the browser. It does not depend on the status request succeeding.

Run `node --test tools/test-pulse.mjs` when changing the status client or API.
It checks the response contract, visit writes, caching, and polling behavior.
The one-time `tools/migrations/remove-online-presence.sql` removes the retired
online-presence table from existing databases; preserve it until migration is
confirmed for each environment.

## The music corner

A row in the home page's top-left status group: "<note icon> <track> by <artist>" — no
lede, nothing clickable. The hint opens below the sentence on hover:
"Now Playing" while something is live, "Last Played · 3 hours ago"
once it isn't. No reporter anywhere —
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
  *song*'s `played_at` — newest wins. Visitor traffic can't be trusted to
  supply the observation, so a scheduled GitHub Actions workflow
  (`.github/workflows/spotify-poll.yml`) POSTs `/api/spotify-poll` and runs
  the same refresh a visitor beat would. The endpoint is gated by
  `SPOTIFY_POLL_TOKEN` (Pages dashboard + `.dev.vars` + a GitHub repo secret
  of the same name). An episode that plays entirely between two looks is
  still lost — that floor is the API's, not ours.
- **One look per episode is enough, and that's deliberate.** A live refresh
  also stores `ends`, projected from `progress_ms` and `duration_ms`, so
  `remembered` can work out when an episode finished rather than assuming it
  finished the moment we happened to look. Seeing an hour-long episode five
  minutes in and never again used to age it by a full hour it never sat idle.
  The rules, in `remembered`: if playback had time to reach `ends` before we
  found it stopped, it ran to completion and `ends` is exact; if we caught
  the stop early it was cut short somewhere unknowable, so the last look
  stands and nothing is invented; and a song that started after the last look
  caps the answer either way, because an episode cannot still be running
  through a song. That last clamp is what stops a projection from outranking
  a song that genuinely played later — don't remove it.
- **Don't trust GitHub's cron.** Measured over 40 runs, `*/15` delivered 35%
  of its ticks: median gap 41 minutes, worst 111, and skipped ticks are
  dropped rather than queued. The schedule now asks for every 5 minutes at
  offset minutes, over-requesting to survive the drop rate and dodging the
  stampede at `:00`/`:15`/`:30`/`:45`. Re-measure before believing any
  interval here (`gh run list --workflow spotify-poll`). If it stops holding,
  the escalation is a Cloudflare Worker cron trigger poking the same
  endpoint, which costs a second deployable.
- **Ages leave the server, timestamps don't.** The payload is title,
  artists, a playing flag, and — for a finished track — `ago` in seconds,
  same convention as `place.ago`, feeding the hover hint. The absolute
  `played_at` stays behind; the browser gets a distance from now, never a
  clock time.

## The location corner

A row in the home page's top-left status group: "Last seen at <venue>". A LaunchAgent on my
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
- **The neighbourhood is a hover hint, not part of the sentence.** The same
  Overpass round trip also fetches `place=neighbourhood|quarter|suburb`
  nodes within 1500m; the nearest of any tier becomes `place.area`, drawn
  by `pulse.js` as the trailing span after the sentence — the
  sentence keeps "in San Francisco" for the faraway reader, the hint says
  "South Beach" for the local. Place nodes are label points, not polygons,
  so nearest-centre is the only possible test, and it's honest about its
  limits: it names the area whose centre is closest, which at a boundary can
  be the next area over. Of a node's `name`/`short_name`/`alt_name` the
  shortest wins ("South of Market" renders as "SoMa"). `AREA_CITIES` gates
  the whole thing to cities where a neighbourhood orients rather than
  pinpoints — currently San Francisco only; in a town the size of
  Pleasanton, "Hacienda" narrows things down more than the corner should.
  Towns outside the gate or with no place nodes get no hint (`:empty`
  collapses it), an Overpass outage on a pin lookup gets none either, and
  the stutter guard drops an area the venue name already contains. The `area` column postdates the `place` table —
  see the ALTER note in schema.sql before deploying this anywhere.
- **The venue never expires; only its age does.** `/api/pulse` always
  returns the `place` row, however old. `PLACE_AGE_TTL` (5 days) decides
  whether `ago` rides along: under it the hover hint reads "South Beach ·
  2 days ago", past it `ago` is null and the hint drops to the
  neighbourhood alone, so the corner says "Last seen at Blue Bottle" with no
  clock on it rather than "Last seen at Blue Bottle · 3 weeks ago". The
  sentence itself never carries the age.
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
- **Retry the one endpoint instead.** Overpass's own CDN answers 521 — "can't
  reach the backend" — on roughly a third of calls made from a Worker and
  almost none made from a laptop, so the flakiness is the CDN-to-CDN hop, not
  the query. Each 521 costs under two seconds, so `askOverpass` asks up to
  three times inside one request, bounded by `LOOKUP_BUDGET_MS` (15s) rather
  than by the attempt count — the Mac's `curl --max-time 20` is the ceiling
  everything here fits under. 5xx, timeouts and a 200 carrying Overpass's
  HTML "too busy" page all retry; 4xx doesn't, because a 400 is our query
  being wrong and a 429 is a throttle that hammering only prolongs.
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
