# arche (zsaeed.com)

Flat-file site served from `public/` on Cloudflare Pages (project name
`zainsaeed`). `functions/` at the repo root holds the one Pages Function
(`POST /api/detect`).

## Deployment

**The site does NOT auto-deploy.** The Pages project has no git integration —
pushing to `main` changes nothing on the live site. After pushing, deploy
manually:

```sh
npx wrangler pages deploy public --project-name zainsaeed
```

Then verify at https://zsaeed.com (use `curl -L`; clean URLs like
`/work/contract` redirect).

## Local preview

Any static server over `public/` works, but it won't rewrite clean URLs —
hit `/work/contract.html` directly. For the Pages Function, use
`npx wrangler pages dev public` (needs `.dev.vars`, see README).
