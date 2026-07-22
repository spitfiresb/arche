"""Static dev server for the site: python3 tools/serve.py, then open localhost:8712.

Serves public/ — the same directory Cloudflare Pages deploys — and imitates the
two Pages behaviours the site depends on:

  no-store      Plain `python -m http.server` sends Last-Modified and no
                Cache-Control, so browsers cache both the HTML and the CSS
                heuristically: an edit then needs a hard reload per page to show
                up, and a page you haven't hard-reloaded keeps rendering an old
                copy. no-store makes every request go to disk.

  clean URLs    Pages serves /work/personal out of work/personal.html, and the
                pages link that way throughout. Without this, every internal
                link would 404 locally while working in production — the worst
                kind of split between the two.

This serves flat files only. The one server-side piece — POST /api/detect,
which the FloorSense demo calls — is a Cloudflare Pages Function, so testing
that path needs `npx wrangler pages dev public` instead.
"""
import http.server
import os

PORT = int(os.environ.get('PORT', 8712))
ROOT = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, 'public'))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path):
        local = super().translate_path(path)
        # An extensionless path that doesn't exist is a clean URL:
        # /work/personal -> work/personal.html. Everything else falls through
        # untouched, so directories still resolve to their index.
        if not os.path.exists(local) and not os.path.splitext(local)[1]:
            if os.path.isfile(local + '.html'):
                return local + '.html'
        return local

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


http.server.test(HandlerClass=Handler, port=PORT, bind='')
