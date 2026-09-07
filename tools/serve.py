#!/usr/bin/env python3
"""Static preview of public/ with Cloudflare Pages' clean-URL rules, so
/work/contract opens work/contract.html and / opens index.html. No Pages
Functions: the live corners on the home page stay empty. For those use
`npx wrangler pages dev` (needs .dev.vars, see README).

    tools/serve.py [port]      # default 8123
"""
import http.server
import os
import sys
from urllib.parse import urlsplit

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path):
        path = urlsplit(path).path
        full = super().translate_path(path)
        if os.path.isdir(full):
            return full
        if not os.path.exists(full) and os.path.exists(full + '.html'):
            return full + '.html'
        return full

    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (self.command, args[0] if args else ''))


http.server.ThreadingHTTPServer.allow_reuse_address = True
with http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler) as srv:
    print(f'serving {os.path.abspath(ROOT)} at http://127.0.0.1:{PORT}/', file=sys.stderr)
    srv.serve_forever()
