#!/usr/bin/env python3
"""Emit the project pages under public/work/ from one template.

    tools/build-work.py          # from the repo root

Each project is one dict in PROJECTS, newest first (the order drives the
previous/next links); the page is the template at the bottom. The output
is committed, so a change here is followed by a run and a commit of the
pages it rewrote. The home page's Work list is written by hand and has to
be kept in step.
"""
import os, sys, re

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
OUT = os.path.join(ROOT, 'public', 'work')

ARROW_OUT = ('<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" '
             'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
             '<path d="M5 11 L11 5"/><path d="M6 5 H11 V10"/></svg>')
ARROW_CODE = ('<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" '
              'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
              '<path d="M6 11 L3 8 L6 5"/><path d="M10 5 L13 8 L10 11"/></svg>')

BACK = '''  <a class="back" href="/" aria-label="Back to the home page">
    <svg class="back-mark" viewBox="0 0 40 40" fill="none" stroke="currentColor" aria-hidden="true">
      <circle class="back-ring" cx="20" cy="20" r="15.5" fill="none" stroke-width="1.1" stroke-dasharray="98 200" stroke-dashoffset="98" transform="rotate(-90 20 20)"/>
      <path class="back-chevron" d="M24 14 L16 20 L24 26" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </a>'''

# Individual-page neighbours remain chronological. The shared project page
# follows the homepage order, with categories used only as homepage labels.
PROJECTS = [
  dict(
    slug='unpak-dashboard', title='Unpak Dashboard', date='2026-07', when='July 2026',
    desc="Unpak's dashboard: the workflows a workforce repeats, where the hours go, and where AI has already shown up.",
    links=[('View repo', 'https://github.com/spitfiresb/unpak/tree/main/cloudflare/dashboard')],
    artifact=dict(kind='demo', src='/demos/unpak-dashboard/', bg='#FCFCFB',
                  title='Unpak dashboard - live demo', img='/assets/img/unpak/dashboard-preview.png',
                  alt='The Unpak dashboard overview: a composition ring of work areas, AI adoption dials, and ranked bars of where the hours are going',
                  caption='The dashboard, running. Click to open it fullscreen.'),
    body=[
      "<p>Unpak's dashboard. It shows the customer the workflows their workforce repeats, where the hours go, and where AI has already shown up in the work.</p>",
      "<p>It is the front half of <a class=\"link\" href=\"/work/unpak-system\">the Unpak system</a>: everything the capture agent and the pipeline work out ends up here, as a composition ring of work areas, adoption dials, and ranked bars of where the time is going.</p>",
    ],
    spec=[('Built on', 'Astro, with the data connected to a Neon Postgres database'),
          ('Hosting', 'Cloudflare Pages')],
  ),
  dict(
    slug='unpak-website', title='Unpak Website', date='2026-07', when='July 2026',
    desc="The main website for Unpak, with a WebGL ripple shader under the headline.",
    links=[],
    artifact=dict(kind='demo', src='/demos/unpak-site/', bg='#FCFCFB', ready='canvas', mobile='native',
                  title='Unpak website - live demo', img='/assets/img/unpak/site-preview.png',
                  alt='The Unpak website landing page: the headline What can AI do for your agency over a soft rippling canvas',
                  caption='The site, running. Click to open it fullscreen.'),
    body=[
      "<p>The main website for Unpak. One of my most polished pieces of work.</p>",
      "<p>The headline sits over a soft rippling canvas, and the diagrams further down are drawn in JavaScript rather than exported as pictures, so they stay crisp at any size.</p>",
    ],
    spec=[('Built on', 'Astro, Tailwind, and JavaScript for the diagrams and the WebGL ripple shader'),
          ('Hosting', 'Cloudflare Pages')],
  ),
  dict(
    slug='liquid-glass', title='Liquid Glass', date='2026-07', when='July 2026',
    desc="My implementation of Apple's Liquid Glass: a WebGL lens that slides between nav tabs.",
    links=[('View code', '/work/liquid-glass-code', 'internal')],
    artifact=dict(kind='inline', src='/demos/liquid-glass/', title='Liquid glass - interactive demo',
                  caption='Live. Click a tab and the glass follows.'),
    body=[
      "<p>My implementation of Apple's Liquid Glass. A pill of glass slides between the tabs, bending the background as it goes and stretching before it settles. One of my personal favorites.</p>",
      "<p>The pill is a signed distance field, and the refraction at its edge follows Snell's law with a little dispersion per colour channel, which is where the faint rainbow fringe comes from. A fresnel term and a glare highlight in LCH space give it the wet look, and a spring drives the motion so the glass overshoots and settles instead of easing to a stop.</p>",
    ],
    spec=[('How it works', 'A refractive lens over a tab row: SDF pill, Snell-law edge refraction with per-channel dispersion, LCH fresnel and glare, spring-driven motion'),
          ('Built on', 'WebGL and JavaScript')],
  ),
  dict(
    slug='notch', title='Notch', date='2026-05', when='May 2026',
    desc="A macOS utility that lives in the display notch: music, playlists, Claude sessions, screenshots.",
    links=[('View repo', 'https://github.com/spitfiresb/notch')],
    artifact=dict(kind='inline', src='/demos/notch-v2/', title='Notch - the app running itself', dark=True,
                  caption='A recreation of the app, running itself on a loop. Nothing here responds to you.'),
    body=[
      "<p>A macOS utility that creates its own notch at the top of the display. Lets you control music, add or remove songs from playlists, and see a Claude session's status in real time. It also makes taking screenshots on a Mac a bit easier.</p>",
      "<p>The demo above is not a video. It is the app rebuilt in the browser at its own point sizes, walking a drawn cursor through Now Playing, the playlist panel, a live Claude Code session, and a screenshot drag, then starting over.</p>",
    ],
    spec=[('How it works', 'An NSPanel pinned above every Space. Now Playing over the private MediaRemote API, audio bars from a CoreAudio tap, screenshots from a folder watch, and Claude sessions from hook events'),
          ('Built on', 'Swift, SwiftUI and AppKit'),
          ('Why', 'I was unsatisfied with the open source alternatives, so I decided to make my own')],
  ),
  dict(
    slug='unpak-system', title='Unpak System', date='2026-04', when='April 2026',
    desc="The capture and processing core of Unpak: an on-device agent and a staged pipeline that turns activity into workflows.",
    links=[('View repo', 'https://github.com/spitfiresb/unpak')],
    artifact=dict(kind='diagram', img='/assets/img/unpak/system-preview-light.svg',
                  alt='A flow chart of the Unpak system: the capture agent on the employee machine uploading to Cloudflare R2, Modal running the processing and analysis pipelines, with the model each stage uses',
                  caption='The system map. Click to zoom.'),
    body=[
      "<p>The capture and processing core of Unpak. A Rust agent on each machine reads the focused window through AX Tree and OCR capture, and scrubs PII on device. After storage, a pipeline then distills that raw activity down in stages: individual actions get grouped into tasks, and tasks into workflows. Cheaper models handle the high-volume grouping and smarter models handle the complicated reasoning sections. A nightly pass clusters recurring workflows across the workforce into families, so variations of the same workflow can still be deterministically grouped together.</p>",
      "<p>The idea: a worker's day is made up of various workflows, each a generally set list of tasks. If you can map those workflows and build a picture of how a company actually does its work, down to the smallest step, then you can pinpoint where an AI solution plugs in most effectively and compute, down to the minute, how much time it would save.</p>",
      "<p>What the customer sees is the <a class=\"link\" href=\"/work/unpak-dashboard\">dashboard</a>.</p>",
    ],
    spec=[('Built on', 'Rust for the agent, Swift for the macOS client, Python for the pipeline. SQLite on the device, Neon Postgres upstream'),
          ('Hosting', 'Modal for the pipeline, Cloudflare R2 for storage')],
  ),
  dict(
    slug='ai-sales-agent', title='AI Sales Agent', date='2026-04', when='April 2026',
    desc="A chat agent for a Bay Area distribution company that answers questions from their ERP in plain language.",
    links=[('View repo', 'https://github.com/spitfiresb/olander-agents')],
    artifact=dict(kind='demo', src='/demos/olander/', bg='#faf7f1', mobile='native',
                  title='Olander Agents - live demo', img='/assets/img/olander/preview.png',
                  alt='Olander Agents chat: an ERP stock question answered with tool-call steps and a per-warehouse on-hand table',
                  caption='The agent, running. Click to open it fullscreen.'),
    body=[
      "<p>A chat agent built for a distribution company in the Bay Area. Connects to their ERP system and allows their employees to save time doing data lookups. Currently serving around 70 employees.</p>",
      "<p>A question like <em>how many of these are in stock</em> becomes a handful of tool calls against the catalog, stock and order tables, and the answer comes back as a table rather than a paragraph. Catalog search runs on a vector index, so a loosely worded part name still finds the part.</p>",
    ],
    spec=[('Data', 'Epicor Prophet 21: catalog, stock, customers, orders. Read through a fixed-IP proxy. Catalog search on a Qdrant vector index'),
          ('Built on', 'Next.js, TypeScript, GPT-5 nano. Neon Postgres, Qdrant, Microsoft SSO'),
          ('Hosting', 'Vercel, plus one always-on proxy for the fixed IP')],
  ),
  dict(
    slug='steward-ai', title='Steward AI', date='2026-01', when='January 2026', note="NexHacks '26 winner",
    desc="A desktop app that lets businesses understand their employees' AI usage. Winner at NexHacks '26.",
    links=[('View repo', 'https://github.com/spitfiresb/steward-ai'), ('View DevPost', 'https://devpost.com/software/nexhacks')],
    artifact=dict(kind='demo', src='/demos/steward-ai/dashboard/index.html', bg='#f7f5f0',
                  title='Steward AI dashboard - live demo', img='/assets/img/steward/dashboard-preview.png',
                  alt='The Steward AI dashboard: a use-case donut chart with hoverable subcategories, top model rankings, a daily average bar chart and a security overview',
                  caption='The dashboard, running. Click to open it fullscreen.'),
    body=[
      "<p>A desktop application that lets businesses understand their employees' AI usage. An Electron app and a browser extension read the accessibility-tree text of AI tools as people use them and a Haiku 4.5 model categorizes each conversation. The platform also identifies PII included in prompts, along with files, which it displays inside the dashboard.</p>",
      "<p>Built at Carnegie Mellon for NexHacks '26, my first hackathon win.</p>",
    ],
    spec=[('How it works', 'Use-case analytics, per-employee drill-downs, a prompt-flow breakdown, and a security log where flagged uploads open in a file viewer'),
          ('Built on', 'An Electron app built on HTML and JavaScript displays data, and uses Swift to grab data from macOS desktop applications, paired with a browser extension to grab DOM text from Chrome. Data is stored in Supabase')],
  ),
  dict(
    slug='floorsense', title='FloorSense', date='2025-11', when='November 2025',
    desc="Computer vision that reads architectural floorplans, with correction tools on top of the detections.",
    links=[('View repo', 'https://github.com/spitfiresb/FloorSense')],
    artifact=dict(kind='demo', src='/demos/floorsense/?embed=1', bg='#fdfbf7', mobile='native',
                  title='FloorSense - live demo', img='/assets/img/floorsense/preview.png',
                  alt='The FloorSense app landing page',
                  caption='The app, running. Click to open it fullscreen.'),
    body=[
      "<p>A computer vision web app that identifies architectural elements in floorplan images using YOLO-based object detection, with real-time detection visualization and correction tools.</p>",
      "<p>The idea: floor plans are notoriously difficult to digitize, since there are so many different variations of objects in them, and no standardized system to create them. A model that can visually classify what's on the page gets around that.</p>",
    ],
    spec=[('Built on', 'Next.js, React, TypeScript, Tailwind'),
          ('Why I built it', 'I was attempting to impress a group of founders at a company I wanted to work at, so I built the product they showed me in a demo'),
          ('Hosting', 'Website hosted on Vercel, YOLO model hosted on Roboflow')],
  ),
  dict(
    slug='ag-analytics', title='Agricultural Analytics Platform', date='2025-11', when='November 2025',
    desc="Geospatial analytics for Oregon's largest equipment dealer, used by over 1,500 employees across six states.",
    links=[('View repo', 'https://github.com/spitfiresb/AgDash')],
    artifact=dict(kind='demo', src='/demos/papeagnet/', ready='canvas',
                  title='PapeAgNet - live demo', img='/assets/img/papeagnet/preview.png',
                  alt='PapeAgNet dashboard: Pacific Northwest dealer regions and county agriculture metrics on an interactive map',
                  caption='The platform, running. Click to open it fullscreen.'),
    body=[
      "<p>A geospatial analytics platform for Oregon's largest equipment dealer. Currently being used by over 1,500 employees across six states.</p>",
      "<p>Every county in the dealer's territory is drawn from the Census Bureau's boundary files and shaded by the USDA's agricultural census, so a rep can see at a glance where the acreage and the crops are, and how their own region compares.</p>",
    ],
    spec=[('Data', "USDA Census of Agriculture, 250 counties across six states. Boundaries from the Census Bureau's TIGER/Line files"),
          ('Built on', 'React, TypeScript, Vite, MapLibre GL'),
          ('Hosting', 'Vercel')],
  ),
]


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
<link rel="stylesheet" href="/assets/css/site.css?v=compact-work">
<link rel="stylesheet" href="/assets/css/live-demo.css">
<script src="/assets/js/transition.js"></script>
</head>'''


def artifact(a):
    if a['kind'] == 'demo':
        attrs = [f'data-live-demo="{a["src"]}"', f'data-title="{a["title"]}"']
        if a.get('bg'): attrs.append(f'data-bg="{a["bg"]}"')
        if a.get('ready'): attrs.append(f'data-ready="{a["ready"]}"')
        if a.get('mobile'): attrs.append(f'data-mobile="{a["mobile"]}"')
        return f'''      <figure class="artifact">
        <div class="ld-thumb" {' '.join(attrs)}
        tabindex="0" role="button" aria-label="Expand the {a['title'].split(' - ')[0]} to fullscreen">
          <img src="{a['img']}" alt="{a['alt']}">
        </div>
        <figcaption>{a['caption']}</figcaption>
      </figure>'''
    if a['kind'] == 'diagram':
        return f'''      <figure class="artifact">
        <div class="ld-thumb plain" data-diagram tabindex="0" role="button" aria-label="Expand the diagram to fullscreen">
          <img src="{a['img']}" alt="{a['alt']}">
        </div>
        <figcaption>{a['caption']}</figcaption>
      </figure>'''
    cls = 'ld-inline dark' if a.get('dark') else 'ld-inline'
    return f'''      <figure class="artifact">
        <iframe class="{cls}" src="{a['src']}" title="{a['title']}" loading="lazy"></iframe>
        <figcaption>{a['caption']}</figcaption>
      </figure>'''


def links(ls):
    if not ls: return ''
    out = []
    for l in ls:
        label, href = l[0], l[1]
        internal = len(l) > 2
        if internal:
            out.append(f'<a class="styled-link is-internal" href="{href}">{label} {ARROW_CODE}</a>')
        else:
            out.append(f'<a class="styled-link" href="{href}" target="_blank" rel="noopener">{label} {ARROW_OUT}</a>')
    return '      <p class="links">' + '\n      '.join(out) + '</p>\n'


def spec(rows):
    inner = '\n'.join(f'        <dt>{k}</dt>\n        <dd>{v}</dd>' for k, v in rows)
    return f'      <dl class="spec">\n{inner}\n      </dl>'


def neighbours(i):
    prev = PROJECTS[i - 1] if i > 0 else None      # newer
    nxt = PROJECTS[i + 1] if i + 1 < len(PROJECTS) else None   # older
    parts = []
    if prev:
        parts.append(f'      <a class="prev" href="/work/{prev["slug"]}"><small>Newer</small>{prev["title"]}</a>')
    if nxt:
        parts.append(f'      <a class="next" href="/work/{nxt["slug"]}"><small>Older</small>{nxt["title"]}</a>')
    return '    <nav class="neighbours" aria-label="Neighbouring projects">\n' + '\n'.join(parts) + '\n    </nav>'


def page(i, p):
    a = p['artifact']
    scripts = ['/assets/js/live-demo.js']
    if a['kind'] == 'diagram': scripts.append('/assets/js/diagram-expand.js')
    scripts.append('/assets/js/pulse.js')
    script_tags = '\n'.join(
        f'  <script src="{s}"{" defer" if s.endswith("pulse.js") else ""}></script>' for s in scripts)
    note = f'\n          <span class="note">{p["note"]}</span>' if p.get('note') else ''
    body = '\n'.join('      ' + b for b in p['body'])
    return f'''{head(p)}
<body class="project">
{BACK}
  <main class="page">
    <article class="article">
      <header>
        <h1>{p['title']}</h1>
        <div class="meta">
          <time datetime="{p['date']}">{p['when']}</time>{note}
        </div>
      </header>
{links(p['links'])}{artifact(a)}
{body}
{spec(p['spec'])}
    </article>
{neighbours(i)}
  </main>
{script_tags}
</body>
</html>
'''


def collection_page():
    projects = {p['slug']: p for p in PROJECTS}
    # Keep the original project markup and copy from main as the source.
    with open(os.path.join(os.path.dirname(__file__), 'project-bands.html')) as f:
        bands = f.read()
    order = re.findall(r'<li id="([^"]+)">', bands)
    assert len(order) == len(projects) and set(order) == set(projects)
    for slug in order:
        # Only add anchor-focus semantics; the original band content is intact.
        bands = bands.replace(f'<li id="{slug}">',
            f'<li id="{slug}" tabindex="-1" aria-labelledby="{slug}-heading">', 1)
        start = bands.index(f'<li id="{slug}"')
        title = bands.index('class="band-title"', start)
        bands = bands[:title] + bands[title:].replace('class="band-title"',
            f'class="band-title" id="{slug}-heading"', 1)
    toc = '\n'.join(
        f'        <li class="toc-item"><a class="toc-link" href="#{slug}">{projects[slug]["title"]}</a></li>'
        for slug in order)
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Projects - Zain Saeed</title>
<meta name="description" content="Personal projects, contract work, and experiments by Zain Saeed, with live demos.">
<meta property="og:title" content="Projects - Zain Saeed">
<meta property="og:description" content="Personal projects, contract work, and experiments, with live demos.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://zsaeed.com/work/">
<link rel="canonical" href="https://zsaeed.com/work/">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@1,6..72,400;1,6..72,500&display=swap">
<link rel="preload" href="/assets/fonts/InterVariable.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/style.css">
<link rel="stylesheet" href="/assets/css/live-demo.css">
<link rel="stylesheet" href="/assets/css/project-navigation.css">
<script src="/assets/js/transition.js"></script>
</head>
<body class="page work collection">
{BACK}
  <nav class="toc" aria-label="Projects on this page">
    <div class="toc-track">
      <ul>
{toc}
      </ul>
      <span class="toc-dot" aria-hidden="true" hidden></span>
    </div>
  </nav>
  <main>
    <h1 class="visually-hidden">Projects</h1>
    <ul class="bands">
{bands}
    </ul>
  </main>
  <script src="/assets/js/toc.js"></script>
  <script src="/assets/js/live-demo.js"></script>
  <script src="/assets/js/diagram-expand.js?v=collection"></script>
  <script src="/assets/js/pulse.js" defer></script>
</body>
</html>
'''


os.makedirs(OUT, exist_ok=True)
for i, p in enumerate(PROJECTS):
    path = os.path.join(OUT, p['slug'] + '.html')
    with open(path, 'w') as f:
        f.write(page(i, p))
    print('wrote', os.path.relpath(path, ROOT))

with open(os.path.join(OUT, 'index.html'), 'w') as f:
    f.write(collection_page())
print('wrote', os.path.relpath(os.path.join(OUT, 'index.html'), ROOT))
