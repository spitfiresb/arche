/* Diagram expander: a static-image cousin of the live-demo component, for
 * artifacts that are a drawing rather than a running app. The thumb shows
 * the image at its own natural aspect ratio (no viewport matching — a tall
 * diagram fills the column instead of letterboxing inside a wide box), and
 * clicking zooms it to fullscreen with the same expand mark and back
 * control as the live demos. Because the thumb, the image and the
 * fullscreen fit all share one aspect ratio, the grow is a uniform zoom.
 *
 * Usage:
 *   <figure class="ld-thumb" data-diagram tabindex="0" role="button"
 *           aria-label="Expand the diagram">
 *     <img src="/assets/img/foo/diagram.svg" alt="...">
 *   </figure>
 *   <script src="/assets/js/diagram-expand.js"></script>
 *
 * Reuses live-demo.css (.ld-thumb, .ld-expand, .ld-overlay, .ld-back) so the
 * two components cannot drift apart visually.
 */
(function () {
  'use strict';

  var still = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var GROW   = still ? 'transform 0.01s linear'
                     : 'transform 0.9s cubic-bezier(0.55, 0, 0.55, 0.55)';
  var SHRINK = still ? 'transform 0.01s linear'
                     : 'transform 0.6s cubic-bezier(0.45, 0.45, 0.45, 1)';

  function init(thumb) {
    var img = thumb.querySelector('img');

    // the natural aspect: undo live-demo.css's viewport-shaped crop
    img.style.aspectRatio = 'auto';
    img.style.objectFit = 'contain';

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

    var overlay = document.createElement('div');
    overlay.className = 'ld-overlay';
    overlay.style.position = 'fixed';
    overlay.style.background = '#1a1a1a';
    overlay.hidden = true;

    var big = document.createElement('img');
    big.src = img.src;
    big.alt = '';
    big.style.cssText = 'position:absolute;inset:0;margin:auto;'
      + 'max-width:96%;max-height:96vh;'
      + 'transform-origin:top left;will-change:transform;';
    overlay.appendChild(big);

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
    overlay.appendChild(back);
    document.body.appendChild(overlay);

    var lockY = 0, readyT = null;

    function lock() {
      lockY = window.scrollY;
      document.body.style.top = -lockY + 'px';
      document.body.classList.add('ld-locked');
    }
    function unlock() {
      document.body.classList.remove('ld-locked');
      document.body.style.top = '';
      window.scrollTo(0, lockY);
    }

    // FLIP: transform that maps the fullscreen image back onto the thumb.
    // Both rects share the image's aspect ratio, so the scale is uniform.
    function collapsed() {
      var from = img.getBoundingClientRect();
      var to = big.getBoundingClientRect();
      return 'translate(' + (from.left - to.left) + 'px, '
        + (from.top - to.top) + 'px) scale(' + (from.width / to.width) + ')';
    }

    function open() {
      // same guard as live-demo.js: no fullscreen below 700px
      if (window.innerWidth < 700) return;
      if (!overlay.hidden) return;
      overlay.hidden = false;
      overlay.classList.add('open');
      lock();
      requestAnimationFrame(function () {
        big.style.transition = 'none';
        big.style.transform = collapsed();
        void big.offsetWidth;
        big.style.transition = GROW;
        big.style.transform = 'none';
        clearTimeout(readyT);
        readyT = setTimeout(function () {
          overlay.classList.add('ld-ready');
        }, still ? 50 : 950);
      });
    }

    function close() {
      if (overlay.hidden) return;
      clearTimeout(readyT);
      overlay.classList.remove('ld-ready');
      big.style.transition = SHRINK;
      big.style.transform = collapsed();
      var done = function (e) {
        if (e.propertyName !== 'transform') return;
        big.removeEventListener('transitionend', done);
        overlay.hidden = true;
        overlay.classList.remove('open');
        big.style.transition = 'none';
        big.style.transform = 'none';
      };
      big.addEventListener('transitionend', done);
      unlock();
    }

    thumb.addEventListener('click', open);
    thumb.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
    back.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) close();
    });
  }

  document.querySelectorAll('figure[data-diagram]').forEach(init);
})();
