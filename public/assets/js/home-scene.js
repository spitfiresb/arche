/* Home-only lookout mockup. The approved ink artwork is a static foundation;
   clouds and forest share one composed illustration, with motion confined to their own regions.
   About and its camp renderer are intentionally independent of this scene. */
(function () {
  if (!document.body.classList.contains('home')) return;
  const root = document.documentElement;
  const NS = 'http://www.w3.org/2000/svg';
  const scene = document.createElement('div');
  scene.className = 'lookout-scene';
  scene.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 430 1536 594');
  svg.setAttribute('preserveAspectRatio', 'xMidYMax slice');
  svg.setAttribute('class', 'lookout-landscape');
  scene.append(svg);
  document.body.prepend(scene);

  function el(tag, attrs, parent = svg) {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => e.setAttribute(key, value));
    parent.append(e);
    return e;
  }
  const rand = i => { const n = Math.sin(i * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };

  const base = el('image', { href: '/assets/img/home/lookout-valley.png', x: 0, y: 0, width: 1536, height: 1024, class: 'lookout-art' });

  // The trees are already rooted in the terrain drawing. The wind mask
  // moves only far-right crowns behind the cabin, never a pasted-on tree.
  window.mountLookoutForest(svg,scene,base);

  // Stars occupy the margins and the open space below the work list.
  // Keeping them outside the central copy column also covers translations.
  const sky = document.createElement('div');
  sky.className = 'lookout-sky';
  sky.setAttribute('aria-hidden', 'true');
  for (let i=0;i<48;i++) {
    const star = document.createElement('i');
    const side = i%2;
    const x = side ? 85 + rand(i*11)*13 : 2 + rand(i*11)*13;
    star.style.cssText=`left:${x}%;top:${7+rand(i*9+1)*61}%;--duration:${5+rand(i)*8}s;--delay:-${rand(i+3)*12}s;--star-opacity:${.2+rand(i+7)*.4}`;
    if (i%11===0) star.className='lookout-star-cross';
    sky.append(star);
  }
  document.body.prepend(sky);

  // Preserve the existing persisted, keyboard-operable sun/moon switch.
  const btn = document.createElement('button');
  btn.className = 'sky-toggle';
  btn.type = 'button';
  btn.innerHTML = '<svg viewBox="-24 -24 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><g class="sun"><circle r="8.5" fill="var(--bg)"/><g class="sun-rays">'+[0,45,90,135,180,225,270,315].map(a=>`<path d="M0 -13 L0 -19" transform="rotate(${a})"/>`).join('')+'</g></g><path class="moon" fill="var(--bg)" d="M3 -12 A11 11 0 1 0 12 5 A8.5 8.5 0 0 1 3 -12 Z"/></svg>';
  function label() {
    const light = root.classList.contains('light');
    btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
    btn.title = light ? 'Dark mode' : 'Light mode';
  }
  btn.addEventListener('click', () => {
    const light = root.classList.toggle('light');
    try { localStorage.setItem('theme', light ? 'light' : 'dark'); } catch (_) {}
    root.classList.add('theme-turning');
    setTimeout(() => root.classList.remove('theme-turning'), 700);
    label();
  });
  label();
  document.body.append(btn);

  // Cloud layers also pause below the fold. The sky is independent because
  // its stars can still be visible while the landscape is offscreen.
  let sceneVisible = true;
  function visibility() { scene.classList.toggle('is-paused', document.hidden || !sceneVisible); sky.classList.toggle('is-paused', document.hidden); }
  new IntersectionObserver(([entry]) => { sceneVisible = entry.isIntersecting; visibility(); }).observe(scene);
  document.addEventListener('visibilitychange', visibility);
  visibility();
})();
