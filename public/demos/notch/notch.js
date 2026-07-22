/* Notch — a browser recreation of the macOS app.
 *
 * The real thing is a Swift package: an NSPanel pinned to the top of every
 * Space, a SwiftUI view tree inside it, and a handful of services (NowPlaying
 * over the private MediaRemote API, an FSEvents watcher on ~/Desktop for new
 * screenshots, an AVAudioEngine tap for the level meter). None of that has a
 * browser equivalent, so what runs here is the view layer and its behaviour,
 * driven by stand-in data instead of the machine.
 *
 * What IS carried over exactly, because it's what the project is actually
 * about: the geometry (see notch.css), the state machine below, and the
 * timings. A few, for orientation:
 *
 *   hover poll          0.06s          AppDelegate.installHoverWatcher
 *   open / close        0.32s / 0.22s  NotchRootView
 *   launch greeting     1.8s open      NotchState.presentLaunchGreeting
 *   toast               2.25s pinned, collapse at 2.35s
 *   toast lead / char   0.34s / 0.018s ScreenshotToastView
 *   ring / checkmark    0.4s, then 0.22s after +0.34s
 *   bar wiggle          sin(t*5.2 + p) and sin(t*9.7 + p*2.1), summed 0.6/0.4
 *
 * The one thing here that the app has no equivalent for is the tour: a ghost
 * cursor that drives the whole loop unattended, because a visitor to a web
 * page has no reason to guess that a black shape wants hovering. Any real
 * input kills it for good.
 *
 * Loaded by index.html in this folder, which is both a standalone page and
 * the src of the live-demo iframe on /work/personal. Every asset path
 * below is relative to that folder, so both framings resolve alike. */

(function () {
  "use strict";

  // ---- Framing ---------------------------------------------------------
  // A notch is 220pt on a 1512pt screen. Reproduce that ratio honestly and
  // the subject of the demo ends up a 7px-tall speck — worse once the
  // live-demo component parks the whole thing at thumbnail size, where the
  // panel's 13.5pt title lands under 7px and simply cannot be read.
  //
  // So the screen is FRAMED rather than reproduced: scaled until the
  // expanded panel takes a set share of the frame, which reads as a camera
  // pushed in on the top of a display. Whichever axis binds first wins, so
  // it holds up in a wide thumbnail and a tall fullscreen alike.
  //
  // Everything scales together, menu bar included, because that is what
  // zooming does — a magnified screen with a life-size menu bar would look
  // like a mistake rather than a close-up.
  var PANEL_W = 300, PANEL_H = 108;   // ScreenMetrics.expandedSize
  var PANEL_W_FRAC = 0.38;            // panel width, as a share of the frame
  var PANEL_H_FRAC = 0.28;            // panel height likewise
  var SCALE_MIN = 0.5;
  var SCALE_MAX = 4;

  var root = document.getElementById("nt-screen");

  // ---- Stand-in data ---------------------------------------------------
  // Three tracks off one record, so the one sleeve on hand is the right
  // sleeve for all of them. Real durations: 4:19, 3:03, 3:05.
  //
  // accent is what NowPlaying derives from the artwork — here it is the pale
  // sky over Abbey Road, sampled off the actual file rather than picked by
  // eye, which is the same answer the app's own extraction lands on: the most
  // saturated colour that isn't crushed dark or blown out.
  //
  // art is the fallback behind artFile, shown for the moment before the JPEG
  // decodes and left in place if the file is ever missing.
  var ABBEY_ROAD = "art-abbey-road.jpg";
  var ABBEY_ACCENT = "#a4d8f2";
  var ABBEY_FALLBACK = "linear-gradient(160deg, #6f9fc4 0%, #b9d7e8 42%, #5b6570 100%)";

  var TRACKS = [
    {
      title: "Come Together",
      artist: "The Beatles",
      duration: 259,
      accent: ABBEY_ACCENT,
      artFile: ABBEY_ROAD,
      art: ABBEY_FALLBACK
    },
    {
      title: "Something",
      artist: "The Beatles",
      duration: 183,
      accent: ABBEY_ACCENT,
      artFile: ABBEY_ROAD,
      art: ABBEY_FALLBACK
    },
    {
      title: "Here Comes the Sun",
      artist: "The Beatles",
      duration: 185,
      accent: ABBEY_ACCENT,
      artFile: ABBEY_ROAD,
      art: ABBEY_FALLBACK
    }
  ];

  /* The shelf holds drawn placeholders, not photographs of anything. An
     earlier version stocked it with this site's own captures — real client
     work, sitting in a fake desktop's screenshot tray, which is the wrong
     place for it however good the pictures looked. These are generic
     windows: an editor, a browser, a terminal, and so on. */
  function shotArt(kind) {
    var bar = '<rect width="104" height="8" fill="rgba(0,0,0,0.18)"/>' +
      '<circle cx="6" cy="4" r="1.5" fill="#ec6a5e"/>' +
      '<circle cx="11" cy="4" r="1.5" fill="#f4bf4f"/>' +
      '<circle cx="16" cy="4" r="1.5" fill="#61c554"/>';
    var art = {
      editor:
        '<rect width="104" height="64" fill="#22262e"/>' + bar +
        '<rect x="0" y="8" width="19" height="56" fill="rgba(0,0,0,0.22)"/>' +
        '<g opacity="0.85">' +
        '<rect x="24" y="14" width="26" height="2.6" rx="1.3" fill="#c678dd"/>' +
        '<rect x="53" y="14" width="17" height="2.6" rx="1.3" fill="#61afef"/>' +
        '<rect x="28" y="21" width="38" height="2.6" rx="1.3" fill="#98c379"/>' +
        '<rect x="28" y="28" width="22" height="2.6" rx="1.3" fill="#e5c07b"/>' +
        '<rect x="28" y="35" width="46" height="2.6" rx="1.3" fill="#5c6370"/>' +
        '<rect x="24" y="42" width="19" height="2.6" rx="1.3" fill="#e06c75"/>' +
        '<rect x="28" y="49" width="33" height="2.6" rx="1.3" fill="#5c6370"/>' +
        '</g>' +
        '<g fill="#3a4048"><rect x="4" y="14" width="11" height="2.2" rx="1.1"/>' +
        '<rect x="4" y="20" width="8" height="2.2" rx="1.1"/>' +
        '<rect x="4" y="26" width="12" height="2.2" rx="1.1"/></g>',
      browser:
        '<rect width="104" height="64" fill="#f4f5f7"/>' +
        '<rect width="104" height="11" fill="#e3e5e9"/>' +
        '<circle cx="6" cy="5.5" r="1.5" fill="#ec6a5e"/>' +
        '<circle cx="11" cy="5.5" r="1.5" fill="#f4bf4f"/>' +
        '<circle cx="16" cy="5.5" r="1.5" fill="#61c554"/>' +
        '<rect x="23" y="3" width="52" height="5" rx="2.5" fill="#f7f8fa"/>' +
        '<g fill="#4a76d6"><rect x="12" y="46" width="9" height="12" rx="1"/>' +
        '<rect x="25" y="38" width="9" height="20" rx="1"/>' +
        '<rect x="38" y="42" width="9" height="16" rx="1"/>' +
        '<rect x="51" y="30" width="9" height="28" rx="1"/>' +
        '<rect x="64" y="35" width="9" height="23" rx="1"/>' +
        '<rect x="77" y="24" width="9" height="34" rx="1"/></g>' +
        '<g fill="#c9ced8"><rect x="12" y="17" width="34" height="3" rx="1.5"/>' +
        '<rect x="12" y="24" width="22" height="3" rx="1.5"/></g>',
      terminal:
        '<rect width="104" height="64" fill="#101215"/>' + bar +
        '<g fill="#5af78e" opacity="0.9">' +
        '<rect x="6" y="14" width="4" height="2.2" rx="1.1"/>' +
        '<rect x="6" y="27" width="4" height="2.2" rx="1.1"/>' +
        '<rect x="6" y="47" width="4" height="2.2" rx="1.1"/></g>' +
        '<g fill="#8b94a3">' +
        '<rect x="13" y="14" width="40" height="2.2" rx="1.1"/>' +
        '<rect x="6" y="20" width="62" height="2.2" rx="1.1"/>' +
        '<rect x="13" y="27" width="28" height="2.2" rx="1.1"/>' +
        '<rect x="6" y="33" width="70" height="2.2" rx="1.1"/>' +
        '<rect x="6" y="39" width="49" height="2.2" rx="1.1"/>' +
        '<rect x="13" y="47" width="34" height="2.2" rx="1.1"/></g>' +
        '<rect x="50" y="47" width="4" height="2.6" fill="#5af78e"/>',
      document:
        '<rect width="104" height="64" fill="#5c6270"/>' +
        '<rect x="14" y="4" width="76" height="60" rx="2" fill="#fdfdfd"/>' +
        '<rect x="22" y="12" width="34" height="4" rx="2" fill="#2f333c"/>' +
        '<g fill="#cdd1d8">' +
        '<rect x="22" y="23" width="60" height="2.6" rx="1.3"/>' +
        '<rect x="22" y="30" width="56" height="2.6" rx="1.3"/>' +
        '<rect x="22" y="37" width="60" height="2.6" rx="1.3"/>' +
        '<rect x="22" y="44" width="38" height="2.6" rx="1.3"/>' +
        '<rect x="22" y="51" width="48" height="2.6" rx="1.3"/></g>',
      gallery:
        '<rect width="104" height="64" fill="#1b1e24"/>' + bar +
        '<g>' +
        '<rect x="6" y="13" width="28" height="22" rx="2" fill="#3b6ea5"/>' +
        '<rect x="38" y="13" width="28" height="22" rx="2" fill="#a5713b"/>' +
        '<rect x="70" y="13" width="28" height="22" rx="2" fill="#4a8f6b"/>' +
        '<rect x="6" y="39" width="28" height="22" rx="2" fill="#8a4a7d"/>' +
        '<rect x="38" y="39" width="28" height="22" rx="2" fill="#4a6f8a"/>' +
        '<rect x="70" y="39" width="28" height="22" rx="2" fill="#8a7a4a"/>' +
        '</g>',
      mail:
        '<rect width="104" height="64" fill="#fbfbfc"/>' +
        '<rect width="104" height="9" fill="#eceef1"/>' +
        '<circle cx="6" cy="4.5" r="1.5" fill="#ec6a5e"/>' +
        '<circle cx="11" cy="4.5" r="1.5" fill="#f4bf4f"/>' +
        '<circle cx="16" cy="4.5" r="1.5" fill="#61c554"/>' +
        '<rect x="0" y="9" width="30" height="55" fill="#f1f2f5"/>' +
        '<g fill="#ccd1d9"><rect x="5" y="15" width="20" height="2.4" rx="1.2"/>' +
        '<rect x="5" y="22" width="16" height="2.4" rx="1.2"/>' +
        '<rect x="5" y="29" width="19" height="2.4" rx="1.2"/></g>' +
        '<g fill="#dfe3e9">' +
        '<rect x="36" y="16" width="52" height="3" rx="1.5"/>' +
        '<rect x="36" y="24" width="60" height="2.6" rx="1.3"/>' +
        '<rect x="36" y="31" width="56" height="2.6" rx="1.3"/>' +
        '<rect x="36" y="38" width="60" height="2.6" rx="1.3"/>' +
        '<rect x="36" y="45" width="34" height="2.6" rx="1.3"/></g>',
      desktop:
        '<defs><linearGradient id="ntdk" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#232338"/><stop offset="0.55" stop-color="#2c3a52"/>' +
        '<stop offset="1" stop-color="#1a2430"/></linearGradient></defs>' +
        '<rect width="104" height="64" fill="url(#ntdk)"/>' +
        '<rect width="104" height="6" fill="rgba(0,0,0,0.28)"/>' +
        '<rect x="42" y="0" width="20" height="6" rx="1.5" fill="#000"/>'
    };
    return '<svg class="nt-shot-art" viewBox="0 0 104 64" preserveAspectRatio="xMidYMid slice" ' +
      'aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' + (art[kind] || art.document) + '</svg>';
  }

  var SHOTS = [
    { kind: "editor", age: "just now" },
    { kind: "browser", age: "2 minutes ago" },
    { kind: "terminal", age: "18 minutes ago" },
    { kind: "document", age: "1 hour ago" },
    { kind: "gallery", age: "3 hours ago" },
    { kind: "mail", age: "yesterday" },
    { kind: "desktop", age: "yesterday" }
  ];

  var TABS = ["music", "screenshots"];

  // ---- State -----------------------------------------------------------
  var st = {
    open: false,
    tab: "music",
    toast: false,
    playing: true,
    track: 0,
    elapsed: 42,          // start mid-song; a player at 0:00 looks switched off
    lastTick: 0,
    pinnedUntil: 0,       // hover can't close the blob before this
    dragging: false,
    tour: true,           // until the visitor touches anything
    pointerIn: false,
    /* SettingsStore's own defaults: copyScreenshotToClipboard is seeded true
       on first launch ("preserves the prior always-on behavior"), and
       routeScreenshotsToFolder mirrors com.apple.screencapture.location,
       which on a machine that has never been pointed anywhere is off. */
    settings: { route: false, clipboard: true }
  };

  var TOAST_PIN = 3.2, TOAST_CLOSE = 3.35;   // app: 2.25 / 2.35

  var closeTimer = null;
  var el = {};

  // ---- Icons -----------------------------------------------------------
  var ICON = {
    apple:
      '<svg viewBox="0 0 16 20" aria-hidden="true"><path d="M13.1 10.6c0-2.2 1.8-3.3 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.3.8-.7 0-1.7-.8-2.8-.8-1.5 0-2.8.8-3.6 2.1C.5 10.4 1.6 14.3 3 16.4c.7 1 1.5 2.2 2.6 2.2 1 0 1.4-.7 2.7-.7s1.6.7 2.7.7 1.8-1 2.5-2c.8-1.2 1.1-2.3 1.1-2.3s-2.2-.9-2.2-3.4zM11 4.1c.6-.7 1-1.7.9-2.7-.8 0-1.9.6-2.5 1.3-.6.6-1 1.6-.9 2.6.9.1 1.9-.5 2.5-1.2z"/></svg>',
    wifi:
      '<svg viewBox="0 0 20 14" aria-hidden="true"><path d="M10 12.6 7.9 10.4a3 3 0 0 1 4.2 0zM10 6.5c-1.5 0-2.9.6-4 1.6L4.6 6.7A7.7 7.7 0 0 1 10 4.5c2.1 0 4 .8 5.4 2.2l-1.4 1.4a5.6 5.6 0 0 0-4-1.6zM10 .8c3 0 5.8 1.2 7.8 3.2l-1.4 1.4A9 9 0 0 0 10 2.8 9 9 0 0 0 3.6 5.4L2.2 4A11 11 0 0 1 10 .8z"/></svg>',
    battery:
      '<svg viewBox="0 0 28 14" aria-hidden="true"><rect x="0.75" y="1.75" width="23" height="10.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.5"/><rect x="2.5" y="3.5" width="15" height="7" rx="1.6"/><path d="M25.4 5.2c1.1.4 1.1 3.2 0 3.6z"/></svg>',
    control:
      '<svg viewBox="0 0 18 14" aria-hidden="true"><path d="M1 3.2h7.2a2.4 2.4 0 0 1 4.6 0H17v1.4h-4.2a2.4 2.4 0 0 1-4.6 0H1zM1 9.4h4.2a2.4 2.4 0 0 1 4.6 0H17v1.4H9.8a2.4 2.4 0 0 1-4.6 0H1z"/></svg>',
    prev:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 3.2c0-.5.4-.8.8-.8s.8.3.8.8v3.9l6-4.4c.6-.4 1.4 0 1.4.8v8.9c0 .8-.8 1.2-1.4.8l-6-4.4v3.9c0 .5-.4.8-.8.8s-.8-.3-.8-.8z"/></svg>',
    next:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M12 3.2c0-.5-.4-.8-.8-.8s-.8.3-.8.8v3.9l-6-4.4c-.6-.4-1.4 0-1.4.8v8.9c0 .8.8 1.2 1.4.8l6-4.4v3.9c0 .5.4.8.8.8s.8-.3.8-.8z"/></svg>',
    play:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.4 2.5c0-.8.9-1.3 1.6-.9l8.2 5.1c.6.4.6 1.3 0 1.7L5 13.5c-.7.4-1.6-.1-1.6-.9z"/></svg>',
    pause:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3.6" height="12" rx="1.4"/><rect x="9.4" y="2" width="3.6" height="12" rx="1.4"/></svg>',
    // SF Symbols "gear" — the symbol the app names in
    // Image(systemName: "gear"). A solid hub with eight rounded teeth and a
    // punched centre, not the thin outlined cog this used to draw. Only one
    // gear exists on the page, so the mask id is safe to hard-code.
    gear: (function () {
      var teeth = "";
      for (var a = 0; a < 360; a += 45) {
        teeth += '<rect x="6.85" y="0.9" width="2.3" height="3.6" rx="1.15" ' +
                 'transform="rotate(' + a + ' 8 8)"/>';
      }
      return '<svg viewBox="0 0 16 16" aria-hidden="true">' +
        '<mask id="nt-gear-hole">' +
          '<rect width="16" height="16" fill="#fff"/>' +
          '<circle cx="8" cy="8" r="2.3" fill="#000"/>' +
        '</mask>' +
        '<g mask="url(#nt-gear-hole)" fill="currentColor">' +
          '<circle cx="8" cy="8" r="5.2"/>' + teeth +
        '</g></svg>';
    })(),
    ghost:
      '<svg viewBox="0 0 18 26" aria-hidden="true"><path d="M2 1.3 15.4 14 9.6 14.4l3.2 7.1-2.9 1.3-3.2-7.2L2 20z" fill="#fff" stroke="#111" stroke-width="1.1" stroke-linejoin="round"/></svg>'
  };

  // ---- Build the screen ------------------------------------------------
  function settingRow(key, title, caption) {
    return '<div class="nt-row">' +
      '<span class="nt-row-text">' +
        '<span class="nt-row-title">' + title + '</span>' +
        '<span class="nt-row-cap">' + caption + '</span>' +
      '</span>' +
      '<button class="nt-switch" type="button" role="switch" data-set="' + key + '" ' +
        'aria-label="' + title + '"><span class="nt-knob"></span></button>' +
    '</div>';
  }

  function build() {
    root.innerHTML =
      '<div class="nt-wall"></div>' +
      '<div class="nt-menubar">' +
        '<div class="nt-menu-left">' +
          // Short on purpose. Pushed in this close the expanded panel reaches
          // roughly a third of the way across, and a longer menu would run
          // under it and get sliced mid-word — which reads as a broken layout
          // even though a real Mac does exactly that.
          ICON.apple +
          '<span class="nt-app">Finder</span><span>File</span><span>Edit</span>' +
          '<span>View</span>' +
        '</div>' +
        '<div class="nt-menu-gap"></div>' +
        '<div class="nt-menu-right">' +
          ICON.battery + ICON.wifi + ICON.control +
          '<span class="nt-clock"></span>' +
        '</div>' +
      '</div>' +

      '<div class="nt-notch">' +
        '<div class="nt-shadow"></div>' +
        '<span class="nt-fillet nt-fillet-l"></span>' +
        '<span class="nt-fillet nt-fillet-r"></span>' +
        '<div class="nt-body">' +

          '<div class="nt-pane nt-pane-peek is-shown">' +
            '<div class="nt-peek">' +
              '<span class="nt-art nt-art-peek"></span>' +
              '<span class="nt-bars nt-bars-peek"></span>' +
            '</div>' +
          '</div>' +

          '<div class="nt-pane nt-pane-music">' +
            '<div class="nt-music">' +
              '<div class="nt-track">' +
                '<span class="nt-art nt-art-full"></span>' +
                '<span class="nt-meta">' +
                  '<span class="nt-title"></span>' +
                  '<span class="nt-artist"></span>' +
                '</span>' +
                '<span class="nt-bars nt-bars-full"></span>' +
              '</div>' +
              '<div class="nt-scrub">' +
                '<span class="nt-time nt-time-l">0:00</span>' +
                '<span class="nt-track-line"><span class="nt-rail">' +
                  '<span class="nt-fill"></span>' +
                '</span></span>' +
                '<span class="nt-time nt-time-r">-0:00</span>' +
              '</div>' +
              '<div class="nt-transport">' +
                '<button class="nt-btn nt-btn-side nt-prev" type="button" aria-label="Previous track">' + ICON.prev + '</button>' +
                '<button class="nt-btn nt-btn-play" type="button" aria-label="Play or pause">' +
                  '<span class="nt-glyph nt-glyph-play">' + ICON.play + '</span>' +
                  '<span class="nt-glyph nt-glyph-pause">' + ICON.pause + '</span>' +
                '</button>' +
                '<button class="nt-btn nt-btn-side nt-next" type="button" aria-label="Next track">' + ICON.next + '</button>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div class="nt-pane nt-pane-shots">' +
            '<div class="nt-shots"></div>' +
          '</div>' +

          '<div class="nt-pane nt-pane-toast">' +
            '<div class="nt-toast">' +
              '<span class="nt-toast-text"></span>' +
              '<svg class="nt-check" viewBox="0 0 22 22" aria-hidden="true">' +
                '<circle cx="11" cy="11" r="10"/>' +
                '<path d="M6.5 11.4 9.2 14.1 15.5 7.8"/>' +
              '</svg>' +
            '</div>' +
          '</div>' +

          // One gear, sitting above the tabs rather than inside each of them
          // — the app puts it in the root ZStack, outside tabContent, so it
          // stays put while the tab underneath changes.
          '<button class="nt-gear" type="button" aria-label="Settings">' + ICON.gear + '</button>' +

        '</div>' +
      '</div>' +

      '<div class="nt-flash"></div>' +
      '<div class="nt-ghost">' + ICON.ghost + '</div>' +

      // Demo scaffolding, kept strictly outside the blob. Everything inside
      // the black shape is the app; everything out here exists because a
      // visitor has no trackpad gesture, no menu bar and no ⇧⌘4 to reach for.
      '<div class="nt-controls">' +
        '<div class="nt-seg" role="tablist" aria-label="Notch panel">' +
          '<span class="nt-seg-glide" aria-hidden="true"></span>' +
          '<button class="nt-seg-btn" type="button" role="tab" data-tab="music">Music</button>' +
          '<button class="nt-seg-btn" type="button" role="tab" data-tab="screenshots">Screenshots</button>' +
        '</div>' +
        '<span class="nt-sep" aria-hidden="true"></span>' +
        '<button class="nt-shoot" type="button">' +
          '<svg viewBox="0 0 20 16" aria-hidden="true">' +
            '<path d="M7.2 1.6h5.6l1.1 2h2.6a1.6 1.6 0 0 1 1.6 1.6v7.6a1.6 1.6 0 0 1-1.6 1.6H3.5a1.6 1.6 0 0 1-1.6-1.6V5.2a1.6 1.6 0 0 1 1.6-1.6h2.6z" ' +
            'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>' +
            '<circle cx="10" cy="9" r="3.1" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
          '</svg>' +
          'Take a screenshot' +
        '</button>' +
      '</div>' +
      '<p class="nt-tip">Hover the notch to open it</p>' +

      /* Settings, straight out of SettingsView.swift: a grouped Form, one
         Screenshots section, two toggles, 480x260 in a titled/closable/
         miniaturizable window called "Notch Settings". Labels and captions
         are the source's strings verbatim. Both toggles actually do
         something here — see fireScreenshot and makeShot. */
      '<div class="nt-settings" hidden>' +
        '<div class="nt-win" role="dialog" aria-label="Notch Settings">' +
          '<div class="nt-win-bar">' +
            '<span class="nt-lights">' +
              '<button class="nt-light nt-light-close" type="button" aria-label="Close settings"></button>' +
              '<span class="nt-light nt-light-min"></span>' +
              // styleMask has no .resizable, so zoom is disabled — grey, not green.
              '<span class="nt-light nt-light-zoom"></span>' +
            '</span>' +
            '<span class="nt-win-title">Notch Settings</span>' +
          '</div>' +
          '<div class="nt-form">' +
            '<h2 class="nt-form-header">Screenshots</h2>' +
            '<div class="nt-group">' +
              settingRow("route",
                "Save screenshots to a Screenshots folder",
                "Routes captures into ~/Desktop/Screenshots so your Desktop stays clean.") +
              '<span class="nt-row-div"></span>' +
              settingRow("clipboard",
                "Copy new screenshots to the clipboard",
                "Paste a screenshot the moment you’ve taken it.") +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Clicking a thumbnail opens the file on a real Mac. There is no file
      // here, so it opens a preview — which at least means the same thing.
      '<div class="nt-preview" hidden>' +
        '<div class="nt-preview-win" role="dialog" aria-label="Screenshot preview">' +
          // No traffic lights on this bar: the artwork inside is itself a
          // picture of a window with its own, and two stacked sets of dots
          // read as two stacked title bars.
          '<div class="nt-preview-bar">' +
            '<span class="nt-preview-name"></span>' +
            '<button class="nt-preview-x" type="button" aria-label="Close preview">&times;</button>' +
          '</div>' +
          '<div class="nt-preview-body"></div>' +
        '</div>' +
      '</div>';

    el.notch = root.querySelector(".nt-notch");
    el.panePeek = root.querySelector(".nt-pane-peek");
    el.paneMusic = root.querySelector(".nt-pane-music");
    el.paneShots = root.querySelector(".nt-pane-shots");
    el.paneToast = root.querySelector(".nt-pane-toast");
    el.clock = root.querySelector(".nt-clock");
    el.artPeek = root.querySelector(".nt-art-peek");
    el.artFull = root.querySelector(".nt-art-full");
    el.title = root.querySelector(".nt-title");
    el.artist = root.querySelector(".nt-artist");
    el.timeL = root.querySelector(".nt-time-l");
    el.timeR = root.querySelector(".nt-time-r");
    el.line = root.querySelector(".nt-track-line");
    el.fill = root.querySelector(".nt-fill");
    el.glyphPlay = root.querySelector(".nt-glyph-play");
    el.glyphPause = root.querySelector(".nt-glyph-pause");
    el.shots = root.querySelector(".nt-shots");
    el.toast = root.querySelector(".nt-toast");
    el.toastText = root.querySelector(".nt-toast-text");
    el.flash = root.querySelector(".nt-flash");
    el.ghost = root.querySelector(".nt-ghost");
    el.seg = root.querySelector(".nt-seg");
    el.glide = root.querySelector(".nt-seg-glide");
    el.shoot = root.querySelector(".nt-shoot");
    el.settings = root.querySelector(".nt-settings");
    el.preview = root.querySelector(".nt-preview");
    el.previewBody = root.querySelector(".nt-preview-body");
    el.previewName = root.querySelector(".nt-preview-name");

    buildBars(root.querySelector(".nt-bars-peek"));
    buildBars(root.querySelector(".nt-bars-full"));
    buildSegments();
    buildShots();
    buildToastText();
    renderSettings();
  }

  function buildBars(host) {
    for (var i = 0; i < 6; i++) {
      host.appendChild(document.createElement("span")).className = "nt-bar";
    }
  }

  /* Selecting a tab also opens the notch and pins it briefly. Without the
     pin the hover watcher shuts it again the moment the pointer — which is
     down here on the button, nowhere near the blob — is next sampled, and
     the button would look broken. */
  function buildSegments() {
    el.seg.querySelectorAll(".nt-seg-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        stopTour();
        setTab(b.getAttribute("data-tab"));
        st.toast = false;
        setOpen(true);
        renderPanes();
        pin(1.1);
        scheduleClose(1.2);
      });
    });
  }

  /* macOS names captures "Screenshot 2026-07-21 at 5.34.12 PM.png" — periods
     in the time, not colons. The folder in front of it is the whole point of
     the routing toggle, so it is recorded per shot at the moment of capture
     rather than read live: flipping the setting changes where the NEXT one
     goes, exactly as it does on a real machine. */
  function shotName() {
    var d = new Date();
    var day = d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
    var time = d.toLocaleTimeString("en-US", {
      hour: "numeric", minute: "2-digit", second: "2-digit"
    }).replace(/:/g, ".");
    return "Screenshot " + day + " at " + time + ".png";
  }

  function makeShot(shot) {
    if (!shot.file) shot.file = shotName();
    if (!shot.dir) shot.dir = st.settings.route ? "~/Desktop/Screenshots" : "~/Desktop";
    var card = document.createElement("div");
    card.className = "nt-shot";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", "Open screenshot from " + shot.age);
    card.innerHTML = shotArt(shot.kind);
    var stamp = document.createElement("span");
    stamp.className = "nt-stamp";
    stamp.textContent = shot.age;
    card.appendChild(stamp);
    card._shot = shot;
    return card;
  }

  function buildShots() {
    SHOTS.forEach(function (shot) { el.shots.appendChild(makeShot(shot)); });
  }

  function buildToastText(text) {
    // CascadeText: one span per character so each can spring in on its own
    // delay. Spaces become non-breaking so the run doesn't collapse.
    text = text || "Screenshot copied to clipboard";
    el.toastText.innerHTML = "";
    for (var i = 0; i < text.length; i++) {
      var s = document.createElement("span");
      s.className = "nt-ch";
      s.textContent = text[i] === " " ? " " : text[i];
      s.style.setProperty("--d", (0.34 + i * 0.018).toFixed(3) + "s");
      el.toastText.appendChild(s);
    }
    var end = 0.34 + text.length * 0.018 + 0.04;
    el.toast.style.setProperty("--ring-d", end.toFixed(3) + "s");
    el.toast.style.setProperty("--check-d", (end + 0.34).toFixed(3) + "s");
  }

  // ---- Scale -----------------------------------------------------------
  function rescale() {
    var s = Math.min(
      PANEL_W_FRAC * window.innerWidth / PANEL_W,
      PANEL_H_FRAC * window.innerHeight / PANEL_H
    );
    root.style.setProperty("--s", Math.max(SCALE_MIN, Math.min(SCALE_MAX, s)));

    /* The settings window gets its OWN scale, deliberately not the notch's.
       --s is a zoom — the view is pushed in on the notch so a 13.5pt track
       title can be read. Applying that same zoom to a 480x260 window blew it
       up to two thirds of the frame, which is nothing like the modest panel
       the app actually opens. So this one is drawn at its true proportion of
       a screen instead: 480 of 1512 points, about a third of the width. The
       second term keeps it under half the frame's height on short frames,
       where a true-proportion window would run off the bottom. */
    var ws = Math.min(window.innerWidth / 1512, window.innerHeight * 0.5 / 260);
    root.style.setProperty("--ws", Math.max(0.42, Math.min(1.2, ws)));
  }

  // ---- Clock -----------------------------------------------------------
  function tickClock() {
    var d = new Date();
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var h = d.getHours();
    var ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    var m = String(d.getMinutes()).padStart(2, "0");
    el.clock.textContent = days[d.getDay()] + " " + h + ":" + m + " " + ampm;
  }

  // ---- Rendering -------------------------------------------------------
  function track() { return TRACKS[st.track]; }

  /* Try the sleeve once per track and remember the answer. A missing file is
     the expected case, not an error — the gradient it falls back to is a
     complete design, not a broken image. */
  function resolveArt(t) {
    if (!t.artFile || t.artTried) return;
    t.artTried = true;
    var probe = new Image();
    probe.onload = function () {
      t.art = 'url("' + t.artFile + '") center / cover no-repeat';
      if (track() === t) renderTrack();
    };
    probe.src = t.artFile;
  }

  function renderTrack() {
    var t = track();
    resolveArt(t);
    el.title.textContent = t.title;
    el.artist.textContent = t.artist;
    el.artPeek.style.background = t.art;
    el.artFull.style.background = t.art;
    // displayAccent tints the bars and the progress fill — and only those.
    // The pane's own colour stays white, because the app applies
    // .foregroundStyle(.white) to the whole tab and lets the accent reach
    // just those two elements; setting it as the inherited colour instead
    // tints the track title along with them.
    el.paneMusic.style.setProperty("--accent", t.accent);
    el.panePeek.style.setProperty("--accent", t.accent);
  }

  function fmt(s) {
    s = Math.max(0, Math.round(s));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function renderProgress() {
    var t = track();
    var f = t.duration > 0 ? st.elapsed / t.duration : 0;
    el.fill.style.width = (f * 100).toFixed(2) + "%";
    el.timeL.textContent = fmt(st.elapsed);
    el.timeR.textContent = "-" + fmt(t.duration - st.elapsed);
  }

  function renderPlayState() {
    el.glyphPlay.style.opacity = st.playing ? 0 : 1;
    el.glyphPause.style.opacity = st.playing ? 1 : 0;
  }

  function renderControls() {
    var i = TABS.indexOf(st.tab);
    el.glide.style.transform = "translateX(" + (i * 100) + "%)";
    el.seg.querySelectorAll(".nt-seg-btn").forEach(function (b, n) {
      var on = n === i;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  /* One place decides which pane is visible, because the three states are
     mutually exclusive and drifting them apart is how you end up with a
     toast painted over a music tab. */
  function renderPanes() {
    var showing = st.toast ? "toast" : (st.open ? st.tab : "peek");
    el.panePeek.classList.toggle("is-shown", showing === "peek");
    el.paneMusic.classList.toggle("is-shown", showing === "music");
    el.paneShots.classList.toggle("is-shown", showing === "screenshots");
    el.paneToast.classList.toggle("is-shown", showing === "toast");
    el.notch.classList.toggle("is-open", st.open && !st.toast);
    el.notch.classList.toggle("is-toast", st.toast);
  }

  // ---- State transitions -----------------------------------------------
  function setOpen(v) {
    if (st.open === v) return;
    st.open = v;
    renderPanes();
  }

  function setTab(name) {
    if (st.tab === name) return;
    st.tab = name;
    renderPanes();
    renderControls();
  }

  function stepTab(dir) {
    // The app stops at the ends rather than wrapping.
    var i = TABS.indexOf(st.tab) + dir;
    if (i < 0 || i >= TABS.length) return;
    setTab(TABS[i]);
  }

  function pin(seconds) {
    st.pinnedUntil = performance.now() + seconds * 1000;
  }

  function scheduleClose(after) {
    clearTimeout(closeTimer);
    closeTimer = setTimeout(function () {
      st.toast = false;
      if (!st.pointerIn) setOpen(false);
      renderPanes();
    }, after * 1000);
  }

  /* presentScreenshotToast: flash the screen, drop a new thumb at the head
     of the shelf, and pop the banner. Tab is set to screenshots so that
     dismissing the banner early reveals the strip it's talking about. */
  function fireScreenshot() {
    el.flash.classList.remove("is-firing");
    void el.flash.offsetWidth;
    el.flash.classList.add("is-firing");

    st.toast = false;
    renderPanes();

    /* The banner's wording follows the clipboard toggle. Worth noting: the
       app itself says "Screenshot copied to clipboard" either way — the
       copy is gated on the setting in AppEnvironment.start(), but the toast
       that announces it is not. Here the message tracks what actually
       happened, because a demo whose job is to show the toggle working
       cannot also tell you it copied something it didn't. */
    buildToastText(st.settings.clipboard
      ? "Screenshot copied to clipboard"
      : "Screenshot saved");

    // Restart the cascade from the top each time.
    el.toast.classList.remove("is-running");
    void el.toast.offsetWidth;

    // A capture that leaves the shelf unchanged makes the shelf look like
    // decoration. Drop the new one at the head, where macOS would put it.
    var fresh = makeShot({ kind: "desktop", age: "just now" });
    el.shots.insertBefore(fresh, el.shots.firstChild);
    while (el.shots.children.length > 9) el.shots.removeChild(el.shots.lastChild);
    el.shots.querySelectorAll(".nt-stamp").forEach(function (n, i) {
      if (i === 1 && n.textContent === "just now") n.textContent = "a moment ago";
    });

    st.toast = true;
    st.tab = "screenshots";
    st.open = true;
    // The app pins 2.25s and collapses at 2.35s. The banner's own animation
    // runs ~1.5s of that, which leaves under a second to actually read it —
    // fine on your own machine where you know what it says, too quick for
    // someone seeing it for the first time. Stretched, and only here.
    pin(TOAST_PIN);
    renderPanes();
    renderControls();
    el.toast.classList.add("is-running");
    el.shots.scrollLeft = 0;
    scheduleClose(TOAST_CLOSE);
  }

  // ---- Hover watcher ---------------------------------------------------
  /* The app polls the cursor against the *visible* blob rather than using a
     tracking area, because the blob changes size underneath the pointer.
     Same here: hit-test the live rect, so the hover region grows with the
     panel and a cursor that entered over the pill keeps it open as it
     expands past them. */
  function hitsBlob(x, y) {
    var r = el.notch.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function onPointerMove(e) {
    st.pointerIn = hitsBlob(e.clientX, e.clientY);
    if (st.pointerIn) {
      if (!st.open) setOpen(true);
      else if (st.toast && performance.now() > st.pinnedUntil) {
        // The banner's time is up — reveal the tabs underneath it.
        st.toast = false;
        renderPanes();
      }
    } else if (st.open && performance.now() > st.pinnedUntil) {
      setOpen(false);
    }
  }

  // ---- Animation loop --------------------------------------------------
  var bars = null;

  function frame(now) {
    if (!bars) bars = root.querySelectorAll(".nt-bar");
    var t = now / 1000;

    // DancingBars' no-signal fallback: two summed sines per bar, phase-offset
    // down the row, so the motion is organic and never repeats on a beat.
    for (var i = 0; i < bars.length; i++) {
      var h;
      if (!st.playing) {
        h = 0.14;                      // restHeight
      } else {
        var phase = (i % 6) * 1.1;
        var a = Math.sin(t * 5.2 + phase) * 0.5 + 0.5;
        var b = Math.sin(t * 9.7 + phase * 2.1) * 0.5 + 0.5;
        h = 0.22 + (a * 0.6 + b * 0.4) * 0.78;
      }
      bars[i].style.transform = "scaleY(" + h.toFixed(3) + ")";
    }

    // Playback clock
    if (st.lastTick) {
      var dt = (now - st.lastTick) / 1000;
      if (st.playing && !st.dragging) {
        st.elapsed += dt;
        if (st.elapsed >= track().duration) {
          st.elapsed = 0;
          st.track = (st.track + 1) % TRACKS.length;
          renderTrack();
        }
        renderProgress();
      }
    }
    st.lastTick = now;

    requestAnimationFrame(frame);
  }

  // ---- Controls --------------------------------------------------------
  function press(btn, action) {
    // Press down snappy, release springy — the app builds this by hand
    // because a stock Button drags macOS's grey pressed tint along with it.
    btn.addEventListener("pointerdown", function (e) {
      e.stopPropagation();
      stopTour();
      btn.classList.add("is-pressed");
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) {
      btn.addEventListener(ev, function () { btn.classList.remove("is-pressed"); });
    });
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      stopTour();
      action();
    });
  }

  function wireControls() {
    press(root.querySelector(".nt-prev"), function () {
      // Restart the track first, jump back only if already near the top —
      // the transport convention everywhere.
      if (st.elapsed > 3) { st.elapsed = 0; }
      else { st.track = (st.track - 1 + TRACKS.length) % TRACKS.length; st.elapsed = 0; renderTrack(); }
      renderProgress();
    });

    press(root.querySelector(".nt-next"), function () {
      st.track = (st.track + 1) % TRACKS.length;
      st.elapsed = 0;
      renderTrack();
      renderProgress();
    });

    press(root.querySelector(".nt-btn-play"), function () {
      st.playing = !st.playing;
      renderPlayState();
    });

    // SettingsWindowController presents a single window and brings the
    // existing one forward on repeat clicks rather than stacking copies — so
    // a second gear press here is a no-op, not a second window.
    press(root.querySelector(".nt-gear"), function () { showOverlay(el.settings); });

    el.settings.querySelectorAll(".nt-switch").forEach(function (sw) {
      sw.addEventListener("click", function () {
        var key = sw.getAttribute("data-set");
        st.settings[key] = !st.settings[key];
        renderSettings();
      });
    });
    el.settings.querySelector(".nt-light-close")
      .addEventListener("click", function () { hideOverlay(el.settings); });

    // Scrubber: follow the pointer while down, seek on release.
    function seekFrom(e) {
      var r = el.line.getBoundingClientRect();
      var f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      st.elapsed = f * track().duration;
      renderProgress();
    }
    el.line.addEventListener("pointerdown", function (e) {
      e.stopPropagation();
      stopTour();
      st.dragging = true;
      el.line.classList.add("is-dragging");
      el.line.setPointerCapture(e.pointerId);
      seekFrom(e);
    });
    el.line.addEventListener("pointermove", function (e) {
      if (st.dragging) seekFrom(e);
    });
    ["pointerup", "pointercancel"].forEach(function (ev) {
      el.line.addEventListener(ev, function () {
        st.dragging = false;
        el.line.classList.remove("is-dragging");
      });
    });

    /* Clicking a thumb opens it. It used to re-fire the "copied to
       clipboard" banner, which was simply the wrong verb — the app opens
       the file on click and keeps Copy on the context menu, and a tap that
       silently claims to have taken your clipboard is worse than one that
       does nothing. */
    el.shots.addEventListener("click", function (e) {
      var card = e.target.closest(".nt-shot");
      if (card) { stopTour(); openPreview(card); }
    });
    el.shots.addEventListener("keydown", function (e) {
      var card = e.target.closest(".nt-shot");
      if (card && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        stopTour();
        openPreview(card);
      }
    });

    el.preview.addEventListener("click", function (e) {
      if (e.target.closest(".nt-preview-x") || !e.target.closest(".nt-preview-win")) {
        hideOverlay(el.preview);
      }
    });

    el.shoot.addEventListener("click", function () {
      stopTour();
      fireScreenshot();
    });
  }

  // ---- Overlays --------------------------------------------------------
  /* Settings and preview are both windows over the desktop, and both fade.
     Unhiding has to land its own frame before the class goes on, or the
     transition starts from the shown state and there is nothing to fade;
     hiding has to wait the transition out, and re-check on the way in case
     it was reopened inside those 200ms. */
  function showOverlay(node) {
    node.hidden = false;
    void node.offsetWidth;
    node.classList.add("is-open");
  }

  function hideOverlay(node) {
    node.classList.remove("is-open");
    setTimeout(function () {
      if (!node.classList.contains("is-open")) node.hidden = true;
    }, 200);
  }

  // ---- Settings --------------------------------------------------------
  function renderSettings() {
    el.settings.querySelectorAll(".nt-switch").forEach(function (sw) {
      var on = !!st.settings[sw.getAttribute("data-set")];
      sw.classList.toggle("is-on", on);
      sw.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  // ---- Preview ---------------------------------------------------------
  function openPreview(card) {
    // Every .nt-shot comes from makeShot, so the record is always there.
    var shot = card._shot;
    el.previewBody.innerHTML = shotArt(shot.kind);
    el.previewName.textContent = shot.dir + "/" + shot.file;
    showOverlay(el.preview);
  }

  // ---- Input -----------------------------------------------------------
  function wireInput() {
    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerleave", function () {
      st.pointerIn = false;
      if (performance.now() > st.pinnedUntil) setOpen(false);
    });

    /* Two-finger horizontal swipe, kept as a shortcut for anyone on a
       trackpad — but it can no longer be the way you're expected to find
       the second tab. On a web page the browser claims that gesture for
       back-navigation, so swiping the demo used to walk you off the site.
       Hence: NOT passive, so the handler can call preventDefault and keep
       the gesture; plus overscroll-behavior in the CSS to stop the history
       swipe outright; plus the visible control panel, which is now the way
       this is meant to be used. */
    var swipeLock = 0;
    root.addEventListener("wheel", function (e) {
      var horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (horizontal && e.cancelable) e.preventDefault();
      if (!st.open || st.toast) return;
      var now = performance.now();
      if (now < swipeLock) return;
      if (Math.abs(e.deltaX) > 5 && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.3) {
        stopTour();
        stepTab(e.deltaX < 0 ? 1 : -1);
        swipeLock = now + 350;
      }
    }, { passive: false });

    window.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { stopTour(); setOpen(true); stepTab(1); }
      else if (e.key === "ArrowLeft") { stopTour(); setOpen(true); stepTab(-1); }
      else if (e.key === " ") { stopTour(); st.playing = !st.playing; renderPlayState(); e.preventDefault(); }
      // ⇧⌘4 is the macOS screenshot shortcut the app watches for the results of
      else if (e.key === "4" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        stopTour();
        fireScreenshot();
      }
      else if (e.key === "Escape") { hideOverlay(el.preview); hideOverlay(el.settings); }
    });

    window.addEventListener("resize", rescale);
  }

  // ---- The tour --------------------------------------------------------
  /* A scripted run through everything the app does, driven by a ghost
     cursor so it reads as someone using it rather than as an animation
     playing. It yields permanently on the first real input — a visitor who
     has taken hold of it should never have the thing move on its own
     underneath them. */

  var tourTimers = [];

  function at(ms, fn) {
    tourTimers.push(setTimeout(fn, ms));
  }

  function ghostTo(x, y, ms) {
    el.ghost.style.transition = "transform " + ms + "ms cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease";
    el.ghost.style.transform = "translate(" + x + "px, " + y + "px)";
  }

  /* Move the ghost onto a control and light that control's hover state by
     hand. Only one thing is hovered at a time, same as a real pointer. */
  var ghostHovering = null;
  function ghostOver(node, ms) {
    if (ghostHovering) ghostHovering.classList.remove("is-ghost-hover");
    ghostHovering = node || null;
    if (!node) return;
    node.classList.add("is-ghost-hover");
    var r = node.getBoundingClientRect();
    ghostTo(r.left + r.width / 2, r.top + r.height / 2, ms || 550);
  }

  function ghostTap(node, action) {
    el.ghost.classList.add("is-clicking");
    if (node) node.classList.add("is-pressed");
    setTimeout(function () {
      el.ghost.classList.remove("is-clicking");
      if (node) node.classList.remove("is-pressed");
      if (action) action();
    }, 130);
  }

  function notchCentre(fracX, fracY) {
    var r = el.notch.getBoundingClientRect();
    return { x: r.left + r.width * fracX, y: r.top + r.height * fracY };
  }

  function runTour() {
    if (!st.tour) return;
    clearTimeout(closeTimer);
    tourTimers.forEach(clearTimeout);
    tourTimers = [];

    var w = window.innerWidth, h = window.innerHeight;

    // Launch greeting: the app opens itself for 1.8s so it's discoverable
    // without a hover. Same here, and it doubles as the tour's cold open.
    st.tab = "music";
    setOpen(true);
    renderControls();
    at(1800, function () { setOpen(false); });

    // Cursor wakes up down on the desktop, then goes for the notch.
    el.ghost.style.transition = "none";
    el.ghost.style.transform = "translate(" + (w * 0.46) + "px, " + (h * 0.62) + "px)";
    at(2100, function () { el.ghost.classList.add("is-on"); });
    at(2300, function () {
      var p = notchCentre(0.5, 0.6);
      ghostTo(p.x, p.y, 1100);
    });
    at(3300, function () { setOpen(true); setTab("music"); });

    // Drag the scrubber, so the thing a static screenshot can never show —
    // that the bar fattens under the pointer and seeks — actually happens.
    at(4200, function () { ghostOver(el.line, 550); });
    at(4900, function () {
      var r = el.line.getBoundingClientRect();
      st.elapsed = track().duration * 0.62;
      renderProgress();
      ghostTo(r.left + r.width * 0.62, r.top + r.height / 2, 600);
    });

    // Pause and resume, so the bars visibly drop to rest and come back.
    var play = root.querySelector(".nt-btn-play");
    at(5800, function () { ghostOver(play, 500); });
    at(6400, function () {
      ghostTap(play, function () { st.playing = false; renderPlayState(); });
    });
    at(7400, function () {
      ghostTap(play, function () { st.playing = true; renderPlayState(); });
    });

    // Reach down and press Screenshots on the control panel. The tour used
    // to just swipe here, which demonstrated a gesture the visitor has no
    // way to guess at and — on a trackpad, over a web page — would have
    // triggered a back-navigation instead. Pressing the visible control
    // teaches something they can actually repeat.
    var segShots = el.seg.querySelectorAll(".nt-seg-btn")[1];
    at(8200, function () { ghostOver(segShots, 750); });
    at(9050, function () {
      ghostTap(segShots, function () {
        setTab("screenshots");
        st.toast = false;
        setOpen(true);
        renderPanes();
      });
    });
    at(9700, function () {
      ghostOver(el.shots.querySelectorAll(".nt-shot")[1], 700);
    });

    // Then press Take a screenshot: shutter, new thumb, copied banner.
    at(11000, function () { ghostOver(el.shoot, 750); });
    at(11850, function () { ghostTap(el.shoot, fireScreenshot); });

    // Let it collapse on its own, pause on the empty desktop, go again.
    at(15600, function () {
      ghostOver(null);
      el.ghost.classList.remove("is-on");
    });
    at(16800, function () { if (st.tour) runTour(); });
  }

  function stopTour() {
    if (!st.tour) return;
    st.tour = false;
    tourTimers.forEach(clearTimeout);
    tourTimers = [];
    ghostOver(null);
    el.ghost.classList.remove("is-on");
    clearTimeout(closeTimer);
    st.pinnedUntil = 0;
    // Hand back a clean slate: closed unless the visitor is already on it.
    // The hint bar stays — it's the demo's only mouse-reachable way to fire
    // a screenshot, and taking it away the moment they engage is backwards.
    if (!st.pointerIn) { st.toast = false; setOpen(false); renderPanes(); }
  }

  // ---- Boot ------------------------------------------------------------
  build();
  rescale();
  tickClock();
  setInterval(tickClock, 20000);
  renderTrack();
  renderProgress();
  renderPlayState();
  renderControls();
  renderPanes();
  wireControls();
  wireInput();
  requestAnimationFrame(frame);

  // Any genuine input at all ends the tour — including a pointer that just
  // arrives, which is why this listens on the window rather than the blob.
  ["pointerdown", "wheel", "keydown"].forEach(function (ev) {
    window.addEventListener(ev, stopTour, { once: true, passive: true });
  });
  // A pointer that merely *arrives* — because the iframe scrolled into view,
  // or because the expand animation landed the frame under a cursor that
  // never moved — is not the visitor reaching for anything, so it shouldn't
  // cost them the tour. Wait for actual travel, measured against the first
  // position seen.
  //
  // Not movementX/Y: those are 0 on the first event of any stream, so a
  // single deliberate move was being read as "hasn't moved" and slipped
  // through. Comparing coordinates is true regardless of how the event was
  // generated.
  var origin = null;
  window.addEventListener("pointermove", function onMove(e) {
    if (!origin) { origin = { x: e.clientX, y: e.clientY }; return; }
    if (Math.abs(e.clientX - origin.x) + Math.abs(e.clientY - origin.y) < 3) return;
    window.removeEventListener("pointermove", onMove);
    stopTour();
  });

  runTour();
})();
