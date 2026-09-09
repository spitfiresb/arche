/* One composed valley illustration. Rooted wind affects the two distant
   crowns; a soft cloud-only flow mask keeps motion within the low cloud
   channels. No moving cloud cutouts or repeated foreground strips. */
window.mountLookoutForest = function (svg, scene, fallback) {
  const NS = 'http://www.w3.org/2000/svg';
  const asset = '/assets/img/home/lookout-valley.png';
  const plane = [0, 0, 1536, 1024];
  const host = document.createElementNS(NS, 'foreignObject');
  Object.entries({x:0,y:430,width:1536,height:594,class:'lookout-tree-mesh'}).forEach(([k,v])=>host.setAttribute(k,v));
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  host.append(canvas);
  fallback.after(host);
  const gl = canvas.getContext('webgl', {alpha:true,antialias:false,premultipliedAlpha:false});
  if (!gl) { host.remove(); return; }
  let program;
  try {
    function shader(type, source) {
      const s = gl.createShader(type);
      gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s,gl.COMPILE_STATUS)) { const error=gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(error); }
      return s;
    }
    const vertex=shader(gl.VERTEX_SHADER, `
      attribute vec2 a_uv;
      uniform mediump float u_time;
      uniform vec4 u_plane;
      varying vec2 v_uv;
      void main() {
        v_uv=a_uv;
        vec2 p=u_plane.xy+a_uv*u_plane.zw;
        // Restrict wind to the two crowns on the far-right back slope.
        // The cabin ends left of this mask; its lines cannot deform.
        float area=smoothstep(1380.0,1410.0,p.x)*(1.0-smoothstep(1520.0,1536.0,p.x));
        float h=clamp((720.0-p.y)/215.0,0.0,1.0);
        float side=sin((p.x-1410.0)*0.043);
        float wind=sin(u_time*0.51)*1.6+sin(u_time*0.27+1.4)*0.6;
        p.x+=area*h*h*wind;
        p.y+=area*h*side*side*sin(u_time*0.73-h*3.4)*0.65;
        gl_Position=vec4(p.x/768.0-1.0,1.0-(p.y-430.0)/297.0,0.0,1.0);
      }
    `);
    const fragment=shader(gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform sampler2D u_image;
      uniform sampler2D u_cloudMask;
      uniform mediump float u_time;
      varying vec2 v_uv;
      void main() {
        float cloud=texture2D(u_cloudMask,v_uv).r;
        // Two staggered phases crossfade, avoiding a visible loop reset.
        // The small flow stays inside the cloud channels; ridge contours
        // and exposed trees remain absolutely stationary.
        float phase=fract(u_time*0.047);
        float phaseB=fract(phase+0.5);
        vec2 flow=vec2(9.0/1536.0,0.7/1024.0)*cloud;
        vec3 a=texture2D(u_image,v_uv-flow*phase).rgb;
        vec3 b=texture2D(u_image,v_uv-flow*phaseB).rgb;
        gl_FragColor=vec4(mix(a,b,abs(phase*2.0-1.0)),1.0);
      }
    `);
    program=gl.createProgram();
    gl.attachShader(program,vertex); gl.attachShader(program,fragment); gl.linkProgram(program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (error) {
    console.warn('Lookout forest uses its static illustration:',error);
    host.remove(); return;
  }
  gl.useProgram(program);
  const points=[], indices=[], columns=128, rows=96;
  for (let y=0;y<=rows;y++) for (let x=0;x<=columns;x++) points.push(x/columns,y/rows);
  for (let y=0;y<rows;y++) for (let x=0;x<columns;x++) {
    const a=y*(columns+1)+x,b=a+1,c=a+columns+1,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  const vertexBuffer=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.STATIC_DRAW);
  const attribute=gl.getAttribLocation(program,'a_uv');
  gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
  const indexBuffer=gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
  gl.uniform4fv(gl.getUniformLocation(program,'u_plane'),plane);
  gl.uniform1i(gl.getUniformLocation(program,'u_image'),0);
  const timeUniform=gl.getUniformLocation(program,'u_time');
  // Hand-placed motion regions follow only the cloud interiors in the
  // approved composition. Blurred edges prevent texture tears at ridges.
  const mask=document.createElement('canvas');mask.width=1536;mask.height=1024;
  const m=mask.getContext('2d');m.fillStyle='black';m.fillRect(0,0,1536,1024);
  m.filter='blur(5px)';m.fillStyle='white';
  [
    'M590 712 Q795 699 1090 724 L1040 737 Q838 719 664 731Z',
    'M60 743 Q172 735 245 750 L225 765 Q145 760 88 758Z',
    'M143 783 Q310 775 470 792 Q557 797 633 790 L628 805 Q478 818 338 799 L181 801Z',
    'M576 778 Q679 752 752 762 L758 773 Q667 772 608 791Z',
    'M850 791 Q926 785 1004 799 L970 814 Q912 808 842 806Z',
    'M179 839 Q215 825 255 825 L252 840 L209 856Z',
    'M468 859 Q585 838 668 833 L674 848 Q597 858 503 875Z',
    'M749 834 Q833 818 879 824 L858 839 L766 852Z',
    'M166 881 Q227 867 295 884 L299 899 Q224 887 181 899Z',
    'M353 907 Q405 889 459 899 L449 913 L374 926Z'
  ].forEach(d=>m.fill(new Path2D(d)));
  const maskTexture=gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,maskTexture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,mask);
  gl.uniform1i(gl.getUniformLocation(program,'u_cloudMask'),1);
  gl.activeTexture(gl.TEXTURE0);
  const texture=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,texture);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let ready=false, visible=true, lost=false, frame=0, last=0, elapsed=0;
  function draw() {
    if (!ready || lost) return;
    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(timeUniform,reduced.matches ? 0 : elapsed);
    gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
  }
  function resize() {
    // Match the host's rendered dimensions, capped at 2×. The SVG handles
    // composition and mobile cropping; the GPU always uses design units.
    const rect=host.getBoundingClientRect(), dpr=Math.min(devicePixelRatio||1,2);
    const w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
    if (canvas.width!==w || canvas.height!==h) { canvas.width=w; canvas.height=h; gl.viewport(0,0,w,h); }
    draw();
  }
  function tick(now) {
    frame=0;
    if (!ready || lost || !visible || document.hidden || reduced.matches) { last=0; return; }
    if (last) elapsed+=Math.min((now-last)/1000,.05);
    last=now;
    draw();
    frame=requestAnimationFrame(tick);
  }
  function sync() {
    if (frame) cancelAnimationFrame(frame);
    frame=0;last=0;
    if (ready && !lost && visible && !document.hidden) {
      draw();
      if (!reduced.matches) frame=requestAnimationFrame(tick);
    }
  }
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();});
  observer.observe(scene);
  const sizeObserver=new ResizeObserver(resize); sizeObserver.observe(host);
  document.addEventListener('visibilitychange',sync);
  reduced.addEventListener('change',sync);
  canvas.addEventListener('webglcontextlost',()=>{lost=true;fallback.style.visibility='visible';host.style.visibility='hidden';sync();});
  const image=new Image();
  image.onload=()=>{
    if(lost)return;
    try {
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      ready=true;resize();fallback.style.visibility='hidden';canvas.dataset.motion='ready';sync();
    } catch(error) { console.warn('Lookout texture uses its static illustration:',error);host.style.visibility='hidden'; }
  };
  image.src=asset;
  // Tear down GPU work even when navigating into the back/forward cache.
  addEventListener('pagehide',()=>{visible=false;sync();});
  addEventListener('pageshow',()=>{visible=true;resize();sync();});
};
