/* Let the left status text approach the name without overlapping it. */
(() => {
  const presence = document.querySelector('.home-presence');
  const header = document.querySelector('body.home .bio > header');
  if (!presence || !header) return;

  function sizePresence() {
    const available = header.getBoundingClientRect().left
      - presence.getBoundingClientRect().left - 24;
    presence.style.setProperty('--home-presence-width', `${Math.max(0, available)}px`);
  }

  const observer = new ResizeObserver(sizePresence);
  observer.observe(header);
  // Status data arrives asynchronously; measure again when it becomes visible.
  observer.observe(presence);
  window.addEventListener('resize', sizePresence);
  document.fonts.ready.then(sizePresence);
  sizePresence();
})();
