function B(){(function(){if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;const u=document.getElementById("ripple"),M=document.querySelector(".hero");if(!u||!M)return;const e=u.getContext("webgl",{alpha:!0,premultipliedAlpha:!0,antialias:!1,depth:!1,stencil:!1});if(!e)return;let x=e.FLOAT;if(!e.getExtension("OES_texture_float")){const t=e.getExtension("OES_texture_half_float");if(!t)return;x=t.HALF_FLOAT_OES}function g(t,r){const o=e.createShader(t);return e.shaderSource(o,r),e.compileShader(o),e.getShaderParameter(o,e.COMPILE_STATUS)?o:(console.warn(e.getShaderInfoLog(o)),null)}function E(t,r){const o=g(e.VERTEX_SHADER,t),a=g(e.FRAGMENT_SHADER,r);if(!o||!a)return null;const f=e.createProgram();return e.attachShader(f,o),e.attachShader(f,a),e.linkProgram(f),e.getProgramParameter(f,e.LINK_STATUS)?f:(console.warn(e.getProgramInfoLog(f)),null)}const R=`
    attribute vec2 aPos;
    varying vec2 vUv;
    void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`,y=`
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    uniform vec2  uTexel;
    uniform float uDamp;
    uniform vec2  uMouse;
    uniform float uStrength;
    uniform float uRadius;
    uniform float uAspect;
    float splat(vec2 c, float radius){
      vec2 p = (vUv - c) * vec2(uAspect, 1.0);       // aspect-correct so splats stay round
      return exp(-dot(p,p) / (radius*radius));
    }
    void main(){
      vec2 st = texture2D(uTex, vUv).rg;            // r = current, g = previous
      float l = texture2D(uTex, vUv + vec2(-uTexel.x, 0.0)).r;
      float r = texture2D(uTex, vUv + vec2( uTexel.x, 0.0)).r;
      float u = texture2D(uTex, vUv + vec2(0.0,  uTexel.y)).r;
      float d = texture2D(uTex, vUv + vec2(0.0, -uTexel.y)).r;
      float nv = (l + r + u + d) * 0.5 - st.g;       // wave equation
      nv *= uDamp;
      nv += splat(uMouse, uRadius) * uStrength;        // interactive cursor ripple
      nv = clamp(nv, -1.5, 1.5);
      gl_FragColor = vec4(nv, st.r, 0.0, 1.0);       // new current, old current -> previous
    }`,D=`
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    uniform vec2  uTexel;
    uniform float uOpacity;
    uniform float uTime;
    uniform float uFlow;
    // value noise -> fbm, for organic (non-wavelike) motion
    float hash(vec2 p){
      p = fract(p * vec2(123.34, 345.45));
      p += dot(p, p + 34.345);
      return fract(p.x * p.y);
    }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      float a = hash(i),                  b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }
    float fbm(vec2 p){
      float v = 0.0, amp = 0.5;
      for(int i = 0; i < 3; i++){ v += amp * noise(p); p *= 2.0; amp *= 0.5; }
      return v;
    }
    // passive flow — domain-warped fbm that slowly churns, shaded from its SLOPE so the
    // moving fronts stay visible. Scale tuned for a few MEDIUM swells: bigger than the
    // "crinkled paper" look, but not so large the gradients flatten out and disappear.
    // The warp pushes each region a different way, so it stays irregular, not a march.
    float flow(vec2 uv){
      float aspect = uTexel.y / uTexel.x;            // keep waves round on a wide hero
      vec2 p = vec2(uv.x * aspect, uv.y) * 1.4;      // base scale (lower = bigger / fewer waves)
      vec2 w = vec2(fbm(p + vec2(0.0,  uTime * 0.10)),
                    fbm(p + vec2(5.2, -uTime * 0.09) + 2.7));
      return fbm(p + 2.2 * w + vec2(uTime * 0.04, -uTime * 0.05));  // stronger warp = less uniform
    }
    float flowSlope(vec2 uv){
      float e = 0.006;                               // fixed epsilon — independent of sim res
      return (flow(uv+vec2(e,0.0)) - flow(uv-vec2(e,0.0)))
           + (flow(uv+vec2(0.0,e)) - flow(uv-vec2(0.0,e)));
    }
    void main(){
      float l = texture2D(uTex, vUv + vec2(-uTexel.x, 0.0)).r;
      float r = texture2D(uTex, vUv + vec2( uTexel.x, 0.0)).r;
      float u = texture2D(uTex, vUv + vec2(0.0,  uTexel.y)).r;
      float d = texture2D(uTex, vUv + vec2(0.0, -uTexel.y)).r;
      float s = (r - l) + (u - d)                    // interactive cursor ripples (slope)
              + flowSlope(vUv) * uFlow;              // passive large waves (slope, boosted)
      vec3 light = vec3(0.384, 0.545, 0.682);        // steel  #628BAE -> crest highlight
      vec3 dark  = vec3(0.090, 0.220, 0.412);        // navy   #173869 -> trough shadow
      vec3 col = mix(dark, light, step(0.0, s));
      // feather the alpha to 0 toward the edges so the effect melts into the paper rather
      // than ending on a hard border — but with a SMALL band so it fills almost to every
      // edge (no dead zone). No top fade at all: it fills right up to the nav line.
      // NB: vUv.y = 1 is the top of the screen, 0 the bottom.
      float fadeX = 0.04, fadeBot = 0.10;
      float edge = smoothstep(0.0, fadeX,   vUv.x) * smoothstep(0.0, fadeX, 1.0 - vUv.x)
                 * smoothstep(0.0, fadeBot, vUv.y);   // bottom fade only; top reaches the nav line
      float a = clamp(abs(s) * 5.0, 0.0, 1.0) * uOpacity * edge;
      // Output PREMULTIPLIED alpha so compositing is identical on Chrome and Safari.
      // The old pipeline (premultipliedAlpha:false + SRC_ALPHA/ONE_MINUS_SRC_ALPHA over a
      // cleared canvas) left the framebuffer holding (col*a, a*a), which Chrome then composited
      // as an unpremultiplied source: col*a*a*a over the paper. Safari ignored the flag and
      // composited it far brighter. To reproduce Chrome's exact (tuned) result on every
      // browser, we bake that same math straight into a premultiplied output:
      //   premultiplied RGB = col * a^3,  alpha = a^2   (with a premultiplied ONE/1-SRC blend).
      float outA = a * a;
      gl_FragColor = vec4(col * a * outA, outA);
    }`,i=E(R,y),c=E(R,D);if(!i||!c)return;const U=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,U),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),e.STATIC_DRAW);function A(t){const r=e.getAttribLocation(t,"aPos");e.bindBuffer(e.ARRAY_BUFFER,U),e.enableVertexAttribArray(r),e.vertexAttribPointer(r,2,e.FLOAT,!1,0,0)}const v={tex:e.getUniformLocation(i,"uTex"),texel:e.getUniformLocation(i,"uTexel"),damp:e.getUniformLocation(i,"uDamp"),mouse:e.getUniformLocation(i,"uMouse"),strength:e.getUniformLocation(i,"uStrength"),radius:e.getUniformLocation(i,"uRadius"),aspect:e.getUniformLocation(i,"uAspect")},d={tex:e.getUniformLocation(c,"uTex"),texel:e.getUniformLocation(c,"uTexel"),opacity:e.getUniformLocation(c,"uOpacity"),time:e.getUniformLocation(c,"uTime"),flow:e.getUniformLocation(c,"uFlow")};function b(t,r){const o=e.createTexture();e.bindTexture(e.TEXTURE_2D,o),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MAG_FILTER,e.NEAREST),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE),e.texImage2D(e.TEXTURE_2D,0,e.RGBA,t,r,0,e.RGBA,x,null);const a=e.createFramebuffer();return e.bindFramebuffer(e.FRAMEBUFFER,a),e.framebufferTexture2D(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,o,0),{tex:o,fb:a}}let n,s,l,m;function w(){n&&(e.deleteTexture(n.tex),e.deleteFramebuffer(n.fb)),s&&(e.deleteTexture(s.tex),e.deleteFramebuffer(s.fb));const t=u.getBoundingClientRect(),r=Math.max(.1,t.width/t.height);return l=Math.max(64,Math.min(320,Math.round(t.width*.35))),m=Math.max(64,Math.round(l/r)),n=b(l,m),s=b(l,m),[n,s].forEach(o=>{e.bindFramebuffer(e.FRAMEBUFFER,o.fb),e.viewport(0,0,l,m),e.clearColor(0,0,0,1),e.clear(e.COLOR_BUFFER_BIT)}),e.bindFramebuffer(e.FRAMEBUFFER,n.fb),e.checkFramebufferStatus(e.FRAMEBUFFER)===e.FRAMEBUFFER_COMPLETE}function F(){const t=u.getBoundingClientRect(),r=Math.min(2,window.devicePixelRatio||1);u.width=Math.max(1,Math.round(t.width*r)),u.height=Math.max(1,Math.round(t.height*r))}if(!w())return;F();let h=[.5,.5],T=0,p=null;window.addEventListener("mousemove",t=>{const r=u.getBoundingClientRect();if(t.clientY<r.top||t.clientY>r.bottom){p=null;return}const o=(t.clientX-r.left)/r.width,a=1-(t.clientY-r.top)/r.height;if(p){const f=o-p[0],L=a-p[1];T=Math.min(1,Math.sqrt(f*f+L*L)*9)}p=[o,a],h=[o,a]},{passive:!0});function _(t){const r=t*.001,o=T*.45;T*=.82,e.bindFramebuffer(e.FRAMEBUFFER,s.fb),e.viewport(0,0,l,m),e.disable(e.BLEND),e.useProgram(i),A(i),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,n.tex),e.uniform1i(v.tex,0),e.uniform2f(v.texel,1/l,1/m),e.uniform1f(v.damp,.992),e.uniform2f(v.mouse,h[0],h[1]),e.uniform1f(v.strength,o),e.uniform1f(v.radius,.05),e.uniform1f(v.aspect,l/m),e.drawArrays(e.TRIANGLE_STRIP,0,4);const a=n;n=s,s=a,e.bindFramebuffer(e.FRAMEBUFFER,null),e.viewport(0,0,u.width,u.height),e.clearColor(0,0,0,0),e.clear(e.COLOR_BUFFER_BIT),e.enable(e.BLEND),e.blendFunc(e.ONE,e.ONE_MINUS_SRC_ALPHA),e.useProgram(c),A(c),e.activeTexture(e.TEXTURE0),e.bindTexture(e.TEXTURE_2D,n.tex),e.uniform1i(d.tex,0),e.uniform2f(d.texel,1/l,1/m),e.uniform1f(d.opacity,.22),e.uniform1f(d.time,r),e.uniform1f(d.flow,5),e.drawArrays(e.TRIANGLE_STRIP,0,4),requestAnimationFrame(_)}let S=null;window.addEventListener("resize",()=>{clearTimeout(S),S=setTimeout(()=>{F(),w()},150)}),requestAnimationFrame(_)})()}export{B as init};
