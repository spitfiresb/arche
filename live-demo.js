/* Live-demo component. Drop-in usage:
 *
 *   <link rel="stylesheet" href="live-demo.css">
 *   <figure class="ld-thumb" data-live-demo="path/to/app.html"
 *           tabindex="0" role="button" aria-label="Expand the live demo">
 *     <img src="path/to/preview.png" alt="...">
 *     <span class="ld-expand" aria-hidden="true"><svg ...>...</svg></span>
 *   </figure>
 *   <script src="live-demo.js"></script>
 *
 * Optional data attributes on the figure:
 *   data-ready="canvas"  — wait until the app's <canvas> has pixels before
 *                          treating it as ready (same-origin apps only);
 *                          default is the iframe's load event.
 *   data-bg="#fdfbf7"    — frame/poster background while the app boots
 *                          (default #0d0d0d).
 *   data-title="Foo"     — accessible title for the iframe.
 *
 * The overlay DOM is built by this script; nothing else to add to the page.
 * Multiple demos per page are supported.
 */
(function () {
  'use strict';

  // Reduced motion collapses the durations rather than removing the
  // transitions: open/close still finish on 'transitionend', which a
  // `transition: none` override would never fire.
  var still = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var GROW   = still ? 'transform 0.01s linear'
                     : 'transform 1.15s cubic-bezier(0.55, 0, 0.55, 0.55)';
  var SHRINK = still ? 'transform 0.01s linear'
                     : 'transform 0.7s cubic-bezier(0.45, 0.45, 0.45, 1)';
  var FADE   = still ? 'opacity 0.01s linear' : 'opacity 0.45s ease';

  function init(thumb) {
    var app      = thumb.getAttribute('data-live-demo');
    var thumbImg = thumb.querySelector('img');
    var bg       = thumb.getAttribute('data-bg') || '#0d0d0d';

    // Build the overlay: live frame + fallback poster + the way out.
    var overlay = document.createElement('div');
    overlay.className = 'ld-overlay';
    overlay.hidden = true;
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
    // At fullscreen the demo covers the whole page, header and all — and the
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

    var srcSet = false, ready = false, grown = false, revealT = null;
    var readyT = null;     // backstop for the back control's entrance
    var shown = false;     // has the live miniature been revealed at least once
    var rescueT = null;
    var mode = 'poster';   // which element performed the grow this open

    // The screenshot is a fixed-resolution capture; the parked miniature is a
    // live render at the visitor's own viewport. A responsive app laid out at
    // 1512x800 is NOT the same picture as the same app captured at 1440x900,
    // so the two can never be made to line up — showing the screenshot first
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
    // document, so that's the live scroll offset — and the miniature then
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

    // Start loading the app — full-size and hidden behind the preview, so
    // booting never touches any animation.
    function preload() {
      if (srcSet) return;
      srcSet = true;
      frame.addEventListener('load', function () {
        if (thumb.getAttribute('data-ready') === 'canvas') {
          // 'load' fires long before a heavy app paints. Same-origin apps
          // can opt into polling for a <canvas> with pixels, then settling
          // briefly — "ready" then means "fully rendered".
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
    // nothing to inspect), so only same-origin apps can be checked — and a
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
      // the opacity transition starts — otherwise it fades in from the wrong
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
    // preview IS the running app — the same pixels at rest, during the grow,
    // at fullscreen, and after close. The screenshot stays underneath as a
    // permanent backstop; the miniature just fades in over it.
    function park() {
      if (!ready || overlay.classList.contains('open')) return;
      overlay.hidden = false;
      overlay.classList.add('parked');
      poster.hidden = true;
      fw.style.transition = 'none';
      fw.style.transform = collapsed();
      // becomeReady() owns the very first reveal (it fades in); every later
      // park is a return to a state the visitor has already seen, so snap.
      if (shown) overlay.classList.add('revealed');
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
      readyT = setTimeout(showBack, 1400);           // a little over GROW
    }
    function showBack() {
      clearTimeout(readyT);
      if (overlay.classList.contains('open')) overlay.classList.add('ld-ready');
    }

    function open() {
      preload();
      grown = false;
      overlay.hidden = false;
      armBack();
      // Lock BEFORE measuring: the lock freezes the coordinate origin that
      // collapsed()/expanded() are both computed against.
      lockScroll();

      if (ready) {
        // The app is already parked on the thumbnail: just grow it.
        mode = 'frame';
        park();                                      // ensure start state
        void fw.offsetWidth;                         // commit it
        overlay.classList.remove('parked');
        overlay.classList.add('open');
        fw.style.transition = GROW;
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
      poster.hidden = false;
      overlay.classList.remove('revealed');
      poster.style.transition = 'none';
      poster.style.transform = collapsed();
      void poster.offsetWidth;                       // commit the start state
      poster.style.transition = GROW;
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
        // parked there — still running, no swap back to a screenshot.
        fw.style.transition = SHRINK;
        fw.style.transform = collapsed();
        overlay.classList.remove('open');
        var doneF = function (e) {
          if (e.propertyName !== 'transform') return;
          fw.removeEventListener('transitionend', doneF);
          overlay.classList.add('parked');
          fw.style.transition = 'none';
        };
        fw.addEventListener('transitionend', doneF);
        return;
      }

      // SHRINK is transform-only, so removing .revealed snaps the still
      // poster back over the app instantly; then it shrinks to the thumb.
      poster.style.transition = SHRINK;
      overlay.classList.remove('revealed');
      poster.style.transform = collapsed();
      overlay.classList.remove('open');
      var done = function (e) {
        if (e.propertyName !== 'transform') return;
        poster.removeEventListener('transitionend', done);
        overlay.hidden = true;
        park();   // if the app finished booting meanwhile, park it live
      };
      poster.addEventListener('transitionend', done);
    }

    // Layout changed: re-fit the thumb and re-pin the parked miniature.
    window.addEventListener('resize', function () {
      syncThumbAspect();
      if (overlay.classList.contains('parked')) {
        fw.style.transition = 'none';
        fw.style.transform = collapsed();
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

    // Boot immediately — one frame's delay so the host page gets its own first
    // paint in first, and no longer. Every millisecond here is a millisecond
    // the thumb sits as a flat colour instead of showing the running app.
    requestAnimationFrame(preload);
  }

  document.querySelectorAll('[data-live-demo]').forEach(init);
})();
