#!/bin/sh
# The beat behind the bottom-left corner of zsaeed.com.
#
# launchd runs this every few minutes while I'm logged in. It gets one
# coordinate from ./locate, decides whether anything has actually changed,
# and — only when it has — asks /api/where to work out whether where I am is
# somewhere worth saying out loud. The server owns that decision entirely;
# this script never learns the name of the place it reports, and never sends
# anything but a coordinate it just measured.
#
# Three states, and the point of all of it is that the middle one is by far
# the most common:
#
#   moved        POST {lat,lon}  -> a venue lookup happens on the server
#   still there  POST {stay}     -> touches a timestamp, no lookup
#   still away   nothing at all  -> no request leaves the machine
#
# Sitting in a cafe for three hours is one lookup and sixty timestamp
# touches. Sitting at home all evening is zero requests of any kind: once the
# server has said "nothing publishable here", this stops asking until I move.
# That is what keeps a public Overpass instance unbothered and the laptop
# idle.

set -eu

DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="${WHERE_CONFIG:-$HOME/.config/zsaeed-where.env}"
STATE_DIR="$HOME/.local/state/zsaeed-where"
STATE="$STATE_DIR/last"

MOVE_M=40    # beyond this from the last publish, ask the server again
DWELL_M=40   # and only after two readings this close together

[ -r "$CONFIG" ] || { echo "report: no config at $CONFIG" >&2; exit 1; }
# shellcheck source=/dev/null
. "$CONFIG"

ENDPOINT="${WHERE_ENDPOINT:-https://zsaeed.com/api/where}"
[ -n "${WHERE_TOKEN:-}" ] || { echo "report: WHERE_TOKEN unset in $CONFIG" >&2; exit 1; }

mkdir -p "$STATE_DIR"

post() {
  curl -fsS --max-time 20 -X POST "$ENDPOINT" \
    -H "Authorization: Bearer $WHERE_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$1"
}

# Uninstalling should take the widget down with it, rather than leaving a
# venue sitting on the home page indefinitely.
if [ "${1:-}" = "--clear" ]; then
  post '{"clear":true}' >/dev/null && rm -f "$STATE"
  echo "report: cleared"
  exit 0
fi

FIX="$("$DIR/Locate.app/Contents/MacOS/locate" 2>/dev/null)" || {
  code=$?
  # 2 is a denied permission, which no amount of retrying will fix.
  [ "$code" = "2" ] && echo "report: location permission denied — run install.sh" >&2
  exit 0
}

LAT="${FIX%%,*}"
LON="${FIX##*,}"
case "$LAT$LON" in *[!0-9.,-]*|"") echo "report: bad fix '$FIX'" >&2; exit 1 ;; esac

# prev_lat prev_lon pub_lat pub_lon published
if [ -r "$STATE" ]; then
  read -r P_LAT P_LON B_LAT B_LON PUBLISHED < "$STATE" || true
fi
: "${P_LAT:=999}" "${P_LON:=999}" "${B_LAT:=999}" "${B_LON:=999}" "${PUBLISHED:=0}"

# Equirectangular metres. awk rather than python3 because launchd jobs get a
# minimal PATH and /usr/bin/awk is always there; the Homebrew python on this
# machine is not.
metres() {
  awk -v a="$1" -v b="$2" -v c="$3" -v d="$4" 'BEGIN{
    if (a>=999||c>=999) { print 999999; exit }
    x=(d-b)*cos(((a+c)/2)*3.14159265/180); y=c-a;
    printf "%d", sqrt(x*x+y*y)*111320
  }'
}

FROM_PUB="$(metres "$LAT" "$LON" "$B_LAT" "$B_LON")"
FROM_PREV="$(metres "$LAT" "$LON" "$P_LAT" "$P_LON")"

# Still where the server last published something: just keep the timestamp
# alive so the corner reads as current instead of ageing while I sit here.
if [ "$PUBLISHED" = "1" ] && [ "$FROM_PUB" -lt "$MOVE_M" ]; then
  post '{"stay":true}' >/dev/null || true
  printf '%s %s %s %s 1\n' "$LAT" "$LON" "$B_LAT" "$B_LON" > "$STATE"
  exit 0
fi

# Still where the server last said "nothing publishable" — home, most of the
# time. This is the branch the whole design leans on: without it, a declined
# spot falls through to the lookup below and asks Overpass the same question
# every three minutes for as long as I sit there. Silence here is what makes
# an evening at home zero requests.
if [ "$PUBLISHED" = "0" ] && [ "$FROM_PUB" -lt "$MOVE_M" ]; then
  printf '%s %s %s %s 0\n' "$LAT" "$LON" "$B_LAT" "$B_LON" > "$STATE"
  exit 0
fi

# Somewhere new, but only one reading deep. Walking past a cafe shouldn't
# announce it, and two adjacent storefronts shouldn't trade the corner back
# and forth, so nothing is reported until a second reading agrees.
if [ "$FROM_PREV" -ge "$DWELL_M" ]; then
  printf '%s %s %s %s %s\n' "$LAT" "$LON" "$B_LAT" "$B_LON" "$PUBLISHED" > "$STATE"
  exit 0
fi

# Settled somewhere new. This is the only path that costs a venue lookup.
#
# The two dwell readings are independent estimates of the same spot, so
# their midpoint is a better fix than either alone — Wi-Fi positioning
# drifts tens of metres between readings, and on a dense block that's the
# difference between naming the right storefront and its neighbour.
if [ "$P_LAT" != "999" ]; then
  LAT="$(awk -v a="$LAT" -v b="$P_LAT" 'BEGIN{printf "%.7f",(a+b)/2}')"
  LON="$(awk -v a="$LON" -v b="$P_LON" 'BEGIN{printf "%.7f",(a+b)/2}')"
fi
RESPONSE="$(post "{\"lat\":$LAT,\"lon\":$LON}")" || {
  echo "report: endpoint unreachable" >&2
  exit 0   # keep the old state so the next beat retries this same spot
}

case "$RESPONSE" in
  *'"published":true'*)
    # Anchor future "still here" beats to where I actually am now.
    printf '%s %s %s %s 1\n' "$LAT" "$LON" "$LAT" "$LON" > "$STATE"
    ;;
  *)
    # Nothing publishable here — home, an office, a Costco. Remember the
    # answer so this spot costs no further requests until I leave it.
    printf '%s %s %s %s 0\n' "$LAT" "$LON" "$LAT" "$LON" > "$STATE"
    ;;
esac
