/* Keep the whole homepage visible with an edge-to-edge landscape.
   Measure the unscaled copy so fonts, translations and resizes all fit. */
(() => {
  const body = document.body;
  const main = body.querySelector('main');
  const copy = body.querySelector('.home-copy');
  if (!body.classList.contains('home') || !copy) return;

  let frame = 0;
  function fit() {
    frame = 0;
    const { width, height } = body.getBoundingClientRect();
    const zoom = width / body.offsetWidth;
    const top = parseFloat(getComputedStyle(main).paddingTop) * zoom;
    const narrow = matchMedia('(max-width: 40rem)').matches;

    // On desktop the mountain and cabin flank the copy; the valley must
    // clear it. Phones put the entire illustration below the two-column grid.
    const gap = narrow ? 12 : 48;
    copy.style.setProperty('--home-copy-scale', '1');
    const naturalHeight = copy.offsetHeight * zoom;
    const sceneWidth = width;
    const sceneHeight = sceneWidth * 594 / 1536;
    const sceneClearance = sceneWidth * (narrow ? 496 : 400) / 1536;
    const layoutOffset = narrow ? 0 : Math.max(0, Math.min(
      top + naturalHeight + sceneClearance + gap - height,
      sceneWidth * .067, height * .14
    ));
    // Keep the existing sky space with uniform scaling. The wider side
    // artwork fills the viewport without changing the original proportions.
    // The skyline is 496 artboard units above the foreground's lower edge.
    const skylineInset = layoutOffset + (sceneHeight - layoutOffset) * .1;
    const sceneScale = Math.max(.1, 1 - skylineInset / (sceneWidth * 496 / 1536));
    const available = Math.max(1, height - top - sceneClearance * sceneScale - gap);
    let scale = 1;
    if (naturalHeight > available + .5) {
      // Keep the visible column width: smaller type can use the space it
      // frees to wrap less. Find the largest size that fits, not just a
      // shrunken copy of the old line breaks.
      let low = 0, high = 1;
      for (let i = 0; i < 9; i++) {
        const candidate = (low + high) / 2;
        copy.style.setProperty('--home-copy-scale', candidate);
        if (copy.offsetHeight * zoom * candidate <= available) low = candidate;
        else high = candidate;
      }
      scale = low;
    }
    copy.style.setProperty('--home-copy-scale', scale.toFixed(4));
    body.style.setProperty('--home-scene-height', `${sceneHeight * sceneScale / zoom}px`);
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(fit);
  }

  fit();
  new ResizeObserver(schedule).observe(copy);
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  document.fonts.ready.then(schedule);
})();
