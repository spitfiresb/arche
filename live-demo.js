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

    // Build the overlay: live frame + fallback poster + close button.
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
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ld-overlay-close';
    closeBtn.setAttribute('aria-label', 'Close the live demo');
    closeBtn.innerHTML = '&times;';
    overlay.appendChild(fw);
    overlay.appendChild(poster);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);

    var srcSet = false, ready = false, grown = false, revealT = null;
    var mode = 'poster';   // which element performed the grow this open

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
              setTimeout(becomeReady, 400);
            }
          }, 120);
          // fallback: never wedge the overlay if the canvas probe misses
          setTimeout(function () { clearInterval(poll); becomeReady(); }, 8000);
        } else {
          setTimeout(becomeReady, 300);
        }
      });
      frame.src = app;
    }
    function becomeReady() {
      if (ready) return;
      ready = true;
      maybeReveal();
      park();
    }

    // Park the live app scaled-down over the thumbnail. From here on the
    // preview IS the running app — the same pixels at rest, during the grow,
    // at fullscreen, and after close. The screenshot stays underneath as a
    // permanent backstop; the miniature just fades in over it.
    function park() {
      if (!ready || overlay.classList.contains('open')) return;
      var first = !overlay.classList.contains('parked');
      overlay.hidden = false;
      overlay.classList.add('parked');
      poster.hidden = true;
      fw.style.transition = 'none';
      fw.style.transform = collapsed();
      if (first) {
        // First park: fade the live miniature in over the screenshot — it
        // reads as the preview waking up, not snapping between two states.
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            overlay.classList.add('revealed');
          });
        });
      } else {
        overlay.classList.add('revealed');
      }
    }

    // Cross-fade to the live app once the poster grow has finished AND the
    // app is ready (fallback path only).
    function maybeReveal() {
      if (!grown || !ready || overlay.hidden || overlay.classList.contains('revealed')) return;
      revealT = setTimeout(function () {
        if (overlay.hidden) return;
        poster.style.transition = FADE;
        overlay.classList.add('revealed');
      }, 300);
    }

    function open() {
      preload();
      grown = false;
      overlay.hidden = false;
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
      maybeReveal();
    }

    function close() {
      clearTimeout(revealT);
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
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });

    // Boot the app while the visitor is still reading the page, so the
    // live miniature takes over from the screenshot as soon as possible.
    if (document.readyState === 'complete') setTimeout(preload, 300);
    else window.addEventListener('load', function () { setTimeout(preload, 300); });
  }

  document.querySelectorAll('[data-live-demo]').forEach(init);
})();
