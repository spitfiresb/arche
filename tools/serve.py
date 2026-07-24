"""Static dev server for the site: python3 tools/serve.py, then open localhost:8712.

Serves public/, the same directory Cloudflare Pages deploys, and imitates the
two Pages behaviours the site depends on:

  no-store      Plain `python -m http.server` sends Last-Modified and no
                Cache-Control, so browsers cache both the HTML and the CSS
                heuristically: an edit then needs a hard reload per page to show
                up, and a page you haven't hard-reloaded keeps rendering an old
                copy. no-store makes every request go to disk.

  clean URLs    Pages serves /work/personal out of work/personal.html, and the
                pages link that way throughout. Without this, every internal
                link would 404 locally while working in production, the worst
                kind of split between the two.

Add ?edit to any page to make its text editable in place; see edit-mode.js.

This serves flat files only. The one server-side piece (POST /api/detect,
which the FloorSense demo calls) is a Cloudflare Pages Function, so testing
that path needs `npx wrangler pages dev public` instead.
"""
import http.server
import os
import urllib.parse

PORT = int(os.environ.get('PORT', 8712))
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, os.pardir, 'public'))

# Edit mode. Requesting any page with ?edit gets tools/edit-mode.js injected;
# the file is served from tools/ under a name public/ has no route for, so the
# whole feature exists only here. Nothing about it is deployable, which is the
# point: public/ is the deployed site and it stays free of dev tooling.
EDIT_URL = '/__edit.js'
EDIT_FILE = os.path.join(HERE, 'edit-mode.js')
EDIT_TAG = b'<script src="' + EDIT_URL.encode() + b'"></script>\n</body>'


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == EDIT_URL:
            return self._send_bytes(open(EDIT_FILE, 'rb').read(),
                                    'text/javascript')
        if 'edit' in urllib.parse.parse_qs(parsed.query, keep_blank_values=True):
            page = self._html_for(parsed.path)
            if page:
                html = open(page, 'rb').read()
                if b'</body>' in html:
                    html = html.replace(b'</body>', EDIT_TAG, 1)
                return self._send_bytes(html, 'text/html')
        return super().do_GET()

    def _html_for(self, path):
        """The .html file this request resolves to, or None if it isn't one."""
        local = self.translate_path(path)
        if os.path.isdir(local):
            local = os.path.join(local, 'index.html')
        return local if local.endswith('.html') and os.path.isfile(local) else None

    def _send_bytes(self, body, ctype):
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

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
