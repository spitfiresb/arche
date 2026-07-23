/* On-page section rail — the fixed table of contents down the left margin
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
    return t ? t.textContent.replace(/\s+/g, ' ').trim() : '';
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
    a.title = label;   // the full text, in case the rail clips a long one

    a.addEventListener('click', function (e) {
      e.preventDefault();
      var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      sec.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      if (history.replaceState) history.replaceState(null, '', '#' + sec.id);
    });

    li.appendChild(a);
    list.appendChild(li);
    return li;
  });

  document.body.appendChild(nav);

  /* Scroll-spy: the active section is the last one whose top has crossed a
     line a third of the way down the viewport; at the very bottom the last
     section wins outright, so a short final section still lights up. */
  var active = -1;
  function setActive(i) {
    if (i === active) return;
    if (active > -1) items[active].classList.remove('active');
    items[i].classList.add('active');
    active = i;
  }
  function spy() {
    var line = innerHeight * 0.33, idx = 0;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top - line <= 0) idx = i;
    }
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
  spy();
})();
