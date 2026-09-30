# arche — ἀρχή

_the beginning, the origin, the first principle that everything else follows
from._

My personal website, live at **[zsaeed.com](https://zsaeed.com)**.

## Pages

- **Home** — name and live status, Work and featured Projects lists, social links, and email contact.
- **Projects** — “View All Projects” opens the complete list at `/projects/`, with
  one sentence per project and a GitHub link when a repository is available.

The site has no About page or demos. Old URLs redirect
home or to the projects list. Edit `PROJECTS` in `tools/build-work.py` and run
`python3 tools/build-work.py` to rebuild the list; omit `github` or set it to
`None` for projects without a repository.

## Live numbers

The home page shows the last commit’s changes at the bottom right, opposite
LinkedIn and GitHub at the bottom left. The visitor count is no longer displayed;
the existing analytics API remains available.

The commit row is "+115 −13" in GitHub's green and red, and clicking it opens
the commit. The page can't know that about itself, so the deploy script
stamps the numbers, the timestamp and the link from `HEAD` right before
uploading, and puts the file back afterwards — the values in this repo are
placeholders. Hovering says how long ago that was, worked out in the
browser. If the repo is private, or the commit isn't pushed, the row links to
my GitHub profile instead: the commit page would be a 404 for everyone but
me. The visitor total comes from Cloudflare D1, with one row per person per
day. A visitor is a salted hash of the day and IP, so repeat visits on the
same day count once. The IP is never written down, and the identifier changes
every midnight.

Home and Projects call `/api/pulse` on load. The homepage refreshes its
location and Spotify status every 30 seconds while visible.

## Project Structure

```
├── public/           # the deployed site, served as-is
│   ├── index.html    # bio, Work and Projects lists, live status
│   ├── projects/         # the complete projects list (tools/build-work.py)
│   └── assets/       # css, js, images
├── functions/api/    # the Cloudflare Pages Functions
├── wrangler.toml     # project name, output dir, D1 binding
├── schema.sql        # visitor counts and personal status caches
└── tools/            # deploy script, dev server, in-place text editing,
                      # and where/ — the macOS location reporter
```

## Running it

Use the static preview server:

```sh
python3 tools/serve.py    # http://localhost:8712
```

`?edit` enables local text editing. The earlier illustration, About page, and
interactive project demos are recoverable from git history; `bottom-artwork`
also preserves the visible landscape layout. The current site has no scene
editor or illustration dependencies.

The location, music, and analytics widgets also work on this preview server:
it reads the public live site's status without registering local visitors
or forwarding browser cookies.
To test the Pages Functions themselves, use Wrangler:

```sh
cp .dev.vars.example .dev.vars     # then fill both values in
npx wrangler d1 execute zainsaeed-pulse --local --file=schema.sql
npx wrangler pages dev
```

`.dev.vars` holds the secrets, none of which are ever committed:
`PULSE_SALT` for the visitor hashes and `WHERE_TOKEN` for the location
reporter — both are any
long random string, and `openssl rand -hex 32` produces a good one. All of
them also have to exist in the Pages dashboard under Settings → Environment
variables for the live site to work.

## Deploying

The site doesn't deploy itself — the Pages project has no git integration,
so pushing to `main` changes nothing until this runs:

```sh
tools/deploy.sh              # stamp the commit row, then wrangler pages deploy
tools/deploy.sh --dry-run    # show what would be stamped, deploy nothing
```

It refuses a dirty tree, so what's live is always a commit. `gh` has to be
signed in, for the one call that checks whether the repo is public.

Deployment stamps the commit numbers, timestamp, and link in the footer.

After deploying the removal of the online indicator, clean up the unused table
in existing databases once (the current `schema.sql` does not create it):

```sh
npx wrangler d1 execute zainsaeed-pulse --remote --file=tools/migrations/remove-online-presence.sql
```

Use `--local` for a local database. This only drops the retired table; the visitor
total, location and Spotify data remain intact.

## The location corner

The top-left status group says where I was last seen, when that
somewhere was public. A LaunchAgent on my Mac takes a coarse CoreLocation fix
every three minutes and posts it to `/api/where`, which asks OpenStreetMap
what's there and writes a venue name only if it passes an allowlist of public
categories — cafés, restaurants, libraries. Everywhere else produces silence,
including home, which needs no configuration because a house contains no café.

Set it up once:

```sh
tools/where/install.sh        # builds, prompts for location access, loads the job
tools/where/install.sh --uninstall
```

The first run writes `~/.config/zsaeed-where.env` and stops so you can paste
in the same `WHERE_TOKEN` that's in the Pages dashboard. The second run asks
macOS for location access and installs the job.

What launchd runs lives in `~/.local/libexec/zsaeed-where/`, not in this
repo — `~/Desktop` is TCC-protected and a LaunchAgent can't execute anything
inside it. So edits to `report.sh` here take effect only after re-running
`install.sh`.

Coordinates never reach the database. They exist for a few milliseconds inside
the Function while it asks what building they fall in; the `place` table holds
one venue name and one timestamp, and nothing else.
