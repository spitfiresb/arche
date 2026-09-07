/* The campground meadow: soil, turf, the camp (stump, fire, tent,
   flower, the 4Runner), left-edge props and a treeline growing in from
   the right, all drawn in the About page's ink language into one svg.
   Shared by About, where it sits at the base of the descent, and the
   home page, where it runs along the bottom of the window.

   drawCamp(svg, o) empties svg and draws into it. o:
     fw      width to fill, in layout px (the viewBox is 0 0 fw 205)
     gy      the ground line's y inside the svg (172 leaves room for the
             tallest pine above and the soil below)
     cliffX  where the cliff base would be: the camp anchors off it and
             the props left of it anchor off the viewport edge. With no
             cliff on the page, pick the x the camp should start at.
     cliff   draw the scree at the cliff base (About only)
     stick   lay the fire-poking stick by the stump (the climber picks it
             up; the home page has no climber)
   Returns { flame, stick, fireX, stumpX }: flame is the updater the
   caller ticks with seconds to keep the fire burning (null when it
   didn't fit); stick is the stick's element or null; fireX and stumpX
   are the camp's x positions relative to cliffX, or null. */
window.drawCamp = function (svg, o) {
  const NS = 'http://www.w3.org/2000/svg';
  const ff = (v) => v.toFixed(1);
  const fln = (w) => ({
    fill: 'none', stroke: '#f2f2f2', 'stroke-width': w,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  });
  // Deterministic per-index noise so the props keep their shape across
  // resizes instead of reshuffling
  const fn = (i) => {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const FM = (a, b) => 'M' + ff(a) + ' ' + ff(b);
  const FL = (a, b) => 'L' + ff(a) + ' ' + ff(b);
  const FQ = (a, b, c, d) => 'Q' + ff(a) + ' ' + ff(b) + ' ' + ff(c) + ' ' + ff(d);
  function fel(name, attrs) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    svg.appendChild(e);
    return e;
  }
  const fw = o.fw, gy = o.gy, cliffX = o.cliffX;
  let floorFlame = null, floorStick = null, stumpX = null;
  svg.textContent = '';
  svg.setAttribute('viewBox', '0 0 ' + fw + ' 205');
  svg.setAttribute('width', fw);
  svg.setAttribute('height', 205);
  // soil: doubled ground edge, pebbles set into the dirt below
  const spts = [];
  for (let px = 0; px <= fw + 12; px += 12)
    spts.push([px, gy + (fn(px) - 0.5) * 2.5]);
  fel('path', Object.assign(fln(1.8), {
    d: spts.map((p, j) => (j ? 'L' : 'M') + ff(p[0]) + ' ' + ff(p[1])).join('') }));
  fel('path', Object.assign(fln(0.8), {
    d: spts.map((p, j) =>
      (j ? 'L' : 'M') + ff(p[0]) + ' ' + ff(p[1] + 5.5 + fn(j) * 2.5)).join('') }));
  for (let i = 0; i < fw / 90; i++) {
    const px = 20 + fn(i * 31) * (fw - 40);
    const py = gy + 7 + fn(i * 17) * 11;
    fel('path', Object.assign(fln(0.7), {
      d: FM(px - 2.5, py) + FQ(px, py - 3.5, px + 2.5, py) +
         FQ(px, py + 2, px - 2.5, py) }));
  }

  // pine: trunk first, filled canopy over it; the hem cuts the
  // trunk exactly at the join
  function pine(x, h, seed) {
    const tw = [0.27, 0.2, 0.14, 0.09].map((w, i) =>
      h * w * (0.92 + fn(seed + i * 7) * 0.16));
    const ty = [0.24, 0.45, 0.64, 0.8].map(f => gy - h * f);
    const cy = ty.map(y => y + h * 0.07);
    fel('path', Object.assign(fln(1.3), {
      d: FM(x - 2.2, gy + 1) + FL(x - 1.6, cy[0]) +
         FM(x + 2.2, gy + 1) + FL(x + 1.6, cy[0]) +
         FM(x - 2.2, gy) + FQ(x - 4.5, gy - 1, x - 6, gy + 1) +
         FM(x + 2.2, gy) + FQ(x + 4.5, gy - 1, x + 6, gy + 1) }));
    let d = FM(x - tw[0], cy[0]);
    for (let t = 1; t < 4; t++) {
      d += FL(x - tw[t] * 0.5, ty[t]);
      d += FQ(x - tw[t] * 0.8, ty[t] + h * 0.04, x - tw[t], cy[t]);
    }
    d += FL(x, gy - h);
    d += FL(x + tw[3], cy[3]);
    for (let t = 3; t >= 1; t--) {
      d += FQ(x + tw[t] * 0.8, ty[t] + h * 0.04, x + tw[t] * 0.5, ty[t]);
      d += FL(x + tw[t - 1], cy[t - 1]);
    }
    d += FQ(x, cy[0] + h * 0.05, x - tw[0], cy[0]) + 'Z';
    fel('path', Object.assign(fln(1.4), { d, fill: '#1a1a1a' }));
  }

  // bush: one closed run of humps rooted in the turf
  function bush(x, w, seed) {
    const h = w * 0.55, n = 6, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push([x - w / 2 + w * t,
        gy - h * Math.sin(Math.PI * t) * (0.85 + fn(seed + i) * 0.3)]);
    }
    let d = FM(pts[0][0], gy + 1);
    for (let i = 1; i <= n; i++) {
      const p0 = pts[i - 1], p1 = pts[i];
      const mx = (p0[0] + p1[0]) / 2;
      d += FQ(mx + (mx - x) * 0.3, (p0[1] + p1[1]) / 2 - h * 0.32,
              p1[0], i === n ? gy + 1 : p1[1]);
    }
    fel('path', Object.assign(fln(1.2), { d: d + 'Z', fill: '#1a1a1a' }));
  }

  // stump with the growth ring showing on the cut face
  function stump(x, w) {
    const h = w * 0.7;
    fel('path', Object.assign(fln(1.3), {
      d: FM(x - w / 2, gy + 1) + FL(x - w / 2 + 1, gy - h) +
         FQ(x, gy - h - 2.5, x + w / 2 - 1, gy - h) +
         FL(x + w / 2, gy + 1) + 'Z', fill: '#1a1a1a' }));
    fel('path', Object.assign(fln(0.8), {
      d: FM(x - w / 2 + 1, gy - h) + FQ(x, gy - h + 2.5, x + w / 2 - 1, gy - h) +
         FM(x - w * 0.2, gy - h + 0.8) +
         FQ(x, gy - h + 2, x + w * 0.2, gy - h + 0.8) }));
  }

  // small rounded rock with a couple of hatch ticks
  function rock(x, w, seed) {
    const h = w * (0.45 + fn(seed) * 0.2);
    fel('path', Object.assign(fln(1.4), {
      d: FM(x - w / 2, gy) + FQ(x - w / 2, gy - h, x - w * 0.1, gy - h) +
         FQ(x + w / 2, gy - h * 0.9, x + w / 2, gy) }));
    fel('path', Object.assign(fln(0.6), {
      d: FM(x + w * 0.05, gy - h * 0.75) +
         'l' + ff(w * 0.22) + ' ' + ff(h * 0.3) +
         FM(x + w * 0.2, gy - h * 0.85) +
         'l' + ff(w * 0.22) + ' ' + ff(h * 0.3) }));
  }

  // fallen log with bark grain and end-grain rings
  function flog(x, len) {
    fel('path', Object.assign(fln(1.4), {
      d: FM(x, gy - 9) + FQ(x + len / 2, gy - 11, x + len, gy - 9) +
         FM(x, gy) + FQ(x + len / 2, gy + 1, x + len, gy) +
         FM(x, gy - 9) + FQ(x - 5.5, gy - 4.5, x, gy) }));
    fel('path', Object.assign(fln(1.1), {
      d: FM(x + len, gy - 9) + FQ(x + len + 5.5, gy - 4.5, x + len, gy) }));
    fel('path', Object.assign(fln(0.6), {
      d: FM(x + len, gy - 6.7) + FQ(x + len + 2.8, gy - 4.5, x + len, gy - 2.3) +
         FM(x + len, gy - 5.4) + FQ(x + len + 1.3, gy - 4.5, x + len, gy - 3.6) +
         FM(x + 4, gy - 7) + FQ(x + len * 0.5, gy - 8.4, x + len - 4, gy - 6.8) +
         FM(x + 6, gy - 3) + FQ(x + len * 0.55, gy - 4.2, x + len - 6, gy - 2.8) }));
  }

  // tiny flower: stem and an open head
  function flower(x, seed) {
    const h = 10 + fn(seed) * 5;
    fel('path', Object.assign(fln(1), {
      d: FM(x, gy) + FQ(x + 1.5, gy - h * 0.6, x, gy - h) }));
    fel('circle', { cx: x, cy: gy - h - 1.5, r: 1.8, fill: 'none',
      stroke: '#f2f2f2', 'stroke-width': 1 });
  }

  // scree: angular rubble where the cliff meets the meadow
  function scree(x, seed) {
    for (let i = 0; i < 5; i++) {
      const sx = x - 16 + fn(seed + i * 7) * 30;
      const w2 = 5 + fn(seed + i * 3) * 9;
      const h2 = w2 * (0.5 + fn(seed + i) * 0.35);
      fel('path', Object.assign(fln(1.1), {
        d: FM(sx - w2 / 2, gy + 1) + FL(sx - w2 * 0.2, gy - h2) +
           FL(sx + w2 * 0.25, gy - h2 * 0.8) + FL(sx + w2 / 2, gy + 1) }));
      fel('path', Object.assign(fln(0.55), {
        d: FM(sx - w2 * 0.1, gy - h2 * 0.55) +
           'l' + ff(w2 * 0.32) + ' ' + ff(h2 * 0.4) }));
    }
  }

  // tent: bell silhouette of concave sweeps with a ridge shoulder,
  // centre pole, swept-open door, guy lines, no shading
  function tent(x, w) {
    const h = w * 0.62, ay = gy - h;
    const lx = x - w / 2, rx = x + w / 2;
    const shX = x + w * 0.13, shY = gy - h * 0.78;
    fel('path', Object.assign(fln(1.6), {
      d: FM(lx, gy) + FQ(x - w * 0.17, gy - h * 0.18, x, ay) +
         FL(shX, shY) + FQ(x + w * 0.22, gy - h * 0.16, rx, gy) +
         FL(lx, gy) + 'Z', fill: '#1a1a1a' }));
    fel('path', Object.assign(fln(1.2), { d: FM(x - 0.5, ay) + FL(x - 0.5, ay - 4.5) }));
    fel('path', Object.assign(fln(0.85), { d: FM(x, ay + 3) + FL(x, gy) }));
    fel('path', Object.assign(fln(1), {
      d: FM(x, ay + 2) + FQ(x - w * 0.02, gy - h * 0.42, x - w * 0.09, gy) +
         FM(x, ay + 2) + FQ(x + w * 0.06, gy - h * 0.36, x + w * 0.14, gy) }));
    const gl = lx - w * 0.09, gr = rx + w * 0.09;
    fel('path', Object.assign(fln(0.8), {
      d: FM(lx + 1, gy - h * 0.06) + FL(gl, gy + 0.5) +
         FM(gl, gy - 3.5) + FL(gl - 1.5, gy + 2) +
         FM(rx - 1, gy - h * 0.06) + FL(gr, gy + 0.5) +
         FM(gr, gy - 3.5) + FL(gr + 1.5, gy + 2) }));
  }

  // fire: two nested teardrop flames rising out of a brazier bowl on
  // stub legs, one smoke squiggle above; the layers morph on their
  // own phases via the returned updater
  function fire(x) {
    const inner = fel('path', Object.assign(fln(1.4), { fill: '#1a1a1a' }));
    const core = fel('path', fln(1));
    fel('path', Object.assign(fln(1.5), {
      d: FM(x - 25, gy - 15) + FQ(x, gy - 11.5, x + 25, gy - 15) +
         FQ(x + 21, gy - 4, x + 7, gy - 3) + FL(x - 7, gy - 3) +
         FQ(x - 21, gy - 4, x - 25, gy - 15) + 'Z', fill: '#1a1a1a' }));
    fel('path', Object.assign(fln(2.2), {
      d: FM(x - 13, gy - 4) + FL(x - 17, gy + 1) +
         FM(x + 13, gy - 4) + FL(x + 17, gy + 1) +
         FM(x, gy - 3) + FL(x, gy + 1) }));
    const smoke = fel('path', fln(1.5));
    const y0 = gy - 13;
    const smoothClosed = (pts) => {
      let d = FM((pts[0][0] + pts[pts.length - 1][0]) / 2,
                 (pts[0][1] + pts[pts.length - 1][1]) / 2);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], q = pts[(i + 1) % pts.length];
        d += FQ(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      }
      return d + 'Z';
    };
    // silhouette: [x-offset, height-fraction, isTip, phase]; tips
    // are doubled so they stay pointed through the smoothing
    const T = [
      [-11, 0.02, 0], [-15, 0.22, 0],
      [-13, 0.42, 0], [-15.5, 0.56, 1, 0],
      [-6.5, 0.68, 0],
      [0, 1, 1, 2],
      [4.5, 0.72, 0], [8, 0.55, 0],
      [14, 0.42, 1, 3], [10, 0.32, 0],
      [12.5, 0.16, 0], [10, 0.02, 0],
    ];
    function flameShape(t, s, ph) {
      const h = 54 * s * (0.9 + 0.1 *
        Math.sin(t * 3.4 + ph * 2 + Math.sin(t * 1.9 + ph)));
      const tip = Math.sin(t * 1.8 + ph + 1) * 3 * s;
      const pts = [];
      for (const p of T) {
        let px = p[0] * s, py = y0 - h * p[1];
        if (p[2]) {
          px += p[0] === 0 ? tip
            : Math.sin(t * 2.6 + ph + p[3] * 1.9) * 1.4 * s * Math.sign(p[0]);
          py += Math.sin(t * 2.2 + ph + p[3]) * 1 * s;
          pts.push([x + px, py], [x + px, py]);
        } else pts.push([x + px, py]);
      }
      return pts;
    }
    const upd = (t) => {
      inner.setAttribute('d', smoothClosed(flameShape(t, 0.55, 2.0)));
      core.setAttribute('d', smoothClosed(flameShape(t, 0.28, 4.1)));
      const sw = (k) => Math.sin(t * 1.1 + k * 1.7) * 2.5;
      const sp = [[x + 1, gy - 52], [x - 4 + sw(1), gy - 63],
        [x + 4 + sw(2), gy - 73], [x - 3 + sw(3), gy - 82],
        [x + 2 + sw(4), gy - 90]];
      let sd = FM(sp[0][0], sp[0][1]);
      for (let i = 1; i < sp.length - 1; i++)
        sd += FQ(sp[i][0], sp[i][1],
          (sp[i][0] + sp[i + 1][0]) / 2, (sp[i][1] + sp[i + 1][1]) / 2);
      smoke.setAttribute('d',
        sd + FL(sp[sp.length - 1][0], sp[sp.length - 1][1]));
    };
    upd(0);
    floorFlame = upd;
  }

  // turf: dense overlapping blade clusters: the grass IS the
  // ground line, drawn last so it fronts everything planted in it
  function turf(x0, x1, seed) {
    let d = '', tx = x0, i = 0;
    while (tx < x1) {
      const n = 2 + Math.floor(fn(seed + i) * 3);
      const s = 0.7 + fn(seed + i * 7) * 0.7;
      for (let b = 0; b < n; b++) {
        const bx = tx + b * 1.6 - n * 0.8;
        const lean = (b / Math.max(1, n - 1) - 0.5) * 2 + 0.3;
        const hgt = (5 + fn(seed + i * 13 + b) * 9) * s;
        d += FM(bx, gy + 1.5) +
          FQ(bx + lean * 2, gy - hgt * 0.55, bx + lean * 4.5, gy - hgt);
      }
      tx += 8 + fn(seed + i * 3) * 9;
      i++;
    }
    fel('path', Object.assign(fln(0.9), { d }));
  }

  // the owner's 4Runner, parked on the turf right of the tent (art in
  // car-art.js): a white body silhouette that occludes the scene behind
  // it, then the black line detail on top, scaled from its source box
  // and seated so the tyres meet the ground line.
  let carPlan = null;
  function drawCar(x, h, sink) {
    const s = h / CAR.bh;
    const g = fel('g', { transform:
      'translate(' + ff(x - CAR.bx * s) + ' ' +
      ff(gy + (sink || 0) - CAR.groundY * s) + ') scale(' + s.toFixed(4) + ')' });
    g.innerHTML =
      '<g fill="#1a1a1a"><g transform="' + CAR.tr + '">' + CAR.sil + '</g></g>' +
      '<g fill="#f2f2f2" stroke="#f2f2f2" stroke-width="0.45"><g transform="' +
      CAR.tr + '">' + CAR.line + '</g></g>';
    // settle the tyres into the dirt: for each wheel, mask the buried
    // bottom behind the ground and heap a little displaced soil at the
    // contact, drawn over the car so the dirt reads in FRONT of the
    // sunk wheel (grass, drawn later, still fronts it all)
    if (sink) {
      const tw = 15;                          // tyre half-width, scene px
      [500, 1294].forEach((wx) => {           // wheel centres in art space
        const c = x + (wx - CAR.bx) * s;
        // mask the buried tyre bottom behind the dirt
        fel('path', { fill: '#1a1a1a', stroke: 'none', d:
          FM(c - tw - 2, gy + 0.5) + FL(c + tw + 2, gy + 0.5) +
          FL(c + tw + 2, gy + sink + 5) + FL(c - tw - 2, gy + sink + 5) + 'Z' });
        // the white tyre body occludes the main ground edge at the contact,
        // so re-lay it across the patch (buildFloor's own formula) to keep
        // the dirt line unbroken where the tyre sits
        let d1 = '';
        for (let px = Math.floor((c - tw - 10) / 12) * 12; px <= c + tw + 10; px += 12)
          d1 += (d1 ? 'L' : 'M') + ff(px) + ' ' + ff(gy + (fn(px) - 0.5) * 2.5);
        fel('path', Object.assign(fln(1.8), { d: d1 }));
        // re-lay the lower dirt edge across the masked patch, reusing the
        // ground's own formula so it rejoins the line seamlessly
        let d2 = '';
        for (let px = Math.floor((c - tw - 8) / 12) * 12; px <= c + tw + 8; px += 12)
          d2 += (d2 ? 'L' : 'M') + ff(px) + ' ' +
            ff(gy + (fn(px) - 0.5) * 2.5 + 5.5 + fn(px / 12) * 2.5);
        fel('path', Object.assign(fln(0.8), { d: d2 }));
        // heaped soil at the contact
        fel('path', Object.assign(fln(1.6), { d:
          FM(c - tw - 8, gy) + FQ(c - tw - 1, gy - 3.5, c - tw + 1, gy + 0.5) +
          FM(c + tw - 1, gy + 0.5) + FQ(c + tw + 1, gy - 3.5, c + tw + 8, gy) }));
      });
    }
  }

  /* ---- layout: skip anything the current width can't hold ---- */
  // left of the cliff, anchored off the viewport's left edge
  if (cliffX - 27 > 90) pine(48, 150, 142);
  if (cliffX - 27 > 136) pine(106, 105, 143);
  if (cliffX - 27 > 181) bush(158, 42, 157);
  if (cliffX - 27 > 258) flog(204, 46);
  if (cliffX - 27 > 274) rock(262, 20, 146);
  if (o.cliff) scree(cliffX - 4, 145);
  // the camp, anchored off the cliff base; the treeline needs the
  // rightmost ~232px, so camp props must stop short of it
  let busyR = cliffX + 34;
  let fireX = null, tentOn = false;
  const campFit = (r) => r < fw - 232;
  stumpX = null;
  if (campFit(cliffX + 143)) {
    stump(cliffX + 133, 18);
    busyR = cliffX + 143;
    stumpX = 133;
    // his fire-poking stick, lying in front of the stump until he
    // sits down and picks it up
    if (o.stick) {
      floorStick = fel('path', Object.assign(fln(1.6), {
        d: FM(cliffX + 139, gy - 0.4) +
           FQ(cliffX + 156, gy - 1.1, cliffX + 173, gy - 0.4) }));
    }
  }
  if (campFit(cliffX + 224)) { fire(cliffX + 196); busyR = cliffX + 224; fireX = cliffX + 196; }
  if (campFit(cliffX + 366)) { tent(cliffX + 310, 78); busyR = cliffX + 349; tentOn = true; }
  if (campFit(cliffX + 382)) { flower(cliffX + 377, 148); busyR = cliffX + 382; }
  // park the 4Runner just past the tent and reserve its footprint, so
  // the treeline fills in only beyond it
  if (tentOn && typeof CAR !== 'undefined') {
    const ch = 84, cw = ch * CAR.bw / CAR.bh, cx = cliffX + 450;
    if (cx + cw < fw - 12) { carPlan = { x: cx, h: ch, sink: 4 }; busyR = cx + cw; }
  }
  // treeline growing in from the right edge
  if (fw - 221 > busyR + 15) bush(fw - 202, 38, 159);
  if (fw - 202 > busyR + 15) pine(fw - 175, 95, 149);
  if (fw - 157 > busyR + 15) pine(fw - 118, 140, 150);
  if (fw - 150 > busyR + 15) flower(fw - 145, 153);
  if (fw - 93 > busyR + 15) pine(fw - 62, 110, 151);
  if (fw - 61 > busyR + 15) pine(fw - 18, 155, 152);
  // drawn last of the scenery so it sits in front of the treeline;
  // the turf below then fronts its tyres
  if (carPlan) drawCar(carPlan.x, carPlan.h, carPlan.sink);
  // turf across the full width, with a cleared patch around the fire
  if (fireX !== null) {
    turf(0, fireX - 38, 154);
    turf(fireX + 38, fw, 155);
  } else {
    turf(0, fw, 154);
  }

  return {
    flame: floorFlame, stick: floorStick,
    fireX: fireX === null ? null : fireX - cliffX,
    stumpX,
  };
};
