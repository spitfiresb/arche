/* The home page's backdrop: a mountain range with a river running out of
   the middle of it, drawn in the same ink the About page's descent and
   meadow are drawn in — thin round strokes in the text colour, shapes
   filled with the page colour so a nearer ridge occludes the one behind
   it — and, in the sky, the sun. The sun is the theme switch: click it
   and the page turns over to the light palette (theme.js remembers), and
   the sun becomes a moon, with a few stars, when the page is dark.

   One fixed svg the size of the window sits under everything; nothing
   in it takes the pointer. The drawing is the window's own size, so it
   is rebuilt on resize, and it's held to faint stroke opacities because
   the page's text runs straight over it — the river deliberately passes
   under the middle column. Below 40rem the scene is display: none with
   the corners and nothing is drawn; the sun stays, smaller, beside the
   flag. */
(function () {
  const main = document.querySelector('main');
  if (!main) return;
  const NS = 'http://www.w3.org/2000/svg';
  const ff = (v) => v.toFixed(1);
  const M = (a, b) => 'M' + ff(a) + ' ' + ff(b);
  const L = (a, b) => 'L' + ff(a) + ' ' + ff(b);
  const Q = (a, b, c, d) => 'Q' + ff(a) + ' ' + ff(b) + ' ' + ff(c) + ' ' + ff(d);
  // deterministic per-index noise so the ridges keep their shape across
  // resizes instead of reshuffling
  const fn = (i) => {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'scene');
  svg.setAttribute('aria-hidden', 'true');
  document.body.prepend(svg);

  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    (parent || svg).appendChild(e);
    return e;
  }
  const ink = (w, op) => ({
    fill: 'none', stroke: 'currentColor', 'stroke-width': w,
    'stroke-opacity': op, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  });
  // a smooth path through points: quadratics with the points as control
  // points and the midpoints as the joins
  function smooth(pts, close) {
    let d = M(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += Q(pts[i][0], pts[i][1], mx, my);
    }
    const last = pts[pts.length - 1];
    d += L(last[0], last[1]);
    return close ? d + 'Z' : d;
  }

  let drawnFor = null;
  function build() {
    if (getComputedStyle(svg).display === 'none') { drawnFor = null; return; }
    // The desktop stylesheet zooms the page to 0.9: rects come back in
    // zoomed pixels, layout in layout pixels. Everything drawn here is
    // layout pixels, so the viewport is divided by the measured zoom.
    const zf = main.offsetHeight
      ? main.getBoundingClientRect().height / main.offsetHeight : 1;
    const W = document.documentElement.clientWidth / zf;
    const H = document.documentElement.clientHeight / zf;
    const key = W + 'x' + H;
    if (key === drawnFor) return;
    drawnFor = key;
    svg.textContent = '';
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

    const hy = H * 0.62;         // where the far range meets the sky
    const gy = H * 0.8;          // the valley floor the near ridges stand on
    const cx = W / 2;            // the river comes out of the middle

    // stars: only in the dark, css hides them in the light
    const stars = el('g', { class: 'scene-stars', fill: 'currentColor' });
    for (let i = 0; i < 34; i++) {
      const x = fn(i * 13 + 5) * W, y = fn(i * 29 + 7) * hy * 0.75;
      el('circle', { cx: ff(x), cy: ff(y), r: (0.6 + fn(i) * 0.7).toFixed(2),
        'fill-opacity': (0.25 + fn(i * 3) * 0.4).toFixed(2) }, stars);
    }

    // a ridge: a run of peaks across [x0, x1], its skirt at base. The
    // crest is stroked on its own and the mass under it filled with the
    // page colour, unstroked, so a nearer ridge hides what's behind it
    // without drawing a floor line under itself. dip(x) lowers the crest
    // towards the river gap.
    function ridge(x0, x1, base, rise, step, seed, w, op, dip) {
      const pts = [];
      for (let x = x0; x <= x1; x += step) {
        let h = rise * (0.35 + fn(seed + x) * 0.65);
        if (dip) h *= dip(x);
        pts.push([x, base - h]);
      }
      // straight runs between the peaks read as rock; smooth would read as hills
      let d = M(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) d += L(pts[i][0], pts[i][1]);
      el('path', { d: d + L(x1, base + 60) + L(x0, base + 60) + 'Z',
        fill: 'var(--bg)', stroke: 'none' });
      el('path', Object.assign(ink(w, op), { d }));
      // a few strokes falling from the taller peaks: the ink's shading
      for (let i = 1; i < pts.length - 1; i++) {
        const [px, py] = pts[i];
        if (py < pts[i - 1][1] && py < pts[i + 1][1] && base - py > rise * 0.45) {
          const n = 2 + Math.floor(fn(seed + i) * 3);
          for (let k = 0; k < n; k++) {
            const len = (base - py) * (0.25 + fn(seed + i * 7 + k) * 0.35);
            const side = k % 2 ? 1 : -1;
            el('path', Object.assign(ink(w * 0.65, op * 0.8), {
              d: M(px + side * (2 + k * 3), py + 4 + k * 3) +
                 Q(px + side * (8 + k * 6), py + len * 0.55, px + side * (10 + k * 9), py + len) }));
          }
        }
      }
    }

    // the far range: a low, faint band all the way across the horizon
    ridge(-40, W + 40, hy, H * 0.16, 58, 11, 1.0, 0.3);

    // the river: a centreline meandering down from a gap in the far
    // range, the banks set out from it and widening towards the bottom
    // edge. Drawn before the near ranges, which stand either side of
    // it and hide all but the stretch that comes through the valley.
    const n = 22, left = [], right = [], mid = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = hy - 4 + t * (H - hy + 10);
      const x = cx + W * 0.05 * Math.sin(t * Math.PI * 1.6) * t;
      const hw = 3 + t * t * W * 0.12 + t * 6;
      mid.push([x, y]);
      left.push([x - hw, y]);
      right.push([x + hw, y]);
    }
    el('path', Object.assign(ink(1.2, 0.45), { d: smooth(left) }));
    el('path', Object.assign(ink(1.2, 0.45), { d: smooth(right) }));
    // the current: short strokes following the flow, more of them as
    // the river widens, none too near a bank
    for (let i = 0; i < 30; i++) {
      const t = 0.35 + fn(i * 5 + 1) * 0.65;
      const k = t * n, a = Math.floor(k), f = k - a;
      if (a >= n) continue;
      const mx = mid[a][0] + (mid[a + 1][0] - mid[a][0]) * f;
      const my = mid[a][1] + (mid[a + 1][1] - mid[a][1]) * f;
      const hw = (right[a][0] - mid[a][0]) * (1 - f) + (right[a + 1][0] - mid[a + 1][0]) * f;
      const off = (fn(i * 9 + 3) - 0.5) * 2 * hw * 0.65;
      const len = 10 + t * 22;
      const dx = (mid[a + 1][0] - mid[a][0]) / (mid[a + 1][1] - mid[a][1]);
      el('path', Object.assign(ink(0.9, 0.35), {
        d: M(mx + off - dx * len * 0.5, my - len * 0.5) +
           Q(mx + off + 3, my, mx + off + dx * len * 0.5, my + len * 0.5) }));
    }

    // the near ranges: two masses either side of the valley the river
    // comes through, taller, darker in the ink, sloping down to the gap
    const gap = Math.max(50, W * 0.05);
    const dipL = (x) => Math.min(1, Math.max(0.05, (cx - gap - x) / (W * 0.2) + 1));
    const dipR = (x) => Math.min(1, Math.max(0.05, (x - cx - gap) / (W * 0.2) + 1));
    ridge(-40, cx - gap, gy, H * 0.3, 46, 23, 1.3, 0.45, dipL);
    ridge(cx + gap, W + 40, gy, H * 0.3, 46, 37, 1.3, 0.45, dipR);

    // the valley floor: a slightly wandering ground line the ridges
    // stand on, in two runs that stop at the water's edge
    const floorY = (x) => gy + (fn(x * 3) - 0.5) * 3 + Math.sin(x / 140) * 3;
    const bankAt = (pts) => {
      for (let i = 1; i <= n; i++)
        if (pts[i][1] >= gy) {
          const f = (gy - pts[i - 1][1]) / (pts[i][1] - pts[i - 1][1]);
          return pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f;
        }
      return cx;
    };
    const bankL = bankAt(left), bankR = bankAt(right);
    const run = (x0, x1) => {
      const pts = [];
      for (let x = x0; x < x1; x += 14) pts.push([x, floorY(x)]);
      pts.push([x1, floorY(x1)]);
      el('path', Object.assign(ink(1.2, 0.4), { d: smooth(pts) }));
    };
    run(-10, bankL);
    run(bankR, W + 10);

    // pines on the valley floor, well clear of the water, the same tree
    // the meadow grows: trunk, then a filled canopy over it
    function pine(x, h, seed) {
      const y0 = floorY(x);
      const tw = [0.27, 0.2, 0.14, 0.09].map((w, i) => h * w * (0.92 + fn(seed + i * 7) * 0.16));
      const ty = [0.24, 0.45, 0.64, 0.8].map(f => y0 - h * f);
      const cy = ty.map(y => y + h * 0.07);
      el('path', Object.assign(ink(1.1, 0.45), {
        d: M(x - 1.8, y0 + 1) + L(x - 1.3, cy[0]) + M(x + 1.8, y0 + 1) + L(x + 1.3, cy[0]) }));
      let d = M(x - tw[0], cy[0]);
      for (let t = 1; t < 4; t++) {
        d += L(x - tw[t] * 0.5, ty[t]);
        d += Q(x - tw[t] * 0.8, ty[t] + h * 0.04, x - tw[t], cy[t]);
      }
      d += L(x, y0 - h) + L(x + tw[3], cy[3]);
      for (let t = 3; t >= 1; t--) {
        d += Q(x + tw[t] * 0.8, ty[t] + h * 0.04, x + tw[t] * 0.5, ty[t]);
        d += L(x + tw[t - 1], cy[t - 1]);
      }
      d += Q(x, cy[0] + h * 0.05, x - tw[0], cy[0]) + 'Z';
      el('path', Object.assign(ink(1.2, 0.45), { d, fill: 'var(--bg)' }));
    }
    for (let i = 0; i < W / 110; i++) {
      const s = i * 17;
      const x = fn(s) < 0.5
        ? 30 + fn(s + 1) * (bankL - 60)
        : bankR + 30 + fn(s + 1) * (W - bankR - 60);
      pine(x, 28 + fn(s + 2) * 30, s);
    }
  }
  build();
  addEventListener('resize', build);

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
  });
  label();
  document.body.append(btn);
})();
