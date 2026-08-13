/* On-page section rail: the fixed table of contents down the left margin
   of the work pages (styled as .toc in style.css). It reads the project
   bands already in the page and, for each, drops a title that scrolls to
   the band on click, lighting whichever one you're currently reading. No
   dependencies, and no markup contract beyond the band titles themselves. */
(function () {
  var main = document.querySelector('main');
  if (!main) return;

  var sections = Array.prototype.slice.call(main.querySelectorAll('ul.bands > li'));
  if (sections.length < 2) return;   // one section isn't worth a rail

  function labelOf(li) {
    var t = li.querySelector('.band-title');
    if (!t) return '';
    // The title carries a trailing .band-date and possibly a .band-award badge;
    // the rail wants the name alone, so read from a copy with those removed.
    var copy = t.cloneNode(true);
    ['.band-date', '.band-award'].forEach(function (sel) {
      var el = copy.querySelector(sel);
      if (el) el.parentNode.removeChild(el);
    });
    return copy.textContent.replace(/\s+/g, ' ').trim();
  }

  function slug(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  var nav = document.createElement('nav');
  nav.className = 'toc';
  nav.setAttribute('aria-label', 'On this page');
  var list = document.createElement('ul');
  nav.appendChild(list);

  var items = sections.map(function (sec, i) {
    var label = labelOf(sec) || ('Section ' + (i + 1));
    // Deep-link targets: reuse the id if the band already has one (the work
    // pages do), otherwise mint a stable, collision-free one from the label.
    if (!sec.id) {
      var base = slug(label) || ('section-' + (i + 1)), id = base, n = 2;
      while (document.getElementById(id)) id = base + '-' + (n++);
      sec.id = id;
    }

    var li = document.createElement('li');
    li.className = 'toc-item';
    var a = document.createElement('a');
    a.className = 'toc-link';
    a.href = '#' + sec.id;
    a.textContent = label;

    a.addEventListener('click', function (e) {
      e.preventDefault();
      var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Center the band in the viewport (the demo lives mid-band, so this
      // puts it front and centre). The browser clamps at either end of the
      // page, so top and bottom sections just get as close as they can.
      sec.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      if (history.replaceState) history.replaceState(null, '', '#' + sec.id);
    });

    li.appendChild(a);
    list.appendChild(li);
    return li;
  });

  // The lone marker dot, a nav child positioned relative to the rail, that
  // slides down to sit beside whichever entry is active.
  var dot = document.createElement('span');
  dot.className = 'toc-dot';
  nav.appendChild(dot);
  document.body.appendChild(nav);

  /* Scroll-spy: the active section is the last one whose top has crossed a
     line a third of the way down the viewport; at the very bottom the last
     section wins outright, so a short final section still lights up. */
  var active = -1;
  // Park the dot beside a section's entry. `animate` is false for the first
  // placement and after a resize, so the dot snaps into place; on a genuine
  // change of section it's true, and the CSS transition slides it across.
  function moveDot(li, animate) {
    var y = li.offsetTop + li.offsetHeight / 2 - 2.5;   // 2.5 = half the dot
    if (!animate) dot.style.transition = 'none';
    dot.style.transform = 'translateY(' + y + 'px)';
    if (!animate) { dot.offsetHeight; dot.style.transition = ''; }   // re-arm
  }
  function setActive(i) {
    if (i === active) return;
    if (active > -1) items[active].classList.remove('active');
    items[i].classList.add('active');
    moveDot(items[i], active > -1);   // slide only after the first placement
    active = i;
  }
  function spy() {
    var line = innerHeight * 0.33, idx = 0;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top - line <= 0) idx = i;
    }
    // innerHeight, scrollY and the root's scrollHeight all read in the same
    // (zoomed) pixel space under the desktop zoom: 0.9 — measured, not
    // assumed — so this comparison needs no conversion.
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) {
      idx = sections.length - 1;
    }
    setActive(idx);
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { spy(); ticking = false; });
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  addEventListener('resize', function () {
    if (active > -1) moveDot(items[active], false);   // re-seat, no slide
  });
  spy();
})();
