"""Static dev server: python3 tools/serve.py [port], then open localhost:8712.
The port defaults to 8712; a positional argument overrides the PORT environment variable.

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

The status widgets preview public production data through a read-only bridge:
local tab IDs and visitor-counting flags are never sent upstream. FloorSense
detection and testing the Pages Functions themselves still need Wrangler.
"""
import http.server
import json
import os
import sys
import threading
import time
import urllib.request
import urllib.parse

PORT = int(sys.argv[1] if len(sys.argv) > 1 else os.environ.get('PORT', 8712))
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, os.pardir, 'public'))

# Edit mode. Requesting any page with ?edit gets tools/edit-mode.js injected;
# the file is served from tools/ under a name public/ has no route for, so the
# whole feature exists only here. Nothing about it is deployable, which is the
# point: public/ is the deployed site and it stays free of dev tooling.
EDIT_URL = '/__edit.js'
EDIT_FILE = os.path.join(HERE, 'edit-mode.js')
EDIT_TAG = b'<script src="' + EDIT_URL.encode() + b'"></script>\n</body>'

PULSE_URL = 'https://zsaeed.com/api/pulse'
PULSE_CACHE_SECONDS = 20
_pulse_lock = threading.Lock()
_pulse_cache = None
_pulse_at = 0


def public_pulse():
    """Read public status without recording a local visit or online presence."""
    global _pulse_cache, _pulse_at
    with _pulse_lock:
        if _pulse_cache is not None and time.monotonic() - _pulse_at < PULSE_CACHE_SECONDS:
            return _pulse_cache
        # Deliberately independent of the incoming body, cookies and headers.
        # pulse.js sends tab/fresh on production; local previews must not.
        request = urllib.request.Request(PULSE_URL, data=b'{}', method='POST',
            headers={'Content-Type': 'application/json', 'User-Agent': 'arche-local-preview'})
        with urllib.request.urlopen(request, timeout=10) as response:
            payload = json.load(response)
        _pulse_cache = json.dumps(payload).encode()
        _pulse_at = time.monotonic()
        return _pulse_cache


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ('/__scene', '/__scene/'):
            return self._send_bytes(open(os.path.join(HERE, 'scene-layers', 'inspector.html'), 'rb').read(), 'text/html')
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

    def do_POST(self):
        if urllib.parse.urlsplit(self.path).path != '/api/pulse':
            return self.send_error(404)
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            return self.send_error(400)
        if not 0 <= length <= 4096:
            return self.send_error(413)
        self.rfile.read(length)  # Consume, but never forward, the local heartbeat.
        try:
            payload = public_pulse()
        except (OSError, ValueError):
            return self._send_bytes(b'{"error":"Public status unavailable"}',
                                    'application/json', status=503)
        return self._send_bytes(payload, 'application/json')

    def _html_for(self, path):
        """The .html file this request resolves to, or None if it isn't one."""
        local = self.translate_path(path)
        if os.path.isdir(local):
            local = os.path.join(local, 'index.html')
        return local if local.endswith('.html') and os.path.isfile(local) else None

    def _send_bytes(self, body, ctype, status=200):
        self.send_response(status)
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


if __name__ == '__main__':
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler) as srv:
        print(f'serving {ROOT} at http://127.0.0.1:{PORT}/', file=sys.stderr)
        srv.serve_forever()
