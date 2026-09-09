/* Shared static scene renderer. SVG cutouts retain the approved raster drawing.
   No canvas, displacement shader, or ambient animation is used. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const MANIFEST = '/assets/img/home/layers/scene.json';
  async function get(url, json = false) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Scene asset ${url}: ${response.status}`);
    return json ? response.json() : response.text();
  }
  async function artwork(url) {
    const doc = new DOMParser().parseFromString(await get(url), 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error(`Invalid scene SVG: ${url}`);
    const g = document.createElementNS(NS, 'g');
    for (const child of doc.documentElement.children) g.append(document.importNode(child, true));
    return g;
  }
  async function mount(svg, options = {}) {
    const manifest = await get(options.manifest || MANIFEST, true);
    const initial = structuredClone(manifest);
    const group = document.createElementNS(NS, 'g');
    group.classList.add('lookout-composition');
    const nodes = new Map();
    const art = await Promise.all(manifest.layers.map(layer => artwork(layer.src)));
    manifest.layers.forEach((layer, i) => {
      const node = art[i];
      node.dataset.layerId = layer.id;
      node.setAttribute('aria-label', layer.label);
      nodes.set(layer.id, node);
      group.append(node);
    });
    // Decode the four shared plates once, before swapping out the fallback.
    const sources = [...new Set([...group.querySelectorAll('image')].map(image => image.getAttribute('href')))];
    await Promise.all(sources.map(src => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = resolve;
      image.onerror = () => reject(new Error(`Unable to load ${src}`));
      image.src = src;
    })));
    let soloId = null;
    function family(layer) {
      const chain = [layer];
      while (chain[0].parent) {
        const parent = manifest.layers.find(item => item.id === chain[0].parent);
        if (!parent || chain.includes(parent)) throw new Error('Invalid scene layer parent');
        chain.unshift(parent);
      }
      return chain;
    }
    function render() {
      manifest.layers.forEach(layer => {
        const node = nodes.get(layer.id);
        const chain = family(layer);
        node.setAttribute('transform', chain.map(item => {
          const [px, py] = item.pivot || [768, 1024];
          return `translate(${item.x || 0} ${item.y || 0}) translate(${px} ${py}) scale(${item.scale ?? 1}) translate(${-px} ${-py})`;
        }).join(' '));
        node.setAttribute('opacity', chain.reduce((opacity, item) => opacity * (item.opacity ?? 1), 1));
        node.style.display = chain.every(item => item.visible !== false) && (!soloId || chain.some(item => item.id === soloId)) ? '' : 'none';
      });
    }
    render();
    svg.replaceChildren(group);
    svg.dataset.sceneReady = 'true';
    return {
      manifest, group, nodes,
      set(id, patch) {
        const layer = manifest.layers.find(item => item.id === id);
        if (!layer) throw new Error(`Unknown layer ${id}`);
        Object.assign(layer, patch);
        render();
      },
      solo(id) { soloId = id; render(); },
      reset() {
        manifest.layers.splice(0, manifest.layers.length, ...structuredClone(initial.layers));
        soloId = null;
        render();
      },
      export() { return JSON.stringify(manifest, null, 2) + '\n'; }
    };
  }
  window.LookoutComposition = { mount, artwork };
})();
