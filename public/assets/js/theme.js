/* Theme, applied before first paint. The site is dark by design; a
   visitor who has clicked the sun on the home page (home-scene.js) gets
   the light palette instead, remembered in localStorage and put back on
   every page by this one class before the stylesheet paints anything —
   so there is no dark flash on the way in. Loaded synchronously in the
   head of every page for that reason; keep it tiny. */
(function () {
  try {
    if (localStorage.getItem('theme') === 'light')
      document.documentElement.classList.add('light');
  } catch (e) {}
})();
