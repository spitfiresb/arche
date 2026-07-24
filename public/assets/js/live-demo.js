/* Live-demo component. Drop-in usage:
 *
 *   <link rel="stylesheet" href="/assets/css/live-demo.css">
 *   <figure class="ld-thumb" data-live-demo="/demos/notch/"
 *           tabindex="0" role="button" aria-label="Expand the live demo">
 *     <img src="/assets/img/notch/preview.png" alt="...">
 *   </figure>
 *   <script src="/assets/js/live-demo.js"></script>
 *
 * data-live-demo is anything an iframe can load: a file, or a directory whose
 * index the server resolves, which is what the demos here pass, so the app's
 * own relative paths keep working.
 *
 * Optional data attributes on the figure:
 *   data-ready="canvas":  wait until the app's <canvas> has pixels before
 *                          treating it as ready (same-origin apps only);
 *                          default is the iframe's load event.
 *   data-bg="#fdfbf7":    frame/poster background while the app boots
 *                          (default #0d0d0d).
 *   data-title="Foo":     accessible title for the iframe.
 *   data-mobile="native": the app is responsive: at fullscreen on a narrow
 *                          viewport it lays out at the viewport's own width
 *                          (its mobile layout) instead of as a scaled-down
 *                          desktop canvas. Parked previews are unaffected.
 *
 * The overlay and the expand mark are built by this script; nothing else to
 * add to the page. Multiple demos per page are supported.
 */
(function () {
  'use strict';

  // Reduced motion collapses the durations rather than removing the
  // transitions: open/close still finish on 'transitionend', which a
  // `transition: none` override would never fire.
  var still = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The expansion eases OUT (fast then slow) over 1.7s; the close eases
  // IN (slow then fast) over 1.05s. The two curves are mirror images, so
  // the open and close read as one motion run in reverse.
  var GROW   = still ? 'transform 0.01s linear'
                     : 'transform 1.7s cubic-bezier(0.45, 0.45, 0.45, 1)';
  var SHRINK = still ? 'transform 0.01s linear'
                     : 'transform 1.05s cubic-bezier(0.55, 0, 0.55, 0.55)';
  var FADE   = still ? 'opacity 0.01s linear' : 'opacity 0.45s ease';
  // The rounded corner morphs to square as the frame grows, and back as it
  // shrinks, on the SAME clock as the transform, so the corners are only
  // fully sharp once the frame is fully expanded, and round again by the
  // time it's back on the thumbnail. Same durations and easings as GROW /
  // SHRINK, appended to their transition so both properties move together.
  var GROW_R   = still ? 'border-radius 0.01s linear'
                       : 'border-radius 1.7s cubic-bezier(0.45, 0.45, 0.45, 1)';
  var SHRINK_R = still ? 'border-radius 0.01s linear'
                       : 'border-radius 1.05s cubic-bezier(0.55, 0, 0.55, 0.55)';

  // Below this viewport width the fullscreen expansion is off entirely:
  // phones, and desktop windows squeezed this narrow. The parked live
  // miniatures still run; a click just doesn't open them. live-demo.css
  // hides the expand mark under the same threshold (43.75rem = 700px) so
  // the preview never advertises an interaction this guard refuses.
  var EXPAND_MIN_W = 700;
  function canExpand() { return window.innerWidth >= EXPAND_MIN_W; }

  function init(thumb) {
    var app      = thumb.getAttribute('data-live-demo');
    var thumbImg = thumb.querySelector('img');
    var bg       = thumb.getAttribute('data-bg') || '#0d0d0d';

    // The expand mark. Built here rather than written into every figure: it
    // advertises an interaction only this script can perform, so a page
    // without it shouldn't show one, and six hand-copied SVGs are six
    // chances to drift. It sits at rest as opacity:0, so it costs nothing
    // to arrive a frame after the page's own first paint.
    var expand = document.createElement('span');
    expand.className = 'ld-expand';
    expand.setAttribute('aria-hidden', 'true');
    expand.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
      + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<g class="ld-arrow ld-arrow-tr">'
      + '<line pathLength="1" x1="14" y1="10" x2="21" y2="3"/>'
      + '<polyline pathLength="1" points="15 3 21 3 21 9"/></g>'
      + '<g class="ld-arrow ld-arrow-bl">'
      + '<line pathLength="1" x1="10" y1="14" x2="3" y2="21"/>'
      + '<polyline pathLength="1" points="9 21 3 21 3 15"/></g></svg>';
    thumb.appendChild(expand);

    // Build the overlay: live frame + fallback poster + the way out.
    var overlay = document.createElement('div');
    overlay.className = 'ld-overlay';
    overlay.hidden = true;
    // Tag the overlay with the demo it belongs to (the nearest id'd ancestor
    // of the thumb, e.g. the band's <li id="floorsense">), since the overlay
    // is appended to <body> and otherwise has no link back to its band: a
    // handle for scoping or debugging a single demo.
    var host = thumb.closest('[id]');
    if (host) overlay.dataset.demo = host.id;
    var fw = document.createElement('div');
    fw.className = 'ld-overlay-frame';
    fw.style.background = bg;
    var frame = document.createElement('iframe');
    frame.title = thumb.getAttribute('data-title') || 'Live demo';
    frame.setAttribute('allow', 'fullscreen');
    fw.appendChild(frame);
    var poster = document.createElement('img');
    poster.className = 'ld-overlay-poster';
    poster.src = thumbImg.currentSrc || thumbImg.src;
    poster.alt = '';
    poster.style.background = bg;
    // At fullscreen the demo covers the whole page, header and all, and the
    // embedded apps hide their own navigation when they're framed. So the
    // way out has to be re-provided here, in the site's own visual language:
    // this is the same mark and the same hover as the .back link in
    // style.css, reusing its classes outright so the two can't drift.
    // A <button> rather than an <a>, since it closes rather than navigates.
    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'back ld-back';
    back.setAttribute('aria-label', 'Back');
    back.innerHTML =
      '<svg class="back-mark" viewBox="0 0 40 40" fill="none" '
      + 'stroke="currentColor" aria-hidden="true">'
      + '<circle class="back-ring" cx="20" cy="20" r="15.5" fill="none" '
      + 'stroke-width="1.1" stroke-dasharray="98 200" stroke-dashoffset="98" '
      + 'transform="rotate(-90 20 20)"/>'
      + '<path class="back-chevron" d="M24 14 L16 20 L24 26" fill="none" '
      + 'stroke-width="1.75" stroke-linecap="round" '
      + 'stroke-linejoin="round"/></svg>';

    overlay.appendChild(fw);
    overlay.appendChild(poster);
    overlay.appendChild(back);
    document.body.appendChild(overlay);

    // The embedded apps are desktop layouts; handed a narrow viewport they
    // crumple (headers overlap, cards collapse) long before the site's own
    // breakpoints care. So the iframe never lays out narrower than MIN_APP_W:
    // below that, it keeps a desktop-width canvas and is transform-scaled
    // down to fit the frame, so a narrow window gets a shrunken desktop app
    // instead of a squeezed one. The scale is inside the frame wrapper, so
    // the park/grow transform on the wrapper composes with it.
    //
    // The parked geometry has a second job. The thumb's aspect is clamped
    // (see syncThumbAspect) while the overlay stays at the viewport's, so on
    // a portrait-ish window collapsed() maps overlay onto thumb with sx ≠ sy,
    // which used to squash the parked miniature vertically. Parked, the
    // iframe therefore carries the inverse y-scale (and a canvas height cut
    // to match, so the app lays out at the thumb's own aspect): the two
    // transforms compose back to a uniform scale on screen. Opening animates
    // the compensation away on the grow's own clock; on an unclamped
    // viewport every value collapses to the fullscreen ones and none of
    // this does anything.
    var MIN_APP_W = 1024;
    // data-mobile="native": this app has a real responsive layout, so at
    // fullscreen on a narrow viewport it's handed the viewport's own width
    // and lays out as its mobile self, instead of arriving as a desktop
    // canvas scaled down to unreadable. Parked stays the scaled-down
    // desktop miniature either way: as a preview, a whole desktop app in
    // a card reads better than a phone layout squeezed into one.
    var nativeMobile = thumb.getAttribute('data-mobile') === 'native';
    function frameGeom(parked) {
      var w = overlay.clientWidth, h = overlay.clientHeight;
      var minW = (!parked && nativeMobile && w < MIN_APP_W) ? w : MIN_APP_W;
      var s = Math.min(1, w / minW);
      var iy = s;
      if (parked) {
        var r = thumb.getBoundingClientRect();
        if (r.width && r.height) iy = s * (r.width / w) / (r.height / h);
      }
      return { w: w / s, h: h / iy, sx: s, sy: iy };
    }
    // anim: transition for the inner scale (the grow/shrink curve), or none.
    // keepH: leave the canvas height alone; the close animates only the
    // scale and re-lays the canvas out once the shrink has landed, so the
    // frame never uncovers the overlay's bottom edge mid-flight.
    function setFrameGeom(g, anim, keepH) {
      frame.style.transition = anim || 'none';
      frame.style.width = g.w.toFixed(1) + 'px';
      if (!keepH) frame.style.height = g.h.toFixed(1) + 'px';
      frame.style.transformOrigin = '0 0';
      frame.style.transform =
        'scale(' + g.sx.toFixed(4) + ', ' + g.sy.toFixed(4) + ')';
    }

    var srcSet = false, ready = false, grown = false, revealT = null;
    var readyT = null;     // backstop for the back control's entrance
    var shown = false;     // has the live miniature been revealed at least once
    var rescueT = null;
    var mode = 'poster';   // which element performed the grow this open

    // The screenshot is a fixed-resolution capture; the parked miniature is a
    // live render at the visitor's own viewport. A responsive app laid out at
    // 1512x800 is NOT the same picture as the same app captured at 1440x900,
    // so the two can never be made to line up; showing the screenshot first
    // and the app a moment later always reads as a zoom/jump.
    //
    // So the screenshot is not shown at rest at all: the thumb starts as the
    // app's own background colour and the real thing fades in on top, which is
    // the app painting rather than one picture replacing a different one.
    // `visibility` (not `display`) keeps the image's aspect-ratio box, which is
    // what gives the thumb its height. Without JS the image just stays visible.
    thumb.style.background = bg;
    thumbImg.style.visibility = 'hidden';

    // ...unless the app never boots. Better a slightly-off screenshot than an
    // empty rectangle, so put it back if we're still waiting after 2.5s.
    rescueT = setTimeout(function () {
      if (!ready) thumbImg.style.visibility = '';
    }, 2500);

    // Keep the thumbnail's aspect ratio equal to the viewport's so collapsed()
    // maps the overlay onto it with a uniform scale (sx === sy): the grow is a
    // clean zoom with no stretch. Clamped so a portrait phone doesn't produce
    // an absurdly tall preview card.
    function syncThumbAspect() {
      var ar = window.innerWidth / window.innerHeight;
      thumbImg.style.aspectRatio = Math.max(1.2, Math.min(ar, 2.2));
    }
    syncThumbAspect();

    // Where the overlay's own origin sits relative to the viewport. Parked,
    // the overlay is a normal absolutely-positioned box at the top of the
    // document, so that's the live scroll offset, and the miniature then
    // scrolls with the page natively, no scroll handler, no lag. Open, the
    // body is pinned and the offset is frozen at whatever it was when the
    // lock went on.
    var lockX = 0, lockY = 0, locked = false;
    function originX() { return locked ? lockX : window.scrollX; }
    function originY() { return locked ? lockY : window.scrollY; }

    function lockScroll() {
      if (locked) return;
      lockX = window.scrollX;
      lockY = window.scrollY;
      locked = true;
      document.body.style.top = -lockY + 'px';
      document.body.style.left = -lockX + 'px';
      document.body.classList.add('ld-locked');
    }
    function unlockScroll() {
      if (!locked) return;
      locked = false;
      document.body.classList.remove('ld-locked');
      document.body.style.top = '';
      document.body.style.left = '';
      window.scrollTo(lockX, lockY);
    }

    // Transform that maps the viewport-sized overlay onto the thumbnail's rect.
    function collapsed() {
      var r = thumb.getBoundingClientRect();
      return 'translate(' + (r.left + originX()) + 'px, '
        + (r.top + originY()) + 'px) scale('
        + (r.width / overlay.clientWidth) + ', '
        + (r.height / overlay.clientHeight) + ')';
    }
    // Fullscreen = the overlay shifted back over the visible viewport.
    function expanded() {
      return 'translate(' + originX() + 'px, ' + originY() + 'px)';
    }

    // Parked, the frame is transform-scaled down onto the thumbnail, so a
    // raw border-radius on it would shrink by that same scale and read
    // smaller than intended (and drift as the viewport changes the scale).
    // Publish the scale-compensated radius as --ld-r so the corner lands at
    // the same on-screen size as the thumb's (see live-demo.css). The target
    // is the --ld-corner knob in style.css, so one value drives every demo.
    // Dropped at fullscreen.
    var LD_CORNER = parseFloat(getComputedStyle(document.documentElement)
      .getPropertyValue('--ld-corner')) || 40;
    function setCorner() {
      var r = thumb.getBoundingClientRect();
      var sx = overlay.clientWidth ? r.width / overlay.clientWidth : 1;
      // on the overlay, so the frame AND the fallback poster inherit it
      overlay.style.setProperty('--ld-r',
        sx ? (LD_CORNER / sx).toFixed(1) + 'px' : LD_CORNER + 'px');
    }

    // Start loading the app: full-size and hidden behind the preview, so
    // booting never touches any animation.
    function preload() {
      if (srcSet) return;
      srcSet = true;
      frame.addEventListener('load', function () {
        if (thumb.getAttribute('data-ready') === 'canvas') {
          // 'load' fires long before a heavy app paints. Same-origin apps
          // can opt into polling for a <canvas> with pixels, then settling
          // briefly, at which point "ready" means "fully rendered".
          var poll = setInterval(function () {
            var doc = frame.contentDocument;
            var cv = doc && doc.querySelector('canvas');
            if (cv && cv.width > 0) {
              clearInterval(poll);
              setTimeout(becomeReady, 120);
            }
          }, 40);
          // fallback: never wedge the overlay if the canvas probe misses
          setTimeout(function () { clearInterval(poll); becomeReady(); }, 8000);
        } else {
          setTimeout(becomeReady, 80);
        }
      });
      frame.src = app;
    }
    // A failed navigation still fires 'load' on the iframe (on the blank or
    // error document), so "it loaded" is not the same as "it rendered". If we
    // can see it's empty, treat the app as dead and hand the thumb back to the
    // screenshot rather than revealing an empty rectangle.
    // A cross-origin frame is opaque (contentDocument is null and there's
    // nothing to inspect), so only same-origin apps can be checked, and a
    // failed navigation nulls contentDocument too, which is why the origin
    // test comes first rather than reading a null document as "cross-origin".
    var ownApp = (function () {
      try { return new URL(app, location.href).origin === location.origin; }
      catch (e) { return false; }
    })();

    function frameAlive() {
      if (!ownApp) return true;
      var doc;
      try { doc = frame.contentDocument; } catch (e) { return true; }
      return !!(doc && doc.body && doc.body.childElementCount > 0);
    }

    function becomeReady() {
      if (ready) return;
      if (!frameAlive()) {
        clearTimeout(rescueT);
        thumbImg.style.visibility = '';
        return;
      }
      ready = true;
      clearTimeout(rescueT);
      maybeReveal();
      if (overlay.classList.contains('open')) return;   // fallback grow owns it
      park();
      // Two frames so the browser has committed the parked transform before
      // the opacity transition starts; otherwise it fades in from the wrong
      // place on the very first reveal.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          shown = true;
          thumbImg.style.visibility = 'hidden';
          overlay.classList.add('revealed');
        });
      });
    }

    // Park the live app scaled-down over the thumbnail. From here on the
    // preview IS the running app: the same pixels at rest, during the grow,
    // at fullscreen, and after close. The screenshot stays underneath as a
    // permanent backstop; the miniature just fades in over it.
    function park() {
      if (!ready || overlay.classList.contains('open')) return;
      overlay.hidden = false;
      setFrameGeom(frameGeom(true));   // desktop canvas at the thumb's aspect
      overlay.classList.add('parked');
      poster.hidden = true;
      fw.style.transition = 'none';
      fw.style.transform = collapsed();
      setCorner();
      // becomeReady() owns the very first reveal (it fades in); every later
      // park is a return to a state the visitor has already seen, so snap.
      if (shown) overlay.classList.add('revealed');
      // If the page-entrance animation is still running, the thumb is
      // mid-rise and the rect above is transient. Rather than freeze at a
      // stale spot (or hold the reveal and flash a stand-in), chase it:
      // re-pin every frame until the rise settles, so the miniature rides
      // up with its band.
      if (entranceActive()) requestAnimationFrame(trackEntrance);
    }

    function entranceActive() {
      return /\bpage-enter\b|\bpage-enter-back\b/
        .test(document.documentElement.className);
    }
    function trackEntrance() {
      if (!overlay.classList.contains('parked')) return;
      fw.style.transition = 'none';
      fw.style.transform = collapsed();
      if (entranceActive()) {
        requestAnimationFrame(trackEntrance);
      } else {
        setCorner();   // one last pin against the settled layout
      }
    }

    // Cross-fade to the live app once the poster grow has finished AND the
    // app is ready (fallback path only).
    function maybeReveal() {
      if (!grown || !ready || overlay.hidden || overlay.classList.contains('revealed')) return;
      revealT = setTimeout(function () {
        if (overlay.hidden) return;
        poster.style.transition = FADE;
        shown = true;
        overlay.classList.add('revealed');
      }, 300);
    }

    // The back control waits for the grow to land rather than appearing with
    // the click, so it reads as arriving WITH the app at fullscreen instead
    // of hovering over a rectangle that's still moving. transitionend is the
    // real signal; the timer is only a backstop, because a transition that
    // gets dropped or interrupted must never leave a demo with no way out.
    function armBack() {
      clearTimeout(readyT);
      readyT = setTimeout(showBack, 2000);           // a little over the 1.7s grow
    }
    function showBack() {
      clearTimeout(readyT);
      if (overlay.classList.contains('open')) overlay.classList.add('ld-ready');
    }

    function open() {
      if (!canExpand()) return;
      preload();
      grown = false;
      overlay.hidden = false;
      armBack();
      // Lock BEFORE measuring: the lock freezes the coordinate origin that
      // collapsed()/expanded() are both computed against.
      lockScroll();
      setCorner();   // refresh the parked-scale corner the morph starts from

      if (ready) {
        // The app is already parked on the thumbnail: just grow it.
        mode = 'frame';
        park();                                      // ensure start state
        void fw.offsetWidth;                         // commit it
        overlay.classList.remove('parked');
        overlay.classList.add('open');
        // Undo the parked aspect compensation on the grow's own clock: the
        // canvas snaps to full height (the extra rows stay clipped under
        // the frame while it's still small) and the inner y-scale rides
        // the same curve as the wrapper's transform.
        setFrameGeom(frameGeom(false), GROW);
        fw.style.transition = GROW + ', ' + GROW_R;  // round corner -> square
        fw.style.transform = expanded();
        var doneG = function (e) {
          if (e.propertyName !== 'transform') return;
          fw.removeEventListener('transitionend', doneG);
          showBack();
        };
        fw.addEventListener('transitionend', doneG);
        return;
      }

      // Fallback (clicked before the app finished booting): the still
      // poster grows, then cross-fades to the app once it's ready.
      mode = 'poster';
      setFrameGeom(frameGeom(false));   // boot straight into fullscreen geometry
      poster.hidden = false;
      overlay.classList.remove('revealed');
      poster.style.transition = 'none';
      poster.style.transform = collapsed();
      void poster.offsetWidth;                       // commit the start state
      poster.style.transition = GROW + ', ' + GROW_R;
      poster.style.transform = expanded();
      overlay.classList.add('open');
      poster.addEventListener('transitionend', onGrown);
    }

    function onGrown(e) {
      if (e.propertyName !== 'transform' || !overlay.classList.contains('open')) return;
      poster.removeEventListener('transitionend', onGrown);
      grown = true;
      showBack();          // the poster path's "we're at fullscreen now"
      maybeReveal();
    }

    function close() {
      clearTimeout(revealT);
      clearTimeout(readyT);
      overlay.classList.remove('ld-ready');
      poster.removeEventListener('transitionend', onGrown);
      // Unlock BEFORE measuring: this restores the exact scroll position the
      // lock froze, so the thumbnail is back where collapsed() expects it.
      unlockScroll();

      if (mode === 'frame') {
        // Shrink the live iframe back onto the thumbnail and leave it
        // parked there, still running, no swap back to a screenshot.
        // The parked aspect compensation rides back in on the shrink's
        // clock; the canvas keeps its fullscreen height until the shrink
        // lands (keepH) so the frame never uncovers the overlay's bottom
        // edge mid-flight; doneF below re-lays it out once parked.
        setFrameGeom(frameGeom(true), SHRINK, true);
        fw.style.transition = SHRINK + ', ' + SHRINK_R;  // square -> round again
        fw.style.transform = collapsed();
        // Drop .open (rounds the corners back) but hold the overlay on top
        // via .closing until the shrink lands, so the frame reveals the page
        // from under itself instead of the page popping up over it.
        overlay.classList.remove('open');
        overlay.classList.add('closing');
        var doneF = function (e) {
          if (e.propertyName !== 'transform') return;
          fw.removeEventListener('transitionend', doneF);
          overlay.classList.remove('closing');   // now settle below the page
          overlay.classList.add('parked');
          fw.style.transition = 'none';
          setFrameGeom(frameGeom(true));   // settle the canvas at parked height
        };
        fw.addEventListener('transitionend', doneF);
        return;
      }

      // SHRINK is transform-only for the poster's opacity, so removing
      // .revealed snaps the still poster back over the app instantly; then
      // it shrinks to the thumb, its corner rounding back as it goes.
      poster.style.transition = SHRINK + ', ' + SHRINK_R;
      overlay.classList.remove('revealed');
      poster.style.transform = collapsed();
      // Same as the frame path: keep the overlay on top through the shrink so
      // it reveals the page from under itself rather than dropping behind it.
      overlay.classList.remove('open');
      overlay.classList.add('closing');
      var done = function (e) {
        if (e.propertyName !== 'transform') return;
        poster.removeEventListener('transitionend', done);
        overlay.classList.remove('closing');
        overlay.hidden = true;
        park();   // if the app finished booting meanwhile, park it live
      };
      poster.addEventListener('transitionend', done);
    }

    // Layout changed: re-fit the thumb and re-pin the parked miniature.
    window.addEventListener('resize', function () {
      syncThumbAspect();
      if (overlay.classList.contains('parked')) {
        setFrameGeom(frameGeom(true));
        fw.style.transition = 'none';
        fw.style.transform = collapsed();
        setCorner();
      } else if (!overlay.hidden) {
        setFrameGeom(frameGeom(false));
      }
    });

    thumb.addEventListener('mouseenter', preload);
    thumb.addEventListener('focus', preload);
    thumb.addEventListener('click', open);
    thumb.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    back.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });

    // Boot immediately: one frame's delay so the host page gets its own first
    // paint in first, and no longer. Every millisecond here is a millisecond
    // the thumb sits as a flat colour instead of showing the running app.
    requestAnimationFrame(preload);
  }

  document.querySelectorAll('[data-live-demo]').forEach(init);

  // Inline embeds (.ld-inline) get the same desktop-canvas treatment as the
  // overlay frames: below MIN_INLINE_W the iframe lays out at that width and
  // is transform-scaled down to its box. The box (built here) takes over the
  // hairline, corner and aspect from the iframe; scaling the iframe itself
  // would shrink its border and radius along with the content.
  var MIN_INLINE_W = 720;
  function initInline(iframe) {
    var box = document.createElement('div');
    box.className = 'ld-inline-box';
    iframe.parentNode.insertBefore(box, iframe);
    box.appendChild(iframe);
    function fit() {
      var w = box.clientWidth, h = box.clientHeight;
      if (!w) return;
      if (w >= MIN_INLINE_W) {
        iframe.style.width = '';
        iframe.style.height = '';
        iframe.style.transform = '';
        return;
      }
      var s = w / MIN_INLINE_W;
      iframe.style.width = MIN_INLINE_W + 'px';
      iframe.style.height = (h / s).toFixed(1) + 'px';
      iframe.style.transformOrigin = '0 0';
      iframe.style.transform = 'scale(' + s.toFixed(4) + ')';
    }
    fit();
    window.addEventListener('resize', fit);
  }
  document.querySelectorAll('iframe.ld-inline').forEach(initInline);
})();
