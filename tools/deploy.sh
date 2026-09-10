#!/bin/sh
# Deploy zsaeed.com: stamp the update date and commit row, then push public/
# to Cloudflare Pages.
#
#   tools/deploy.sh            stamp and deploy
#   tools/deploy.sh --dry-run  stamp, show the diff, deploy nothing
#
# The stats strip's middle row says what the last commit did ("+142 −16"),
# how long ago, and links to it. The page can't know any of that about
# itself, so this script works it out from git right before deploying and
# writes it into the commit anchor in public/index.html. The greeting's
# Last updated line uses this deployment's time, independently of the commit
# date, and links to the same deployed revision. Redeploying an unchanged
# commit therefore still updates the greeting's date. The write is
# temporary: the file is put back the moment wrangler returns, whatever
# happens, so the checked-in copy keeps its placeholder values and the tree
# stays clean.
#
# Where the click goes depends on whether anyone can follow it. A private
# repo answers 404 to everyone but its owner — GitHub hides that the repo
# exists at all — so the link would be a dead end for every visitor. The
# script asks GitHub once, at deploy time, and links the commit only when
# the repo is public; otherwise the row links to the profile, the one page
# guaranteed to open. Same rule for a commit that hasn't been pushed yet:
# it isn't on GitHub, so the profile stands in. One gh call per deploy,
# nothing at request time.
set -eu

cd "$(dirname "$0")/.."
INDEX=public/index.html

dry=0
[ "${1:-}" = "--dry-run" ] && dry=1

# What's deployed is what's committed, or the row describes the wrong code.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "deploy: working tree has uncommitted changes; commit or stash them first" >&2
  exit 1
fi

sha=$(git rev-parse HEAD)
when=$(git log -1 --format=%cI)
subject=$(git log -1 --format=%s)

# Added and removed lines. Against the first parent, so a merge commit
# reports what the merge brought in rather than an empty combined diff.
if git rev-parse --verify -q HEAD^ >/dev/null; then
  stat=$(git diff --shortstat HEAD^ HEAD)
else
  stat=$(git show --shortstat --format= HEAD)
fi
add=$(printf '%s' "$stat" | sed -n 's/.* \([0-9]*\) insertion.*/\1/p'); add=${add:-0}
del=$(printf '%s' "$stat" | sed -n 's/.* \([0-9]*\) deletion.*/\1/p');  del=${del:-0}

# Where the row links: the commit if a visitor could open it, else the profile.
repo=$(gh repo view --json owner,name,visibility,url \
  --jq '"\(.owner.login) \(.name) \(.visibility) \(.url)"')
set -- $repo
owner=$1; visibility=$3; url=$4
profile="https://github.com/$owner"

if [ "$visibility" != PUBLIC ]; then
  echo "deploy: repo is $visibility; linking the commit row to $profile" >&2
  href=$profile
elif [ -z "$(git branch -r --contains "$sha")" ]; then
  echo "deploy: HEAD isn't pushed, so the commit isn't on GitHub; linking to $profile" >&2
  href=$profile
else
  href="$url/commit/$sha"
fi

# Stamp the anchor, and put the file back on the way out no matter what.
keep=$(mktemp)
cp "$INDEX" "$keep"
trap 'cp "$keep" "$INDEX"; rm -f "$keep"' EXIT INT TERM

deployed=$(date +%s)
HREF=$href WHEN=$when ADD=$add DEL=$del DEPLOYED=$deployed LC_ALL=C perl -0pi -e '
  use POSIX qw(strftime);
  my $iso = strftime("%Y-%m-%dT%H:%M:%SZ", gmtime($ENV{DEPLOYED}));
  my $label = strftime("%B %e, %Y", gmtime($ENV{DEPLOYED}));
  $label =~ s/ +/ /g;
  my $updated_link = s{(<a class="site-updated"[^>]*?)href="[^"]*"}{$1href="$ENV{HREF}"};
  my $updated_time = s{<time data-deployed(?: datetime="[^"]*")?>[^<]*</time>}{<time data-deployed datetime="$iso">$label</time>};
  die "deploy: missing Last updated markup\n" unless $updated_link == 1 && $updated_time == 1;
  s{(<a class="pulse-stat pulse-commit"[^>]*?)href="[^"]*"}{$1href="$ENV{HREF}"};
  s{(<a class="pulse-stat pulse-commit"[^>]*?)data-committed="[^"]*"}{$1data-committed="$ENV{WHEN}"};
  s{(<span class="pulse-sign">\+</span>)\d+}{$1$ENV{ADD}};
  s{(<span class="pulse-sign">&minus;</span>)\d+}{$1$ENV{DEL}};
' "$INDEX"

if git diff --quiet -- "$INDEX"; then
  echo "deploy: nothing was stamped — has the commit row's markup changed?" >&2
  exit 1
fi

echo "deploy: ${sha%${sha#???????}} +$add −$del, $when, → $href" >&2

if [ $dry = 1 ]; then
  git --no-pager diff -- "$INDEX"
  exit 0
fi

npx wrangler pages deploy --commit-hash "$sha" --commit-message "$subject"
