/* The home page's backdrop: a valley in colouring-book line art. Clouds
   over a range of snow-capped peaks, two forested hills sloping down to
   a gap, and a river coming out of the gap and winding towards us across
   a meadow of bushes, rocks and grass, with big pines in the near
   corners. Every element is one closed shape with a clean outline,
   filled with the page colour so the nearer shape hides the farther
   one; depth is overlap, never shading, and the only interior lines are
   deliberate — a snow zigzag under a summit, the inner line of a river
   bank, a ripple, the tiers of a pine.

   It is a fixed composition, drawn by hand in a 1600×460 design box and
   scaled to the window the way the car on About is scaled from its
   source box — not generated, so it stays composed at every size. The
   box is fitted to cover the band (scaled to the width, anchored to the
   bottom edge, the sky cropped first on a short band, the sides on a
   tall one) and clipped to it, so nothing reaches the columns above.
   The pines are the About meadow's pine (camp.js), the bushes, rocks
   and turf its too, so the two pages share a hand.

   Drawn on a canvas the size of the window, fixed under the page. The
   band is the bottom --valley-h of the window: the script measures where
   the work grid ends and sets the variable to what's left under it, and
   main's bottom padding follows. Redrawn on resize and when the sun is
   clicked; display: none below 40rem with the corners.

   The sun, top right in the sky, is the theme switch: theme.js puts
   html.light back on every page before paint; this file only toggles it
   and remembers the choice. */
(function () {
  const main = document.querySelector('main');
  if (!main) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'valley';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');

  // deterministic noise: the same forest on every visit and every resize
  const fn = (i) => {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const BW = 1600, BH = 460;   // the design box

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

    // the band takes what the columns leave: from just under the work
    // grid to the bottom edge, held between a quarter and 42% of the
    // window. Written back to --valley-h so main's padding matches.
    const grid = main.querySelector('.work-grid');
    const rem = parseFloat(css.fontSize);
    const under = grid
      ? H - (grid.getBoundingClientRect().bottom / zoom + window.scrollY / zoom) - rem
      : H * 0.38;
    const Vh = Math.round(clamp(under, H * 0.26, H * 0.42));
    document.documentElement.style.setProperty('--valley-h', Vh + 'px');

    const dpr = (window.devicePixelRatio || 1) * zoom;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ink;
    ctx.fillStyle = paper;

    const dark = !document.documentElement.classList.contains('light');
    const yb = H - Vh;

    // fit the box over the band: scaled to cover, anchored bottom-centre,
    // and clipped to the band so the sky never reaches the columns
    const s = Math.max(W / BW, Vh / BH);
    const ox = (W - BW * s) / 2, oy = H - BH * s;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, yb, W, Vh);
    ctx.clip();
    ctx.translate(ox, oy);
    ctx.scale(s, s);
    // line weights are set in box units, so they scale with the drawing
    const THICK = 2.4, MID = 1.8, THIN = 1.3;
    const topBox = (yb - oy) / s;   // the band's top edge, in box units

    // ---- primitives, in box space
    function trace(pts, smooth) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      if (!smooth) { for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); return; }
      for (let i = 1; i < pts.length - 1; i++)
        ctx.quadraticCurveTo(pts[i][0], pts[i][1], (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
      ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
    }
    // a filled face whose first n points are its visible edge
    function face(pts, n, w, smooth) {
      ctx.beginPath(); trace(pts, smooth); ctx.closePath(); ctx.fill();
      ctx.beginPath(); trace(pts.slice(0, n), smooth); ctx.lineWidth = w; ctx.stroke();
    }
    function line(pts, w, smooth) { ctx.beginPath(); trace(pts, smooth); ctx.lineWidth = w; ctx.stroke(); }
    function closed(pts, w, smooth) { ctx.beginPath(); trace(pts, smooth); ctx.closePath(); ctx.fill(); ctx.lineWidth = w; ctx.stroke(); }

    // ---- the meadow's shapes (camp.js)
    // pine: trunk first, filled canopy over it, root flare when big
    function pine(x, gy, h, seed, w) {
      const tw = [0.27, 0.2, 0.14, 0.09].map((f, i) => h * f * (0.92 + fn(seed + i * 7) * 0.16));
      const ty = [0.24, 0.45, 0.64, 0.8].map(f => gy - h * f);
      const cy = ty.map(y => y + h * 0.07);
      const k = h / 55;
      ctx.beginPath();
      ctx.moveTo(x - 2.2 * k, gy + k); ctx.lineTo(x - 1.6 * k, cy[0]);
      ctx.moveTo(x + 2.2 * k, gy + k); ctx.lineTo(x + 1.6 * k, cy[0]);
      if (h > 40) {
        ctx.moveTo(x - 2.2 * k, gy); ctx.quadraticCurveTo(x - 4.5 * k, gy - k, x - 6 * k, gy + k);
        ctx.moveTo(x + 2.2 * k, gy); ctx.quadraticCurveTo(x + 4.5 * k, gy - k, x + 6 * k, gy + k);
      }
      ctx.lineWidth = w; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - tw[0], cy[0]);
      for (let t = 1; t < 4; t++) {
        ctx.lineTo(x - tw[t] * 0.5, ty[t]);
        ctx.quadraticCurveTo(x - tw[t] * 0.8, ty[t] + h * 0.04, x - tw[t], cy[t]);
      }
      ctx.lineTo(x, gy - h);
      ctx.lineTo(x + tw[3], cy[3]);
      for (let t = 3; t >= 1; t--) {
        ctx.quadraticCurveTo(x + tw[t] * 0.8, ty[t] + h * 0.04, x + tw[t] * 0.5, ty[t]);
        ctx.lineTo(x + tw[t - 1], cy[t - 1]);
      }
      ctx.quadraticCurveTo(x, cy[0] + h * 0.05, x - tw[0], cy[0]);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = w; ctx.stroke();
    }
    // bush: one closed run of humps rooted in the turf
    function bush(x, gy, w, seed) {
      const h = w * 0.55, n = 6, pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push([x - w / 2 + w * t, gy - h * Math.sin(Math.PI * t) * (0.85 + fn(seed + i) * 0.3)]);
      }
      ctx.beginPath();
      ctx.moveTo(pts[0][0], gy + 1);
      for (let i = 1; i <= n; i++) {
        const p0 = pts[i - 1], p1 = pts[i], mx = (p0[0] + p1[0]) / 2;
        ctx.quadraticCurveTo(mx + (mx - x) * 0.3, (p0[1] + p1[1]) / 2 - h * 0.32, p1[0], i === n ? gy + 1 : p1[1]);
      }
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = MID; ctx.stroke();
    }
    // rock: rounded boulder with a couple of hatch ticks
    function rock(x, gy, w, seed) {
      const h = w * (0.45 + fn(seed) * 0.2);
      ctx.beginPath();
      ctx.moveTo(x - w / 2, gy);
      ctx.quadraticCurveTo(x - w / 2, gy - h, x - w * 0.1, gy - h);
      ctx.quadraticCurveTo(x + w / 2, gy - h * 0.9, x + w / 2, gy);
      ctx.closePath(); ctx.fill();
      ctx.lineWidth = MID; ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + w * 0.05, gy - h * 0.75); ctx.lineTo(x + w * 0.27, gy - h * 0.45);
      ctx.moveTo(x + w * 0.2, gy - h * 0.85); ctx.lineTo(x + w * 0.42, gy - h * 0.55);
      ctx.lineWidth = 0.9; ctx.stroke();
    }
    // turf: a cluster of blades
    function tuft(x, gy, k, seed) {
      const n = 2 + Math.floor(fn(seed) * 3);
      ctx.beginPath();
      for (let b = 0; b < n; b++) {
        const bx = x + (b * 1.6 - n * 0.8) * k;
        const lean = (b / Math.max(1, n - 1) - 0.5) * 2 + 0.3;
        const hgt = (5 + fn(seed * 13 + b) * 9) * k;
        ctx.moveTo(bx, gy + 1.5 * k);
        ctx.quadraticCurveTo(bx + lean * 2 * k, gy - hgt * 0.55, bx + lean * 4.5 * k, gy - hgt);
      }
      ctx.lineWidth = THIN; ctx.stroke();
    }
    // cloud: bumpy top, flat base
    function cloud(cx, cy, k) {
      const b = [[-1, 0], [-1.05, -0.3], [-0.7, -0.6], [-0.4, -0.35], [-0.3, -0.85], [0.1, -0.9], [0.3, -0.5], [0.5, -0.75], [0.9, -0.55], [1.05, -0.2], [1, 0]];
      closed(b.map(p => [cx + p[0] * k, cy + p[1] * k]), MID, true);
    }
    // snow: a zigzag under a summit, between two points on its flanks
    function snowcap(l, r, depth) {
      const pts = [l], n = 6;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push([l[0] + (r[0] - l[0]) * t, l[1] + (r[1] - l[1]) * t + (i % 2 ? -depth : depth * 0.5)]);
      }
      pts.push(r); line(pts, MID);
    }
    // the y of a smooth ridge at x, for planting trees on it
    function ridgeAt(pts, x) {
      for (let i = 1; i < pts.length; i++)
        if (x <= pts[i][0]) {
          const t = (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
          return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
        }
      return pts[pts.length - 1][1];
    }

    // ================= the scene, back to front =================
    // stars, in the dark, above the range
    if (dark) {
      ctx.save();
      ctx.fillStyle = ink;
      for (let i = 0; i < 40; i++) {
        const x = fn(i * 13 + 5) * BW, y = topBox + 10 + fn(i * 29 + 7) * (150 - topBox);
        if (y > 150) continue;
        ctx.globalAlpha = 0.35 + fn(i * 3) * 0.45;
        ctx.beginPath(); ctx.arc(x, y, 0.8 + fn(i) * 0.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    // clouds
    // clouds, only the ones the band has room for: a cropped cloud is a box
    for (const [cx, cy, k] of [[300, 128, 62], [1250, 104, 50], [830, 86, 42]])
      if (cy - 0.95 * k > topBox + 4) cloud(cx, cy, k);

    // the far range: peaks all the way across, snow on the tall ones
    const far = [[-20, 350], [90, 260], [180, 305], [300, 178], [380, 240], [470, 130], [560, 220], [640, 200], [720, 148], [800, 220], [900, 170], [980, 232], [1080, 120], [1180, 200], [1260, 182], [1350, 110], [1440, 212], [1520, 170], [1620, 270]];
    face(far.concat([[1620, 440], [-20, 440]]), far.length, THICK);
    snowcap([262, 216], [336, 213], 9); snowcap([430, 172], [512, 170], 10); snowcap([684, 185], [758, 188], 8);
    snowcap([1038, 162], [1122, 162], 10); snowcap([1306, 152], [1394, 156], 10);

    // the hills: two rounded ridges sloping to the gap, then the forest
    // over each in rows from the ridge down, back to front
    const hillL = [[-20, 300], [120, 232], [300, 222], [480, 250], [620, 296], [700, 322], [760, 348], [790, 372]];
    const hillR = [[1620, 282], [1480, 212], [1300, 206], [1120, 246], [980, 292], [900, 318], [840, 342], [810, 372]];
    face(hillL.concat([[790, 460], [-20, 460]]), hillL.length, THICK, true);
    face(hillR.concat([[810, 460], [1620, 460]]), hillR.length, THICK, true);
    const meadowY = 372;
    function forest(ridge, x0, x1, seed) {
      const rows = 6;
      for (let r = 0; r < rows; r++) {
        const step = 30 + r * 6;
        for (let x = x0 + fn(seed + r) * step; x < x1; x += step) {
          const jx = x + (fn(seed + x * 3 + r) - 0.5) * step * 0.6;
          const gy = ridgeAt(ridge, jx) + 8 + r * 24 + (fn(seed + x + r * 7) - 0.5) * 12;
          if (gy > meadowY - 2) continue;
          const h = 26 + r * 5 + fn(seed + x * 5 + r) * 12;
          pine(jx, gy, h, seed + x + r, THIN + r * 0.12);
        }
      }
    }
    forest(hillL, 0, 785, 11);
    forest(hillR.slice().reverse(), 815, 1600, 23);

    // the meadow: its far edge, then the river out of the gap
    face([[-20, 380], [200, 366], [500, 370], [700, 362], [800, 358], [900, 362], [1100, 372], [1400, 366], [1620, 380], [1620, 460], [-20, 460]], 9, THICK, true);
    const L = [[768, 358], [742, 376], [690, 390], [640, 402], [612, 420], [626, 440], [660, 456], [690, 480]];
    const R = [[832, 358], [836, 378], [812, 394], [790, 408], [800, 428], [842, 446], [886, 462], [920, 480]];
    ctx.beginPath(); trace(L, true); trace(R.slice().reverse(), true); ctx.closePath(); ctx.fill();
    line(L, THICK, true); line(R, THICK, true);
    line(L.slice(1).map(p => [p[0] + 14, p[1] + 5]), THIN, true);
    line(R.slice(1).map(p => [p[0] - 14, p[1] + 5]), THIN, true);
    // a gravel bar on the inside of the first bend, and ripples
    closed([[690, 416], [716, 410], [742, 418], [736, 432], [706, 436]], THIN, true);
    for (let i = 0; i < 5; i++) {
      const y = 384 + i * 17, cx = 760 - i * 10 + (i % 2) * 34;
      line([[cx - 14, y], [cx, y - 4], [cx + 14, y]], THIN, true);
    }

    // meadow props: bushes, rocks, turf, and the big pines in the corners
    const props = [];
    for (let i = 0; i < 60; i++) {
      const x = fn(i * 3 + 1) * BW, y = meadowY + 8 + Math.pow(fn(i * 5 + 2), 1.3) * 80;
      // keep off the water: the ribbon runs roughly 610–930 wide down the middle
      if (x > 590 && x < 950) continue;
      props.push({ x, y, kind: fn(i * 7 + 3), s: i });
    }
    props.sort((a, b) => a.y - b.y);
    for (const p of props) {
      const k = 0.6 + (p.y - meadowY) / 90;
      if (p.kind < 0.22) rock(p.x, p.y, 18 * k + fn(p.s) * 16 * k, p.s);
      else if (p.kind < 0.5) bush(p.x, p.y, 30 * k + fn(p.s) * 30 * k, p.s);
      else if (k > 0.85) tuft(p.x, p.y, k * 1.1, p.s);
    }
    pine(70, 462, 150, 101, THICK); pine(165, 462, 112, 102, THICK); pine(280, 456, 82, 103, MID);
    pine(1530, 462, 160, 104, THICK); pine(1430, 462, 118, 105, THICK); pine(1310, 456, 84, 106, MID);
    pine(470, 452, 62, 107, MID); pine(1140, 452, 66, 108, MID);

    ctx.restore();
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
