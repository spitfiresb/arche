# arche (zsaeed.com)

Flat-file site served from `public/` on Cloudflare Pages (project name
`zainsaeed`). `functions/` at the repo root holds the two Pages Functions
(`POST /api/detect`, `POST /api/pulse`). `wrangler.toml` carries the project
name, the output directory, and the D1 binding.

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

Schema changes go to both databases — `--local` for dev, `--remote` for live:

```sh
npx wrangler d1 execute zainsaeed-pulse --remote --file=schema.sql
```
