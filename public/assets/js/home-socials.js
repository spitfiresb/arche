/* Original expanding social previews and live GitHub contribution calendar. */
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
      var viewport = document.documentElement.clientWidth;

      if (cards[i].classList.contains("gh-card")) {
        // Keep the full calendar inside a phone viewport, shifting its
        // reveal left when there isn't enough room beside the icon.
        var graphWidth = Math.min(29 * parseFloat(getComputedStyle(host).fontSize),
          viewport - 2 * EDGE_GUTTER);
        var offset = Math.min(0,
          viewport - EDGE_GUTTER - host.getBoundingClientRect().left - graphWidth);
        host.style.setProperty("--ghw", graphWidth + "px");
        host.style.setProperty("--gh-offset", offset + "px");
      } else {
        // room between the viewport edge and the mark's right edge,
        // exactly the span a leftward-opening card has to live in.
        // The rect is zoomed px under the desktop zoom: 0.9; --liw and
        // the minimum are layout px, so convert (see about.js).
        var zf = document.body.offsetWidth
          ? document.body.getBoundingClientRect().width
            / document.body.offsetWidth : 1;
        var room = host.getBoundingClientRect().right / zf - EDGE_GUTTER;
        var opensLeft = room >= Math.min(OPEN_LEFT_MIN, width);
        host.classList.toggle("opens-left", opensLeft);
        if (opensLeft) width = Math.min(width, room);
        width = Math.min(width, viewport - 2 * EDGE_GUTTER);
        var linkedInOffset = opensLeft ? 0 : Math.min(0,
          viewport - EDGE_GUTTER - host.getBoundingClientRect().left - width);
        host.style.setProperty("--li-offset", linkedInOffset + "px");
      }

      host.style.setProperty("--liw", width + "px");
    }
  }

  sizeHoverCards();
  window.addEventListener("resize", sizeHoverCards);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(sizeHoverCards);
  }

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

})();
