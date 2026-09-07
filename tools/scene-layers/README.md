# Home lookout: editable scene

Home now composes 23 static artwork layers. The mountain, three depths of clouds,
four wooded valley islands, foreground forest, two edge ridges, eight selected firs, ground/trail,
lookout building, window light, and reconstructed backing have separate SVG files.
Stars and the interactive moon/sun remain separate DOM elements in home-scene.js.
About has its own renderer and is unaffected.

## Preview and edit

Run `PORT=8712 python3 tools/serve.py`, then visit http://localhost:8712/__scene.
This inspector is served only by the local development server. It is not part of
the deployed public site. Select, hide, isolate, reposition, resize, and change the
opacity of a layer. "Approved reference" shows the pre-separation composition.
"Clouds" reveals the reconstructed forest below the three cloud bands.
The window-light layer inherits the cabin's position, scale, opacity and visibility.

Inspector changes are temporary. Export layout downloads scene.json. Replace
`public/assets/img/home/layers/scene.json` with that file to apply the composition
to Home. No inspector controls or scene animation run on the actual Home page.

## Artwork and masks

These are **SVG cutouts of raster artwork**, not redrawn vector illustrations or
23 duplicated PNGs. Each cutout has its own alpha mask, pivot and source; original
PNG pixels remain shared to keep the approved drawing consistent. The renderer
imports SVG contents into the main SVG because SVG-as-image cannot reliably load
nested external image references.

All coordinates use a 1536 × 1024 artboard. Home displays `0 430 1536 594` with the
existing responsive crop. Manifest order is back to front. Source layers are
partitioned: silhouettes above a layer are removed from the original pixels
beneath it, preventing the original cabin/tree being left behind when hidden.
Cloud cutouts additionally contain painted continuation beneath forest islands.

- `tools/scene-layers/scene.json`: editable silhouettes, names, category and pivot.
- `public/assets/img/home/layers/*.svg`: individual artwork layers.
- `public/assets/img/home/layers/scene.json`: runtime ordering and layout.
- `public/assets/js/lookout-composition.js`: loader and composition controls.
- `baseline-home-scene.js`, `baseline-home-lookout.css`: pre-separation code reference.
- `public/assets/img/home/layers/reference.svg`: visual comparison reference.

To replace a piece, put its new full-artboard artwork in `public/assets/img/home/`,
set that layer's `artwork` URL in the source config, and adjust only its `paths`
if its silhouette changes. Optional `detailArtwork` and `repairArtwork` override
the detail patch and hidden cloud continuation. Run:

```sh
python3 tools/scene-layers/build.py
```

The builder writes native SVG masks without altering raster pixels. Existing
runtime position, scale, opacity, and visibility values survive rebuilding.
Direct changes to a generated SVG are overwritten by the builder; use the source
config for repeatable edits, or point the runtime manifest at a custom SVG.

## Shared plates and provenance

- `lookout-valley.png`: the approved original generated illustration, unchanged.
- `lookout-valley-treetops.png`: the refined small-tree artwork, restricted to the
  same four feathered patches used before separation.
- `layers/terrain-repair.png`: newly generated hidden forest/terrain. Imagegen was
  given lookout-forest.png and asked to remove the mountain, cabin, and two rear
  firs; retain the foreground slope/trail and fill the valley with forest. A second
  edit removed the large foreground firs, continuing smaller trees beneath them.
- `layers/cloud-repair.png`: newly generated cloud continuation. Imagegen was
  given lookout-valley.png and asked to remove the forest islands and foreground
  trees within the valley, continuing the low stratocumulus texture behind them.

The repair plates are hidden by the approved drawing at the default layout.
They make modest placement changes and individual artwork replacement practical.
Hand-traced masks retain small amounts of surrounding texture at branch edges;
large moves, close-up animation, or a substantially different silhouette still
require local matte cleanup and repainting of newly exposed areas. This is an
editable static composition, not a finished animation rig. No full-image warp is
used; home-tree.js is retained as historical code but is not loaded by Home.
