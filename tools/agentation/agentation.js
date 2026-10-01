// Dev-only loader for Agentation (https://agentation.com) on the flat-file
// site. The site has no React and no build step, so instead of `npm install`
// this mounts React + Agentation from esm.sh into whatever page is open.
// Never ship this: it is meant for a local preview or a bookmarklet.
//
//   1. Bookmarklet: paste the contents of bookmarklet.txt as a bookmark URL,
//      open any page of the site, click it. The toolbar appears bottom-right.
//   2. Local preview: `tools/agentation/serve.sh` serves public/ with this
//      script injected into every page.
(async () => {
  if (document.getElementById('agentation-root')) return;
  const R = 'react@18.3.1', D = 'react-dom@18.3.1';
  const [React, { createRoot }, { Agentation }] = await Promise.all([
    import(`https://esm.sh/${R}`),
    import(`https://esm.sh/${D}/client`),
    import(`https://esm.sh/agentation@3.0.2?deps=${R},${D}`),
  ]);
  const host = document.createElement('div');
  host.id = 'agentation-root';
  document.body.appendChild(host);
  createRoot(host).render(React.createElement(Agentation));
})();
