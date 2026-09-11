/* Section navigation, adapted from main's section rail. The markup is
   generated with the articles so the links also work without JavaScript.
   One dot follows the current project through scrolling and anchor jumps. */
(() => {
  const nav = document.querySelector('.toc');
  if (!nav) return;
  const links = Array.from(nav.querySelectorAll('.toc-link'));
  const sections = links.map(link => document.getElementById(link.hash.slice(1)));
  if (!links.length || sections.some(section => !section)) return;
  const dot = nav.querySelector('.toc-dot');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let active = -1;
  let frame = 0;
  let reposition = false;

  function moveDot(animate) {
    const link = links[active];
    const y = link.offsetTop + link.offsetHeight / 2 - 2.5;
    dot.classList.toggle('is-positioning', !animate);
    dot.hidden = false;
    dot.style.transform = `translate(0px, ${y}px)`;
    if (!animate) {
      // Commit the new position before restoring travel for the next project.
      void dot.offsetHeight;
      dot.classList.remove('is-positioning');
    }
  }

  function revealActive() {
    const link = links[active];
    if (link.offsetTop < nav.scrollTop ||
        link.offsetTop + link.offsetHeight > nav.scrollTop + nav.clientHeight) {
      nav.scrollTo({ top: link.offsetTop - (nav.clientHeight - link.offsetHeight) / 2 });
    }
  }

  function setActive(index, animate) {
    const changed = index !== active;
    if (changed) {
      if (active > -1) {
        links[active].parentElement.classList.remove('active');
        links[active].removeAttribute('aria-current');
      }
      links[index].parentElement.classList.add('active');
      links[index].setAttribute('aria-current', 'location');
    }
    const initialized = active > -1;
    active = index;
    moveDot(animate && initialized);
    if (changed || !animate) revealActive();
  }

  function spy(animate = true) {
    // Fullscreen demos temporarily pin the body; those positions aren't
    // the reading position. Resume when the page's scroll is restored.
    if (document.body.classList.contains('ld-locked')) return;
    const offset = parseFloat(getComputedStyle(sections[0]).scrollMarginTop) || 0;
    const line = Math.max(innerHeight * 0.25, offset + 1);
    let index = 0;
    sections.forEach((section, i) => {
      if (section.getBoundingClientRect().top <= line) index = i;
    });
    const height = document.documentElement.scrollHeight;
    if (height > innerHeight + 2 && innerHeight + scrollY >= height - 2) {
      index = sections.length - 1;
    }
    setActive(index, animate);
  }

  function schedule(snap = false) {
    reposition = reposition || snap;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      spy(!reposition);
      frame = 0;
      reposition = false;
    });
  }

  links.forEach((link, index) => {
    link.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey ||
          event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      sections[index].focus({ preventScroll: true });
      sections[index].scrollIntoView({
        behavior: reduced.matches ? 'auto' : 'smooth', block: 'start'
      });
      history.replaceState(null, '', link.hash);
      schedule();
    });
  });

  // Previously shared category fragments still land on their first project.
  function resolveLegacyHash() {
    const aliases = { '#personal': 'steward-ai', '#contract': 'ai-sales-agent', '#experiments': 'notch', '#unpak': 'unpak-system' };
    const id = aliases[location.hash];
    if (id && document.getElementById(id)) {
      history.replaceState(null, '', '#' + id);
      document.getElementById(id).scrollIntoView({ block: 'start' });
    }
  }

  addEventListener('scroll', () => schedule(), { passive: true });
  addEventListener('resize', () => schedule(true));
  addEventListener('hashchange', () => { resolveLegacyHash(); schedule(); });
  addEventListener('pageshow', () => schedule(true));
  addEventListener('pagetransitionend', () => schedule(true));
  addEventListener('load', () => schedule(true));
  const observer = new ResizeObserver(() => schedule(true));
  observer.observe(document.querySelector('main'));
  observer.observe(nav.querySelector('.toc-track'));
  if (document.fonts) document.fonts.ready.then(() => schedule(true));
  resolveLegacyHash();
  spy(false);
})();
