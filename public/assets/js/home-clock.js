/* Keep the Bay Area clock on Pacific time, including daylight saving time. */
(() => {
  const clock = document.querySelector('.home-local-time');
  const separator = document.querySelector('.home-local-separator');
  if (!clock) return;

  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  let timer;

  function stop() {
    clearTimeout(timer);
  }

  function tick() {
    stop();
    if (document.hidden) return;
    const now = new Date();
    clock.textContent = format.format(now).toLowerCase();
    clock.dateTime = now.toISOString();
    clock.hidden = false;
    if (separator) separator.hidden = false;
    timer = setTimeout(tick, 1000 - now.getMilliseconds());
  }

  document.addEventListener('visibilitychange', tick);
  addEventListener('pagehide', stop);
  addEventListener('pageshow', tick);
  tick();
})();
