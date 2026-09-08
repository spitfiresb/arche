/* Static home-only lookout illustration. Display the approved artwork
   directly, without cloud displacement, tree deformation or ambient animation.
   About and its camp renderer are independent of this scene. */
(function () {
  if (!document.body.classList.contains('home')) return;
  const root = document.documentElement;
  const NS = 'http://www.w3.org/2000/svg';
  const scene = document.createElement('div');
  scene.className = 'lookout-scene';
  scene.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 430 1536 594');
  // Scale equally in both directions. The side continuation below paints
  // into the extra viewport width outside the original artboard.
  svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
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

  // Keep the original layered artwork in the middle. Only the new terrain
  // at its sides comes from the wider painting; neither outer edge fades.
  // Each side is registered to the original with a uniform scale. Blend over
  // the edge shading, not just the last few pixels of the original plate.
  // This is an internal crossfade; the viewport edges remain fully painted.
  // Mask and clip geometry must not inherit the illustration's stroke.
  const panoramaDefs = el('defs', { stroke: 'none' });
  const overlap = 256;
  const leftClip = el('clipPath', { id: 'lookout-extension-left' }, panoramaDefs);
  el('rect', { x: -1024, y: 0, width: 1024 + overlap, height: 1024 }, leftClip);
  const rightClip = el('clipPath', { id: 'lookout-extension-right' }, panoramaDefs);
  el('rect', { x: 1536 - overlap, y: 0, width: 1024 + overlap, height: 1024 }, rightClip);
  // Exclude the bitmap's baked-in dark margins. An irregular join follows
  // the terrain instead of making a full-height vertical brightness band.
  // A short feather keeps the linework sharp and leaves the cabin untouched.
  const seamFeather = el('filter', { id: 'lookout-seam-feather', x: '-5%', y: '-5%', width: '110%', height: '110%' }, panoramaDefs);
  el('feGaussianBlur', { stdDeviation: 8 }, seamFeather);
  const seamMask = el('mask', { id: 'lookout-seams', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 1536, height: 1024 }, panoramaDefs);
  el('path', {
    d: 'M160 -64 H1470 V640 L1450 692 L1416 744 L1374 776 L1398 811 L1360 844 L1388 879 L1350 918 L1372 950 L1336 988 L1360 1088 H174 L184 1000 L152 970 L184 932 L164 903 L196 866 L168 835 L194 802 L160 774 L186 746 L152 718 L174 680 L160 640 Z',
    fill: 'white', filter: 'url(#lookout-seam-feather)'
  }, seamMask);
  const wingTone = el('filter', { id: 'lookout-extension-tone', x: '0%', y: '0%', width: '100%', height: '100%', 'color-interpolation-filters': 'sRGB' }, panoramaDefs);
  const tone = el('feComponentTransfer', {}, wingTone);
  ['R', 'G', 'B'].forEach(channel => el(`feFunc${channel}`, { type: 'linear', slope: .86 }, tone));
  [
    { side: 'left', scale: .8183896100, rotation: .0000950914, x: 566.1210779, y: -114.8893409 },
    { side: 'right', scale: .8307821712, rotation: .0004986008, x: 556.5039729, y: -128.1921289 }
  ].forEach(({ side, scale, rotation, x, y }) => {
    // Invert the measured similarity registration (uniform scale + rotation).
    const divisor = scale * scale + rotation * rotation;
    const a = scale / divisor;
    const b = rotation / divisor;
    const wing = el('g', { 'clip-path': `url(#lookout-extension-${side})`, class: 'lookout-extension' });
    el('image', {
      href: '/assets/img/home/lookout-panorama-v2.png',
      width: 2172, height: 724,
      transform: `matrix(${a} ${-b} ${b} ${a} ${-a * x - b * y} ${b * x - a * y})`,
      filter: 'url(#lookout-extension-tone)'
    }, wing);
  });
  const original = el('g', { class: 'lookout-original', mask: 'url(#lookout-seams)' });
  el('image', { href: '/assets/img/home/lookout-valley.png', x: 0, y: 0, width: 1536, height: 1024, class: 'lookout-art' }, original);

  // Apply only the refined middle-distance fir patches. Keeping the original
  // underneath preserves the mountain, lookout, clouds and foreground rather
  // than accepting unrelated changes from the detail-edit image.
  const defs = el('defs', {}, original);
  const feather = el('filter', { id: 'treetop-feather', x: '-5%', y: '-5%', width: '110%', height: '110%', 'color-interpolation-filters': 'sRGB' }, defs);
  el('feGaussianBlur', { stdDeviation: 1.2 }, feather);
  const mask = el('mask', { id: 'treetop-detail-mask', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 1536, height: 1024 }, defs);
  const patches = el('g', { fill: 'white', stroke: 'none', filter: 'url(#treetop-feather)' }, mask);
  [
    'M260 752 L281 743 L310 744 L335 729 L359 735 L382 720 L412 725 L432 724 L458 735 L486 728 L512 740 L534 739 L562 752 L583 751 L603 768 L593 780 L557 785 L520 778 L486 777 L455 764 L417 764 L386 757 L349 760 L320 759 L282 764Z',
    'M232 827 L262 811 L285 807 L306 797 L329 798 L350 811 L374 811 L395 819 L418 817 L441 824 L465 823 L487 834 L516 838 L529 854 L515 862 L479 865 L447 856 L415 855 L384 845 L346 844 L315 837 L284 838 L263 838Z',
    'M619 810 L646 796 L674 787 L697 786 L718 775 L743 780 L764 781 L788 793 L807 798 L821 808 L801 817 L775 816 L747 825 L718 827 L692 820 L663 820 L642 826Z',
    'M720 770 L740 754 L764 745 L787 743 L806 729 L827 734 L846 731 L862 741 L882 738 L901 746 L924 746 L945 758 L967 758 L991 772 L1025 779 L1013 791 L986 792 L966 781 L936 784 L910 781 L889 772 L862 769 L835 762 L809 758 L781 765 L752 768 L736 780Z'
  ].forEach(d => el('path', { d }, patches));
  el('image', { href: '/assets/img/home/lookout-valley-treetops.png', x: 0, y: 0, width: 1536, height: 1024, mask: 'url(#treetop-detail-mask)', class: 'lookout-treetop-detail' }, original);

  window.LookoutComposition.mount(original).then(() => {
    svg.dataset.sceneReady = 'true';
  }).catch(error => {
    console.error('Layered lookout failed to load; keeping the static reference.', error);
  });

  // Stars occupy the margins and the open space below the work list.
  // Keeping them outside the central copy column also covers translations.
  const sky = document.createElement('div');
  sky.className = 'lookout-sky';
  sky.setAttribute('aria-hidden', 'true');
  for (let i=0;i<48;i++) {
    const star = document.createElement('i');
    const side = i%2;
    const x = side ? 85 + rand(i*11)*13 : 2 + rand(i*11)*13;
    star.style.cssText=`left:${x}%;top:${7+rand(i*9+1)*61}%;--star-opacity:${.2+rand(i+7)*.4}`;
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

})();
