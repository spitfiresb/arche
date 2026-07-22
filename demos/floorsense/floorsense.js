/* FloorSense — vanilla-JS port of the original React app.
 *
 * Same behaviour as the Next.js version: landing → upload → analyze → interactive
 * viewer with an edit mode. Builds the whole UI into #fs-app; runs standalone at
 * demos/floorsense/ and framed as a live demo from work-personal.html. The only
 * server dependency is POST /api/detect (functions/api/detect.js), which holds
 * the Roboflow key and returns raw predictions. Everything else is in-browser. */

(() => {
  "use strict";

  // ---- Config ---------------------------------------------------------
  const COLORS = {
    perimeter: "#4a90e2", // sketch-blue
    bathroom: "#e24a8d",  // sketch-pink
    window: "#50e3c2",    // sketch-green
    door: "#f5a623",      // sketch-orange
    stairs: "#9b59b6",
    furniture: "#95a5a6",
  };
  const STANDARD_KEYS = ["perimeter", "bathroom", "window", "door", "stairs", "furniture"];
  // Types offered in the edit UI (furniture is detected but not user-addable).
  const EDIT_TYPES = STANDARD_KEYS.filter((t) => t !== "furniture");

  // ---- Minimal inline icons (lucide-style paths) ----------------------
  const svg = (paths) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  const ICON = {
    home: svg('<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'),
    pencil: svg('<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>'),
    file: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
    eye: svg('<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7"/><circle cx="12" cy="12" r="3"/>'),
    layers: svg('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'),
    download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'),
    upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
    plus: svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
    minus: svg('<line x1="5" y1="12" x2="19" y2="12"/>'),
    save: svg('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>'),
    loader: svg('<line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>'),
  };

  // ---- App state ------------------------------------------------------
  const app = {
    state: "landing", // landing | uploading | analyzing | viewing
    image: null,
    analysisData: null,
    error: null,
  };

  const root = document.getElementById("fs-app");

  // When embedded in the fullscreen overlay (demos/floorsense/?embed=1) the host
  // page supplies its own close control, so hide the header's back link/tagline.
  const isEmbed = new URLSearchParams(location.search).get("embed") === "1";

  // ---- Analysis (port of lib/analysis.ts) -----------------------------
  async function analyzeFloorPlan(base64Image) {
    // base64 data-URL → Blob → File for multipart upload
    const blob = await (await fetch(base64Image)).blob();
    const file = new File([blob], "image.png", { type: "image/png" });

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/detect", { method: "POST", body: formData });
    if (!response.ok) {
      let msg = "Analysis failed";
      try {
        const d = await response.json();
        msg = d.error || d.details || msg;
      } catch {
        msg = await response.text();
      }
      throw new Error(msg);
    }

    const data = await response.json();

    // Roboflow returns center x/y + width/height in absolute pixels. The viewer
    // wants [ymin, xmin, ymax, xmax] normalized to a 0-1000 scale.
    let imgWidth = data.image?.width || 0;
    let imgHeight = data.image?.height || 0;
    if (!imgWidth || !imgHeight) {
      await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { imgWidth = img.width; imgHeight = img.height; resolve(); };
        img.src = base64Image;
      });
    }
    const safeW = imgWidth || 1000;
    const safeH = imgHeight || 1000;

    const elements = (data.predictions || []).map((p, i) => {
      const xMin = p.x - p.width / 2;
      const yMin = p.y - p.height / 2;
      const xMax = p.x + p.width / 2;
      const yMax = p.y + p.height / 2;
      return {
        id: `pred-${i}`,
        type: p.class,
        label: `${p.class} (${Math.round(p.confidence * 100)}%)`,
        box_2d: [
          Math.round((yMin / safeH) * 1000),
          Math.round((xMin / safeW) * 1000),
          Math.round((yMax / safeH) * 1000),
          Math.round((xMax / safeW) * 1000),
        ],
      };
    });

    const summary = {};
    elements.forEach((el) => { summary[el.type] = (summary[el.type] || 0) + 1; });
    STANDARD_KEYS.forEach((k) => { if (!summary[k]) summary[k] = 0; });

    return { summary, elements };
  }

  // ---- Top-level flow -------------------------------------------------
  function setState(next) { app.state = next; renderApp(); }

  function goHome() {
    app.image = null;
    app.analysisData = null;
    app.error = null;
    setState("landing");
  }

  async function handleImageSelected(base64) {
    app.image = base64;
    app.error = null;
    setState("analyzing");
    try {
      app.analysisData = await analyzeFloorPlan(base64);
      setState("viewing");
    } catch (err) {
      // the thrown message can carry server config detail (bad key, plan
      // limits), so the visitor gets a generic line and the detail goes to
      // the console.
      console.error("FloorSense analysis failed:", err);
      app.error = "Failed to analyze floor plan. Please try again.";
      setState("uploading");
    }
  }

  // ---- Render: shell --------------------------------------------------
  function renderApp() {
    root.innerHTML = "";

    // Header
    const header = el("header", "fs-header");
    const brand = el("button", "fs-brand");
    brand.innerHTML = `${ICON.home}<h1>FloorSense</h1>`;
    brand.onclick = goHome;
    header.append(brand);
    if (!isEmbed) {
      const tag = el("div", "fs-tagline");
      tag.innerHTML = `<a class="fs-back" href="/work-personal.html">← Back to work</a><span>Intelligent Floorplan Analysis</span>`;
      header.append(tag);
    }

    // Main
    const main = el("main", "fs-main");

    if (app.state === "landing") main.append(renderLanding());
    else if (app.state === "uploading") main.append(renderUploading());
    else if (app.state === "analyzing") main.append(renderAnalyzing());
    else if (app.state === "viewing" && app.image && app.analysisData) {
      const wrap = el("div", "fs-fade");
      wrap.style.marginTop = "2rem";
      wrap.append(renderViewer(app.image, app.analysisData));
      main.append(wrap);
    }

    // Footer
    const footer = el("footer", "fs-footer");
    footer.innerHTML = `<p>Built by <span class="accent">Zain Saeed</span></p><p class="tiny">Powered by Roboflow</p>`;

    root.append(header, main, footer);
  }

  // ---- Render: landing ------------------------------------------------
  function renderLanding() {
    const wrap = el("div", "fs-landing");
    const head = el("div", "fs-landing-head");

    const h1 = el("h1", "fs-title");
    const textSpan = document.createElement("span");
    const caret = el("span", "fs-caret");
    h1.append(textSpan, caret);

    const sub = el("p", "fs-sub");
    sub.textContent = "Upload any architectural drawing and let the model instantly identify rooms, doors, windows, and furniture.";

    const cta = el("div", "fs-cta");
    const tryBtn = el("button", "fs-btn");
    tryBtn.innerHTML = `Try It Now ${ICON.pencil}`;
    tryBtn.onclick = () => setState("uploading");
    const docsBtn = el("button", "fs-btn secondary");
    docsBtn.innerHTML = `Read the Docs ${ICON.file}`;
    docsBtn.onclick = () => window.open("https://github.com/spitfiresb/FloorSense", "_blank");
    cta.append(tryBtn, docsBtn);

    head.append(h1, sub, cta);

    const features = el("div", "fs-features");
    [
      { icon: ICON.eye, title: "INSTANT DETECTION", desc: "Model inference runs in seconds. Upload and get results immediately." },
      { icon: ICON.layers, title: "INTERACTIVE VIEWER", desc: "Toggle layers and inspect each detected element on the plan." },
      { icon: ICON.download, title: "EXPORT READY", desc: "Correct the detections by hand, then save the result as a PNG." },
    ].forEach((f) => {
      const card = el("div", "fs-feature");
      card.innerHTML = `<div class="fs-feature-icon">${f.icon}</div><h3>${f.title}</h3><p>${f.desc}</p>`;
      features.append(card);
    });

    wrap.append(head, features);

    // Typewriter for "FloorSense"
    typewriter(textSpan, caret, "FloorSense", 100, 300);
    return wrap;
  }

  function typewriter(textSpan, caret, text, speed, startDelay) {
    caret.classList.add("blink");
    let i = 0;
    const type = () => {
      const iv = setInterval(() => {
        if (i < text.length) { textSpan.textContent = text.slice(0, ++i); }
        else {
          clearInterval(iv);
          setTimeout(() => { caret.classList.remove("blink"); caret.classList.add("gone"); }, 3000);
        }
      }, speed);
    };
    setTimeout(type, startDelay);
  }

  // ---- Render: uploading ----------------------------------------------
  function renderUploading() {
    const center = el("div", "fs-center");
    const wrap = el("div", "fs-upload-wrap fs-fade");

    const drop = el("div", "fs-dropzone");
    drop.innerHTML = `${ICON.upload}<h2 class="fs-hand">Drop your floor plan here</h2><p>or click to browse</p>`;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png, image/jpeg, image/jpg";
    input.style.display = "none";

    const readBlob = (blob) => {
      const reader = new FileReader();
      reader.onload = (e) => { if (e.target?.result) handleImageSelected(e.target.result); };
      reader.readAsDataURL(blob);
    };
    const readFile = (file) => { if (file && file.type.startsWith("image/")) readBlob(file); };

    drop.onclick = () => input.click();
    input.onchange = (e) => { if (e.target.files?.[0]) readFile(e.target.files[0]); };
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("drag"); };
    drop.ondragleave = () => drop.classList.remove("drag");
    drop.ondrop = (e) => {
      e.preventDefault();
      drop.classList.remove("drag");
      if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
    };

    const hint = el("p", "fs-hint");
    hint.textContent = "Supported formats: PNG, JPG";

    const examples = el("div", "fs-examples");
    const exHead = el("p", "fs-hand");
    exHead.textContent = "Or try one of these examples:";
    const grid = el("div", "fs-example-grid");
    ["samples/sample_1.png", "samples/sample_2.png", "samples/sample_3.png"].forEach((src) => {
      const cell = el("div", "fs-example");
      cell.innerHTML = `<img src="${src}" alt="Sample floor plan">`;
      // a missing sample would otherwise make the click do nothing at all,
      // with no banner and nothing in the console to explain it
      cell.onclick = () => {
        fetch(src)
          .then((r) => { if (!r.ok) throw new Error(`${r.status} ${src}`); return r.blob(); })
          .then(readBlob)
          .catch((err) => {
            console.error("FloorSense sample failed to load:", err);
            app.error = "Could not load that example. Please try another.";
            setState("uploading");
          });
      };
      grid.append(cell);
    });
    examples.append(exHead, grid);

    wrap.append(drop, input, hint, examples);
    center.append(wrap);

    if (app.error) {
      const err = el("div", "fs-error");
      err.textContent = `Error: ${app.error}`;
      center.append(err);
    }
    return center;
  }

  // ---- Render: analyzing ----------------------------------------------
  function renderAnalyzing() {
    const center = el("div", "fs-center fs-pulse");
    const box = el("div", "fs-analyzing");
    box.innerHTML = `
      <div class="fs-spinner-wrap">
        <div class="fs-spinner-ring"></div>
        <div class="fs-spinner-core">${ICON.loader}</div>
      </div>
      <h2 class="fs-hand">Analyzing Architecture...</h2>
      <p>Identifying walls, windows, and doors.</p>`;
    center.append(box);
    return center;
  }

  // ---- Render: viewer -------------------------------------------------
  function renderViewer(image, data) {
    // Local, mutable viewer state
    const v = {
      elements: [],
      activeLayers: { perimeter: true, bathroom: true, window: true, door: true, stairs: true, furniture: true },
      editAction: "none", // none | add | remove
      selectedType: "window",
      dragStart: null,
      currentDrag: null,
    };

    // Sort: establish left-to-right animation order by xmin, then paint order by
    // area DESC so big shapes (perimeter) sit under small ones (doors).
    const xSorted = [...data.elements].sort((a, b) => a.box_2d[1] - b.box_2d[1]);
    v.elements = xSorted.map((el, index) => ({ ...el, animationIndex: index })).sort((a, b) => {
      const areaA = (a.box_2d[2] - a.box_2d[0]) * (a.box_2d[3] - a.box_2d[1]);
      const areaB = (b.box_2d[2] - b.box_2d[0]) * (b.box_2d[3] - b.box_2d[1]);
      const valA = a.type === "perimeter" ? Number.MAX_SAFE_INTEGER : areaA;
      const valB = b.type === "perimeter" ? Number.MAX_SAFE_INTEGER : areaB;
      return valB - valA;
    });

    const container = el("div", "fs-viewer");

    // --- Left sidebar (stats) ---
    const sidebar = el("div", "fs-sidebar");
    const panel = el("div", "fs-panel");
    panel.innerHTML = `<h3 class="fs-hand">Analysis</h3>`;
    const statList = el("div", "fs-stat-list");
    panel.append(statList);
    sidebar.append(panel);

    // --- Stage (image + boxes) ---
    const stage = el("div", "fs-stage");
    const canvas = el("div", "fs-canvas");
    const img = document.createElement("img");
    img.src = image;
    img.alt = "Floor Plan";
    canvas.append(img);
    const dragPreview = el("div", "fs-drag-preview fs-hidden");
    canvas.append(dragPreview);
    stage.append(canvas);

    const stageControls = el("div", "fs-stage-controls");
    const editBtn = el("button", "fs-btn");
    editBtn.innerHTML = `Edit ${ICON.pencil}`;
    stageControls.append(editBtn);
    stage.append(stageControls);

    // --- Right edit panel (created on demand) ---
    let editPanel = null;

    container.append(sidebar, stage);

    // ---- Helpers ----
    const boxStyle = (box) => {
      const [ymin, xmin, ymax, xmax] = box;
      return { top: `${ymin / 10}%`, left: `${xmin / 10}%`, height: `${(ymax - ymin) / 10}%`, width: `${(xmax - xmin) / 10}%` };
    };

    const currentSummary = () => v.elements.reduce((acc, el) => { acc[el.type] = (acc[el.type] || 0) + 1; return acc; }, {});

    function renderStats() {
      statList.innerHTML = "";
      const summary = currentSummary();
      STANDARD_KEYS.forEach((type) => {
        const count = summary[type] || 0;
        if (count === 0) return;
        const row = el("div", "fs-stat-row");
        row.innerHTML = `
          <div class="fs-stat-left">
            <div class="fs-swatch${v.activeLayers[type] ? "" : " off"}" style="background:${COLORS[type]}"></div>
            <span class="fs-stat-name">${type}</span>
          </div>
          <span class="fs-stat-count">${count}</span>`;
        row.onclick = () => { toggleLayer(type); };
        statList.append(row);
      });
    }

    function renderBoxes() {
      // Remove existing boxes (keep the img + dragPreview)
      canvas.querySelectorAll(".fs-box").forEach((n) => n.remove());
      canvas.classList.toggle("adding", v.editAction === "add");
      canvas.classList.toggle("removing", v.editAction === "remove");

      v.elements.filter((e) => v.activeLayers[e.type]).forEach((elm) => {
        const b = el("div", "fs-box");
        const s = boxStyle(elm.box_2d);
        Object.assign(b.style, s);
        const color = COLORS[elm.type] || "black";
        b.style.borderColor = color;
        const area = (elm.box_2d[2] - elm.box_2d[0]) * (elm.box_2d[3] - elm.box_2d[1]) + 1;
        b.style.zIndex = String((elm.type === "perimeter" ? 0 : 20) + Math.round(1000000 / area));
        const isManual = elm.id.startsWith("custom-");
        b.style.animationDelay = isManual ? "0s" : `${elm.animationIndex * 0.1}s`;

        const label = el("div", "fs-label");
        label.textContent = elm.label;
        b.append(label);

        const removeIcon = el("div", "fs-remove-icon");
        removeIcon.innerHTML = ICON.minus;
        b.append(removeIcon);

        b.onclick = (e) => {
          if (v.editAction === "remove") {
            e.stopPropagation();
            v.elements = v.elements.filter((x) => x.id !== elm.id);
            renderBoxes();
            renderStats();
          }
        };
        canvas.append(b);
      });
    }

    function toggleLayer(type) {
      v.activeLayers[type] = !v.activeLayers[type];
      renderBoxes();
      renderStats();
      if (editPanel) syncVisibilityChecks();
    }

    // ---- Edit mode: draw-to-add ----
    const normCoords = (e) => {
      const rect = img.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      return {
        x: Math.max(0, Math.min(1000, Math.round((x / rect.width) * 1000))),
        y: Math.max(0, Math.min(1000, Math.round((y / rect.height) * 1000))),
      };
    };

    canvas.addEventListener("mousedown", (e) => {
      if (v.editAction !== "add") return;
      const c = normCoords(e);
      v.dragStart = c; v.currentDrag = c;
    });
    canvas.addEventListener("mousemove", (e) => {
      if (v.editAction !== "add" || !v.dragStart) return;
      v.currentDrag = normCoords(e);
      drawPreview();
    });
    const finishDrag = () => {
      if (v.editAction !== "add" || !v.dragStart || !v.currentDrag) { v.dragStart = null; v.currentDrag = null; return; }
      const ymin = Math.min(v.dragStart.y, v.currentDrag.y);
      const xmin = Math.min(v.dragStart.x, v.currentDrag.x);
      const ymax = Math.max(v.dragStart.y, v.currentDrag.y);
      const xmax = Math.max(v.dragStart.x, v.currentDrag.x);
      if (Math.abs(xmax - xmin) > 10 && Math.abs(ymax - ymin) > 10) {
        v.elements.push({
          id: `custom-${idCounter++}`,
          type: v.selectedType,
          label: `${v.selectedType} (Manual)`,
          box_2d: [ymin, xmin, ymax, xmax],
          animationIndex: v.elements.length,
        });
        renderBoxes();
        renderStats();
      }
      v.dragStart = null; v.currentDrag = null;
      dragPreview.classList.add("fs-hidden");
    };
    canvas.addEventListener("mouseup", finishDrag);
    canvas.addEventListener("mouseleave", () => { v.dragStart = null; v.currentDrag = null; dragPreview.classList.add("fs-hidden"); });

    function drawPreview() {
      if (!v.dragStart || !v.currentDrag || v.editAction !== "add") { dragPreview.classList.add("fs-hidden"); return; }
      const s = boxStyle([
        Math.min(v.dragStart.y, v.currentDrag.y),
        Math.min(v.dragStart.x, v.currentDrag.x),
        Math.max(v.dragStart.y, v.currentDrag.y),
        Math.max(v.dragStart.x, v.currentDrag.x),
      ]);
      Object.assign(dragPreview.style, s);
      dragPreview.style.borderColor = COLORS[v.selectedType] || "black";
      dragPreview.classList.remove("fs-hidden");
    }

    // ---- Edit panel ----
    function buildEditPanel() {
      const panelWrap = el("div", "fs-edit");
      const inner = el("div", "fs-edit-inner");

      const head = el("h3", "fs-hand");
      head.textContent = "EDIT MODE";

      const actions = el("div", "fs-edit-actions");
      const addBtn = el("button", "fs-btn small");
      addBtn.innerHTML = `ADD ${ICON.plus}`;
      const removeBtn = el("button", "fs-btn small");
      removeBtn.innerHTML = `REMOVE ${ICON.minus}`;
      actions.append(addBtn, removeBtn);

      const contextSlot = el("div", "fs-context-slot");

      const visibility = el("div", "fs-visibility");
      const visHead = document.createElement("p");
      visHead.textContent = "Visibility";
      visibility.append(visHead);
      EDIT_TYPES.forEach((type) => {
        const lab = el("label", "fs-check");
        lab.dataset.type = type;
        lab.innerHTML = `<input type="checkbox" ${v.activeLayers[type] ? "checked" : ""}><span>${type}</span>`;
        lab.querySelector("input").onchange = () => toggleLayer(type);
        visibility.append(lab);
      });

      const footer = el("div", "fs-edit-footer");
      const saveBtn = el("button", "fs-btn blue small block");
      saveBtn.innerHTML = `SAVE IMAGE ${ICON.save}`;
      saveBtn.onclick = downloadImage;
      const doneBtn = el("button", "fs-btn small block");
      doneBtn.textContent = "DONE";
      doneBtn.onclick = () => { v.editAction = "none"; teardownEditPanel(); renderBoxes(); };
      footer.append(saveBtn, doneBtn);

      inner.append(head, actions, contextSlot, visibility, footer);
      panelWrap.append(inner);

      const setAction = (action) => {
        v.editAction = v.editAction === action ? "none" : action;
        addBtn.classList.toggle("active", v.editAction === "add");
        removeBtn.classList.toggle("active", v.editAction === "remove");
        renderContext(contextSlot);
        renderBoxes();
      };
      addBtn.onclick = () => setAction("add");
      removeBtn.onclick = () => setAction("remove");

      return panelWrap;
    }

    function renderContext(slot) {
      slot.innerHTML = "";
      if (v.editAction === "add") {
        const box = el("div", "fs-add-box");
        const p = el("p", "fs-small-label");
        p.textContent = "Item to Add:";
        const grid = el("div", "fs-type-grid");
        EDIT_TYPES.forEach((type) => {
          const b = el("button", "fs-type-btn" + (v.selectedType === type ? " sel" : ""));
          b.textContent = type;
          b.onclick = () => { v.selectedType = type; renderContext(slot); };
          grid.append(b);
        });
        const note = el("p", "fs-note");
        note.textContent = `Click and drag on the image to draw a new ${v.selectedType}.`;
        box.append(p, grid, note);
        slot.append(box);
      } else if (v.editAction === "remove") {
        const box = el("div", "fs-remove-box");
        box.innerHTML = `<p>Select items to remove</p><p class="fs-note">Click any box on the image to delete it.</p>`;
        slot.append(box);
      }
    }

    function syncVisibilityChecks() {
      if (!editPanel) return;
      editPanel.querySelectorAll(".fs-check").forEach((lab) => {
        const input = lab.querySelector("input");
        if (input) input.checked = !!v.activeLayers[lab.dataset.type];
      });
    }

    function teardownEditPanel() {
      if (editPanel) { editPanel.remove(); editPanel = null; }
      stageControls.classList.remove("fs-hidden");
      canvas.classList.remove("adding", "removing");
    }

    editBtn.onclick = () => {
      stageControls.classList.add("fs-hidden");
      editPanel = buildEditPanel();
      container.append(editPanel);
    };

    function downloadImage() {
      // Faithful to the original: exports the uploaded plan image.
      const link = document.createElement("a");
      link.href = image;
      link.download = "floorplan_analyzed.png";
      link.click();
    }

    // Initial paint
    renderStats();
    renderBoxes();

    return container;
  }

  // ---- utils ----------------------------------------------------------
  let idCounter = 0;
  function el(tag, className) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    return n;
  }

  // ---- boot -----------------------------------------------------------
  renderApp();
})();
