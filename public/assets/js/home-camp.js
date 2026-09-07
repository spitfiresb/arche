/* The campground along the bottom of the home page: the same meadow
   that sits at the base of About's descent (camp.js draws both), here a
   fixed band across the foot of the window, under the two bottom corners.
   Fixed rather than in the flow so it stays put with the corners it
   shares the edge with; main reserves the band's height in its bottom
   padding (see .camp in style.css), so nothing lays out under it.

   No cliff here, so the camp is placed rather than anchored: it starts
   where the cliff base would have been, chosen so the tent and the truck
   sit about mid-screen, with the props left of it and the treeline right
   of it filling in from the edges the way they do on About. Below 40rem
   the band is display: none with the corners, and this script draws
   nothing while it is. */
(function () {
  const main = document.querySelector('main');
  if (!main || typeof drawCamp !== 'function') return;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'camp');
  svg.setAttribute('aria-hidden', 'true');
  main.appendChild(svg);

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let flame = null;
  let drawnFor = null;   // the width the current drawing was made for

  function build() {
    if (getComputedStyle(svg).display === 'none') { drawnFor = null; return; }
    // The desktop stylesheet zooms the page to 0.9: rects come back in
    // zoomed pixels, layout in layout pixels. Everything drawn here is
    // layout pixels, so the viewport width is divided by the measured
    // zoom first (1 in a browser that doesn't scale rects).
    const zf = main.offsetHeight
      ? main.getBoundingClientRect().height / main.offsetHeight : 1;
    const fw = document.documentElement.clientWidth / zf;
    if (fw === drawnFor) return;
    drawnFor = fw;
    // where the cliff base would be: the camp runs from cliffX + 133 to
    // about cliffX + 670 with the truck, so this centres it
    const cliffX = Math.max(40, Math.round(fw / 2 - 400));
    flame = drawCamp(svg, { fw, gy: 172, cliffX, cliff: false, stick: false }).flame;
  }
  build();
  addEventListener('resize', build);

  // the fire burns on the real clock while the tab is visible; in
  // reduced motion it is drawn once, unlit
  if (still) return;
  let raf = 0;
  function tick(now) {
    if (flame) flame(now / 1000);
    raf = requestAnimationFrame(tick);
  }
  function watch() {
    cancelAnimationFrame(raf);
    if (!document.hidden) raf = requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', watch);
  watch();
})();
