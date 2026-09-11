/* Old collection bookmarks should still open the requested project. */
(() => {
  const routes = {
    'steward-ai': '/work/steward-ai',
    'unpak': '/work/unpak',
    'unpak-system': '/work/unpak#unpak-system',
    'unpak-dashboard': '/work/unpak#unpak-dashboard',
    'unpak-website': '/work/unpak#unpak-website',
    'floorsense': '/work/floorsense',
    'ai-sales-agent': '/work/ai-sales-agent',
    'ag-analytics': '/work/ag-analytics',
    'notch': '/work/notch',
    'liquid-glass': '/work/liquid-glass',
    'personal': '/work/steward-ai',
    'contract': '/work/ai-sales-agent',
    'experiments': '/work/notch'
  };
  function redirect() {
    const key = location.hash.slice(1);
    if (Object.hasOwn(routes, key)) location.replace(routes[key]);
  }
  addEventListener('hashchange', redirect);
  redirect();
})();
