/* Restore before styles paint; mount the shared control once the page exists. */
(() => {
  const root = document.documentElement;
  let button;
  let transition;
  let spin;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function applyTheme(light) {
    root.classList.toggle('light', light);
    if (button) button.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
  }

  function restoreTheme() {
    try { applyTheme(localStorage.getItem('theme') === 'light'); } catch (_) {}
  }
  restoreTheme();

  document.addEventListener('DOMContentLoaded', () => {
    const page = document.querySelector('body.home > .page, body.projects-index > .page');
    if (!page) return;
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-toggle page-reveal';
    button.innerHTML = `<svg class="theme-moon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M7.691 4.098a9 9 0 1 0 12.211 12.211 9 9 0 0 1-12.211-12.211Z"/></svg><svg class="theme-sun" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>`;
    applyTheme(root.classList.contains('light'));
    button.addEventListener('click', () => {
      const light = !root.classList.contains('light');
      const update = () => {
        applyTheme(light);
        if (!reducedMotion.matches) {
          spin?.cancel();
          const icon = button.querySelector(light ? '.theme-sun' : '.theme-moon');
          spin = icon.animate([
            { transform: 'rotate(0deg)' },
            { transform: 'rotate(360deg)' }
          ], { duration: 500, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
        }
      };
      transition?.skipTransition();
      if (!reducedMotion.matches && document.startViewTransition) {
        transition = document.startViewTransition(update);
      } else {
        update();
      }
      try { localStorage.setItem('theme', light ? 'light' : 'dark'); } catch (_) {}
    });
    page.prepend(button);
  }, { once: true });

  addEventListener('pageshow', restoreTheme);
  addEventListener('storage', (event) => {
    if (event.key === 'theme' || event.key === null) restoreTheme();
  });
})();
