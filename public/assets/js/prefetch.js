/* Warm same-origin destinations when a pointer approaches their links. */
(() => {
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
})();
