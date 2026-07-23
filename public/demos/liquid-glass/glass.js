/* Liquid glass — a WebGL lens that slides between nav tabs.
 *
 * How it works, in one breath: the tab row is drawn once into an offscreen
 * 2D canvas (background colour + label text), uploaded as a texture, and
 * blurred in two separable Gaussian passes. A fragment shader then renders
 * a rounded-pill lens over it: a signed-distance field gives the pill's
 * edge, the edge band refracts the background with per-channel dispersion
 * (chromatic fringing), and fresnel + glare terms in LCH colour space add
 * the bright rim. The pill's centre and width are driven by two springs,
 * so the glass stretches and settles instead of teleporting.
 *
 * Adapted from the Unpak site nav. Interactions here:
 *   - hover the row and the lens tracks the cursor, shrinking with distance
 *   - click a tab and the lens springs to it and stays
 *   - a time scale (window.glassTimeScale) slows the springs for slow motion
 */
(function () {
  'use strict';

  var CFG = {
    refThickness: 20,       // width of the refracting edge band, px
    refFactor: 1.4,         // index of refraction
    refDispersion: 7,       // chromatic aberration strength
    refFresnelRange: 30,
    refFresnelHardness: 20,
    refFresnelFactor: 20,
    glareRange: 30,
    glareHardness: 20,
    glareFactor: 90,
    glareConvergence: 50,
    glareOppositeFactor: 80,
    glareAngle: -45,
    blurRadius: 1,
    blurEdge: true,
    tint: { r: 255, g: 255, b: 255, a: 0 },
    shadowExpand: 25,
    shadowFactor: 15,
    shadowPosition: { x: 0, y: -10 },
    shapeRadius: 100,       // % of half the short side
    shapeRoundness: 2,      // superellipse exponent
    springSizeFactor: 10,   // velocity-driven stretch
    displaceScale: 70,
    referenceSize: 200
  };

  // The lens geometry was tuned around 14px nav type; SCALE lets a page
  // blow the whole thing up (set data-glass-scale on the <nav>).
  var navEl = document.querySelector('nav');
  var SCALE = navEl && parseFloat(navEl.dataset.glassScale) || 1;

  var PAD_X = 14 * SCALE;         // lens overhang past a tab's text, each side
  var PAD_Y = 5 * SCALE;
  var MAX_W = 120 * SCALE;        // widest the tracking lens gets
  var MIN_W = 34 * SCALE;         // narrowest, out at the row's ends
  var EDGE_SLACK = 40 * SCALE;    // how far past the row the cursor keeps the lens
  var FALLOFF = 34 * SCALE;       // distance constant for the shrink
  var CANVAS_PAD = 70 * SCALE;    // texture bleed so refraction can sample outside

  var VERT = [
    '#version 300 es',
    'layout(location = 0) in vec2 a_pos;',
    'out vec2 v_uv;',
    'void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }'
  ].join('\n');

  var FRAG_BLUR = [
    '#version 300 es',
    'precision highp float;',
    '#define MAX_R 16',
    'in vec2 v_uv;',
    'out vec4 fragColor;',
    'uniform sampler2D u_tex;',
    'uniform vec2 u_dir;',
    'uniform float u_w[MAX_R + 1];',
    'uniform int u_r;',
    'void main(){',
    '  vec4 c = texture(u_tex, v_uv) * u_w[0];',
    '  for (int i = 1; i <= u_r; i++){',
    '    vec2 o = u_dir * float(i);',
    '    c += texture(u_tex, v_uv + o) * u_w[i];',
    '    c += texture(u_tex, v_uv - o) * u_w[i];',
    '  }',
    '  fragColor = c;',
    '}'
  ].join('\n');

  var FRAG_MAIN = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 v_uv;',
    'out vec4 fragColor;',
    'uniform sampler2D u_bg;',
    'uniform sampler2D u_blurredBg;',
    'uniform vec2  u_res;',
    'uniform vec2  u_center;',
    'uniform vec2  u_size;',
    'uniform float u_radius;',
    'uniform float u_roundness;',
    'uniform float u_refThickness;',
    'uniform float u_refFactor;',
    'uniform float u_refDispersion;',
    'uniform float u_displace;',
    'uniform float u_fresnelRange;',
    'uniform float u_fresnelHardness;',
    'uniform float u_fresnelFactor;',
    'uniform float u_glareRange;',
    'uniform float u_glareHardness;',
    'uniform float u_glareFactor;',
    'uniform float u_glareConvergence;',
    'uniform float u_glareOpposite;',
    'uniform float u_glareAngle;',
    'uniform vec4  u_tint;',
    'uniform float u_shadowExpand;',
    'uniform float u_shadowFactor;',
    'uniform vec2  u_shadowOffset;',
    'uniform float u_blurEdge;',
    'uniform float u_scale;',
    '#define PI 3.14159265359',
    'const float N_R = 0.98;',
    'const float N_B = 1.02;',
    'float safeAsin(float x){ return asin(clamp(x, -1.0, 1.0)); }',
    'const mat3 RGB_TO_XYZ_M = mat3(',
    '  0.4124, 0.3576, 0.1805,',
    '  0.2126, 0.7152, 0.0722,',
    '  0.0193, 0.1192, 0.9505);',
    'const mat3 XYZ_TO_RGB_M = mat3(',
    '   3.2406255, -1.537208 , -0.4986286,',
    '  -0.9689307,  1.8757561,  0.0415175,',
    '   0.0557101, -0.2040211,  1.0569959);',
    'const vec3 D65_WHITE = vec3(0.95045592705, 1.0, 1.08905775076);',
    'float uncompand(float a){ return a > 0.04045 ? pow((a + 0.055) / 1.055, 2.4) : a / 12.92; }',
    'float compand(float a){ return a <= 0.0031308 ? 12.92 * a : 1.055 * pow(a, 0.41666666666) - 0.055; }',
    'float xyzToLabF(float x){ return x > 0.00885645167 ? pow(x, 0.333333333) : 7.78703703704 * x + 0.13793103448; }',
    'float labToXyzF(float x){ return x > 0.206897 ? x * x * x : 0.12841854934 * (x - 0.137931034); }',
    'vec3 SRGB_TO_LCH(vec3 srgb){',
    '  vec3 rgb = vec3(uncompand(srgb.x), uncompand(srgb.y), uncompand(srgb.z));',
    '  vec3 s = (rgb * RGB_TO_XYZ_M) / D65_WHITE;',
    '  s = vec3(xyzToLabF(s.x), xyzToLabF(s.y), xyzToLabF(s.z));',
    '  vec3 lab = vec3(116.0 * s.y - 16.0, 500.0 * (s.x - s.y), 200.0 * (s.y - s.z));',
    '  return vec3(lab.x, sqrt(dot(lab.yz, lab.yz)), atan(lab.z, lab.y + 1e-9) * 57.2957795131);',
    '}',
    'vec3 LCH_TO_SRGB(vec3 lch){',
    '  vec3 lab = vec3(lch.x, lch.y * cos(lch.z * 0.01745329251), lch.y * sin(lch.z * 0.01745329251));',
    '  float w = (lab.x + 16.0) / 116.0;',
    '  vec3 xyz = D65_WHITE * vec3(labToXyzF(w + lab.y / 500.0), labToXyzF(w), labToXyzF(w - lab.z / 200.0));',
    '  vec3 rgb = xyz * XYZ_TO_RGB_M;',
    '  return vec3(compand(rgb.x), compand(rgb.y), compand(rgb.z));',
    '}',
    // Superellipse corner: roundness 2 is a circle, higher squares it off.
    'float seCorner(vec2 p, float r, float n){',
    '  p = abs(p);',
    '  return pow(pow(p.x, n) + pow(p.y, n), 1.0 / n) - r;',
    '}',
    'float pillSDF(vec2 p){',
    '  vec2 half_ = u_size * 0.5;',
    '  vec2 d = abs(p) - half_;',
    '  if (d.x > -u_radius && d.y > -u_radius) {',
    '    vec2 corner = sign(p) * (half_ - vec2(u_radius));',
    '    return seCorner(p - corner, u_radius, u_roundness);',
    '  }',
    '  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));',
    '}',
    'vec2 pillNormal(vec2 p){',
    '  vec2 e = vec2(0.5, 0.0);',
    '  vec2 g = vec2(',
    '    pillSDF(p + e.xy) - pillSDF(p - e.xy),',
    '    pillSDF(p + e.yx) - pillSDF(p - e.yx));',
    '  float l = length(g);',
    '  return l > 0.0 ? g / l : vec2(0.0);',
    '}',
    'float shadowAt(vec2 p){',
    '  float sdRef = pillSDF(p - u_center - u_shadowOffset * u_scale) / u_scale;',
    '  return exp(-abs(sdRef) / u_shadowExpand) * 0.6 * u_shadowFactor;',
    '}',
    'vec4 bgAt(sampler2D t, vec2 p){ return texture(t, p / u_res); }',
    'void main(){',
    '  vec2 p = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;',
    '  float sd = pillSDF(p - u_center);',
    '  float shadow = shadowAt(p);',
    '  float aa = 0.75;',
    '  float coverage = 1.0 - smoothstep(-aa, aa, sd);',
    '  if (coverage <= 0.0) {',
    '    fragColor = vec4(0.0, 0.0, 0.0, shadow);',
    '    return;',
    '  }',
    // Refraction: treat depth into the pill as a curved glass surface and
    // bend the sample point by Snell's law, per channel for dispersion.
    '  float sdRef = sd / u_scale;',
    '  float dIn = -sdRef;',
    '  float xr = 1.0 - dIn / u_refThickness;',
    '  float thetaI = safeAsin(xr * xr);',
    '  float thetaT = safeAsin(sin(thetaI) / u_refFactor);',
    '  float edgeFactor = dIn >= u_refThickness ? 0.0 : -tan(thetaT - thetaI);',
    '  vec3 glass;',
    '  if (edgeFactor <= 0.0) {',
    '    vec3 flat_ = bgAt(u_blurredBg, p).rgb - shadowAt(p);',
    '    glass = mix(flat_, u_tint.rgb, u_tint.a * 0.8);',
    '  } else {',
    '    vec2 n = pillNormal(p - u_center);',
    '    vec2 disp = -n * edgeFactor * u_displace * u_scale;',
    '    vec2 pR = p + disp * (1.0 - (N_R - 1.0) * u_refDispersion);',
    '    vec2 pG = p + disp;',
    '    vec2 pB = p + disp * (1.0 - (N_B - 1.0) * u_refDispersion);',
    '    float mixRate = u_blurEdge > 0.5 ? 1.0 : clamp(dIn / u_refThickness, 0.0, 1.0);',
    '    vec3 sharp = vec3(bgAt(u_bg, pR).r, bgAt(u_bg, pG).g, bgAt(u_bg, pB).b);',
    '    vec3 blur  = vec3(bgAt(u_blurredBg, pR).r, bgAt(u_blurredBg, pG).g, bgAt(u_blurredBg, pB).b);',
    '    vec3 pixel = max(mix(sharp, blur, mixRate) - shadowAt(pG), 0.0);',
    '    glass = mix(pixel, u_tint.rgb, u_tint.a * 0.8);',
    '    float fres = clamp(pow(max(1.0 + sdRef / 1500.0 * pow(500.0 / u_fresnelRange, 2.0) + u_fresnelHardness, 0.0), 5.0), 0.0, 1.0);',
    '    vec3 fresTint = SRGB_TO_LCH(mix(vec3(1.0), u_tint.rgb, u_tint.a * 0.5));',
    '    fresTint.x = clamp(fresTint.x + 20.0 * fres * u_fresnelFactor, 0.0, 100.0);',
    '    glass = mix(glass, LCH_TO_SRGB(fresTint), fres * u_fresnelFactor * 0.7);',
    '    float geo = clamp(pow(max(1.0 + sdRef / 1500.0 * pow(500.0 / u_glareRange, 2.0) + u_glareHardness, 0.0), 5.0), 0.0, 1.0);',
    '    vec2 nUp = vec2(n.x, -n.y);',
    '    float angle = atan(nUp.y, nUp.x);',
    '    if (angle < 0.0) angle += 2.0 * PI;',
    '    float ga = (angle - PI / 4.0 + u_glareAngle) * 2.0;',
    '    bool farside = (ga > PI * 1.5 && ga < PI * 3.5) || ga < -PI * 0.5;',
    '    float gaF = (0.5 + sin(ga) * 0.5) * (farside ? 1.2 * u_glareOpposite : 1.2) * u_glareFactor;',
    '    gaF = clamp(pow(gaF, 0.1 + u_glareConvergence * 2.0), 0.0, 1.0);',
    '    vec3 glareTint = SRGB_TO_LCH(mix(pixel, u_tint.rgb, u_tint.a * 0.5));',
    '    glareTint.x = clamp(glareTint.x + 150.0 * gaF * geo, 0.0, 120.0);',
    '    glareTint.y += 30.0 * gaF * geo;',
    '    glass = mix(glass, LCH_TO_SRGB(glareTint), gaF * geo);',
    '  }',
    '  fragColor = vec4(glass * coverage, coverage + shadow * (1.0 - coverage));',
    '}'
  ].join('\n');

  /* ---- springs ------------------------------------------------------ */

  function spring(x) { return { x: x, v: 0, target: x }; }

  // Fixed-step damped spring: stiffness 170, damping 26. dt arrives
  // already multiplied by the slow-motion scale.
  function step(s, dt) {
    var n = Math.max(1, Math.ceil(dt / 0.008));
    var h = dt / n;
    for (var i = 0; i < n; i++) {
      s.v += (170 * (s.target - s.x) - 26 * s.v) * h;
      s.x += s.v * h;
    }
  }

  function settle(s) { s.x = s.target; s.v = 0; }
  function atRest(s) { return Math.abs(s.x - s.target) < 0.05 && Math.abs(s.v) < 0.5; }

  /* ---- GL helpers --------------------------------------------------- */

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('liquid-glass shader: ' + gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function link(gl, vs, fs) {
    var v = compile(gl, gl.VERTEX_SHADER, vs);
    var f = compile(gl, gl.FRAGMENT_SHADER, fs);
    if (!v || !f) return null;
    var p = gl.createProgram();
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('liquid-glass link: ' + gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }

  function uniforms(gl, prog) {
    var out = {};
    var n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var info = gl.getActiveUniform(prog, i);
      out[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(prog, info.name);
    }
    return out;
  }

  function makeTexture(gl, w, h) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }

  function gaussianWeights(radius) {
    var raw = [1], sum = 1;
    if (radius > 0) {
      var sigma = radius / 3;
      raw = []; sum = 0;
      for (var i = 0; i <= radius; i++) {
        var w = Math.exp(-0.5 * i * i / (sigma * sigma));
        raw.push(w);
        sum += i === 0 ? w : w * 2;
      }
    }
    var out = new Float32Array(17);
    for (var j = 0; j < raw.length && j < 17; j++) out[j] = raw[j] / sum;
    return out;
  }

  /* ---- setup -------------------------------------------------------- */

  var nav = document.querySelector('nav');
  var row = nav && nav.querySelector('.tabs');
  if (!nav || !row) return;

  var tabs = Array.prototype.slice.call(row.querySelectorAll('a'));
  var active = row.querySelector('.tab-active') || tabs[0];
  var bubble = row.querySelector('.tab-bubble');   // no-WebGL fallback
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!tabs.length || !active) return;

  var ctx = null;   // the WebGL bundle, or null when we're on the bubble
  var layout = { rowW: 0, rowH: 0, cy: 0, H: 0, offX: CANVAS_PAD, offY: 0, cssW: 0, cssH: 0, dpr: 1 };
  var sx = spring(0);       // lens centre, px from the row's left edge
  var sw = spring(MAX_W);   // lens width
  var raf = null, last = 0;
  var hideTimer = null, visible = false;

  // Slow motion: the page sets this to something like 0.12 and every
  // spring step shrinks with it, so the same physics plays at 1/8 speed.
  window.glassTimeScale = window.glassTimeScale || 1;

  function show(on) {
    if (on === visible) return;
    visible = on;
    var el = ctx ? ctx.canvas : bubble;
    if (el) el.style.opacity = on ? '1' : '0';
  }

  function tabTarget(tab) {
    return { cx: tab.offsetLeft + tab.offsetWidth / 2, w: tab.offsetWidth + PAD_X * 2 };
  }

  function kick() {
    if (raf == null) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  function tick(now) {
    raf = null;
    var dt = Math.min(Math.max(now - last, 0.1), 50) / 1000;
    last = now;
    if (reduced || !ctx) {
      settle(sx); settle(sw);
    } else {
      dt *= window.glassTimeScale;
      step(sx, dt); step(sw, dt);
    }
    render();
    if (!(atRest(sx) && atRest(sw))) raf = requestAnimationFrame(tick);
  }

  function moveTo(tab) {
    if (!tab) return;
    var t = tabTarget(tab);
    sx.target = t.cx;
    sw.target = t.w;
    show(true);
    kick();
  }

  function setActive(tab) {
    active = tab;
    tabs.forEach(function (a) {
      a.classList.toggle('tab-active', a === tab);
      a.setAttribute('aria-current', a === tab ? 'page' : 'false');
    });
    moveTo(tab);
  }

  function rest() { moveTo(active); }

  function restSoon() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(rest, 160);
  }

  // Free tracking: the lens follows the cursor across the row, narrowing
  // as it leaves the tabs behind, and lets go past the edge slack.
  function track(clientX) {
    clearTimeout(hideTimer);
    var w = row.offsetWidth;
    var x = clientX - row.getBoundingClientRect().left;
    var out = Math.max(0, -x, x - w);
    var width = MIN_W + (MAX_W - MIN_W) * Math.exp(-out / FALLOFF);
    if (x < -PAD_X - EDGE_SLACK + width / 2 || x > w + PAD_X + EDGE_SLACK - width / 2) {
      rest();
      return;
    }
    sx.target = x;
    sw.target = width;
    show(true);
    kick();
  }

  /* ---- render ------------------------------------------------------- */

  function render() {
    if (!ctx) { renderBubble(); return; }
    var gl = ctx.gl;
    var stretch = reduced ? 0 : Math.abs(sx.v) * layout.dpr / 1000 * CFG.springSizeFactor / 100;
    var w = sw.x * (1 + stretch);
    var h = layout.H;
    var radius = Math.min(w, h) / 2 * CFG.shapeRadius / 100;

    gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(ctx.progMain);
    var u = ctx.uMain;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, ctx.bgTex);
    gl.uniform1i(u.u_bg, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ctx.texB);
    gl.uniform1i(u.u_blurredBg, 1);
    gl.uniform2f(u.u_res, layout.cssW, layout.cssH);
    gl.uniform2f(u.u_center, sx.x + layout.offX, layout.cy + layout.offY);
    gl.uniform2f(u.u_size, w, h);
    gl.uniform1f(u.u_radius, radius);
    gl.uniform1f(u.u_roundness, CFG.shapeRoundness);
    gl.uniform1f(u.u_refThickness, CFG.refThickness);
    gl.uniform1f(u.u_refFactor, CFG.refFactor);
    gl.uniform1f(u.u_refDispersion, CFG.refDispersion);
    gl.uniform1f(u.u_displace, CFG.displaceScale);
    gl.uniform1f(u.u_fresnelRange, CFG.refFresnelRange);
    gl.uniform1f(u.u_fresnelHardness, CFG.refFresnelHardness / 100);
    gl.uniform1f(u.u_fresnelFactor, CFG.refFresnelFactor / 100);
    gl.uniform1f(u.u_glareRange, CFG.glareRange);
    gl.uniform1f(u.u_glareHardness, CFG.glareHardness / 100);
    gl.uniform1f(u.u_glareFactor, CFG.glareFactor / 100);
    gl.uniform1f(u.u_glareConvergence, CFG.glareConvergence / 100);
    gl.uniform1f(u.u_glareOpposite, CFG.glareOppositeFactor / 100);
    gl.uniform1f(u.u_glareAngle, CFG.glareAngle * Math.PI / 180);
    gl.uniform4f(u.u_tint, CFG.tint.r / 255, CFG.tint.g / 255, CFG.tint.b / 255, CFG.tint.a);
    gl.uniform1f(u.u_shadowExpand, CFG.shadowExpand);
    gl.uniform1f(u.u_shadowFactor, CFG.shadowFactor / 100);
    gl.uniform2f(u.u_shadowOffset, CFG.shadowPosition.x, -CFG.shadowPosition.y);
    gl.uniform1f(u.u_blurEdge, CFG.blurEdge ? 1 : 0);
    gl.uniform1f(u.u_scale, Math.min(w, h) / CFG.referenceSize);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function renderBubble() {
    if (!bubble) return;
    var w = sw.x;
    var h = layout.H || row.offsetHeight + PAD_Y * 2;
    bubble.style.width = w + 'px';
    bubble.style.height = h + 'px';
    bubble.style.transform = 'translate(' + (sx.x - w / 2) + 'px,' + -PAD_Y + 'px)';
  }

  // Redraw the row into the snapshot canvas: what the lens refracts.
  function snapshot() {
    var snap = ctx.snap;
    var c2d = snap.getContext('2d');
    snap.width = Math.max(1, Math.round(layout.cssW * layout.dpr));
    snap.height = Math.max(1, Math.round(layout.cssH * layout.dpr));
    c2d.setTransform(layout.dpr, 0, 0, layout.dpr, 0, 0);
    var bg = getComputedStyle(document.body).backgroundColor;
    c2d.fillStyle = !bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent' ? '#FCFCFB' : bg;
    c2d.fillRect(0, 0, layout.cssW, layout.cssH);
    var rowRect = row.getBoundingClientRect();
    c2d.textAlign = 'center';
    c2d.textBaseline = 'middle';
    tabs.forEach(function (a) {
      var cs = getComputedStyle(a);
      var r = a.getBoundingClientRect();
      c2d.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      if ('letterSpacing' in c2d) c2d.letterSpacing = cs.letterSpacing === 'normal' ? '0px' : cs.letterSpacing;
      c2d.fillStyle = cs.color;
      c2d.fillText(a.textContent.trim(),
        r.left - rowRect.left + r.width / 2 + layout.offX,
        r.top - rowRect.top + r.height / 2 + layout.offY);
    });
  }

  function blurPass(gl, srcTex, dstFb, dir) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dstFb);
    gl.viewport(0, 0, ctx.canvas.width, ctx.canvas.height);
    gl.useProgram(ctx.progBlur);
    var u = ctx.uBlur;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(u.u_tex, 0);
    gl.uniform2fv(u.u_dir, dir);
    gl.uniform1fv(u.u_w, ctx.blurWeights);
    gl.uniform1i(u.u_r, Math.min(CFG.blurRadius, 16));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function relayout() {
    var navRect = nav.getBoundingClientRect();
    var rowRect = row.getBoundingClientRect();
    layout.rowW = row.offsetWidth;
    layout.rowH = row.offsetHeight;
    layout.cy = layout.rowH / 2;
    layout.H = layout.rowH + PAD_Y * 2;
    layout.offX = CANVAS_PAD;
    layout.offY = rowRect.top - navRect.top;
    layout.cssW = layout.rowW + CANVAS_PAD * 2;
    layout.cssH = navRect.height;
    layout.dpr = window.devicePixelRatio || 1;

    var t = tabTarget(active);
    sx.target = t.cx;
    sw.target = t.w;

    if (!ctx) { renderBubble(); return; }
    var gl = ctx.gl;
    var canvas = ctx.canvas;
    canvas.style.left = -CANVAS_PAD + 'px';
    canvas.style.top = -layout.offY + 'px';
    canvas.style.width = layout.cssW + 'px';
    canvas.style.height = layout.cssH + 'px';
    canvas.width = Math.max(1, Math.round(layout.cssW * layout.dpr));
    canvas.height = Math.max(1, Math.round(layout.cssH * layout.dpr));
    snapshot();
    gl.bindTexture(gl.TEXTURE_2D, ctx.bgTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ctx.snap);
    [ctx.texA, ctx.texB].forEach(function (t2) {
      gl.bindTexture(gl.TEXTURE_2D, t2);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    });
    blurPass(gl, ctx.bgTex, ctx.fbA, [0, 1 / canvas.height]);
    blurPass(gl, ctx.texA, ctx.fbB, [1 / canvas.width, 0]);
  }

  function build() {
    var canvas = document.createElement('canvas');
    canvas.className = 'tab-lens';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.opacity = '0';
    canvas.style.transition = 'opacity .25s ease';
    var gl = canvas.getContext('webgl2', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false
    });
    if (!gl) return null;
    var progMain = link(gl, VERT, FRAG_MAIN);
    var progBlur = link(gl, VERT, FRAG_BLUR);
    if (!progMain || !progBlur) return null;

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

    var bundle = {
      canvas: canvas, gl: gl,
      progMain: progMain, progBlur: progBlur,
      uMain: uniforms(gl, progMain), uBlur: uniforms(gl, progBlur),
      bgTex: makeTexture(gl),
      texA: makeTexture(gl, 1, 1), texB: makeTexture(gl, 1, 1),
      fbA: gl.createFramebuffer(), fbB: gl.createFramebuffer(),
      snap: document.createElement('canvas'),
      blurWeights: gaussianWeights(Math.min(CFG.blurRadius, 16))
    };
    gl.bindFramebuffer(gl.FRAMEBUFFER, bundle.fbA);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bundle.texA, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, bundle.fbB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bundle.texB, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); }, false);
    canvas.addEventListener('webglcontextrestored', function () {
      var old = ctx && ctx.canvas;
      ctx = build() || null;
      if (ctx) {
        ctx.canvas.style.opacity = visible ? '1' : '0';
        row.appendChild(ctx.canvas);
        if (old && old.parentNode) old.parentNode.removeChild(old);
        relayout();
        settle(sx); settle(sw);
        render();
      }
    }, false);
    return bundle;
  }

  ctx = build();
  if (ctx) {
    row.appendChild(ctx.canvas);
    if (bubble) bubble.remove();
  }

  function reset() {
    relayout();
    settle(sx); settle(sw);
    render();
  }

  /* ---- wiring ------------------------------------------------------- */

  var finePointer = window.matchMedia('(pointer: fine)').matches;

  tabs.forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (a.getAttribute('href') === '#') e.preventDefault();
      setActive(a);
    });
    a.addEventListener('focus', function () {
      clearTimeout(hideTimer);
      moveTo(a);
    });
  });

  if (finePointer) {
    nav.addEventListener('mousemove', function (e) { track(e.clientX); });
    nav.addEventListener('mouseleave', restSoon);
  }
  nav.addEventListener('focusout', function (e) {
    if (!nav.contains(e.relatedTarget)) restSoon();
  });

  window.addEventListener('resize', function () {
    clearTimeout(hideTimer);
    reset();
  });

  reset();
  show(true);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(reset);

  window.__liquidGlass = {
    webgl: !!ctx,
    cfg: CFG,
    moveTo: moveTo,
    setActive: setActive,
    track: track,
    rest: rest
  };
})();
