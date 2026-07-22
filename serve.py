"""Static dev server for the site: python3 serve.py, then open localhost:8712.

Plain `python -m http.server` sends Last-Modified and no Cache-Control, so
browsers cache both the HTML and the CSS heuristically — an edit then needs
a hard reload per page to show up, and a page you haven't hard-reloaded
keeps rendering an old copy. no-store makes every request go to disk.

This serves flat files only. The one server-side piece — POST /api/detect,
which the FloorSense demo calls — is a Cloudflare Pages Function, so testing
that path needs `npx wrangler pages dev .` instead.
"""
import http.server

PORT = 8712


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


http.server.test(HandlerClass=Handler, port=PORT, bind='')
