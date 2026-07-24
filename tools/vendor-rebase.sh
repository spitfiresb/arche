#!/usr/bin/env bash
#
# Rebase the vendored demos onto /demos/.
#
# public/demos/unpak-site, unpak-dashboard and papeagnet are build output copied
# in from their own repos. Each was built with its base path set to the repo
# root, so the Astro and Vite output refers to "/unpak-site/…" and friends as
# root-absolute URLs, which is wrong here, where they are served from
# "/demos/unpak-site/…".
#
# Run this after copying in a fresh build:
#
#     tools/vendor-rebase.sh
#
# It is idempotent: an already-rebased tree is left alone. The long-term fix is
# to set the base path in each source repo's build config and delete this file.
set -euo pipefail

cd "$(dirname "$0")/.."
DEMOS=(unpak-site unpak-dashboard papeagnet)
ROOT=public/demos

for name in "${DEMOS[@]}"; do
  [ -d "$ROOT/$name" ] || { echo "missing $ROOT/$name" >&2; exit 1; }
done

# Every vendored tree may link to any of the others (unpak-site's nav points at
# unpak-dashboard), so each pattern is applied across all of them.
total=0
for name in "${DEMOS[@]}"; do
  # -I skips binaries; fonts and images have no paths to rewrite.
  # A path is always introduced by a quote or by CSS url(, and anchoring on that
  # is what keeps the rewrite from touching prose or an already-rebased path.
  files=$(grep -rlIE '["'\''(]/(unpak-site|unpak-dashboard|papeagnet)/' "$ROOT/$name" || true)
  [ -n "$files" ] || continue
  count=$(printf '%s\n' "$files" | wc -l | tr -d ' ')
  total=$((total + count))
  printf '%s\n' "$files" | xargs sed -i '' \
    -E -e 's#(["'\''(])/unpak-site/#\1/demos/unpak-site/#g' \
       -e 's#(["'\''(])/unpak-dashboard/#\1/demos/unpak-dashboard/#g' \
       -e 's#(["'\''(])/papeagnet/#\1/demos/papeagnet/#g'
  echo "rebased $name ($count files)"
done

[ "$total" -gt 0 ] || echo "nothing to rebase, already on /demos/"
