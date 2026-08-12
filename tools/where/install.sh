#!/bin/sh
# Sets up the location reporter behind the bottom-left corner of zsaeed.com.
#
#   ./install.sh              build, configure, grant, load
#   ./install.sh --rebuild    force a rebuild even if the sources look current
#   ./install.sh --uninstall  stop it, clear the widget, remove everything
#
# Safe to re-run: it leaves an up-to-date build, the config, and the location
# grant alone.
#
# Note where things end up. The repo lives under ~/Desktop, which macOS
# protects with TCC, and a LaunchAgent has no access to protected folders —
# a job pointed at a script in there dies with "Operation not permitted"
# every time it fires. So the two things launchd actually executes are
# installed to ~/.local/libexec instead, and the copies in the repo are
# sources rather than the running program.

set -eu

DIR="$(cd "$(dirname "$0")" && pwd)"
LIBEXEC="$HOME/.local/libexec/zsaeed-where"
APP="$LIBEXEC/Locate.app"
BIN="$APP/Contents/MacOS/locate"
REPORT="$LIBEXEC/report.sh"

LABEL="com.zsaeed.where"
AGENTS="$HOME/Library/LaunchAgents"
PLIST="$AGENTS/$LABEL.plist"
CONFIG="$HOME/.config/zsaeed-where.env"
LOG="$HOME/Library/Logs/zsaeed-where.log"

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  # Take the widget down with the job, so the site doesn't keep showing a
  # place that nothing is updating any more.
  [ -x "$REPORT" ] && "$REPORT" --clear 2>/dev/null || true
  rm -f "$PLIST"
  rm -rf "$LIBEXEC" "$HOME/.local/state/zsaeed-where"
  echo "Uninstalled. $CONFIG left in place — delete it by hand if you want the token gone."
  exit 0
fi

mkdir -p "$LIBEXEC"

# ---- 1. Build the app bundle --------------------------------------------
#
# An .app, not a bare binary. CoreLocation refuses to even ask for permission
# unless the calling bundle's Info.plist carries a usage description, and it
# refuses silently — no dialog, no error, and no entry in System Settings to
# switch on, because as far as macOS is concerned it never asked. See the
# note at the top of locate.swift.
#
# Rebuilt only when the sources are genuinely newer. The location grant is
# attached to the signed bundle, and a fresh build of identical source still
# produces a different hash for it to attach to, so rebuilding for no reason
# silently revokes the permission and sends you back to System Settings
# wondering what broke.
if [ "${1:-}" != "--rebuild" ] && [ -x "$BIN" ] &&
   [ "$DIR/locate.swift" -ot "$BIN" ] && [ "$DIR/Locate-Info.plist" -ot "$BIN" ]; then
  echo "Locate.app is current — keeping it (and its location grant)."
else
  echo "Building Locate.app..."
  rm -rf "$APP"
  mkdir -p "$APP/Contents/MacOS"
  swiftc -O -o "$BIN" "$DIR/locate.swift" -framework CoreLocation
  cp "$DIR/Locate-Info.plist" "$APP/Contents/Info.plist"
  # Ad-hoc signing gives the bundle a stable identity for the grant to hang
  # off. Unsigned, macOS keys the permission to the file's contents instead.
  codesign --force --deep --sign - "$APP" 2>/dev/null || \
    echo "  (codesign unavailable — you may need to re-grant location after rebuilds)"
fi

cp "$DIR/report.sh" "$REPORT"
chmod +x "$REPORT"

# ---- 2. Config -----------------------------------------------------------
if [ ! -f "$CONFIG" ]; then
  mkdir -p "$(dirname "$CONFIG")"
  cat > "$CONFIG" <<'EOF'
# Credentials for the zsaeed.com location reporter. Not in git, and not
# readable by anyone else on this machine.
#
# WHERE_TOKEN must match the value set in the Cloudflare Pages dashboard
# under Settings > Environment variables. Generate one with:
#   openssl rand -hex 32
WHERE_TOKEN=
WHERE_ENDPOINT=https://zsaeed.com/api/where
EOF
  chmod 600 "$CONFIG"
  echo
  echo "Created $CONFIG — put your WHERE_TOKEN in it, then run this again."
  exit 0
fi

# shellcheck source=/dev/null
. "$CONFIG"
[ -n "${WHERE_TOKEN:-}" ] || { echo "WHERE_TOKEN is empty in $CONFIG"; exit 1; }

# ---- 3. Location permission ---------------------------------------------
# Interactively, and here rather than later: under launchd there is no
# session to show a dialog in, so a job installed before the grant would time
# out every three minutes forever without ever saying why.
echo
echo "Asking for a location fix — approve the dialog if one appears."

OUT="$(mktemp)"
trap 'rm -f "$OUT"' EXIT

if FIX="$("$BIN" 2>/dev/null)"; then
  echo "  got a fix"
else
  # Nothing yet. Launch it through Launch Services instead: started with
  # `open`, the app is its own foreground process and asks on its own behalf
  # rather than inheriting whatever the terminal's answer was. This is the
  # path that actually produces the dialog on a first run — and stdout goes
  # to Launch Services rather than to this shell, which is why the fix has to
  # come back through a file.
  echo "  no permission yet — opening the app to request it..."
  : > "$OUT"
  open -a "$APP" --args --out "$OUT"

  FIX=""
  n=0
  while [ "$n" -lt 40 ]; do
    [ -s "$OUT" ] && { FIX="$(cat "$OUT")"; break; }
    sleep 1
    n=$((n + 1))
  done

  case "${FIX:-}" in
    "")   echo; echo "  Timed out waiting for a fix." ;;
    ERR*) echo; echo "  $FIX" ;;
    *)    echo "  got a fix" ;;
  esac

  case "${FIX:-}" in
    ""|ERR*)
      echo
      echo "  Open System Settings > Privacy & Security > Location Services,"
      echo "  make sure the switch at the top is on, then look for"
      echo "  'zsaeed.com location' in the list and enable it."
      echo "  Then run this script again."
      exit 1
      ;;
  esac
fi

# ---- 4. Install the job --------------------------------------------------
mkdir -p "$AGENTS"
sed -e "s|__REPORT__|$REPORT|g" -e "s|__LOG__|$LOG|g" \
  "$DIR/$LABEL.plist" > "$PLIST"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo
echo "Installed. Reporting every 3 minutes while you're logged in."
echo "  runs from: $LIBEXEC"
echo "  log:       $LOG"
echo "  run now:   $REPORT"
echo "  stop:      $DIR/install.sh --uninstall"
