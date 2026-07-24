/* Directional page transitions for same-origin navigation. On click the
   current page animates out, then we navigate; the destination page reads
   the stored direction and animates in from the matching side. Everything
   else (new tabs, modified clicks, hash jumps on the same page, external
   links) passes through untouched. */
(() => {
  const root = document.documentElement;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // Entrance: consume the direction the exiting page left behind.
  const dir = sessionStorage.getItem('page-transition');
  sessionStorage.removeItem('page-transition');
  if (dir) {
    const cls = dir === 'back' ? 'page-enter-back' : 'page-enter';
    root.classList.add(cls);
    // Drop the class once the slowest staggered rise (350ms delay + 520ms
    // run) has finished; removing it earlier would cut those animations off.
    setTimeout(() => {
      root.classList.remove(cls);
      // Anything that pins itself to measured layout (live-demo.js parks its
      // miniatures over the thumbnails) holds off while the enter class is
      // up, then re-measures against the settled layout on this signal.
      dispatchEvent(new Event('pagetransitionend'));
      dispatchEvent(new Event('resize'));
    }, 950);
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    if (a.target && a.target !== '_self') return;
    if (a.origin !== location.origin) return;
    if (a.pathname === location.pathname) return; // same-page hash jump

    e.preventDefault();
    // Heading home (or clicking the back mark) reads as "back"; everything
    // deeper reads as "forward".
    const back = a.classList.contains('back') || a.pathname === '/';
    sessionStorage.setItem('page-transition', back ? 'back' : 'fwd');
    root.classList.add(back ? 'page-exit-back' : 'page-exit');
    // Navigate right away: the fade-out plays while the next document loads
    // in parallel: the browser keeps this page painted until it's ready.
    // Waiting for the animation first would stack fade + fetch into a
    // visible freeze.
    location.href = a.href;
  });

  // Warm the cache for likely destinations so the swap is instant by the
  // time a click lands.
  const prefetched = new Set();
  document.addEventListener('pointerover', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || a.origin !== location.origin) return;
    if (a.pathname === location.pathname || prefetched.has(a.pathname)) return;
    prefetched.add(a.pathname);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = a.pathname;
    document.head.appendChild(link);
  });

  // A bfcache restore (browser back/forward) resurrects the page exactly as
  // it left, mid-exit. Strip any transition state so it isn't stuck faded.
  addEventListener('pageshow', (e) => {
    if (e.persisted) {
      root.classList.remove('page-exit', 'page-exit-back', 'page-enter', 'page-enter-back');
      dispatchEvent(new Event('resize'));
    }
  });
})();
