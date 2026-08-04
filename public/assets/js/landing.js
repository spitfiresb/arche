/* Landing-page behaviour: the two hover preview cards, the live GitHub
   contribution calendar, the drawn pill outlines, and the corner peel's
   peek-then-peel-away navigation to About. */
(function () {
  "use strict";

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
        // room between the viewport edge and the mark's right edge,
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
    // real one lands, so redraw rather than stroke a stale outline
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(sizeAllPills);
    }
    window.addEventListener("resize", sizeAllPills);
  }

  /* The corner peel: one continuous sweep from the first frame of the
     click. The transition curve starts gentle (that IS the peek) and
     accelerates, so there's no staged pause; the crease crosses the whole
     viewport, revealing the About page already rendered in the iframe
     behind the fold.

     There is NO navigation at the end — a document swap repaints the
     world and reads as a glitch, however well the frames line up. The
     already-rendered iframe is promoted to BE the page instead: it gets
     the pointer and keyboard, the URL flips to /about with pushState, and
     a 'peel:wake' message starts its held opening (the kicker type-out,
     the climber's drop). Browser back (or the About page's own back mark,
     relayed by postMessage) folds the corner back up the same way.

     Registered in the CAPTURE phase: transition.js also listens for link
     clicks at the document level and was registered first, so this is the
     only way to run ahead of it; the preventDefault here is what makes its
     handler stand down (it checks e.defaultPrevented). Modifier clicks
     pass through untouched so cmd-click still opens a new tab, and
     reduced-motion users just follow the link to the real /about. */
  var peelLink = document.querySelector("a.peel");
  var behind = document.querySelector(".peel-behind");
  var homeTitle = document.title;
  var peeling = false;

  function commitPeel() {
    document.documentElement.classList.add("peeled");
    if (!behind) return;
    behind.style.pointerEvents = "auto";
    behind.removeAttribute("aria-hidden");
    behind.removeAttribute("tabindex");
    try {
      document.title = behind.contentDocument.title;
      behind.contentWindow.postMessage("peel:wake", location.origin);
      behind.contentWindow.focus();
    } catch (err) { /* frame not ready: it stays a frozen page, still legible */ }
  }

  function unpeel() {
    peeling = false;
    document.documentElement.classList.remove("peeled", "peeling");
    if (peelLink) {
      // snap shut, no reverse sweep: going back should just BE the home
      // page again, with the corner already folded. Kill the transition
      // for one frame so removing .away lands instantly.
      peelLink.style.transition = "none";
      peelLink.classList.remove("away");
      void peelLink.offsetWidth;
      peelLink.style.transition = "";
    }
    document.title = homeTitle;
    if (!behind) return;
    behind.style.pointerEvents = "none";
    behind.setAttribute("aria-hidden", "true");
    behind.setAttribute("tabindex", "-1");
  }

  document.addEventListener("click", function (e) {
    var link = e.target.closest("a.peel");
    if (!link) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (peeling) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      window.location.href = link.href;
      return;
    }

    peeling = true;
    document.documentElement.classList.add("peeling");   // fades the hint
    link.classList.add("away");
    history.pushState({ peeled: true }, "", link.href);

    // a fixed handoff rather than transitionend (which never fires in a
    // backgrounded tab), timed to the transition's end: by then the crease
    // has cleared the far corner and the iframe owns every pixel.
    setTimeout(commitPeel, 1500);
  }, true);

  // Browser back from the peeled state folds the corner back up; forward
  // re-opens it (instantly recommitting if the animation already ran).
  window.addEventListener("popstate", function () {
    if (location.pathname === "/about" && history.state && history.state.peeled) {
      if (peelLink) { peeling = true; document.documentElement.classList.add("peeling"); peelLink.classList.add("away"); }
      commitPeel();
    } else {
      unpeel();
    }
  });

  // The About page's own back mark, relayed from inside the frame
  window.addEventListener("message", function (e) {
    if (e.origin !== location.origin) return;
    if (e.data === "peel:back") history.back();
  });

  // A bfcache restore resurrects the page exactly as it left. If it left
  // mid-peel without the history entry settled, strip the peel state so
  // the home page comes back whole.
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    if (location.pathname !== "/about") unpeel();
  });
})();
