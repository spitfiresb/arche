# Full-width landscape continuation

Home uses the original 23 layers inside a uniformly scaled SVG. The original
1536 × 1024 artwork and its masks remain unchanged. The visible viewBox is still
`0 430 1536 594`; `preserveAspectRatio="xMidYMax meet"` keeps the same scale on
both axes and includes the complete lower foreground.

A [wider painting](../../public/assets/img/home/lookout-panorama-v2.png) supplies
only the side terrain outside the original artwork. It is rendered twice with
separate uniform registrations, then clipped to the left and right wings. The
wings extend 256 artboard units into the original plate. An irregular,
terrain-following mask with an 8-unit Gaussian feather places the actual joins
inside that overlap, away from the original bitmap's baked-in dark margins.
It preserves the original cabin, including its stairs. The viewport edges are
fully painted; there is no fade into the page background.

The continuation's RGB brightness is multiplied by 0.86 in sRGB to match the
original's engraving density. Mask and clip definitions explicitly disable
inherited strokes, preventing outlines along their boundaries. These are SVG
compositing changes; neither raster asset nor the 23 source layers is modified.

## Asset and generation

- Final asset: `public/assets/img/home/lookout-panorama-v2.png` (2172 × 724).
- Mode: built-in image generation, editing/outpainting.
- Input: `public/assets/img/home/lookout-valley.png` (1536 × 1024).
- Integration: `public/assets/js/home-scene.js`.
- Sizing: `public/assets/js/home-layout.js`.

The original raster pixels, rather than the generated versions of the cabin,
mountain or central forest, remain the source of the existing editable layers.
SIFT/RANSAC feature matching registered the overlapping terrain to the original:
102 left-side and 169 right-side inliers, with approximately 0.53-pixel median
residuals in the generated image. The registrations use uniform scaling,
translation, and tiny rotations, never independent X/Y stretching. The generated
center is not displayed.

## Exact generation prompt

Use case: precise-object-edit / horizontal outpainting. Image 1 is the edit target, an existing 1536x1024 etched white-on-black mountain and fire-lookout landscape. Create a much wider 3072x1024 panorama by extending BOTH the LEFT and RIGHT by 768 pixels each. The input is the center half, occupying x=768..2304 at its original proportions. Keep the mountain, cabin, trees, clouds, rocks, trail, and complete lower foreground of the input unchanged in scale, geometry and perspective. There must be a full 768-pixel continuation to the RIGHT of the input's right edge, as well as to the LEFT. Output the widest 3:1 panoramic composition. Outpaint only the new side regions: low wooded valley and cloud bands to the left; continuous rocky slope with small plants and firs to the right. The top half is empty pure-black sky. Match the exact fine white/gray engraving linework and density. No additional cabins or mountain summits, no new focal objects, no text, no frames, no border, no side fades or vignette. Extend the landscape texture completely to both canvas edges. Do not squash, stretch, zoom into, or crop the existing artwork. The extended side terrain is needed to fill a wide website viewport while displaying the existing center illustration smaller with uniform scaling.
