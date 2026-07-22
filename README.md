# zainsaeed.com

A personal site, hand-written. No framework, no build step, no dependencies —
every page is a flat file the browser reads as-is. Deployed on Cloudflare Pages.

## Running it

```sh
python3 serve.py        # http://localhost:8712
```

The server sends `Cache-Control: no-store`, so an edit shows up on reload
instead of needing a hard refresh.

That serves flat files only. The one server-side piece is `POST /api/detect`
(the FloorSense demo's model call), which is a Cloudflare Pages Function — to
exercise that path you need Wrangler and a Roboflow key:

```sh
cp .dev.vars.example .dev.vars   # then fill in ROBOFLOW_API_KEY
npx wrangler pages dev .
```

## Layout

```
index.html            the landing page
about.html            about, with the car illustration
work-personal.html    projects built for myself
work-contract.html    projects built under contract
work-cool.html        a running collection

site/                 shared across the pages above
  style.css             every page links this
  landing.js            landing-page behaviour only (hover cards, GitHub
                        calendar, pill outlines, the About transition)
  about.js              about-page behaviour only
  car-art.js            SVG path data for the car illustration
  live-demo.{js,css}    the thumbnail-to-fullscreen live demo component

demos/                apps written for this site, embedded as live demos
  notch/                recreation of the macOS notch utility
  floorsense/           the floorplan detection app (calls /api/detect)
  olander/              recreation of the AI sales agent

assets/               images the pages use, one folder per project
functions/api/        Cloudflare Pages Functions
serve.py              the local dev server

unpak-site/           compiled output — see below
unpak-dashboard/
papeagnet/
```

### The three compiled directories

`unpak-site/`, `unpak-dashboard/` and `papeagnet/` are build output copied in
from their own repos. Two rules:

**Don't edit them by hand.** Changes belong in the source repo; anything done
here is lost on the next copy-in.

**They cannot be moved.** Each was built with its base path baked in — the
Astro and Vite output references `/unpak-site/…`, `/papeagnet/…` and so on as
root-absolute URLs across hundreds of files. Nesting them under a parent
directory silently breaks all three demos. They have to sit at the repo root
under exactly these names, or be rebuilt from source with a new base.

## Adding a live demo

Drop a thumbnail in `assets/<project>/preview.png`, then add a figure to the
relevant work page:

```html
<figure class="ld-thumb" data-live-demo="demos/<project>/"
        data-bg="#fdfbf7" data-title="Project — live demo"
        tabindex="0" role="button"
        aria-label="Expand the live demo to fullscreen">
  <img src="assets/<project>/preview.png" alt="...">
</figure>
```

`site/live-demo.js` does the rest — it builds the expand mark, the fullscreen
overlay and the back control, boots the app in a hidden iframe, and parks the
running app on the thumbnail so the preview *is* the live thing. The optional
attributes are documented at the top of that file.

## Secrets

`.env` (Cloudflare account id and API token, for manual deploys) and
`.dev.vars` (`ROBOFLOW_API_KEY`, read by `wrangler pages dev`) are gitignored
and have never been committed. `.example` files show the shape. In production
the key lives in the Cloudflare Pages dashboard — it is never sent to the
browser, which is the entire reason `functions/api/detect.js` exists.
