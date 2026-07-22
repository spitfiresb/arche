/* In-page window manager: links with data-window open inside a draggable,
   resizable "browser" window instead of leaving the site. */
(function () {
  "use strict";

  var zTop = 100;
  var openWindows = {};

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function createWindow(opts) {
    if (openWindows[opts.id]) {
      focusWindow(openWindows[opts.id]);
      return;
    }

    var win = el("section", "bwin");
    win.setAttribute("role", "dialog");
    win.setAttribute("aria-label", opts.title);

    var bar = el("header", "bwin-bar");
    var lights = el("div", "bwin-lights");
    var btnClose = el("button", "bwin-light bwin-close");
    var btnMin = el("button", "bwin-light bwin-min");
    var btnMax = el("button", "bwin-light bwin-max");
    btnClose.setAttribute("aria-label", "Close");
    btnMin.setAttribute("aria-label", "Minimize");
    btnMax.setAttribute("aria-label", "Maximize");
    lights.appendChild(btnClose);
    lights.appendChild(btnMin);
    lights.appendChild(btnMax);
    bar.appendChild(lights);
    bar.appendChild(el("span", "bwin-title", opts.title));

    var urlbar = el("div", "bwin-urlbar");
    var lock = el("span", "bwin-lock", "◆");
    var url = el("a", "bwin-url", opts.url.replace(/^https?:\/\//, ""));
    url.href = opts.url;
    url.target = "_blank";
    url.rel = "noopener";
    url.title = "Open in a real tab";
    urlbar.appendChild(lock);
    urlbar.appendChild(url);

    var body = el("div", "bwin-body");
    body.appendChild(opts.content);

    var grip = el("div", "bwin-grip");
    grip.setAttribute("aria-hidden", "true");

    win.appendChild(bar);
    win.appendChild(urlbar);
    win.appendChild(body);
    win.appendChild(grip);
    document.body.appendChild(win);

    // Center-ish spawn, cascaded per open window
    var count = Object.keys(openWindows).length;
    var w = Math.min(420, window.innerWidth - 24);
    win.style.width = w + "px";
    win.style.left = Math.max(12, (window.innerWidth - w) / 2 + count * 24) + "px";
    win.style.top = Math.max(12, window.innerHeight * 0.18 + count * 24) + "px";

    openWindows[opts.id] = win;
    win.dataset.winId = opts.id;
    focusWindow(win);
    requestAnimationFrame(function () { win.classList.add("bwin-open"); });

    btnClose.addEventListener("click", function () { closeWindow(win); });
    btnMin.addEventListener("click", function () {
      win.classList.remove("bwin-maxed");
      win.classList.toggle("bwin-mined");
    });
    btnMax.addEventListener("click", function () {
      win.classList.remove("bwin-mined");
      win.classList.toggle("bwin-maxed");
    });
    win.addEventListener("pointerdown", function () { focusWindow(win); });

    makeDraggable(win, bar);
    makeResizable(win, grip);
  }

  function focusWindow(win) {
    win.style.zIndex = ++zTop;
    var all = document.querySelectorAll(".bwin");
    for (var i = 0; i < all.length; i++) all[i].classList.remove("bwin-focus");
    win.classList.add("bwin-focus");
  }

  function closeWindow(win) {
    delete openWindows[win.dataset.winId];
    win.classList.remove("bwin-open");
    win.addEventListener("transitionend", function () { win.remove(); }, { once: true });
    setTimeout(function () { win.remove(); }, 300);
  }

  function makeDraggable(win, handle) {
    handle.addEventListener("pointerdown", function (e) {
      if (e.target.closest("button") || win.classList.contains("bwin-maxed")) return;
      e.preventDefault();
      var startX = e.clientX, startY = e.clientY;
      var rect = win.getBoundingClientRect();
      handle.setPointerCapture(e.pointerId);
      function move(ev) {
        win.style.left = Math.max(-rect.width + 60, rect.left + ev.clientX - startX) + "px";
        win.style.top = Math.max(0, rect.top + ev.clientY - startY) + "px";
      }
      function up() {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
      }
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    });
  }

  function makeResizable(win, grip) {
    grip.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      var startX = e.clientX, startY = e.clientY;
      var rect = win.getBoundingClientRect();
      grip.setPointerCapture(e.pointerId);
      function move(ev) {
        win.style.width = Math.max(260, rect.width + ev.clientX - startX) + "px";
        win.style.height = Math.max(160, rect.height + ev.clientY - startY) + "px";
      }
      function up() {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", up);
      }
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", up);
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var focused = document.querySelector(".bwin-focus");
    if (focused) closeWindow(focused);
  });

  /* --- Window content --- */

  function linkedinContent(profileUrl) {
    var card = el("div", "li-card");

    var banner = el("img", "li-banner");
    banner.src = "assets/li-banner.jpeg";
    banner.alt = "";
    var avatar = el("img", "li-avatar");
    avatar.src = "assets/li-avatar.jpeg";
    avatar.alt = "Zain Saeed";
    card.appendChild(banner);
    card.appendChild(avatar);

    var info = el("div", "li-info");
    info.appendChild(el("p", "li-name", "Zain Saeed"));
    info.appendChild(el("p", "li-headline", "CS & Data Science | Prev @Trimble"));
    info.appendChild(el("p", "li-meta", "San Francisco Bay Area"));
    info.appendChild(el("p", "li-connections", "500+ connections"));

    var cta = el("a", "li-cta", "View full profile on LinkedIn →");
    cta.href = profileUrl;
    cta.target = "_blank";
    cta.rel = "noopener";
    info.appendChild(cta);

    var note = el("p", "li-note",
      "LinkedIn doesn’t allow itself to be embedded in other sites, so this window is a preview rendered by this site.");
    info.appendChild(note);

    card.appendChild(info);
    return card;
  }

  /* --- Hover card: lay out the inner content at the card's final width,
         so the box uncovers it as it grows instead of squishing it --- */

  // The LinkedIn card opens leftward, so it can only be as wide as the
  // page margin left of its mark. Below this it would be too cramped to
  // read, and the card opens rightward instead (narrow windows, phones).
  var OPEN_LEFT_MIN = 260;
  var EDGE_GUTTER = 12;   // never touch the viewport's left edge

  function sizeHoverCards() {
    var cards = document.querySelectorAll(".li-hover-card");
    for (var i = 0; i < cards.length; i++) {
      var list = cards[i].closest("ul.links");
      if (!list) continue;
      /* set on the item, not the card: the reveal wrapper is the card's
         parent and widens out to --liw as well */
      var host = cards[i].closest("li.li-hover") || cards[i];
      var width = list.clientWidth;

      if (!cards[i].classList.contains("gh-card")) {
        // room between the viewport edge and the mark's right edge —
        // exactly the span a leftward-opening card has to live in
        var room = host.getBoundingClientRect().right - EDGE_GUTTER;
        var opensLeft = room >= Math.min(OPEN_LEFT_MIN, width);
        host.classList.toggle("opens-left", opensLeft);
        if (opensLeft) width = Math.min(width, room);
      }

      host.style.setProperty("--liw", width + "px");
    }
  }

  sizeHoverCards();
  window.addEventListener("resize", sizeHoverCards);

  /* --- GitHub contribution calendar: live data via a public proxy of
         GitHub's GraphQL API (no token needed). Drawn as an SVG grid,
         one cell per day, using GitHub's own 0-4 intensity levels. --- */

  function buildGhGraph() {
    var wrap = document.querySelector(".gh-graph");
    if (!wrap) return;

    fetch("https://github-contributions-api.jogruber.de/v4/spitfiresb?y=last")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var days = data.contributions;
        // GitHub's dark-theme green intensity ramp (empty -> brightest)
        var colors = ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"];
        var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        var fullMonths = ["January", "February", "March", "April", "May",
                          "June", "July", "August", "September", "October",
                          "November", "December"];
        var NS = "http://www.w3.org/2000/svg";
        var CELL = 10, PITCH = 12, TOP = 15;

        // Column = week, row = weekday; pad so weeks start on Sunday
        var firstDay = new Date(days[0].date + "T00:00:00").getDay();
        var weeks = Math.ceil((days.length + firstDay) / 7);

        var svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 " + (weeks * PITCH - 2) + " " + (7 * PITCH - 2 + TOP));

        var lastMonth = -1;
        for (var i = 0; i < days.length; i++) {
          var col = Math.floor((i + firstDay) / 7);
          var row = (i + firstDay) % 7;
          var d = days[i];

          // Month label above the first full week of each new month
          if (row === 0) {
            var m = new Date(d.date + "T00:00:00").getMonth();
            if (m !== lastMonth && col > 0 && col < weeks - 3) {
              var label = document.createElementNS(NS, "text");
              label.setAttribute("x", col * PITCH);
              label.setAttribute("y", 9);
              label.setAttribute("class", "gh-month");
              label.textContent = months[m];
              svg.appendChild(label);
            }
            lastMonth = m;
          }

          var rect = document.createElementNS(NS, "rect");
          rect.setAttribute("x", col * PITCH);
          rect.setAttribute("y", row * PITCH + TOP);
          rect.setAttribute("width", CELL);
          rect.setAttribute("height", CELL);
          rect.setAttribute("rx", 2);
          rect.setAttribute("fill", colors[d.level]);
          // GitHub's faint outline keeps even the empty cells defined
          rect.setAttribute("stroke", "rgba(255, 255, 255, 0.05)");
          var nice = new Date(d.date + "T00:00:00");
          rect.setAttribute("data-tip",
            (d.count === 0 ? "No" : d.count) +
            " contribution" + (d.count === 1 ? "" : "s") + " on " +
            fullMonths[nice.getMonth()] + " " + nice.getDate());
          svg.appendChild(rect);
        }
        wrap.appendChild(svg);

        // Instant tooltip, GitHub-style: the native <title> tooltip only
        // shows after the browser's long hover delay, so draw our own
        var tip = document.createElement("div");
        tip.className = "gh-tip";
        wrap.appendChild(tip);

        svg.addEventListener("mouseover", function (e) {
          var cell = e.target.closest("rect");
          if (!cell) return;
          tip.textContent = cell.getAttribute("data-tip");
          var r = cell.getBoundingClientRect();
          var w = wrap.getBoundingClientRect();
          // The hover card is scaled/tilted (its 3d-tile effect), so
          // screen pixels are slightly larger than the card's own units.
          // Convert the measured position back into local units, or the
          // tooltip drifts right the further along the year the cell is.
          var sx = w.width / wrap.offsetWidth;
          var sy = w.height / wrap.offsetHeight;
          // cell center in the wrap's padding box (absolute positioning
          // is relative to inside the border, so subtract it)
          var cx = (r.left - w.left + r.width / 2) / sx - wrap.clientLeft;
          var cy = (r.top - w.top) / sy - wrap.clientTop;
          // bubble centered on the cell, clamped inside the graph box
          var half = tip.offsetWidth / 2;
          var x = Math.min(wrap.clientWidth - half - 2,
            Math.max(half + 2, cx));
          tip.style.left = x + "px";
          tip.style.top = (cy - 7) + "px";
          // the arrow stays pinned to the cell even if the bubble clamped
          tip.style.setProperty("--ax", (half + cx - x) + "px");
          tip.classList.add("on");
        });
        svg.addEventListener("mouseleave", function () {
          tip.classList.remove("on");
        });

        var total = document.querySelector(".gh-total");
        if (total) {
          total.textContent = data.total.lastYear.toLocaleString() +
            " contributions in the last year";
        }
      })
      .catch(function () {
        // Offline or proxy down: the card still works, just without the graph
        wrap.textContent = "github.com/spitfiresb";
        wrap.classList.add("gh-graph-fallback");
      });
  }

  buildGhGraph();

  /* --- The drawn pill outlines (About me, the column labels) --- */

  /* The two halves are laid out here rather than in the markup because the
     geometry follows the link's rendered box: the cap radius is half its
     height, so the path can only be written once the text has its final
     size. Each half starts at the bottom centre and runs up its own side
     to the top centre, so the stroke opens symmetrically from the bottom.
     The 1px overlap at the top keeps the two ends from leaving a gap. */
  function sizePillBorder(svg) {
    var left = svg.querySelector(".pb-l");
    var right = svg.querySelector(".pb-r");
    var box = svg.parentElement;
    var w = box.offsetWidth;
    var h = box.offsetHeight;
    if (!w || !h) return;

    var r = h / 2;      // cap radius
    var mid = w / 2;    // bottom/top centre, where the halves meet

    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    right.setAttribute(
      "d",
      "M" + mid + " " + h + " L" + (w - r) + " " + h +
      " A" + r + " " + r + " 0 0 0 " + (w - r) + " 0 L" + (mid - 1) + " 0"
    );
    left.setAttribute(
      "d",
      "M" + mid + " " + h + " L" + r + " " + h +
      " A" + r + " " + r + " 0 0 1 " + r + " 0 L" + (mid + 1) + " 0"
    );
  }

  var pillBorders = document.querySelectorAll(".pill-border");
  if (pillBorders.length) {
    var sizeAllPills = function () {
      Array.prototype.forEach.call(pillBorders, sizePillBorder);
    };
    sizeAllPills();
    // the fallback face is wider than Söhne, so the box moves once the
    // real one lands — redraw rather than stroke a stale outline
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(sizeAllPills);
    }
    window.addEventListener("resize", sizeAllPills);
  }

  /* --- Wire up links --- */

  /* About me: the pill collapses in on itself, then the page opens. The
     modifier keys are left alone so cmd-click still opens a new tab, and
     reduced-motion users just follow the link. */
  document.addEventListener("click", function (e) {
    var link = e.target.closest(".about a");
    if (!link) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    e.preventDefault();

    // pin the box open, flush that frame, then let it shut — so the
    // collapse plays from full width whether or not the pointer hovered
    link.classList.add("open");
    void link.offsetWidth;
    link.classList.add("collapsing");

    // a fixed handoff rather than transitionend: the event never fires if
    // the tab is backgrounded or transitions are off, and a link that
    // sometimes doesn't navigate is worse than one that animates unseen
    setTimeout(function () {
      window.location.href = link.href;
    }, 340);
  });

  document.addEventListener("click", function (e) {
    var link = e.target.closest("a[data-window]");
    if (!link) return;
    e.preventDefault();
    createWindow({
      id: link.dataset.window,
      title: link.textContent + " — " + document.title,
      url: link.href,
      content: linkedinContent(link.href)
    });
  });
})();
