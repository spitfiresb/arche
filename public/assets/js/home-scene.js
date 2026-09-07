/* The home page's backdrop: a glacier valley, seen from a height looking
   down its length — the river braiding out of the ice at the head, the
   walls rising either side to a broken skyline, a lateral moraine along
   each foot, pines in the meadow nearest us. Nothing is an image: the
   valley is laid out in three dimensions (x across, y up, z away, in
   units where the floor is about six wide) and every mark is a stroke
   through projected points, so the perspective converges the way a real
   valley does and a resize is simply a redraw. The ink is the About
   page's: thin round strokes in the text colour, faces filled with the
   page colour so a nearer wall hides what's behind it.

   Drawn on a canvas the size of the window, fixed under the page,
   occupying the bottom --valley-h of it; main keeps that much of its
   bottom padding clear, so the columns sit in the sky above the valley
   and never over it. Redrawn on resize and when the sun is clicked
   (the colours come from the stylesheet's variables). Below 40rem the
   canvas is display: none with the corners and nothing is drawn.

   The sun, top right in the sky, is the theme switch: theme.js puts
   html.light back on every page before paint; this file only toggles
   it and remembers the choice. */
(function () {
  const main = document.querySelector('main');
  if (!main) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'valley';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');

  // deterministic noise: the same valley on every visit and every resize
  const fn = (i) => {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  // smooth noise along one axis, in [0, 1]
  const sn = (t, seed) => {
    const i = Math.floor(t), u = t - i, w = u * u * (3 - 2 * u);
    return fn(i + seed) * (1 - w) + fn(i + 1 + seed) * w;
  };

  let drawnFor = null;
  function draw(force) {
    if (getComputedStyle(canvas).display === 'none') { drawnFor = null; return; }
    // the desktop stylesheet zooms the page to 0.9: draw in layout px,
    // back them by device px, and let css size the canvas to the window
    const zoom = main.offsetHeight
      ? main.getBoundingClientRect().height / main.offsetHeight : 1;
    const W = document.documentElement.clientWidth / zoom;
    const H = document.documentElement.clientHeight / zoom;
    const css = getComputedStyle(document.documentElement);
    const ink = css.getPropertyValue('--fg').trim();
    const paper = css.getPropertyValue('--bg').trim();
    const key = [W, H, ink, main.scrollHeight].join('|');
    if (!force && key === drawnFor) return;
    drawnFor = key;
    const dpr = (window.devicePixelRatio || 1) * zoom;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const dark = !document.documentElement.classList.contains('light');
    // the band takes what the columns leave: from just under the work
    // grid to the bottom edge, held between a quarter and 42% of the
    // window. Written back to --valley-h so main's padding matches.
    const grid = main.querySelector('.work-grid');
    const rem = parseFloat(css.fontSize);
    const under = grid
      ? H - (grid.getBoundingClientRect().bottom / zoom + window.scrollY / zoom) - rem
      : H * 0.38;
    const Vh = Math.round(Math.min(H * 0.42, Math.max(H * 0.26, under)));
    document.documentElement.style.setProperty('--valley-h', Vh + 'px');
    const yb = H - Vh;                 // the band's top edge
    const cx = W / 2;
    const vpy = yb + Vh * 0.34;        // the valley head, where it all converges
    const f = W * 0.45;                // focal length
    const camY = 1.7;                  // how high we stand above the floor
    // z of the floor at the bottom edge of the window, and the far end
    const zn = f * camY / (H - vpy);
    const zf = zn * 14;
    const WF = 3.0;                    // half-width of the floor
    const floorY = (z) => 0.05 * (z - zn);   // the floor climbs to the ice
    const P = (x, y, z) => [cx + f * x / z, vpy - f * (y - camY) / z];
    // a run of z from near to far, denser near
    const zs = (n, a, b) => Array.from({ length: n + 1 },
      (_, i) => a * Math.pow(b / a, i / n));

    // fill: close the polygon and fill it with the page colour first;
    // n: stroke only the first n points (the skyline, not the base)
    function stroke(pts, w, op, fill, n) {
      if (pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      if (fill) { ctx.closePath(); ctx.fillStyle = paper; ctx.fill(); }
      if (n) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      }
      ctx.globalAlpha = op;
      ctx.strokeStyle = ink;
      ctx.lineWidth = w;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // a stroke in 3d: a polyline through projected points
    const stroke3 = (pts3, w, op, fill, n) => stroke(pts3.map(p => P(p[0], p[1], p[2])), w, op, fill, n);

    // ---- stars, in the dark, over the sky at the head of the valley
    if (dark) {
      ctx.fillStyle = ink;
      for (let i = 0; i < 40; i++) {
        const x = fn(i * 13 + 5) * W, y = yb + fn(i * 29 + 7) * (vpy - yb - 30);
        ctx.globalAlpha = 0.25 + fn(i * 3) * 0.4;
        ctx.beginPath();
        ctx.arc(x, y, 0.6 + fn(i) * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ---- the range beyond the head of the valley: small, faint,
    // filled so the ice ends against it
    {
      const z = zf * 1.35, pts = [];
      const span = WF + 9;
      for (let x = -span; x <= span; x += 0.5) {
        const t = (x + span) / (2 * span);
        const h = floorY(z) + 2 + 2.2 * sn(x * 1.3, 91) * Math.sin(Math.PI * t) + 0.7 * fn(x * 7);
        pts.push([x, h, z]);
      }
      const n = pts.length;
      pts.push([span, floorY(z) - 3, z], [-span, floorY(z) - 3, z]);
      stroke3(pts, 0.9, 0.35, true, n);
    }

    // ---- the crest of each wall: lateral position and height along z
    const crestX = (z, s) => WF + 2.2 + 1.6 * sn(Math.log(z) * 4, s) + 0.4 * sn(Math.log(z) * 13, s + 3);
    // we stand at the valley's mouth, where the walls have fallen away
    // to slopes: the crest rises from there to the peaks further in, so
    // the near walls never loom up into the page's columns
    const near = (z) => Math.min(1, Math.max(0.3, (z / zn - 0.5) / 2.6));
    const crestY = (z, s) => {
      const base = 2.2 + 1.1 * sn(Math.log(z) * 5, s + 7);
      const spike = sn(Math.log(z) * 19, s + 11);
      return floorY(z) + near(z) * (base + (spike > 0.72 ? (spike - 0.72) * 2.5 : 0) + 0.2 * fn(Math.log(z) * 40 + s));
    };

    // ---- the glacier: the floor from a third of the way back is ice,
    // creased across by crevasses that bow down-valley, ending in a
    // snout the river runs out of
    const zg = zf * 0.34;
    {
      const ice = zs(60, zg, zf);
      for (let i = 0; i < ice.length; i += 2) {
        const z = ice[i], pts = [];
        const bow = 0.06 + 0.04 * fn(i);
        for (let x = -WF + 0.15; x <= WF - 0.15; x += 0.25)
          pts.push([x + 0.1 * (fn(i * 3 + x) - 0.5), floorY(z) + 0.45 + 0.05 * fn(x * 9 + i),
            z - bow * z * (1 - (x / WF) * (x / WF))]);
        stroke3(pts, 0.8, 0.28 + 0.15 * (1 - i / ice.length));
      }
      // a medial moraine: a dark line of rock down the middle of the ice
      stroke3(zs(20, zg * 1.02, zf).map(z => [0.3 * Math.sin(z * 0.05) + 0.1, floorY(z) + 0.5, z]), 0.9, 0.4);
      stroke3(zs(20, zg * 1.02, zf).map(z => [0.3 * Math.sin(z * 0.05) - 0.1, floorY(z) + 0.5, z]), 0.9, 0.4);
      // the snout: a heavier arc, and a few cracks running back into it
      const pts = [];
      for (let x = -WF; x <= WF; x += 0.2)
        pts.push([x, floorY(zg) + 0.05 + 0.4 * (1 - Math.pow(x / WF, 4)), zg - 0.05 * zg * (1 - (x / WF) * (x / WF))]);
      stroke3(pts, 1.2, 0.55);
      for (let k = 0; k < 7; k++) {
        const x = -WF + 0.6 + fn(k * 5) * (2 * WF - 1.2);
        stroke3([[x, floorY(zg) + 0.15, zg], [x + (fn(k) - 0.5), floorY(zg) + 0.4, zg * (1.06 + 0.08 * fn(k * 3))]], 0.7, 0.35);
      }
    }

    // ---- the river: a braid out of the snout, wandering down the
    // floor towards us and widening a little as it comes
    {
      const zr = zs(70, zn * 0.6, zg);
      const mid = (z) => 0.9 * Math.sin(z * 0.11) + 0.45 * Math.sin(z * 0.31 + 1) + 0.15 * (sn(z * 0.8, 33) - 0.5);
      const hw = (z) => 0.55 - 0.25 * (z - zn) / (zg - zn);
      const L = [], R = [];
      for (const z of zr) {
        const m = mid(z), w = hw(z);
        L.push([m - w, 0.02 + floorY(z), z]);
        R.push([m + w, 0.02 + floorY(z), z]);
      }
      stroke3(L, 1.1, 0.6);
      stroke3(R, 1.1, 0.6);
      // a second channel splitting off and rejoining, twice
      for (let b = 0; b < 2; b++) {
        const i0 = 12 + b * 26, i1 = i0 + 16, pts = [];
        for (let i = i0; i <= i1; i++) {
          const t = (i - i0) / (i1 - i0), z = zr[i];
          const side = b ? -1 : 1;
          pts.push([mid(z) + side * hw(z) * (0.35 + 0.9 * Math.sin(Math.PI * t)), 0.02 + floorY(z), z]);
        }
        stroke3(pts, 0.8, 0.45);
      }
      // the current: short strokes down the middle of the water
      for (let i = 0; i < 40; i++) {
        const t = fn(i * 7 + 2), z = zn * 0.7 * Math.pow(zg / (zn * 0.7), t);
        const off = (fn(i * 11 + 5) - 0.5) * hw(z) * 1.1;
        stroke3([[mid(z) + off, 0.02 + floorY(z), z], [mid(z * 1.06) + off, 0.02 + floorY(z * 1.06), z * 1.06]], 0.7, 0.35);
      }
      // gravel bars along the banks: a scatter of small arcs near us
      for (let i = 0; i < 30; i++) {
        const z = zn * (0.7 + fn(i * 3) * 2.5), side = fn(i * 5) < 0.5 ? -1 : 1;
        const x = mid(z) + side * (hw(z) + 0.15 + fn(i * 9) * 0.9);
        const r = 0.04 + fn(i * 13) * 0.06, arc = [];
        for (let k = 0; k <= 6; k++) {
          const a = Math.PI * k / 6;
          arc.push([x - r * Math.cos(a), floorY(z) + r * 0.7 * Math.sin(a), z]);
        }
        stroke3(arc, 0.7, 0.35);
      }
    }

    // ---- the walls, near to far, each side: a filled face from the
    // skyline down to the foot, the skyline stroked over it, then the
    // spurs and gullies running down the face and a moraine along the
    // foot
    for (const side of [-1, 1]) {
      const s = side < 0 ? 0 : 50;
      const zc = zs(140, zn * 0.55, zf * 1.3);
      const crest = zc.map(z => [side * crestX(z, s), crestY(z, s), z]);
      const face = crest.concat([[side * WF, floorY(zf * 1.3), zf * 1.3], [side * WF, floorY(zn * 0.55), zn * 0.55]]);
      stroke3(face, 1.3, 0.7, true, crest.length);
      // spurs: from a peak, a line down the face to the foot, bending
      // as it goes; a gully beside the bigger ones
      for (let i = 2; i < crest.length - 2; i += 5) {
        const [x0, y0, z0] = crest[i];
        if (fn(i + s) < 0.45) continue;
        const z1 = z0 * (1 + 0.16 * (fn(i * 3 + s) - 0.3));
        const bend = 0.35 * (fn(i * 7 + s) - 0.5);
        const pts = [];
        const reach = 0.55 + 0.4 * fn(i * 9 + s);   // how far down the face it runs
        for (let k = 0; k <= 8; k++) {
          const t = k / 8 * reach;
          const x = x0 + (side * WF - x0) * t + side * bend * Math.sin(Math.PI * t);
          const y = y0 + (floorY(z0) - y0) * (t * t * 0.6 + t * 0.4);
          pts.push([x, y, z0 + (z1 - z0) * t]);
        }
        stroke3(pts, 0.8, 0.22 + 0.2 * (1 - i / crest.length));
        if (fn(i * 5 + s) > 0.75) {
          const g = pts.slice(3).map(p => [p[0] + side * 0.25, p[1] - 0.15, p[2] * 1.02]);
          stroke3(g, 0.7, 0.18);
        }
      }
      // scree at the foot: short ticks leaning up the face
      for (let i = 0; i < 40; i++) {
        const z = zn * 0.7 * Math.pow(zg / (zn * 0.7), fn(i * 3 + s));
        const x = side * (WF + 0.1 + fn(i * 7 + s) * 0.9);
        stroke3([[x, floorY(z) + 0.05, z], [x + side * 0.25, floorY(z) + 0.3 + fn(i + s) * 0.3, z * 1.01]], 0.7, 0.3);
      }
      // the moraine: a doubled line along the foot, the whole way back
      const foot = zs(30, zn * 0.55, zg * 1.1);
      stroke3(foot.map(z => [side * (WF + 0.05 * sn(z, s + 21)), floorY(z) + 0.02, z]), 1.1, 0.6);
      stroke3(foot.map(z => [side * (WF + 0.5 + 0.2 * sn(z * 0.7, s + 23)), floorY(z) + 0.35 + 0.1 * sn(z, s + 25), z]), 0.8, 0.4);
      // the trimline: where the ice once reached, a faint line along
      // the wall, broken where the spurs cross it
      stroke3(foot.map(z => [side * (WF + 1.2 + 0.3 * sn(z * 0.5, s + 27)), floorY(z) + 1.6 + 0.2 * sn(z * 0.9, s + 29), z]), 0.6, 0.22);
    }

    // ---- the meadow: pines and boulders on the floor nearest us,
    // between the moraine and the water, the nearer ones drawn last
    const trees = [];
    for (let i = 0; i < 28; i++) {
      const z = zn * (0.9 + Math.pow(fn(i * 3 + 1), 1.4) * 5);
      const side = fn(i * 5 + 2) < 0.5 ? -1 : 1;
      const x = side * (1.1 + fn(i * 7 + 3) * 1.7);
      trees.push({ x, z, h: 0.3 + fn(i * 11 + 4) * 0.28, s: i });
    }
    trees.sort((a, b) => b.z - a.z);
    for (const t of trees) {
      const y0 = floorY(t.z), h = t.h;
      const [px, py] = P(t.x, y0, t.z), [, pt] = P(t.x, y0 + h, t.z);
      const th = py - pt;
      if (th < 4) continue;
      // trunk, then the canopy: three tiers of boughs, each tier a
      // point out and a notch back in, down one side and up the other,
      // filled so the trunk and anything behind stop at the outline
      stroke([[px, py], [px, py - th * 0.3]], 0.9, 0.6);
      const tiers = [[0.72, 0.16], [0.5, 0.26], [0.28, 0.36]];   // [height, half-width] as fractions of th
      const right = [];
      for (const [ty, tw] of tiers) {
        right.push([px + tw * th, py - th * ty]);
        right.push([px + tw * th * 0.45, py - th * (ty - 0.05)]);
      }
      right[right.length - 1] = [px + tiers[2][1] * th * 0.25, py - th * 0.26];
      const left = right.slice().reverse().map(q => [2 * px - q[0], q[1]]);
      stroke([[px, pt]].concat(right, left), 1, 0.65, true);
    }
    for (let i = 0; i < 9; i++) {
      const z = zn * (0.8 + fn(i * 3 + 9) * 2.2), side = fn(i * 5 + 8) < 0.5 ? -1 : 1;
      const x = side * (0.9 + fn(i * 7 + 7) * 1.9), r = 0.08 + fn(i * 11 + 6) * 0.12;
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const a = Math.PI * k / 8;
        pts.push([x - r * Math.cos(a), floorY(z) + r * 0.8 * Math.sin(a) * (0.8 + 0.4 * fn(k + i)), z]);
      }
      stroke3(pts, 0.8, 0.45);
    }
  }
  draw();
  addEventListener('resize', () => draw());

  /* ---- The sun: the theme switch, top right in the sky ---- */
  const root = document.documentElement;
  const btn = document.createElement('button');
  btn.className = 'sky-toggle';
  btn.type = 'button';
  btn.innerHTML =
    '<svg viewBox="-24 -24 48 48" aria-hidden="true" fill="none" stroke="currentColor" ' +
      'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' +
      '<g class="sun">' +
        '<circle class="sun-disc" r="8.5" fill="var(--bg)"/>' +
        '<g class="sun-rays">' +
          [0, 45, 90, 135, 180, 225, 270, 315].map(a =>
            '<path d="M0 -13 L0 -19" transform="rotate(' + a + ')"/>').join('') +
        '</g>' +
      '</g>' +
      '<path class="moon" fill="var(--bg)" ' +
        'd="M3 -12 A11 11 0 1 0 12 5 A8.5 8.5 0 0 1 3 -12 Z"/>' +
    '</svg>';
  function label() {
    const light = root.classList.contains('light');
    btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
    btn.title = light ? 'Dark mode' : 'Light mode';
  }
  btn.addEventListener('click', () => {
    const light = root.classList.toggle('light');
    try { localStorage.setItem('theme', light ? 'light' : 'dark'); } catch (e) {}
    root.classList.add('theme-turning');
    setTimeout(() => root.classList.remove('theme-turning'), 700);
    label();
    draw(true);
  });
  label();
  document.body.append(btn);
})();
