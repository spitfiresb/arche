/* The home page's backdrop: a glacier valley from a viewpoint high on
   its shoulder, looking down its length. The valley winds; the river
   braids out of the ice at the far end and meanders down the floor
   between forest, gravel bars and boulders; the walls step up in
   benches to a broken skyline, with a waterfall off one of them; pines
   climb the lower slopes and stand thick on the floor, thinning to the
   meadow and boulders nearest us.

   It is drawn, not pictured: the valley is laid out in three
   dimensions (x across, y up, z away; the floor is six wide) and every
   mark is a stroke through projected points on a canvas the size of
   the window, so the perspective is real and a resize is a redraw. The
   ink is About's meadow's, and the pines, bushes, rocks and turf are
   the same shapes camp.js draws there — filled with the page colour and
   stroked in the text colour, nearer ones over farther ones, so a tree
   in front hides the tree behind it the way it should.

   The band is the bottom --valley-h of the window: the script measures
   where the work grid ends and sets the variable to the space left
   under it, and main's bottom padding follows, so the columns stay in
   the sky above the skyline. Redrawn on resize and when the sun is
   clicked; display: none below 40rem with the corners.

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
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

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
    const yb = H - Vh;                 // the band's top edge
    const cx = W / 2;
    const vpy = yb + Vh * 0.16;        // eye level: the far skyline sits about here
    const f = W * 0.46;                // focal length
    const camY = 4.2;                  // we stand high on the valley's shoulder
    const zn = f * camY / (H - vpy);   // z of the floor at the bottom edge
    const zf = zn * 17;                // the head of the valley
    const zg = zf * 0.44;              // where the ice begins
    const WF = 3.0;                    // half-width of the floor
    const SLOPE = 1.5;                 // the walls' rise per unit out from the foot
    const floorY = (z) => 0.04 * (z - zn);   // the floor climbs to the ice
    // the valley winds: everything across is offset by its axis
    const axis = (z) => 2.4 * Math.sin((z - zn) * 0.05) + 0.9 * Math.sin((z - zn) * 0.13 + 1.2);
    const P = (x, y, z) => [cx + f * x / z, vpy - f * (y - camY) / z];
    const zs = (n, a, b) => Array.from({ length: n + 1 }, (_, i) => a * Math.pow(b / a, i / n));
    const lw = (z) => clamp(1.5 * Math.pow(zn / z, 0.4), 0.7, 1.5);

    // ---- drawing primitives, in screen space
    function path(pts, close) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      if (close) ctx.closePath();
    }
    // a smooth line through points: quadratics with the points as the
    // controls and the midpoints as the joins
    function smoothPath(pts, close) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++)
        ctx.quadraticCurveTo(pts[i][0], pts[i][1],
          (pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2);
      const l = pts[pts.length - 1];
      ctx.lineTo(l[0], l[1]);
      if (close) ctx.closePath();
    }
    function stroke(w) { ctx.lineWidth = w; ctx.stroke(); }
    // a filled face: the polygon painted in the page colour, then only
    // its first n points stroked (the skyline, not the base)
    function face(pts, n, w) {
      path(pts, true);
      ctx.fill();
      path(pts.slice(0, n));
      stroke(w);
    }
    const proj = (pts3) => pts3.map(p => P(p[0], p[1], p[2]));

    // ---- the meadow's shapes (camp.js), in screen space, scaled by s
    // pine: trunk first, filled canopy over it
    function pine(x, gy, h, seed) {
      const tw = [0.27, 0.2, 0.14, 0.09].map((w, i) => h * w * (0.92 + fn(seed + i * 7) * 0.16));
      const ty = [0.24, 0.45, 0.64, 0.8].map(fr => gy - h * fr);
      const cy = ty.map(y => y + h * 0.07);
      const s = h / 55, w = clamp(h / 40, 0.6, 1.4);
      ctx.beginPath();
      ctx.moveTo(x - 2.2 * s, gy + s); ctx.lineTo(x - 1.6 * s, cy[0]);
      ctx.moveTo(x + 2.2 * s, gy + s); ctx.lineTo(x + 1.6 * s, cy[0]);
      if (h > 22) {
        ctx.moveTo(x - 2.2 * s, gy); ctx.quadraticCurveTo(x - 4.5 * s, gy - s, x - 6 * s, gy + s);
        ctx.moveTo(x + 2.2 * s, gy); ctx.quadraticCurveTo(x + 4.5 * s, gy - s, x + 6 * s, gy + s);
      }
      stroke(w);
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
      stroke(w);
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
      ctx.closePath();
      ctx.fill();
      stroke(clamp(w / 30, 0.6, 1.2));
    }
    // rock: small rounded boulder with a couple of hatch ticks
    function rock(x, gy, w, seed) {
      const h = w * (0.45 + fn(seed) * 0.2);
      ctx.beginPath();
      ctx.moveTo(x - w / 2, gy);
      ctx.quadraticCurveTo(x - w / 2, gy - h, x - w * 0.1, gy - h);
      ctx.quadraticCurveTo(x + w / 2, gy - h * 0.9, x + w / 2, gy);
      ctx.closePath();
      ctx.fill();
      stroke(clamp(w / 14, 0.6, 1.4));
      if (w > 9) {
        ctx.beginPath();
        ctx.moveTo(x + w * 0.05, gy - h * 0.75); ctx.lineTo(x + w * 0.27, gy - h * 0.45);
        ctx.moveTo(x + w * 0.2, gy - h * 0.85); ctx.lineTo(x + w * 0.42, gy - h * 0.55);
        stroke(0.6);
      }
    }
    // turf: a cluster of blades, the meadow's grass
    function tuft(x, gy, s, seed) {
      const n = 2 + Math.floor(fn(seed) * 3);
      ctx.beginPath();
      for (let b = 0; b < n; b++) {
        const bx = x + (b * 1.6 - n * 0.8) * s;
        const lean = (b / Math.max(1, n - 1) - 0.5) * 2 + 0.3;
        const hgt = (5 + fn(seed * 13 + b) * 9) * s;
        ctx.moveTo(bx, gy + 1.5 * s);
        ctx.quadraticCurveTo(bx + lean * 2 * s, gy - hgt * 0.55, bx + lean * 4.5 * s, gy - hgt);
      }
      stroke(clamp(0.9 * s, 0.5, 0.9));
    }

    // ---- stars, in the dark, over the sky at the head of the valley
    if (dark) {
      ctx.save();
      ctx.fillStyle = ink;
      for (let i = 0; i < 44; i++) {
        const x = fn(i * 13 + 5) * W, y = yb + fn(i * 29 + 7) * (vpy - yb - 24);
        ctx.globalAlpha = 0.3 + fn(i * 3) * 0.45;
        ctx.beginPath();
        ctx.arc(x, y, 0.6 + fn(i) * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    // birds, a few, high over the head of the valley
    for (let i = 0; i < 5; i++) {
      const x = cx + (fn(i * 7 + 1) - 0.5) * W * 0.5, y = yb + 10 + fn(i * 11 + 2) * (vpy - yb - 40);
      const s = 3 + fn(i * 5 + 3) * 4;
      ctx.beginPath();
      ctx.moveTo(x - s, y);
      ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.7, x, y - s * 0.1);
      ctx.quadraticCurveTo(x + s * 0.5, y - s * 0.7, x + s, y);
      stroke(0.8);
    }

    // ---- the range beyond the head of the valley: filled, so the ice
    // ends against it
    {
      const z = zf * 1.3, a = axis(z), pts = [];
      const span = WF + 12;
      for (let x = -span; x <= span; x += 0.4) {
        const t = (x + span) / (2 * span);
        const h = floorY(z) + 3.5 + 3.5 * sn(x * 0.9, 91) * Math.sin(Math.PI * t) + 1.2 * sn(x * 4, 93);
        pts.push([a + x, h, z]);
      }
      const n = pts.length;
      pts.push([a + span, floorY(z) - 4, z], [a - span, floorY(z) - 4, z]);
      face(proj(pts), n, 0.9);
    }

    // ---- the crest of each wall along z: how far out, how high
    const crestOut = (z, s) => WF + 2.3 + 1.3 * sn(Math.log(z) * 4, s) + 0.3 * sn(Math.log(z) * 13, s + 3);
    const crestY = (z, s) => {
      const spike = sn(Math.log(z) * 4.5, s + 11);
      return floorY(z) + 3.6 + 0.9 * sn(Math.log(z) * 5, s + 7) + 0.25 * sn(Math.log(z) * 21, s + 9)
        + (spike > 0.6 ? (spike - 0.6) * 2.6 : 0);
    };
    // a second, higher range standing behind each wall
    const backOut = (z, s) => crestOut(z, s) + 3.2 + 1.5 * sn(Math.log(z) * 3, s + 31);
    const backY = (z, s) => {
      const spike = sn(Math.log(z) * 4, s + 37);
      return floorY(z) + 4.6 + 1.3 * sn(Math.log(z) * 4, s + 33) + 0.3 * sn(Math.log(z) * 17, s + 35)
        + (spike > 0.6 ? (spike - 0.6) * 3.5 : 0);
    };

    // ---- the glacier: the floor from the head down to the snout is
    // ice, creased by crevasses that bow down-valley
    {
      const iceY = (z) => floorY(z) + 0.5;
      const zi = zs(48, zg, zf);
      // the edges of the ice against each wall
      for (const side of [-1, 1])
        smoothPath(proj(zi.map(z => [axis(z) + side * (WF - 0.15), iceY(z), z])));
      for (const side of [-1, 1]) {
        smoothPath(proj(zi.map(z => [axis(z) + side * (WF - 0.15), iceY(z), z])));
        stroke(0.9);
      }
      for (let i = 2; i < zi.length; i += 3) {
        const z = zi[i], pts = [], bow = 0.07 + 0.03 * fn(i);
        const l = -WF + 0.45 + fn(i * 3) * 0.6, r = WF - 0.45 - fn(i * 5) * 0.6;
        for (let x = l; x <= r; x += 0.2)
          pts.push([axis(z) + x, iceY(z), z - bow * z * (1 - (x / WF) * (x / WF))]);
        smoothPath(proj(pts));
        stroke(0.8);
      }
      // a medial moraine down the middle of the ice
      smoothPath(proj(zs(24, zg * 1.03, zf).map(z => [axis(z) + 0.25 * Math.sin(z * 0.06), iceY(z), z])));
      stroke(0.9);
      // the snout: a heavier arc the river runs out of
      const pts = [];
      for (let x = -WF + 0.1; x <= WF - 0.1; x += 0.15)
        pts.push([axis(zg) + x, floorY(zg) + 0.05 + 0.45 * (1 - Math.pow(x / WF, 4)), zg - 0.06 * zg * (1 - (x / WF) * (x / WF))]);
      smoothPath(proj(pts));
      stroke(1.1);
    }

    // ---- the river: out of the snout, meandering down the floor,
    // widening a little as it comes; gravel bars on the inside of the
    // bends, boulders in the shallows
    const rmid = (z) => axis(z) + 0.9 * Math.sin(z * 0.14 + 2) + 0.35 * Math.sin(z * 0.41) + 0.2 * (sn(z * 0.6, 33) - 0.5);
    const rhw = (z) => 0.55 - 0.3 * (z - zn) / (zg - zn);
    {
      const zr = zs(90, zn * 0.5, zg);
      const L = zr.map(z => [rmid(z) - rhw(z), floorY(z), z]);
      const R = zr.map(z => [rmid(z) + rhw(z), floorY(z), z]);
      smoothPath(proj(L)); stroke(1.1);
      smoothPath(proj(R)); stroke(1.1);
      // a side channel that splits and rejoins, twice
      for (let b = 0; b < 2; b++) {
        const i0 = 14 + b * 34, i1 = i0 + 22, pts = [];
        for (let i = i0; i <= i1; i++) {
          const t = (i - i0) / (i1 - i0), z = zr[i], side = b ? -1 : 1;
          pts.push([rmid(z) + side * rhw(z) * (0.5 + 1.1 * Math.sin(Math.PI * t)), floorY(z), z]);
        }
        smoothPath(proj(pts)); stroke(0.9);
      }
      // the current: a long stroke or two riding the middle
      for (let k = 0; k < 6; k++) {
        const i0 = 4 + k * 14, i1 = i0 + 7 + Math.floor(fn(k) * 5), pts = [];
        const off = (fn(k * 9 + 1) - 0.5) * 0.8;
        for (let i = i0; i <= i1 && i < zr.length; i++) {
          const z = zr[i];
          pts.push([rmid(z) + off * rhw(z), floorY(z), z]);
        }
        smoothPath(proj(pts)); stroke(0.7);
      }
      // gravel bars: lens shapes on the bank, filled
      for (let k = 0; k < 7; k++) {
        const i0 = 6 + k * 11, len = 5 + Math.floor(fn(k * 3) * 4), side = fn(k * 7) < 0.5 ? -1 : 1, pts = [];
        for (let i = 0; i <= len; i++) {
          const z = zr[i0 + i], t = i / len;
          pts.push([rmid(z) + side * (rhw(z) + 0.5 * Math.sin(Math.PI * t) * (0.5 + fn(k + i) * 0.3)), floorY(z), z]);
        }
        for (let i = len; i >= 0; i--) {
          const z = zr[i0 + i], t = i / len;
          pts.push([rmid(z) + side * (rhw(z) - 0.1 - 0.15 * Math.sin(Math.PI * t)), floorY(z), z]);
        }
        smoothPath(proj(pts), true);
        ctx.fill();
        stroke(0.8);
        // pebbles on it
        for (let p = 0; p < 4; p++) {
          const z = zr[i0 + 1 + Math.floor(fn(k * 5 + p) * (len - 1))];
          const [px, py] = P(rmid(z) + side * (rhw(z) + 0.15 + fn(k * 11 + p) * 0.2), floorY(z), z);
          const r = clamp(f * 0.05 / z, 0.8, 3);
          ctx.beginPath();
          ctx.moveTo(px - r, py);
          ctx.quadraticCurveTo(px, py - r * 1.4, px + r, py);
          ctx.quadraticCurveTo(px, py + r * 0.8, px - r, py);
          stroke(0.6);
        }
      }
    }

    // ---- a waterfall off the right wall a third of the way up the
    // valley: a doubled falling line down the face, a plunge pool, and
    // a stream across the floor into the river
    const zw = zn * 4.2, sw = 1;
    {
      const x0 = axis(zw) + sw * (WF + 1.5), top = floorY(zw) + 2.2;
      for (const dx of [-0.05, 0.05]) {
        const pts = [];
        for (let k = 0; k <= 12; k++) {
          const t = k / 12;
          pts.push([x0 + dx + 0.06 * Math.sin(t * 9) - sw * 1.45 * t * t, top - (top - floorY(zw)) * t, zw + 0.3 * t]);
        }
        smoothPath(proj(pts)); stroke(0.8);
      }
      const pool = [];
      for (let k = 0; k <= 12; k++) {
        const a = Math.PI * 2 * k / 12;
        pool.push([axis(zw) + sw * WF - sw * 0.05 + 0.32 * Math.cos(a), floorY(zw), zw + 0.3 + 0.6 * Math.sin(a)]);
      }
      smoothPath(proj(pool), true); stroke(0.8);
      const brook = zs(14, zw + 0.9, zw * 1.05).map((z, i) =>
        [axis(zw) + sw * (WF - 0.3) - (axis(zw) + sw * (WF - 0.3) - (rmid(z) + sw * rhw(z))) * (i / 14), floorY(z), z]);
      smoothPath(proj(brook)); stroke(0.8);
    }

    // ---- the walls, each side: a filled face from the skyline down to
    // the foot, benches stepping across it, crags under the peaks
    // the walls' detail stays inside the band: a crag or ridge line that
    // would poke above the skyline is clipped rather than drawn into the
    // sky beside the columns; the skylines themselves are not clipped
    const clipBand = () => { ctx.save(); ctx.beginPath(); ctx.rect(0, yb, W, Vh); ctx.clip(); };
    for (const side of [-1, 1]) {
      const s = side < 0 ? 0 : 50;
      const zc = zs(160, zn * 0.45, zf * 1.3);
      const crest = zc.map(z => [axis(z) + side * crestOut(z, s), crestY(z, s), z]);
      const foot = zc.map(z => [axis(z) + side * WF, floorY(z), z]);
      // the range behind: its skyline, faced down to well below the
      // wall's crest so the wall paints over its lower part
      const zb = zc.filter(z => z > zn * 2.4);
      const back = zb.map(z => [axis(z) + side * backOut(z, s), backY(z, s), z]);
      face(proj(back.concat(zb.slice().reverse().map(z => [axis(z) + side * backOut(z, s), floorY(z) - 2, z]))), back.length, 1.1);
      // off each of its summits, a ridge runs along the range towards us
      // and one down its face, the way a mountain's own lines go
      clipBand();
      for (let i = 4; i < back.length - 4; i += 1) {
        const [x0, y0, z0] = back[i];
        if (!(y0 > back[i - 3][1] && y0 > back[i + 3][1])) continue;
        const along = [], down = [];
        for (let q = 0; q <= 8; q++) {
          const t = q / 8;
          along.push([x0 + side * 0.4 * t, y0 - (0.6 + 0.5 * fn(i + s)) * t - 0.2 * Math.sin(Math.PI * t), z0 * (1 - 0.22 * t)]);
          down.push([x0 - side * (0.9 + 0.4 * fn(i * 3 + s)) * t, y0 - (1.2 + 0.6 * fn(i * 5 + s)) * t, z0 * (1 - 0.06 * t)]);
        }
        smoothPath(proj(along)); stroke(0.8);
        smoothPath(proj(down)); stroke(0.8);
      }
      ctx.restore();
      face(proj(crest.concat(foot.slice().reverse())), crest.length, 1.3);
      clipBand();
      // the foot: where the slope meets the floor
      smoothPath(proj(foot.filter(p => p[2] < zg * 1.05)));
      stroke(1);
      // benches: lines along the face at set heights, broken where the
      // rock is, each following the valley round
      for (const hh of [0.9, 1.9, 2.8]) {
        let run = [];
        const flush = () => { if (run.length > 3) { smoothPath(proj(run)); stroke(0.8); } run = []; };
        for (let i = 0; i < zc.length; i++) {
          const z = zc[i];
          if (crestY(z, s) - floorY(z) < hh + 0.4 || z > zf * 1.05 || z < zn * 0.7 || fn(i * 3 + hh * 10 + s) < 0.3) { flush(); continue; }
          run.push([axis(z) + side * (WF + hh / SLOPE + 0.35 * (sn(Math.log(z) * 7, s + hh * 10) - 0.5)), floorY(z) + hh + 0.3 * (sn(Math.log(z) * 9, s + hh * 3) - 0.5), z]);
        }
        flush();
      }
      // spurs: from a high point, a shoulder runs down the face towards
      // us and bends to meet the foot
      for (let i = 3; i < crest.length - 3; i += 1) {
        const [x0, y0, z0] = crest[i];
        if (z0 < zn * 1.6 || z0 > zg * 1.3 || !(y0 > crest[i - 3][1] && y0 > crest[i + 3][1])) continue;
        const pts = [], z1 = z0 * (0.86 - 0.08 * fn(i + s));
        for (let k = 0; k <= 10; k++) {
          const t = k / 10;
          const reach = 0.45 + 0.3 * fn(i * 17 + s);
          const x = x0 + (axis(z0) + side * WF - x0) * (t * reach) + side * 0.25 * Math.sin(Math.PI * t) * (fn(i * 3 + s) - 0.5);
          const y = y0 + (floorY(z0) - y0) * (0.55 * t * t + 0.45 * t) * reach;
          pts.push([x, y, z0 + (z1 - z0) * t]);
        }
        smoothPath(proj(pts)); stroke(0.85);
      }
      // crags: under a peak, the rock steps down its inner face
      for (let i = 3; i < crest.length - 3; i += 2) {
        const [x0, y0, z0] = crest[i];
        if (z0 < zn * 3 || !(y0 > crest[i - 2][1] && y0 > crest[i + 2][1] && y0 - floorY(z0) > 4.2)) continue;
        const pts = [[x0, y0, z0]];
        let x = x0, y = y0;
        for (let k = 0; k < 4; k++) {
          x -= side * (0.08 + fn(i + k + s) * 0.1); y -= 0.06 + fn(i * 3 + k) * 0.08; pts.push([x, y, z0]);
          y -= 0.18 + fn(i * 5 + k) * 0.15; pts.push([x, y, z0]);
        }
        path(proj(pts)); stroke(0.9);
        // a second, shorter line beside it
        path(proj(pts.slice(2, 7).map(p => [p[0] - side * 0.25, p[1] - 0.15, p[2]]))); stroke(0.7);
      }
      ctx.restore();
    }


    // ---- the forest: pines thick on the floor and up the lower
    // slopes, thinning to the meadow nearest us; every tree the meadow's
    // pine, drawn far to near so each hides what stands behind it
    const trees = [];
    for (let i = 0; i < 2600; i++) {
      const z = zn * 0.5 * Math.pow(zg * 0.98 / (zn * 0.5), fn(i * 3 + 1));
      let x = (fn(i * 5 + 2) - 0.5) * 2 * (WF + 3.2);
      const out = Math.abs(x) - WF;            // how far up the slope
      const side = x < 0 ? -1 : 1, ss = side < 0 ? 0 : 50;
      // the slope runs up to the crest; nothing stands above it
      const cy = crestY(z, ss) - floorY(z), co = crestOut(z, ss) - WF;
      if (out > co - 0.25) continue;
      const y = out > 0 ? floorY(z) + Math.min(out * SLOPE, cy - 0.3) : floorY(z);
      // none in the water, on the bars, or in the meadow right at our feet
      const r = x - (rmid(z) - axis(z));
      if (Math.abs(r) < rhw(z) + 0.8) continue;
      if (z < zn * 1.1 && fn(i * 7) < 0.7) continue;
      if (z > zn * 4 && fn(i * 17) < 0.55) continue;
      // the treeline: thick on the lower slope, thinning to bare rock
      // near the ridge, and thicker everywhere close to us
      const up = out > 0 ? out / co : 0;
      if (out > 0 && fn(i * 11) < Math.pow(up, z < zn * 3 ? 2.2 : 1.1)) continue;
      trees.push({ x: axis(z) + x, y, z, h: 0.36 + fn(i * 13 + 4) * 0.26, s: i });
    }
    trees.sort((a, b) => b.z - a.z);
    for (const t of trees) {
      const [px, py] = P(t.x, t.y, t.z);
      const h = f * t.h / t.z;
      if (h < 5) continue;
      pine(px, py, h, t.s);
    }

    // ---- the meadow nearest us: boulders, bushes and turf on the
    // floor, and rocks along the water
    const near = [];
    for (let i = 0; i < 160; i++) {
      const z = zn * (0.5 + Math.pow(fn(i * 3 + 9), 1.5) * 2.6);
      const x = (fn(i * 5 + 8) - 0.5) * 2 * (WF + 2.0);
      const out = Math.abs(x) - WF;
      const r = x - (rmid(z) - axis(z));
      const kind = fn(i * 7 + 6);
      if (Math.abs(r) < rhw(z) + 0.2) continue;
      near.push({ x: axis(z) + x, y: out > 0 ? floorY(z) + out * SLOPE : floorY(z), z, kind, s: i });
    }
    near.sort((a, b) => b.z - a.z);
    for (const n of near) {
      const [px, py] = P(n.x, n.y, n.z), sc = f / n.z;
      if (n.kind < 0.25) rock(px, py, sc * (0.12 + fn(n.s) * 0.18), n.s);
      else if (n.kind < 0.45) bush(px, py, sc * (0.25 + fn(n.s) * 0.25), n.s);
      else if (sc / 90 > 0.55) tuft(px, py, Math.min(1.6, sc / 90), n.s);
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
