# zainsaeed.com

A personal site, hand-written. No framework, no build step, no dependencies —
every page is a flat file the browser reads as-is. Deployed on Cloudflare Pages.

## Running it

```sh
python3 tools/serve.py        # http://localhost:8712
```

That serves `public/` and imitates the two Pages behaviours the site relies on:
`Cache-Control: no-store`, so an edit shows up on reload instead of needing a
hard refresh, and clean URLs, so `/work/personal` resolves to
`work/personal.html` locally exactly as it does in production.

Flat files only. The one server-side piece is `POST /api/detect` (the
FloorSense demo's model call), which is a Cloudflare Pages Function — to
exercise that path you need Wrangler and a Roboflow key:

```sh
cp .dev.vars.example .dev.vars   # then fill in ROBOFLOW_API_KEY
npx wrangler pages dev public
```

## Layout

`public/` is the document root: everything in it is served, nothing outside it
is. On Cloudflare Pages that is the **build output directory** — set it to
`public`, with no build command. `functions/` stays at the repo root, which is
where Pages looks for it regardless of the output directory.

```
public/                   the deployed site
  index.html                the landing page
  about.html                about, with the car illustration
  work/
    personal.html           projects built for myself
    contract.html           projects built under contract
    cool.html               a running collection

  assets/
    css/style.css           every page links this
    css/live-demo.css
    js/landing.js           landing-page behaviour only (hover cards, GitHub
                            calendar, pill outlines, the About transition)
    js/about.js             about-page behaviour only
    js/car-art.js           SVG path data for the car illustration
    js/live-demo.js         the thumbnail-to-fullscreen live demo component
    img/                    images the pages use, one folder per project

  demos/                  the live demos, one self-contained app each
    notch/                  recreation of the macOS notch utility     ── source
    floorsense/             floorplan detection (calls /api/detect)   ── source
    olander/                recreation of the AI sales agent          ── source
    unpak-site/             marketing site                            ── vendored
    unpak-dashboard/        the dashboard                             ── vendored
    papeagnet/              contract build                            ── vendored

functions/api/            Cloudflare Pages Functions
tools/serve.py            the local dev server
tools/vendor-rebase.sh    see below
```

Pages link with root-absolute paths (`/assets/css/style.css`,
`/demos/notch/`) so they resolve the same from `/` and from `/work/personal`.
Inside a demo, paths are relative to the demo, so each one is movable and runs
standalone.

### The three vendored demos

`unpak-site/`, `unpak-dashboard/` and `papeagnet/` are build output copied in
from their own repos — marked *vendored* above because they are not source, and
a few MB of minified Astro and Vite output shouldn't be mistaken for it.

**Don't edit them by hand.** Changes belong in the source repo; anything done
here is lost on the next copy-in.

**Re-run `tools/vendor-rebase.sh` after every copy-in.** Each was built with its
base path set to the repo root, so its output refers to `/unpak-site/…`,
`/papeagnet/…` and so on — root-absolute, and wrong here, where they are served
from `/demos/…`. The script rewrites those ~1,100 references and is idempotent.
The real fix is to set the base path in each source repo's build config, after
which the script can be deleted.

## Adding a live demo

Drop a thumbnail in `public/assets/img/<project>/preview.png`, then add a figure
to the relevant work page:

```html
<figure class="ld-thumb" data-live-demo="/demos/<project>/"
        data-bg="#fdfbf7" data-title="Project — live demo"
        tabindex="0" role="button"
        aria-label="Expand the live demo to fullscreen">
  <img src="/assets/img/<project>/preview.png" alt="...">
</figure>
```

`public/assets/js/live-demo.js` does the rest — it builds the expand mark, the
fullscreen overlay and the back control, boots the app in a hidden iframe, and
parks the running app on the thumbnail so the preview *is* the live thing. The
optional attributes are documented at the top of that file.

## Secrets

`.env` (Cloudflare account id and API token, for manual deploys) and
`.dev.vars` (`ROBOFLOW_API_KEY`, read by `wrangler pages dev`) are gitignored
and have never been committed. `.example` files show the shape. In production
the key lives in the Cloudflare Pages dashboard — it is never sent to the
browser, which is the entire reason `functions/api/detect.js` exists.
