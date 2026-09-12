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
tools/deploy.sh            # stamp the commit row, then wrangler pages deploy
tools/deploy.sh --dry-run  # show what would be stamped, deploy nothing
```

The script refuses a dirty tree, works out the last commit's diff stat,
timestamp and URL from git, writes them into the commit row in
`public/index.html`, runs `npx wrangler pages deploy`, and restores the file
on exit whatever happens. Running `npx wrangler pages deploy` by hand still
works (`wrangler.toml` declares the output directory and project name) but
ships the placeholder commit row.

The name is followed by a gray Last update link. The same script
stamps its `time[data-deployed]` with the deployment time in UTC, separate
from the commit timestamp, and points the link at the deployed revision.
The local source keeps a dash as its placeholder. Use `tools/deploy.sh`
so this date updates even when redeploying an unchanged commit.

Then verify at https://zsaeed.com (use `curl -L`; clean URLs like
`/work/contract` redirect).

## Local preview

`reformatting` is the combined development branch: the illustration branch's
history, source artwork and scene tools are merged here. `main` remains the
production baseline. Use one preview server: `python3 tools/serve.py` on
`http://localhost:8712`; an optional positional port or `PORT` overrides it.

`tools/serve.py` serves `public/` with Cloudflare's clean-URL rule, so
`/work/notch` resolves the way it does live. Any other static server works
but needs the `.html`. The preview server bridges `POST /api/pulse` to the
public production response, caching it for 20 seconds. It always sends an
empty body upstream and never forwards visitor-counting flags, cookies
or headers, so local previews do not register visits. Other Pages
Functions still need `npx wrangler pages dev` (needs `.dev.vars`, see README).

The same server exposes `/__scene` for the preserved illustration layer
inspector and `?edit` for in-place text previews, with no-store responses.
The homepage uses the panorama inside an inline SVG with a separate cabin-light
layer. `home-cabin.css` adds amber window tint, bloom and gentle flickering;
reduced motion keeps the glow steady. Panorama and light share the same viewBox
and responsive crop in `site.css`. The layer sources and older
scene/theme scripts are retained for future illustration work, but are not
loaded by the homepage; editing the layer manifest only updates the inspector.
Do not re-enable the old viewport-fitting script or three-column stylesheet
when changing the illustration: the current layout lives in `site.css`.

## The pages

The homepage stylesheet is `site.css`: a 638px outer column with 30px
side padding and Hanken Grotesk on charcoal (#1a1a1a). Homepage text follows
benji.org's scale: 14px with a 20px line height for the name, update date,
project heading, titles and About link. Project descriptions use 12px / 17px;
hovering or keyboard-focusing a project keeps it white and dims the others.
Live status readouts
use 13–14px text and smaller hover labels.
The name uses weight 500 and regular text 460. Profile-preview cards retain
their own LinkedIn/GitHub typography.
The home page has a centered, content-width header with Zain Saeed above
Last update, both aligned to the same left edge, and no interests paragraph.
It keeps main's centered expanding social cards
(`home-socials.css` and `home-socials.js`), and bracketed About link.
One Projects heading introduces seven projects in a two-column grid,
with short descriptions and subtle row rules. Entries fill left to right;
below 460px the grid becomes one column, except on short screens where
two columns conserve height. There are no category labels.
Each entry links directly to its project at `/work/<slug>`. Unpak links to
`/work/unpak`, containing only its System, Dashboard and Website sections. The landscape uses the static
`lookout-panorama-v2.png` from the former `home-illustration` branch,
anchored at the bottom of the viewport behind the copy. Both the body and
landscape blend container have an opaque charcoal background, so the image's
black sky blends into the page grey. The homepage is one viewport with no
scrolling; short screens use tighter spacing. Location, music and analytics
share `.home-status`, styled by `home-status.css`: location and music on
the top left, metrics on the top right. Hover details expand beneath their
readouts. Below 1160px the two columns take space above the name. Each widget
appears when its data arrives. No language UI or translation script is loaded.
The right metrics use an 8px gap; desktop left widgets keep 12px.
`home-status.js` measures the centered header so the left widgets can extend
to 24px before it, instead of clipping at a fixed width.
The site uses self-hosted Hanken Grotesk variable fonts, with existing sizes and weights.
Project pages load main's original `style.css`, preserving their copy,
technical specifications, demo sizes and alternating side-by-side layouts.
`project-pages.css` preserves each band's original left/right orientation after
splitting the collection. The six single-section projects have no sidebar gutter.
Unpak alone keeps a fixed left table of contents (System, Dashboard, Website),
with `toc.js` moving the active dot on scroll or anchor navigation.
`project-navigation.css` reserves its sidebar gutter at every width.
All nine content bands live in `tools/project-bands.html`, originally copied
from main at 07c5768. There is no footer clock or cross-project navigation.
`/about` preserves main's original timeline,
stickman/rope animation, car artwork and language behavior. It uses `style.css`,
`about.js`, `car-art.js`, and `i18n.js` with the dictionaries in `assets/i18n/`;
keep this page independent of the homepage redesign. All page-level back links
use the shared `home-back.css` return-arrow + “home” control: gray at rest,
white on hover or keyboard focus. The
home link sits 80px from the top and left on desktop, with the project rail
aligned below it at 168px. At widths up to 900px, the link uses 24px left /
32px top insets and the rail starts at 100px. The
project pages are generated: `tools/build-work.py` holds page metadata and reads
`tools/project-bands.html` as the single source for their content. Edit the source,
run the script, and commit both source and output. The homepage list is hand-written
and links to the seven project pages. `/work/` is a compact index with no demos;
`work-redirect.js` preserves old collection fragment links. Former Unpak page URLs
redirect to the matching section of `/work/unpak`. `_redirects` retains the older
category redirects (`/work/personal`, `/work/contract`, `/work/cool`).

All project pages use the original demo framing (`live-demo.js`, `live-demo.css`,
and `diagram-expand.js`), with main's 40px corners and desktop zoom. Unpak uses the
original dark system map. The About page and homepage keep their own layouts.

## The stats strip

The home page’s top-right metrics show visits in the last 30 days and the
last commit’s diff stat.
`pulse.js` calls `POST /api/pulse` once per page load; pages with status
widgets refresh every 30s while visible. Only `index.html` draws the result. Counts are stored in the `zainsaeed-pulse` D1
database (`schema.sql`).

The commit row is static: "+142 −16" in GitHub's green and red, the whole
row a link, and its timestamp in `data-committed`. `tools/deploy.sh` stamps
all three from HEAD at deploy time; the values in git are placeholders. Only
the age is computed, in the browser, for the hover label. The link is the
commit when the repo is public and the commit is pushed, and the GitHub
profile otherwise — a private repo's commit page is a 404 to everyone but
its owner, so the row links to the one page guaranteed to open. The check
is one `gh repo view` call on the deploying machine, never at request time.

Hovering a number opens its label. Requests only carry a `fresh` flag to
register a visit, and the API returns `{ visits, place, track }`.
`schema.sql` defines hits, place and spotify. After deploying this version,
apply `tools/migrations/remove-online-presence.sql` once to existing databases
with `wrangler d1 execute ... --file=...`; it removes only the retired table.

Things to remember when touching it:

- **Location/music sit top left and metrics top right.** Keep
  `.whereat-line`, `.listening-line` and the hint spans: `pulse.js` uses
  these for the location indent and metadata. Hover reveals location/music
  ages and commit age; touch displays the details directly.
  The status group remains available at narrow widths.
- **`PULSE_SALT` must be set** in the Pages dashboard and in `.dev.vars`.
  Without it, the visitor hashes are a plain hash of an IP, which is
  enumerable over the whole IPv4 space and therefore not anonymous at all.
- **The beacon has to stay out of iframes.** Nothing on the site frames its
  own pages today (the old folded-corner About preview did), but the
  `window.top` guard in `pulse.js` stays: any future embed is a real page
  load, and every framed copy silently double-counts its visit.

Run `node --test tools/test-pulse.mjs` when changing the API or browser status
client; it checks the response contract, visit writes and polling behavior.

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

## The Notch demo

The Notch band on `/work/cool` embeds `public/demos/notch-v2/` — one
self-contained file that recreates the app in the browser and then *runs
itself*: a 25-second loop walks a drawn cursor through Now Playing, the
"Saved in" playlist panel, a live Claude Code session (already under way
when the loop opens, so the spinner is in the pill from the first frame),
Clawd's completion sprint, and then a ⇧⌘4 drag over a Claude window on the
desktop that ends in the screenshot toast. Nothing in it responds to the
visitor — no buttons, no hover, no keys — so it reads as a video without
being one.

- **It's an `.ld-inline` iframe, not an `.ld-thumb`.** A thumb only runs the
  demo once you click through to fullscreen, which is no good for something
  whose whole point is that it plays on its own.
- **Every size is the app's own point value**, scaled once with `--u`; the
  header comment lists the timings it mirrors. Changing `PANEL_W_FRAC` is
  how far the camera is pushed in, and 0.52 is the ceiling: past that the
  menu bar (which scales too) overflows the frame.
- **It pauses when nobody's looking.** A loop that never ends would
  otherwise animate in a background tab or below the fold; `onScreen()`
  checks `document.hidden` and the iframe's own rect in the parent.
- **The playlist slide is a FLIP, not a transition.** Toggling a playlist
  rebuilds the list, and rebuilt nodes have no memory of where they were, so
  `togglePlaylist` measures every row first and puts each one back before
  releasing it. The app gets the same slide for free — one `ForEach` spans
  both sections there, so a toggle is a pure reorder.
- `public/demos/notch/` is the previous, interactive edition, kept for
  comparison. Nothing links to it.

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
