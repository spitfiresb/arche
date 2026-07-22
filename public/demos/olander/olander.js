/* Olander Agents — scripted replica of the shipped chat product.
 *
 * The real app streams model tokens over an HTTP route and runs its tool calls
 * against a fixed-IP proxy in front of the customer's ERP. Neither can be
 * reached from a portfolio page, so this file replays recorded turns instead:
 * the same tool-call cards, the same steps disclosure, the same streaming
 * answer, driven by canned data on the same timings the live product hits.
 *
 * Everything a visitor can do — click a suggestion, type a question, expand a
 * tool call, open the steps — behaves as it does in the product. Questions
 * that don't match a recorded turn fall through to a catalog search on
 * whatever they typed, so the demo never dead-ends.
 *
 * Loaded only by demos/olander/index.html, which runs standalone and as the
 * iframe behind the live-demo tile on /work/contract.
 *
 * EVERY VALUE BELOW IS FABRICATED. This page is public, so no part number,
 * quantity, customer, order, or dollar figure may be copied from the client's
 * live ERP — invent them. The only things carried over from the real system
 * are the Prophet 21 view names, which are Epicor's schema and shared by
 * every P21 site, and manufacturer catalog numbers anyone can look up.
 */
(function () {
  'use strict';

  var still = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var el = {
    stream: document.querySelector('[data-stream]'),
    scroll: document.querySelector('[data-scroll]'),
    empty: document.querySelector('[data-empty]'),
    suggestions: document.querySelector('[data-suggestions]'),
    history: document.querySelector('[data-history]'),
    composer: document.querySelector('[data-composer]'),
    input: document.querySelector('[data-input]'),
    send: document.querySelector('.oa-send'),
    stop: document.querySelector('.oa-stop'),
    title: document.querySelector('[data-title]'),
    titleText: document.querySelector('.oa-title-text')
  };

  /* ------------------------------------------------------------- dates */

  // Recorded rows carry live dates rather than frozen ones: an ERP demo that
  // shows last year's promise dates reads as a screenshot, not a system.
  function shift(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return d;
  }
  function iso(d) {
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }
  function weekStart() {
    var d = new Date();
    return shift(-((d.getDay() + 6) % 7));           // Monday of this week
  }
  function weekEnd() {
    var d = new Date(weekStart());
    d.setDate(d.getDate() + 6);
    return d;
  }
  function longDate(d) {
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  }

  var MON = iso(weekStart());
  var SUN = iso(weekEnd());

  /* ----------------------------------------------------------- scripts */

  // One recorded turn. `keys` are the substrings pickTurn scores a typed
  // question against; `steps` are the tool calls in order, where `wait` is how
  // long that call spins before its `rows` land; `answer` is the reply as
  // blocks — { p } and { ul } type word by word, { table } lands whole.
  var TURNS = [
    {
      title: '38C150SHCS on-hand',
      q: 'On-hand for 38C150SHCS across all warehouses',
      keys: ['38c150shcs', 'on-hand', 'on hand', 'stock', 'warehouse', 'inventory', 'shcs'],
      steps: [
        {
          label: 'Catalog search',
          sublabel: '"38C150SHCS"',
          detail: [['Query', '38C150SHCS'], ['Top K', '5']],
          wait: 850,
          rows: [
            { item_id: '38C150SHCS', description: '3/8-16 X 1-1/2 SOC CAP SST', score: 0.94 },
            { item_id: '38C125SHCS', description: '3/8-16 X 1-1/4 SOC CAP SST', score: 0.81 },
            { item_id: '38C200SHCS', description: '3/8-16 X 2 SOC CAP SST', score: 0.78 }
          ]
        },
        {
          label: 'Stock-on-hand lookup',
          sublabel: 'item_id = 38C150SHCS',
          detail: [
            ['View', 'p21_view_inv_loc'],
            ['Filter', "item_id eq '38C150SHCS'"],
            ['Columns', 'location_id,qty_on_hand,qty_allocated,qty_on_order'],
            ['Top', '50']
          ],
          wait: 1150,
          rows: [
            { location_id: 'HQ01', qty_on_hand: 1480, qty_allocated: 145, qty_on_order: 0 },
            { location_id: 'POR02', qty_on_hand: 240, qty_allocated: 30, qty_on_order: 500 },
            { location_id: 'SEA03', qty_on_hand: 95, qty_allocated: 0, qty_on_order: 0 }
          ]
        }
      ],
      answer: [
        { p: '**38C150SHCS** — 3/8-16 X 1-1/2 SOC CAP SST. **1,815** on hand across three branches, 1,640 available once allocations come off.' },
        {
          table: {
            columns: [
              { label: 'Branch' },
              { label: 'On hand', align: 'right' },
              { label: 'Allocated', align: 'right' },
              { label: 'Available', align: 'right' }
            ],
            rows: [
              ['HQ01 — Portland', '1,480', '145', '1,335'],
              ['POR02 — Eugene', '240', '30', '210'],
              ['SEA03 — Kent', '95', '0', '95']
            ]
          }
        },
        { p: 'Another 500 land at Eugene on PO 118432, promised ' + longDate(shift(11)) + '.' }
      ],
      citation: 'catalog search (3 matches), p21_view_inv_loc (3 rows)'
    },

    {
      title: 'Open orders — this week',
      q: 'Open sales orders shipping this week',
      keys: ['open order', 'sales order', 'orders', 'shipping', 'ship', 'this week', 'promise'],
      steps: [
        {
          label: 'Sales order search',
          sublabel: 'with filter',
          detail: [
            ['View', 'p21_view_oe_hdr'],
            ['Filter', "completed eq 'N' and promise_date ge " + MON + " and promise_date le " + SUN],
            ['Columns', 'order_no,customer_id,customer_name,promise_date,order_total'],
            ['Top', '100']
          ],
          wait: 1250,
          rows: [
            { order_no: '553104', customer_name: 'Cascade Machine Works', promise_date: iso(weekStart()), order_total: 14820.5 },
            { order_no: '553112', customer_name: 'Willamette Fabrication', promise_date: iso(shift(0)), order_total: 9240 },
            { order_no: '553119', customer_name: 'Rainier Hydraulics', promise_date: iso(shift(1)), order_total: 7115.75 },
            { order_no: '553126', customer_name: 'Puget Steel Supply', promise_date: iso(shift(1)), order_total: 4860 },
            { order_no: '553131', customer_name: 'Deschutes Equipment', promise_date: iso(weekEnd()), order_total: 3402.25 },
            { order_no: '553138', customer_name: 'Coast Range Millwork', promise_date: iso(weekEnd()), order_total: 1843.9 }
          ]
        }
      ],
      answer: [
        { p: 'Six orders are still open with a promise date this week — **$41,282** in all.' },
        {
          table: {
            columns: [
              { label: 'Order', mono: true },
              { label: 'Customer' },
              { label: 'Promise' },
              { label: 'Total', align: 'right' }
            ],
            rows: [
              ['553104', 'Cascade Machine Works', iso(weekStart()), '$14,820.50'],
              ['553112', 'Willamette Fabrication', iso(shift(0)), '$9,240.00'],
              ['553119', 'Rainier Hydraulics', iso(shift(1)), '$7,115.75'],
              ['553126', 'Puget Steel Supply', iso(shift(1)), '$4,860.00'],
              ['553131', 'Deschutes Equipment', iso(weekEnd()), '$3,402.25'],
              ['553138', 'Coast Range Millwork', iso(weekEnd()), '$1,843.90']
            ]
          }
        },
        { p: 'Two need watching: **553104** is allocated against Kent stock rather than Portland, and **553119** is waiting on PO 118432.' }
      ],
      citation: 'p21_view_oe_hdr (6 rows)'
    },

    {
      title: 'Helicoil for 3/8-16',
      q: 'What size helicoil goes in a 3/8-16 hole?',
      keys: ['helicoil', 'heli-coil', 'insert', 'thread repair', '3/8-16'],
      steps: [
        {
          label: 'Catalog search',
          sublabel: '"helicoil insert 3/8-16"',
          detail: [['Query', 'helicoil insert 3/8-16'], ['Top K', '5']],
          wait: 900,
          rows: [
            { item_id: '1185-6CN375', description: 'HELI-COIL INSERT 3/8-16 X 1D SST', score: 0.91 },
            { item_id: '1185-6CN562', description: 'HELI-COIL INSERT 3/8-16 X 1.5D SST', score: 0.88 },
            { item_id: '4CPB-6', description: 'HELI-COIL TAP STI 3/8-16', score: 0.74 }
          ]
        },
        {
          label: 'Stock-on-hand lookup',
          sublabel: 'item_id = 1185-6CN375',
          detail: [
            ['View', 'p21_view_inv_loc'],
            ['Filter', "item_id eq '1185-6CN375'"],
            ['Columns', 'location_id,qty_on_hand,qty_allocated'],
            ['Top', '50']
          ],
          wait: 1000,
          rows: [
            { location_id: 'HQ01', qty_on_hand: 340, qty_allocated: 0 },
            { location_id: 'POR02', qty_on_hand: 60, qty_allocated: 12 }
          ]
        }
      ],
      answer: [
        { p: 'A 3/8-16 hole takes a **3/8-16 Heli-Coil insert** — same nominal thread as the bolt, not the oversize drill.' },
        {
          ul: [
            'Drill the hole to **25/64 (0.3906)**, then tap with an **STI 3/8-16** tap — a standard 3/8-16 tap will not cut the oversize form the insert needs.',
            'Free length: `1185-6CN375` is 1× diameter (0.375), the usual choice in steel. Go to `1185-6CN562` at 1.5× for aluminum or a heavier pull-out load.'
          ]
        },
        { p: '**400 on hand** of the 1D insert — 340 at Portland, 60 at Eugene. The STI tap `4CPB-6` shows 6 at Portland.' }
      ],
      citation: 'catalog search (3 matches), p21_view_inv_loc (2 rows)'
    },

    {
      title: '5/16-18 flange nut',
      q: 'Find a 5/16-18 stainless flange nut',
      keys: ['flange nut', 'flange', 'nut', '5/16-18 stainless'],
      steps: [
        {
          label: 'Catalog search',
          sublabel: '"5/16-18 stainless flange nut"',
          detail: [['Query', '5/16-18 stainless flange nut'], ['Top K', '5']],
          wait: 950,
          rows: [
            { item_id: '31FLNS', description: '5/16-18 SERRATED FLANGE NUT 18-8 SST', score: 0.93 },
            { item_id: '31FLNS316', description: '5/16-18 SERRATED FLANGE NUT 316 SST', score: 0.87 },
            { item_id: '31FLNZ', description: '5/16-18 SERRATED FLANGE NUT ZINC', score: 0.62 }
          ]
        },
        {
          label: 'Stock-on-hand lookup',
          sublabel: 'with filter',
          detail: [
            ['View', 'p21_view_inv_loc'],
            ['Filter', "item_id in ('31FLNS','31FLNS316')"],
            ['Columns', 'item_id,location_id,qty_on_hand'],
            ['Top', '50']
          ],
          wait: 1050,
          rows: [
            { item_id: '31FLNS', location_id: 'HQ01', qty_on_hand: 4800 },
            { item_id: '31FLNS', location_id: 'POR02', qty_on_hand: 1200 },
            { item_id: '31FLNS316', location_id: 'HQ01', qty_on_hand: 750 }
          ]
        }
      ],
      answer: [
        { p: 'Two stainless options, both serrated flange:' },
        {
          ul: [
            '`31FLNS` — 18-8 stainless, **6,000 on hand** (4,800 Portland, 1,200 Eugene). The stock item.',
            '`31FLNS316` — 316 stainless for marine or chemical exposure, **750 on hand** at Portland.'
          ]
        },
        { p: 'The zinc equivalent `31FLNZ` is cheaper if corrosion is not a factor — say the word and I will pull pricing.' }
      ],
      citation: 'catalog search (3 matches), p21_view_inv_loc (3 rows)'
    }
  ];

  var HISTORY = [
    { label: 'Today', rows: ['38C150SHCS on-hand', 'Bronze cap screw vendors', 'PO 118432 status'] },
    { label: 'Yesterday', rows: ['Past-due invoices — Cascade', 'Helicoil for 3/8-16'] },
    { label: 'Last 7 days', rows: ['Open orders — Rainier Hydraulics', 'M10 1.25 SHCS stock check', 'Customers added this month'] }
  ];

  // Chip label paired with the prompt it drops into the composer.
  var FOLLOW_UPS = [
    ['Shorter', 'Make that response shorter and more direct.'],
    ['Email-ready', 'Reformat that as a short email I can send to a customer.'],
    ['Continue', 'Continue.']
  ];

  /* --------------------------------------------------------- primitives */

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function svg(markup) {
    var wrap = document.createElement('span');
    wrap.innerHTML = markup;
    return wrap.firstElementChild;
  }

  function icon(paths, size, extra) {
    return svg('<svg viewBox="0 0 16 16" width="' + size + '" height="' + size
      + '" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"'
      + ' stroke-linejoin="round" class="' + (extra || '') + '" aria-hidden="true">'
      + paths + '</svg>');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // The product renders assistant text as GFM. The recorded answers only ever
  // use bold and inline code, so that is all this understands — a full parser
  // would be a lot of code for two constructs.
  function inline(text) {
    return escapeHtml(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, still ? Math.min(ms, 60) : ms); });
  }

  var stuck = true;
  el.scroll.addEventListener('scroll', function () {
    var dist = el.scroll.scrollHeight - el.scroll.scrollTop - el.scroll.clientHeight;
    stuck = dist < 80;
  });
  function pin() {
    if (stuck) el.scroll.scrollTop = el.scroll.scrollHeight;
  }

  /* ------------------------------------------------------------- tables */

  // Mirrors ResultsTable's column inference: money and counts right-align,
  // identifiers set in mono. Keeps a tool-result preview and a model-emitted
  // table looking like the same object.
  function inferFormat(key) {
    var k = String(key).toLowerCase();
    if (/(price|cost|amount|total|score)/.test(k)) return 'num';
    if (/(qty|quantity|count|stock|on_hand|onhand)/.test(k)) return 'num';
    if (/(_id|^id$|item|order|sku|part)/.test(k)) return 'id';
    return 'text';
  }

  function tableFrom(columns, rows, note) {
    var wrap = node('div', 'oa-table-wrap');
    var scroll = node('div', 'oa-table-scroll');
    var table = node('table', 'oa-table');

    var thead = node('thead');
    var htr = node('tr');
    columns.forEach(function (c) {
      var th = node('th', c.align === 'right' ? 'is-right' : '', c.label);
      th.scope = 'col';
      htr.appendChild(th);
    });
    thead.appendChild(htr);

    var tbody = node('tbody');
    rows.forEach(function (r) {
      var tr = node('tr');
      columns.forEach(function (c, i) {
        var cls = (c.align === 'right' ? 'is-right ' : '') + (c.mono ? 'is-mono' : '');
        tr.appendChild(node('td', cls.trim(), r[i] == null || r[i] === '' ? '—' : String(r[i])));
      });
      tbody.appendChild(tr);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    scroll.appendChild(table);
    wrap.appendChild(scroll);
    if (note) wrap.appendChild(node('div', 'oa-table-foot', note));
    return wrap;
  }

  // Tool details render the raw result rows — keys as headers, exactly as the
  // product does when you expand a call.
  function rawTable(rows) {
    var keys = Object.keys(rows[0]);
    var columns = keys.map(function (k) {
      var fmt = inferFormat(k);
      return { label: k, align: fmt === 'num' ? 'right' : 'left', mono: fmt === 'id' };
    });
    var body = rows.slice(0, 5).map(function (r) {
      return keys.map(function (k) {
        var v = r[k];
        return typeof v === 'number' ? v.toLocaleString() : v;
      });
    });
    var note = rows.length > 5 ? 'Showing 5 of ' + rows.length + ' rows.' : null;
    return tableFrom(columns, body, note);
  }

  /* -------------------------------------------------------- tool cards */

  function toolCard(step) {
    var card = node('div', 'oa-tool oa-in');

    var head = node('button', 'oa-tool-head');
    head.type = 'button';
    head.setAttribute('aria-expanded', 'false');

    var glyph = node('span', 'oa-tool-glyph');
    glyph.appendChild(node('span', 'oa-tool-spinner'));

    var body = node('div', 'oa-tool-body');
    var labels = node('div', 'oa-tool-labels');
    labels.appendChild(node('span', 'oa-tool-label', step.label));
    if (step.sublabel) labels.appendChild(node('span', 'oa-tool-sublabel', step.sublabel));
    var state = node('div', 'oa-tool-state', 'Searching…');
    body.appendChild(labels);
    body.appendChild(state);

    head.appendChild(glyph);
    head.appendChild(body);
    head.appendChild(icon('<path d="M3 6l5 5 5-5"/>', 12, 'oa-tool-chevron'));

    var detail = node('div', 'oa-tool-detail');
    var dl = node('dl', 'oa-detail-grid');
    step.detail.forEach(function (pair) {
      dl.appendChild(node('dt', '', pair[0]));
      dl.appendChild(node('dd', '', pair[1]));
    });
    detail.appendChild(dl);

    head.addEventListener('click', function () {
      var open = card.classList.toggle('is-open');
      head.setAttribute('aria-expanded', String(open));
      pin();
    });

    card.appendChild(head);
    card.appendChild(detail);

    return {
      node: card,
      settle: function () {
        glyph.innerHTML = '';
        glyph.classList.add('is-success');
        glyph.appendChild(icon('<path d="M3 8.5L6.5 12L13 4.5" stroke-width="2.5"/>', 10));
        var n = step.rows.length;
        state.textContent = 'Found ' + n + ' row' + (n === 1 ? '' : 's');

        var copies = node('div', 'oa-copyrow');
        ['CSV', 'TSV', 'MD'].forEach(function (fmt) {
          var b = node('button', 'oa-copybtn', fmt);
          b.type = 'button';
          b.addEventListener('click', function () {
            b.textContent = 'Copied';
            setTimeout(function () { b.textContent = fmt; }, 1500);
          });
          copies.appendChild(b);
        });
        detail.appendChild(copies);
        detail.appendChild(rawTable(step.rows));
      }
    };
  }

  /* ------------------------------------------------------------ turn UI */

  function addUser(text) {
    var row = node('div', 'oa-user oa-in');
    row.appendChild(node('div', 'oa-user-bubble', text));
    el.stream.appendChild(row);
    pin();
  }

  function assistantColumn() {
    var row = node('div', 'oa-assistant oa-in');
    var avatar = node('div', 'oa-avatar', 'O');
    avatar.setAttribute('aria-hidden', 'true');
    var col = node('div', 'oa-assistant-col');
    row.appendChild(avatar);
    row.appendChild(col);
    el.stream.appendChild(row);
    pin();
    return col;
  }

  function stepsContainer(col) {
    var wrap = node('div', 'oa-steps is-inflight is-open');
    var toggle = node('button', 'oa-steps-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'true');
    toggle.appendChild(icon('<path d="M6 3l5 5-5 5" stroke-width="2"/>', 10, 'oa-steps-chevron'));
    var label = node('span');
    toggle.appendChild(label);

    var panel = node('div', 'oa-steps-panel');
    var clip = node('div', 'oa-steps-clip');
    var inner = node('div', 'oa-steps-inner');
    clip.appendChild(inner);
    panel.appendChild(clip);
    wrap.appendChild(toggle);
    wrap.appendChild(panel);
    col.appendChild(wrap);

    var count = 0;
    function paintLabel() {
      var open = wrap.classList.contains('is-open');
      label.textContent = (open ? 'Hide ' : 'Show ') + count + (count === 1 ? ' step' : ' steps');
    }

    toggle.addEventListener('click', function () {
      var open = wrap.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
      paintLabel();
      pin();
    });

    return {
      add: function (n) { count++; inner.appendChild(n); paintLabel(); pin(); },
      // Streaming forces the panel open so the rep can watch progress; when
      // the turn settles it collapses to a pill, which is the only thing that
      // moves — no content relocates.
      settle: function () {
        wrap.classList.remove('is-inflight', 'is-open');
        toggle.setAttribute('aria-expanded', 'false');
        paintLabel();
      }
    };
  }

  function typingBubble(col) {
    var t = node('div', 'oa-typing oa-in');
    t.appendChild(node('span'));
    t.appendChild(node('span'));
    t.appendChild(node('span'));
    col.appendChild(t);
    pin();
    return t;
  }

  // Streams one recorded answer into the bubble. Text blocks arrive in word
  // chunks behind a caret; tables land whole, the way a completed markdown
  // table does when its closing row parses.
  async function streamAnswer(col, blocks) {
    var bubble = node('div', 'oa-answer');
    col.appendChild(bubble);
    pin();

    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      if (block.table) {
        await sleep(180);
        bubble.appendChild(tableFrom(block.table.columns, block.table.rows));
        pin();
        continue;
      }
      if (block.ul) {
        var list = node('ul');
        bubble.appendChild(list);
        for (var j = 0; j < block.ul.length; j++) {
          var li = node('li');
          list.appendChild(li);
          await typeInto(li, block.ul[j]);
        }
        continue;
      }
      var p = node('p');
      bubble.appendChild(p);
      await typeInto(p, block.p);
    }
  }

  async function typeInto(target, text) {
    var words = text.split(' ');
    var shown = '';
    for (var i = 0; i < words.length; i++) {
      shown += (i ? ' ' : '') + words[i];
      target.innerHTML = inline(shown) + '<span class="oa-cursor"></span>';
      pin();
      await sleep(18 + Math.random() * 34);
    }
    target.innerHTML = inline(shown);
  }

  function chips(col) {
    var row = node('div', 'oa-chips');
    FOLLOW_UPS.forEach(function (pair) {
      var b = node('button', 'oa-chip', pair[0]);
      b.type = 'button';
      b.addEventListener('click', function () {
        el.input.value = pair[1];
        syncSend();
        el.input.focus();
      });
      row.appendChild(b);
    });
    col.appendChild(row);
  }

  var CLIPBOARD = '<rect x="5" y="5" width="9" height="9" rx="1.5"/>'
    + '<path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"/>';
  var TICK = '<path d="M3 8.5L6.5 12L13 4.5" stroke-width="2"/>';

  function actions(col) {
    var row = node('div', 'oa-actions');
    var regen = node('button', 'oa-action');
    regen.type = 'button';
    regen.appendChild(icon('<path d="M14 8a6 6 0 0 1-10.5 4M2 8a6 6 0 0 1 10.5-4"/><path d="M14 3v3.5h-3.5"/><path d="M2 13v-3.5h3.5"/>', 13));
    regen.appendChild(node('span', '', 'Regenerate response'));

    var copy = node('button', 'oa-action-icon');
    copy.type = 'button';
    copy.setAttribute('aria-label', 'Copy message');
    function paint(paths) {
      copy.innerHTML = '';
      copy.appendChild(icon(paths, 13));
    }
    paint(CLIPBOARD);
    copy.addEventListener('click', function () {
      paint(TICK);
      setTimeout(function () { paint(CLIPBOARD); }, 1500);
    });

    row.appendChild(regen);
    row.appendChild(copy);
    col.appendChild(row);
  }

  /* -------------------------------------------------------- turn runner */

  var busy = false;

  function setInFlight(on) {
    busy = on;
    el.send.hidden = on;
    el.stop.hidden = !on;
    syncSend();
  }

  async function run(turn, question) {
    if (busy) return;
    setInFlight(true);
    if (el.empty) { el.empty.remove(); el.empty = null; }
    setTitle(turn.title);

    addUser(question);
    await sleep(320);

    var col = assistantColumn();
    var typing = typingBubble(col);
    await sleep(520);
    typing.remove();

    var steps = stepsContainer(col);
    for (var i = 0; i < turn.steps.length; i++) {
      var card = toolCard(turn.steps[i]);
      steps.add(card.node);
      await sleep(turn.steps[i].wait);
      card.settle();
      pin();
      await sleep(240);
    }

    await streamAnswer(col, turn.answer);
    steps.settle();

    col.appendChild(node('div', 'oa-citation', 'Data: ' + turn.citation));
    chips(col);
    actions(col);
    pin();

    setInFlight(false);
  }

  // Questions that miss every recorded turn still get a real-looking answer:
  // the catalog search the product would run first, against their own words.
  function fallbackTurn(text) {
    var q = text.length > 48 ? text.slice(0, 45) + '…' : text;
    return {
      title: q,
      steps: [{
        label: 'Catalog search',
        sublabel: '"' + q + '"',
        detail: [['Query', text], ['Top K', '5']],
        wait: 1000,
        rows: [
          { item_id: '38C150SHCS', description: '3/8-16 X 1-1/2 SOC CAP SST', score: 0.58 },
          { item_id: '31FLNS', description: '5/16-18 SERRATED FLANGE NUT 18-8 SST', score: 0.54 },
          { item_id: '1185-6CN375', description: 'HELI-COIL INSERT 3/8-16 X 1D SST', score: 0.49 }
        ]
      }],
      answer: [
        { p: 'This is a recorded demo, so the catalog is a small slice of the real one — nothing in it matches **' + text.replace(/\*/g, '') + '** closely. The nearest items:' },
        {
          table: {
            columns: [{ label: 'Item', mono: true }, { label: 'Description' }, { label: 'Score', align: 'right' }],
            rows: [
              ['38C150SHCS', '3/8-16 X 1-1/2 SOC CAP SST', '0.58'],
              ['31FLNS', '5/16-18 SERRATED FLANGE NUT 18-8 SST', '0.54'],
              ['1185-6CN375', 'HELI-COIL INSERT 3/8-16 X 1D SST', '0.49']
            ]
          }
        },
        { p: 'Against the live ERP the same question would run a filtered view query and answer from the rows it came back with. Try a suggestion chip to see a full lookup.' }
      ],
      citation: 'catalog search (3 matches)'
    };
  }

  function pickTurn(text) {
    var t = text.toLowerCase();
    var best = null;
    var bestScore = 0;
    TURNS.forEach(function (turn) {
      var score = 0;
      turn.keys.forEach(function (k) { if (t.indexOf(k) !== -1) score += k.length; });
      if (score > bestScore) { bestScore = score; best = turn; }
    });
    return bestScore >= 4 ? best : fallbackTurn(text);
  }

  /* ---------------------------------------------------------- app chrome */

  // A conversation is titled from its first message and keeps that title for
  // every later turn — same as the product. Later turns are continuations of
  // the same chat, not new rows in the history list.
  var titled = false;
  function setTitle(title) {
    if (titled) return;
    titled = true;
    el.titleText.textContent = title;
    el.title.hidden = false;
    var first = el.history.querySelector('.oa-row');
    if (first) {
      first.querySelector('span').textContent = title;
      first.classList.add('is-active');
    }
  }

  function paintHistory() {
    HISTORY.forEach(function (group) {
      var wrap = node('div', 'oa-group');
      wrap.appendChild(node('div', 'oa-group-label', group.label));
      var ul = node('ul');
      group.rows.forEach(function (title) {
        var li = node('li', 'oa-row');
        li.appendChild(node('span', '', title));
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
      el.history.appendChild(wrap);
    });
  }

  // Every recorded turn gets a chip. Clicking one runs that turn directly —
  // routing its own question back through pickTurn would only find it again.
  function paintSuggestions() {
    TURNS.forEach(function (turn) {
      var b = node('button', 'oa-suggestion', turn.q);
      b.type = 'button';
      b.addEventListener('click', function () {
        cancelAutoplay();
        run(turn, turn.q);
      });
      el.suggestions.appendChild(b);
    });
  }

  function syncSend() {
    el.send.disabled = busy || el.input.value.trim().length === 0;
  }

  /* -------------------------------------------------------------- input */

  el.input.addEventListener('input', function () { cancelAutoplay(); syncSend(); });
  el.input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      el.composer.requestSubmit();
    }
  });
  el.composer.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = el.input.value.trim();
    if (!text || busy) return;
    cancelAutoplay();
    el.input.value = '';
    syncSend();
    run(pickTurn(text), text);
  });
  el.stop.addEventListener('click', function () { setInFlight(false); });
  document.querySelector('[data-new-chat]').addEventListener('click', function () {
    if (busy) return;
    cancelAutoplay();
    location.reload();
  });

  /* ----------------------------------------------------------- autoplay */

  // The demo lives inside a preview tile on a portfolio page, so it has to
  // show what the product does without anyone touching it — it types the
  // first question itself. Any real interaction cancels the rest.
  var autoplay = true;
  function cancelAutoplay() { autoplay = false; }

  async function typeQuestion(text) {
    for (var i = 0; i < text.length && autoplay; i++) {
      el.input.value = text.slice(0, i + 1);
      syncSend();
      await sleep(22 + Math.random() * 26);
    }
  }

  // Two turns, then it stops and leaves the composer to the visitor. The lead-in
  // is longer before the first (the tile has to finish opening) than between.
  async function play() {
    for (var i = 0; i < 2; i++) {
      await sleep(i === 0 ? 900 : 3200);
      if (!autoplay) return;
      await typeQuestion(TURNS[i].q);
      if (!autoplay) return;
      await sleep(420);
      if (!autoplay) return;
      el.input.value = '';
      syncSend();
      await run(TURNS[i], TURNS[i].q);
    }
    autoplay = false;
  }

  paintHistory();
  paintSuggestions();
  syncSend();
  play();
})();
