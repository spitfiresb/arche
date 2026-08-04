# arche — ἀρχή

_the beginning, the origin, the first principle that everything else follows
from._

My personal website, live at **[zsaeed.com](https://zsaeed.com)**.

## Pages

- **Home** — the landing page
- **About** — a timeline of how I got here
- **Work / Personal** — what I built for myself
- **Work / Contract** — what I built for other people
- **Work / Cool** — a running collection of things I found interesting

## Demos

Each project on the work pages carries a live demo: a real app running in the
page, not a screenshot.

- **Notch** — a Dynamic Island for the Mac notch
- **FloorSense** — turns a floor plan image into an interactive model
- **Liquid Glass** — a WebGL refractive tab bar
- **Steward AI** — the hackathon dashboard, ported to the browser
- **Olander** — the AI sales agent
- **Unpak** — the marketing site and the dashboard
- **Papeagnet** — a contract build

## Project Structure

```
├── public/           # the deployed site, served as-is
│   ├── index.html    # landing
│   ├── about.html    # timeline
│   ├── work/         # personal, contract, cool, liquid-glass source
│   ├── assets/       # css, js, images, and i18n strings
│   └── demos/        # one self-contained app per folder
├── functions/api/    # the one Cloudflare Pages Function
└── tools/            # dev server, in-place text editing, vendor rebase
```
