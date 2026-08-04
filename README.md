# zsaeed.com

A personal site, hand-written. No framework, no build step, no dependencies: every page
is a flat file the browser reads as-is. Deployed on Cloudflare Pages.

## Running it

```sh
python3 tools/serve.py        # http://localhost:8712
```

That serves `public/` and imitates the two Pages behaviours the site relies on:
`Cache-Control: no-store`, so an edit shows up on reload instead of needing a
hard refresh, and clean URLs, so `/work/personal` resolves to
`work/personal.html` locally exactly as it does in production.

### Editing the words

Add `?edit` to any page (`localhost:8712/work/personal?edit`) and every block
of text on it becomes editable in place. Click a line, change it, and a panel in
the corner tracks what you've touched. **Copy changes** puts a diff of just the
edits on your clipboard; **Copy all text** takes the whole page.

Nothing is written to disk and a reload discards the edits: copying is the way
out, and the diff is meant to be pasted into a chat for someone to apply. The
unit is the block, so a sentence wrapping a `<span class="stress">` is edited as
one paragraph with the tag left visible, rather than split around it.

This exists only in the dev server. `tools/edit-mode.js` sits outside `public/`
and is injected on the way out, so there is nothing to strip before deploying
and no way for it to reach production.

Flat files only. The one server-side piece is `POST /api/detect` (the
FloorSense demo's model call), which is a Cloudflare Pages Function. To
exercise that path you need Wrangler and a Roboflow key:

```sh
cp .dev.vars.example .dev.vars   # then fill in ROBOFLOW_API_KEY
npx wrangler pages dev public
```

## Layout

`public/` is the document root: everything in it is served, nothing outside it
is. On Cloudflare Pages that is the **build output directory**: set it to
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
    liquid-glass-code.html  the liquid-glass source, laid out to be taken

  assets/
    css/style.css           every page links this
    css/live-demo.css
    css/code.css            source pages only
    js/landing.js           landing-page behaviour only (hover cards, GitHub
                            calendar, pill outlines, the About transition)
    js/about.js             about-page behaviour only
    js/car-art.js           SVG path data for the car illustration
    js/live-demo.js         the thumbnail-to-fullscreen live demo component
    js/code-view.js         syntax highlighting and copy buttons for the
                            source pages; no library, a hand-rolled tokenizer
    img/                    images the pages use, one folder per project

  demos/                  the live demos, one self-contained app each
    notch/                  recreation of the macOS notch utility     ── source
    floorsense/             floorplan detection (calls /api/detect)   ── source
    olander/                recreation of the AI sales agent          ── source
    liquid-glass/           the WebGL liquid-glass tab bar            ── source
    steward-ai/             the Steward AI dashboard, browser port    ── source
    unpak-site/             marketing site                            ── vendored
    unpak-dashboard/        the dashboard                             ── vendored
    papeagnet/              contract build                            ── vendored

functions/api/            Cloudflare Pages Functions
tools/serve.py            the local dev server
tools/edit-mode.js        in-place text editing, injected by serve.py on ?edit
tools/vendor-rebase.sh    see below
```

Pages link with root-absolute paths (`/assets/css/style.css`,
`/demos/notch/`) so they resolve the same from `/` and from `/work/personal`.
Inside a demo, paths are relative to the demo, so each one is movable and runs
standalone.

### The three vendored demos

`unpak-site/`, `unpak-dashboard/` and `papeagnet/` are build output copied in
from their own repos, marked *vendored* above because they are not source, and
a few MB of minified Astro and Vite output shouldn't be mistaken for it.

**Don't edit them by hand.** Changes belong in the source repo; anything done
here is lost on the next copy-in.

**Re-run `tools/vendor-rebase.sh` after every copy-in.** Each was built with its
base path set to the repo root, so its output refers to `/unpak-site/…`,
`/papeagnet/…` and so on: root-absolute, and wrong here, where they are served
from `/demos/…`. The script rewrites those ~1,100 references and is idempotent.
The real fix is to set the base path in each source repo's build config, after
which the rebase half of the script can be deleted.

The same script then **prunes the handful of files a build emits that nothing
here can reach**: the social-preview image every page links absolutely at
`unpak.ai`, an unlinked blog page, a nested `404.html` that Pages never serves
in place of the root one, and the dashboard's login page, which sits behind a
`/api/engagement` call the demo shims to a 200. A copy-in brings them all back,
which is why the prune list lives in the script rather than in a one-off
deletion. The marketing pages are deliberately kept: they are reachable from
the nav, and clicking through them is what the demo is.

## Adding a live demo

Drop a thumbnail in `public/assets/img/<project>/preview.png`, then add a figure
to the relevant work page:

```html
<figure class="ld-thumb" data-live-demo="/demos/<project>/"
        data-bg="#fdfbf7" data-title="Project live demo"
        tabindex="0" role="button"
        aria-label="Expand the live demo to fullscreen">
  <img src="/assets/img/<project>/preview.png" alt="...">
</figure>
```

`public/assets/js/live-demo.js` does the rest. It builds the expand mark, the
fullscreen overlay and the back control, boots the app in a hidden iframe, and
parks the running app on the thumbnail so the preview *is* the live thing. The
optional attributes are documented at the top of that file.

## Search metadata

Notes that used to live as HTML comments in `<head>`. They are here instead:
anything in a served file is one Inspect Element away from a reader, and none
of this is for them.

**No comments in `public/**/*.html`.** Every page and `404.html` ship without
a single one. Explain things here, or in the CSS and JS, not in the markup
that goes over the wire. Where a page has to explain itself to a *reader*
with JavaScript off (`liquid-glass-code.html`'s empty source panel is the one
case), it says so in visible copy that `code-view.js` then replaces.

**One Person, referenced everywhere.** `index.html` declares a `Person` with
`@id` `https://zsaeed.com/#person`, alongside a `WebSite` and a `WebPage` in
one `@graph`. Every other page points at that `@id` rather than redeclaring
it: About as a `ProfilePage` whose `mainEntity` is that person, the three
work pages as a `CollectionPage` authored by them. Redeclaring instead of
referencing would read as several unrelated people who happen to share a name.

**`sameAs` is the load-bearing field.** The LinkedIn and GitHub URLs are what
fuse the three profiles into one entity; keep them in step with the links in
the markup whenever either changes. Every other field is there to
*disambiguate*: there is a novelist, a valuation director and a freelance
designer with this name. Fields that merely describe (job titles, prose bios,
self-asserted expertise) are not ranking inputs and get discounted, so they
were deliberately left out. If a field doesn't distinguish, don't add it.

**Descriptions state what the site is, not what its owner is.** No job title,
no seniority, nothing that dates or that someone else gets to dispute.

**`404.html` exists so Pages has a real 404 to serve.** Without it every
unknown path fell through to the home page with a `200`, which reads to a
crawler as an unbounded set of duplicate pages. `noindex` on it is
belt-and-braces on top of the status code.

**`/demos/*` is `noindex` via `X-Robots-Tag` in `public/_headers`, not a
`Disallow` in `robots.txt`.** A `Disallow` would stop crawlers fetching the
page at all, and a header they never fetch is a header they never obey.
Crawling stays open precisely so the header lands. Three of the demos are
vendored copies of sites that exist elsewhere, and the Unpak one would
otherwise compete with the real marketing site.

**`sitemap.xml` lists the real pages.** Add a page, add it there.

## Secrets

`.env` (Cloudflare account id and API token, for manual deploys) and
`.dev.vars` (`ROBOFLOW_API_KEY`, read by `wrangler pages dev`) are gitignored
and have never been committed. `.example` files show the shape. In production
the key lives in the Cloudflare Pages dashboard, and is never sent to the
browser, which is the entire reason `functions/api/detect.js` exists.
