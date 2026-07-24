/* Edit mode, injected by tools/serve.py into any page requested with ?edit.
 *
 * It never ships: the file lives in tools/, outside public/, and the dev server
 * is the only thing that serves it. Production has no idea it exists.
 *
 * What it does: makes every block of text on the page directly editable, then
 * hands you the result as a diff you can paste into a chat. Nothing is written
 * to disk; a reload throws the edits away. That is deliberate; the copy button
 * is the way out.
 *
 * A block is any element holding text of its own. Where a paragraph contains
 * inline markup the paragraph is the unit, not the fragments around the tag, so
 * <span class="stress"> stays visible and editable as part of the sentence
 * instead of being split off into its own box.
 */
(function () {
  'use strict';

  var PANEL_ID = 'zs-edit-panel';
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, SVG: 1, IFRAME: 1 };

  var blocks = [];   // { el, original, key }
  var titleOriginal = document.title;

  /* ---------------------------------------------------------- finding text */

  // An element qualifies if it has a direct text-node child that isn't just
  // whitespace. Ancestors win: once a paragraph is editable, the span inside it
  // is edited as part of the paragraph rather than as a box of its own.
  function hasOwnText(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3 && n.nodeValue.trim()) return true;
    }
    return false;
  }

  // An empty <p> is a paragraph waiting to be written, and text is the one
  // thing this tool has to be able to add. Without this an entry with nothing
  // in it yet is the one place you cannot type, so empty text holders arm
  // too, and CSS gives them a hint and enough height to aim at.
  var EMPTY_OK = { P: 1, H1: 1, H2: 1, H3: 1, H4: 1, FIGCAPTION: 1, BLOCKQUOTE: 1 };

  function isEmptyHolder(el) {
    return EMPTY_OK[el.tagName] && !el.children.length && !el.textContent.trim();
  }

  function insideEditable(el) {
    for (var p = el.parentElement; p; p = p.parentElement) {
      if (p.hasAttribute && p.hasAttribute('data-zs-edit')) return true;
    }
    return false;
  }

  // A short, readable path: enough for me to find the line in the file.
  function keyFor(el) {
    var parts = [];
    for (var n = el; n && n.tagName !== 'BODY'; n = n.parentElement) {
      var s = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(s + '#' + n.id); break; }
      if (n.classList.length) s += '.' + n.classList[0];
      var same = [];
      if (n.parentElement) {
        for (var i = 0; i < n.parentElement.children.length; i++) {
          if (n.parentElement.children[i].tagName === n.tagName) {
            same.push(n.parentElement.children[i]);
          }
        }
      }
      if (same.length > 1) s += ':' + (same.indexOf(n) + 1);
      parts.unshift(s);
      if (parts.length >= 3) break;
    }
    return parts.join(' > ');
  }

  function collapse(s) {
    return s.replace(/\s+/g, ' ').trim();
  }

  function contentOf(el) {
    return collapse(el.innerHTML);
  }

  /* ------------------------------------------------------------- edit mode */

  function arm(el) {
    el.setAttribute('data-zs-edit', '');
    el.setAttribute('contenteditable', 'true');
    el.setAttribute('spellcheck', 'true');
    blocks.push({ el: el, original: contentOf(el), key: keyFor(el) });

    // Paste as plain text. Copying a sentence out of a styled page and back in
    // otherwise drags a stack of <span style> with it, and the point of this
    // tool is to change words, not markup.
    el.addEventListener('paste', function (e) {
      e.preventDefault();
      var t = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, t);
    });
    el.addEventListener('input', refresh);
    el.addEventListener('focus', function () { el.classList.add('zs-editing'); });
    el.addEventListener('blur', function () {
      el.classList.remove('zs-editing');
      refresh();
    });
    // Enter should end the edit, not fabricate a <div> or a <br> inside a
    // heading. Shift+Enter still breaks a line where that's wanted.
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); el.blur(); }
    });
  }

  function scan() {
    var all = document.body.getElementsByTagName('*');
    var pending = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (SKIP_TAGS[el.tagName]) continue;
      if (el.closest('#' + PANEL_ID)) continue;
      if (!hasOwnText(el) && !isEmptyHolder(el)) continue;
      pending.push(el);
    }
    // Two passes: mark nothing until every candidate is known, so the
    // ancestor-wins rule doesn't depend on traversal order.
    for (var j = 0; j < pending.length; j++) {
      if (!insideEditable(pending[j])) arm(pending[j]);
    }
  }

  /* ---------------------------------------------------------------- output */

  function changed() {
    var out = [];
    for (var i = 0; i < blocks.length; i++) {
      if (contentOf(blocks[i].el) !== blocks[i].original) out.push(blocks[i]);
    }
    return out;
  }

  function pagePath() {
    return location.pathname + (location.pathname === '/' ? '' : '');
  }

  function report(all) {
    var list = all ? blocks : changed();
    var head = ['Text edits: ' + pagePath()];
    if (document.title !== titleOriginal) {
      head.push('', '[title]', '  - ' + titleOriginal, '  + ' + document.title);
    }
    if (!list.length && document.title === titleOriginal) {
      return head.join('\n') + '\n\nNo changes.';
    }
    head.push('', all
      ? list.length + ' blocks (full text of the page):'
      : list.length + ' of ' + blocks.length + ' blocks changed:');
    var body = list.map(function (b, i) {
      var now = contentOf(b.el);
      if (all) return '\n[' + (i + 1) + '] ' + b.key + '\n  ' + now;
      return '\n[' + (i + 1) + '] ' + b.key +
             '\n  - ' + b.original +
             '\n  + ' + now;
    });
    return head.join('\n') + body.join('\n') + '\n';
  }

  function copy(text, btn) {
    function done(ok) {
      var was = btn.textContent;
      btn.textContent = ok ? 'Copied' : 'Copy failed';
      btn.classList.toggle('zs-ok', ok);
      setTimeout(function () {
        btn.textContent = was;
        btn.classList.remove('zs-ok');
      }, 1400);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); },
                                               function () { done(false); });
      return;
    }
    var ta = document.createElement('textarea');       // http:// fallback
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-1000px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    done(ok);
  }

  /* ----------------------------------------------------------------- panel */

  function build() {
    var css = document.createElement('style');
    css.textContent = [
      '[data-zs-edit]{outline:1px dashed rgba(90,140,255,.34);outline-offset:3px;',
      '  border-radius:2px;transition:outline-color .12s,background-color .12s}',
      '[data-zs-edit]:hover{outline-color:rgba(90,140,255,.75);',
      '  background:rgba(90,140,255,.06)}',
      '[data-zs-edit].zs-editing{outline:2px solid #4a7dff;outline-offset:3px;',
      '  background:rgba(90,140,255,.10)}',
      '[data-zs-edit].zs-dirty{outline-color:rgba(224,140,32,.85);',
      '  background:rgba(240,160,40,.10)}',
      // An empty block collapses to nothing and cannot be clicked, so give it
      // a line of height and say what it is. Both vanish on the first keystroke.
      '[data-zs-edit]:empty{display:block;min-height:1.3em}',
      '[data-zs-edit]:empty::before{content:"Write here…";opacity:.45;',
      '  font-style:italic}',
      '#' + PANEL_ID + '{position:fixed;right:18px;bottom:18px;z-index:2147483647;',
      '  width:250px;background:#16171a;color:#e9e9ec;border-radius:11px;',
      '  box-shadow:0 8px 34px rgba(0,0,0,.36);overflow:hidden;',
      '  font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
      '#' + PANEL_ID + ' .zs-hd{display:flex;align-items:center;gap:7px;',
      '  padding:11px 13px 9px;border-bottom:1px solid #26272c}',
      '#' + PANEL_ID + ' .zs-dot{width:7px;height:7px;border-radius:50%;',
      '  background:#4a7dff;flex:none}',
      '#' + PANEL_ID + ' .zs-hd b{font-size:12.5px;font-weight:600;letter-spacing:.01em}',
      '#' + PANEL_ID + ' .zs-hd span{margin-left:auto;font-size:11px;color:#8d8f97;',
      '  font-variant-numeric:tabular-nums}',
      '#' + PANEL_ID + ' .zs-bd{padding:11px 13px 13px}',
      '#' + PANEL_ID + ' label{display:block;font-size:10.5px;color:#8d8f97;',
      '  text-transform:uppercase;letter-spacing:.07em;margin:0 0 5px}',
      '#' + PANEL_ID + ' input{width:100%;box-sizing:border-box;background:#0e0f11;',
      '  border:1px solid #2c2d33;border-radius:6px;color:#e9e9ec;padding:6px 8px;',
      '  font:12.5px/1.4 inherit;margin-bottom:11px}',
      '#' + PANEL_ID + ' input:focus{outline:none;border-color:#4a7dff}',
      '#' + PANEL_ID + ' button{display:block;width:100%;margin-bottom:6px;',
      '  padding:7px 10px;border:0;border-radius:6px;background:#2a2c33;',
      '  color:#e9e9ec;font:600 12.5px inherit;cursor:pointer;text-align:center}',
      '#' + PANEL_ID + ' button:hover{background:#343740}',
      '#' + PANEL_ID + ' button.zs-primary{background:#3b6df0}',
      '#' + PANEL_ID + ' button.zs-primary:hover{background:#4a7dff}',
      '#' + PANEL_ID + ' button.zs-ok{background:#1f7a4d}',
      '#' + PANEL_ID + ' .zs-note{font-size:10.5px;color:#75777f;margin:7px 0 0;',
      '  line-height:1.4}'
    ].join('');
    document.head.appendChild(css);

    var p = document.createElement('div');
    p.id = PANEL_ID;
    p.innerHTML =
      '<div class="zs-hd"><i class="zs-dot"></i><b>Edit mode</b><span id="zs-count"></span></div>' +
      '<div class="zs-bd">' +
      '<label for="zs-title">Page title</label>' +
      '<input id="zs-title" type="text">' +
      '<button class="zs-primary" id="zs-copy-diff">Copy changes</button>' +
      '<button id="zs-copy-all">Copy all text</button>' +
      '<button id="zs-reset">Revert</button>' +
      '<p class="zs-note">Nothing is saved. Copy, then paste into the chat.</p>' +
      '</div>';
    document.body.appendChild(p);

    var titleInput = p.querySelector('#zs-title');
    titleInput.value = document.title;
    titleInput.addEventListener('input', function () {
      document.title = titleInput.value;
      refresh();
    });

    p.querySelector('#zs-copy-diff').addEventListener('click', function () {
      copy(report(false), this);
    });
    p.querySelector('#zs-copy-all').addEventListener('click', function () {
      copy(report(true), this);
    });
    p.querySelector('#zs-reset').addEventListener('click', function () {
      for (var i = 0; i < blocks.length; i++) blocks[i].el.innerHTML = blocks[i].original;
      document.title = titleOriginal;
      titleInput.value = titleOriginal;
      refresh();
    });
  }

  function refresh() {
    var n = 0;
    for (var i = 0; i < blocks.length; i++) {
      var dirty = contentOf(blocks[i].el) !== blocks[i].original;
      blocks[i].el.classList.toggle('zs-dirty', dirty);
      if (dirty) n++;
    }
    if (document.title !== titleOriginal) n++;
    var c = document.getElementById('zs-count');
    if (c) c.textContent = n ? n + ' changed' : blocks.length + ' blocks';
  }

  /* ------------------------------------------------------------------ boot */

  function start() {
    scan();
    build();
    refresh();
    // A live demo would otherwise go fullscreen the moment you click a caption
    // near it. In edit mode the thumbnails are just pictures.
    var thumbs = document.querySelectorAll('.ld-thumb');
    for (var i = 0; i < thumbs.length; i++) {
      thumbs[i].addEventListener('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
      }, true);
    }
    console.log('[edit mode] ' + blocks.length + ' editable blocks');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
