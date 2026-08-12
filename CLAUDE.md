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
- **The beacon has to stay out of iframes.** The home page keeps `/about?peek`
  open in one behind the folded corner, so a missing `window.top` guard in
  `pulse.js` double-counts every home visit.
- **Country belongs on `presence`, not `hits`.** Presence rows expire minutes
  after a tab closes; putting the country on the visit log instead would
  quietly turn a counter into a 30-day record of where people were.
- **Never add `Segoe UI Emoji` to the `.pulse-flags` stack.** It *does* have
  glyphs for the regional-indicator range — the boxed capitals — so naming it
  satisfies the lookup on Windows and stops the fallback to the bundled
  Twemoji font, which is the whole reason that font is there. The stack names
  `Apple Color Emoji` (Apple-only, has real flags, so a Mac downloads nothing)
  and then the webfont, and nothing else.

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
  entry anywhere: a house contains no café, so nothing matches.
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
  (a pin near you), and parks/gardens last — being inside Golden Gate Park
  says almost nothing about where you are, so it only wins when nothing else
  is in range. Distance breaks ties inside a tier and never across one.
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
