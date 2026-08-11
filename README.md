# arche — ἀρχή

_the beginning, the origin, the first principle that everything else follows
from._

My personal website, live at **[zsaeed.com](https://zsaeed.com)**.

## Pages

- **Home** — the landing page
- **About** — a timeline of how I got here
- **Work / Personal** — what I built for myself
- **Work / Contract** — what I built for other people
- **Work / Cool** — a running collection of things I found interesting

## Demos

Each project on the work pages carries a live demo: a real app running in the
page, not a screenshot.

- **Notch** — a Dynamic Island for the Mac notch
- **FloorSense** — turns a floor plan image into an interactive model
- **Liquid Glass** — a WebGL refractive tab bar
- **Steward AI** — the hackathon dashboard, ported to the browser
- **Olander** — the AI sales agent
- **Unpak** — the marketing site and the dashboard
- **Papeagnet** — a contract build

## Live numbers

The home page carries three of them in its bottom-right corner: how long the
page took to load, how many people have visited in the last 30 days, and how
many are reading right now.

The first is measured in the browser and never leaves it. The other two come
from a Cloudflare D1 database, one row per person per day and one row per open
tab. A visitor is a salted hash of the day and the IP, so the same person
counts once however many times they reload, and the table can't be walked
backwards to an address — the IP is never written down, and the identifier a
person gets changes every midnight.

Hovering the live count opens a flag for each country currently reading, one
per country however many people are in it. That country is the only thing
either table records about anybody, and it rides on the row that expires with
the open tab — so it says where people are, never where they were.

Windows ships no flag glyphs — a Microsoft policy decision, not a missing
font — so those two letters come out as two boxed capitals there. Apple
platforms use their own flags and download nothing; everyone else is served a
flags-only webfont, scoped by `unicode-range` so it is fetched only when a
flag is actually on screen. The flags are
[Twemoji](https://github.com/twitter/twemoji) by Twitter, CC-BY 4.0.

Every page beats to `/api/pulse`; only the home page draws the answer.

## Project Structure

```
├── public/           # the deployed site, served as-is
│   ├── index.html    # landing
│   ├── about.html    # timeline
│   ├── work/         # personal, contract, cool, liquid-glass source
│   ├── assets/       # css, js, images, and i18n strings
│   └── demos/        # one self-contained app per folder
├── functions/api/    # the Cloudflare Pages Functions
├── wrangler.toml     # project name, output dir, D1 binding
├── schema.sql        # the two tables behind the live numbers
└── tools/            # dev server, in-place text editing, vendor rebase
```

## Running it

```sh
cp .dev.vars.example .dev.vars     # then fill both values in
npx wrangler d1 execute zainsaeed-pulse --local --file=schema.sql
npx wrangler pages dev
```

`.dev.vars` holds two secrets, neither of which is ever committed:
`ROBOFLOW_API_KEY` for the FloorSense demo, and `PULSE_SALT`, any long random
string — `openssl rand -hex 32` produces a good one. Both also have to exist
in the Pages dashboard under Settings → Environment variables for the live
site to work.
