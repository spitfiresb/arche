#!/usr/bin/env python3
"""Build one page per project, preserving the original project bands.

Unpak groups System, Dashboard and Website with its own section navigation.
Edit project-bands.html for content, then run python3 tools/build-work.py.
"""
from pathlib import Path
from html import escape
import re
import sys

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
OUT = ROOT / 'public' / 'work'

BACK = '''  <a class="back home-back" href="/" aria-label="Back to the home page">
    <svg class="home-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M8 8 3 13 8 18M3 13h13a5 5 0 0 0 0-10h-2"/>
    </svg>
    <span>home</span>
  </a>'''

PROJECTS = [{'slug': 'steward-ai',
  'title': 'Steward AI',
  'date': '2026-01',
  'desc': "A desktop app that lets businesses understand their employees' AI usage. Winner at NexHacks '26."},
 {'slug': 'unpak',
  'title': 'Unpak',
  'date': '2026-04',
  'desc': 'The Unpak system, dashboard, and website: mapping how companies work and where AI can help.'},
 {'slug': 'floorsense',
  'title': 'FloorSense',
  'date': '2025-11',
  'desc': 'Computer vision that reads architectural floorplans, with correction tools on top of the '
          'detections.'},
 {'slug': 'ai-sales-agent',
  'title': 'AI Sales Agent',
  'date': '2026-04',
  'desc': 'A chat agent for a Bay Area distribution company that answers questions from their ERP in plain '
          'language.'},
 {'slug': 'ag-analytics',
  'title': 'Agricultural Analytics Platform',
  'date': '2025-11',
  'desc': "Geospatial analytics for Oregon's largest equipment dealer, used by over 1,500 employees across "
          'six states.'},
 {'slug': 'notch',
  'title': 'Notch',
  'date': '2026-05',
  'desc': 'A macOS utility that lives in the display notch: music, playlists, Claude sessions, screenshots.'},
 {'slug': 'liquid-glass',
  'title': 'Liquid Glass',
  'date': '2026-07',
  'desc': "My implementation of Apple's Liquid Glass: a WebGL lens that slides between nav tabs."}]


def head(p):
    url = f"https://zsaeed.com/work/{p['slug']}"
    title = f"{p['title']} - Zain Saeed"
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{p['desc']}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{p['desc']}">
<meta property="og:type" content="article">
<meta property="og:url" content="{url}">
<meta property="og:site_name" content="Zain Saeed">
<meta property="og:locale" content="en_US">
<meta name="author" content="Zain Saeed">
<link rel="canonical" href="{url}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "CreativeWork",
  "@id": "{url}#webpage",
  "url": "{url}",
  "name": "{p['title']}",
  "description": "{p['desc']}",
  "datePublished": "{p['date']}",
  "isPartOf": {{ "@id": "https://zsaeed.com/#website" }},
  "author": {{ "@id": "https://zsaeed.com/#person" }}
}}
</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@1,6..72,400;1,6..72,500&display=swap">
<link rel="preload" href="/assets/fonts/InterVariable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/style.css">
<link rel="stylesheet" href="/assets/css/live-demo.css">
<link rel="stylesheet" href="/assets/css/project-navigation.css">
<link rel="stylesheet" href="/assets/css/project-pages.css">
<script src="/assets/js/transition.js"></script>
<link rel="stylesheet" href="/assets/css/home-back.css">
</head>'''


UNPAK_SECTIONS = [('unpak-system', 'System'), ('unpak-dashboard', 'Dashboard'), ('unpak-website', 'Website')]


def load_bands():
    source = (Path(__file__).parent / 'project-bands.html').read_text()
    matches = list(re.finditer(r'^      <li id="([^"]+)">', source, re.M))
    bands = {}
    for i, match in enumerate(matches):
        slug = match.group(1)
        end = matches[i + 1].start() if i + 1 < len(matches) else len(source)
        band = source[match.start():end].strip()
        # Preserve the side each demo occupied in the original collection.
        reverse = ' class="band-reversed"' if i % 2 else ''
        band = band.replace(f'<li id="{slug}">',
            f'<li id="{slug}"{reverse} tabindex="-1" aria-labelledby="{slug}-heading">', 1)
        band = band.replace('class="band-title"', f'class="band-title" id="{slug}-heading"', 1)
        bands[slug] = band
    expected = {p['slug'] for p in PROJECTS if p['slug'] != 'unpak'} | {s for s, _ in UNPAK_SECTIONS}
    assert set(bands) == expected, 'Project metadata and source bands must agree'
    return bands


def section_nav():
    items = '\n'.join(f'        <li class="toc-item"><a class="toc-link" href="#{slug}">{title}</a></li>'
                      for slug, title in UNPAK_SECTIONS)
    return f'''  <nav class="toc" aria-label="Unpak sections">
    <div class="toc-track">
      <ul>
{items}
      </ul>
      <span class="toc-dot" aria-hidden="true" hidden></span>
    </div>
  </nav>'''


def project_page(project, bands):
    unpak = project['slug'] == 'unpak'
    slugs = [s for s, _ in UNPAK_SECTIONS] if unpak else [project['slug']]
    content = '\n'.join(bands[s] for s in slugs)
    scripts = ['/assets/js/live-demo.js']
    if unpak:
        scripts += ['/assets/js/toc.js', '/assets/js/diagram-expand.js']
    scripts += ['/assets/js/pulse.js']
    script_tags = '\n'.join(f'  <script src="{src}" defer></script>' for src in scripts)
    return f'''{head(project)}
<body class="page work project-detail{' collection' if unpak else ''}">
{BACK}
{section_nav() if unpak else ''}
  <main>
    <h1 class="visually-hidden">{escape(project['title'])}</h1>
    <ul class="bands">
{content}
    </ul>
  </main>
{script_tags}
</body>
</html>
'''


def redirect_page(slug, label):
    destination = '/work/unpak#' + slug
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{label} - Zain Saeed</title>
<link rel="canonical" href="https://zsaeed.com/work/unpak">
<meta http-equiv="refresh" content="0;url={destination}">
</head>
<body><a href="{destination}">Continue to Unpak: {label}</a></body>
</html>
'''


def index_page():
    items = '\n'.join(f'      <li><a class="work-project" href="/work/{p["slug"]}"><span class="work-title">{escape(p["title"])}</span><span class="work-chevron" aria-hidden="true"></span></a></li>' for p in PROJECTS)
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Projects - Zain Saeed</title>
<link rel="canonical" href="https://zsaeed.com/work/">
<link rel="stylesheet" href="/assets/css/site.css">
<link rel="stylesheet" href="/assets/css/home-back.css">
<script src="/assets/js/work-redirect.js"></script>
<script src="/assets/js/transition.js"></script>
</head>
<body>
{BACK}
  <main class="page">
    <h1>Projects</h1>
    <ul class="project-grid">
{items}
    </ul>
  </main>
  <script src="/assets/js/pulse.js" defer></script>
</body>
</html>
'''


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    bands = load_bands()
    pages = {p['slug']: project_page(p, bands) for p in PROJECTS}
    pages.update({slug: redirect_page(slug, label) for slug, label in UNPAK_SECTIONS})
    pages['index'] = index_page()
    for slug, content in pages.items():
        path = OUT / (slug + '.html')
        path.write_text(content)
        print('wrote', path)


if __name__ == '__main__':
    main()
