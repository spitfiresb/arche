#!/usr/bin/env python3
"""Build the projects list at /projects/; edit PROJECTS below, then run this script."""
from pathlib import Path
from html import escape
import sys

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'projects'

PROJECTS = [{'slug': 'unpak',
  'website': 'https://unpak.ai/',
  'title': 'Unpak',
  'desc': 'A platform for mapping company workflows and AI opportunities.',
  'github': 'https://github.com/spitfiresb/unpak'},
 {'slug': 'notch',
  'title': 'Notch',
  'desc': 'A macOS utility that turns your display notch into a workspace.',
  'github': 'https://github.com/spitfiresb/notch'},
{'slug': 'steward-ai',
  'title': 'Steward AI',
  'desc': 'A desktop app that helps businesses understand how teams use AI.',
  'devpost': 'https://devpost.com/software/nexhacks',
  'github': 'https://github.com/spitfiresb/steward-ai'},
 {'slug': 'floorsense',
  'title': 'FloorSense',
  'desc': 'A computer vision tool for analyzing architectural floorplans.',
  'github': 'https://github.com/spitfiresb/FloorSense'},
 {'slug': 'ai-sales-agent',
  'title': 'AI Sales Agent',
  'desc': 'A deployed chat agent for querying a distribution company’s ERP.',
  'github': 'https://github.com/spitfiresb/olander-agents'},
 {'slug': 'ag-analytics',
  'title': 'Agricultural Analytics Platform',
  'desc': 'Geospatial analytics used by 1,500+ employees across six states.',
  'website': 'https://papeagnet.com/'},
 {'slug': 'mimi',
  'title': 'Mimi',
  'desc': 'A private, on-device speech-to-text app for Mac.',
  'github': 'https://github.com/spitfiresb/mimi'}]


def project_item(project, order):
    title = escape(project['title'])
    link = ''
    if project.get('private'):
        link = ('<span class="project-repo" role="img" aria-label="Private repository">'
                '<svg class="project-lock-icon" viewBox="0 0 16 16" fill="none" '
                'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" '
                'stroke-linejoin="round" aria-hidden="true">'
                '<rect x="3" y="7" width="10" height="8" rx="1.5"/>'
                '<path d="M5 7V5a3 3 0 0 1 6 0v2"/></svg></span>')
    elif project.get('github'):
        link = (f'<a class="project-repo" href="{escape(project["github"], quote=True)}" '
                f'target="_blank" rel="noopener" aria-label="{title} GitHub repository">'
                '<span class="project-repo-icon" aria-hidden="true"></span></a>')
    if project.get('website'):
        link += ('\n            ' if link else '') + (
            f'<a class="project-repo" href="{escape(project["website"], quote=True)}" '
            f'target="_blank" rel="noopener" aria-label="{title} website">'
            '<span class="project-external-arrow" aria-hidden="true">↗</span></a>')
    if project.get('devpost'):
        link += ('\n            ' if link else '') + (
            f'<a class="project-repo" href="{escape(project["devpost"], quote=True)}" '
            f'target="_blank" rel="noopener" aria-label="{title} on Devpost">'
            '<span class="project-external-arrow" aria-hidden="true">↗</span></a>')
    link_line = f'            {link}\n' if link else ''
    return f'''      <li id="{escape(project['slug'])}" class="page-reveal" style="--reveal-order: {order}">
        <div class="work-project">
          <div class="project-heading">
            <h2 class="work-title">{title}</h2>
{link_line}          </div>
          <p class="work-description">{escape(project['desc'])}</p>
        </div>
      </li>'''


def index_page():
    items = '\n'.join(project_item(project, order) for order, project in enumerate(PROJECTS, 1))
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Projects - Zain Saeed</title>
<meta name="description" content="Projects by Zain Saeed, with short descriptions, websites, and GitHub repositories.">
<meta property="og:title" content="Projects - Zain Saeed">
<meta property="og:description" content="Projects by Zain Saeed, with short descriptions, websites, and GitHub repositories.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://zsaeed.com/projects/">
<meta property="og:site_name" content="Zain Saeed">
<meta property="og:locale" content="en_US">
<meta property="og:image" content="https://zsaeed.com/assets/img/og-projects.png">
<meta property="og:image:width" content="2400">
<meta property="og:image:height" content="1260">
<meta property="og:image:alt" content="Zain Saeed's projects page on zsaeed.com">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="https://zsaeed.com/projects/">
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" href="/favicon-16x16.png" type="image/png" sizes="16x16">
<link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32">
<link rel="icon" href="/favicon.svg" type="image/svg+xml" sizes="any">
<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
<link rel="preload" href="/assets/fonts/HankenGrotesk-Variable.f1a70e8b.woff2" as="font" type="font/woff2" crossorigin>
<script src="/assets/js/theme.js?v=theme-crossfade"></script>
<link rel="stylesheet" href="/assets/css/site.css?v=woff2">
<script src="/assets/js/prefetch.js"></script>
</head>
<body class="projects-index">
  <main class="page">
    <nav class="breadcrumbs page-reveal" style="--reveal-order: 0" aria-label="Breadcrumb">
      <ol>
        <li><a class="animated-link" href="/"><span class="link-label">Home</span></a></li>
        <li class="breadcrumb-separator" aria-hidden="true">&gt;</li>
        <li aria-current="page"><h1>Projects</h1></li>
      </ol>
    </nav>
    <ul class="project-grid">
{items}
    </ul>
  </main>
  <script src="/assets/js/pulse.js?v=count-once" defer></script>
</body>
</html>
'''


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / 'index.html'
    path.write_text(index_page())
    print('wrote', path)


if __name__ == '__main__':
    main()
