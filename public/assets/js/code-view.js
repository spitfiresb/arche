/* Source panels: syntax highlighting, copy buttons, and the one panel whose
   body is fetched rather than written into the page.
 *
 * No dependencies and no build step, like everything else here, so the
 * highlighter is a small hand-rolled tokenizer rather than a library. It
 * covers the three languages these pages show (JS, CSS, HTML) and nothing
 * else; anything it can't classify falls through as plain text, which is
 * the failure mode you want: unstyled, never mangled.
 *
 * The panels degrade in order. Snippets written into the HTML are already
 * readable as plain <pre> before this file runs, and stay readable if it
 * never does. A fetched panel can't do that, so it ships with a Raw link
 * in its header that works either way.
 */
(function () {
  'use strict';

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ---- tokenizers ---------------------------------------------------
     Each returns a flat list of {cls, text} covering the source exactly:
     concatenating every text back together reproduces the input. Lines are
     cut later, so a token is free to span newlines. */

  var JS_KEYWORD = /^(?:var|let|const|function|return|if|else|for|while|do|break|continue|new|delete|typeof|instanceof|in|of|this|null|undefined|true|false|void|switch|case|default|try|catch|finally|throw|class|extends|super|yield|async|await|import|export|from|static|get|set)$/;

  // A slash opens a regex unless the thing before it could end an
  // expression, in which case it's division. Same heuristic every JS
  // tokenizer uses, and it's enough for the code these pages carry.
  function regexAllowed(prev) {
    if (!prev) return true;
    if (prev === ')' || prev === ']' || prev === '}') return false;
    if (prev === 'num' || prev === 'str') return false;
    if (/^[A-Za-z_$]/.test(prev)) return JS_KEYWORD.test(prev);
    return true;
  }

  function tokenizeJS(src) {
    var out = [], i = 0, n = src.length, prev = '';
    function push(cls, j) { out.push({ cls: cls, text: src.slice(i, j) }); i = j; }

    while (i < n) {
      var c = src[i], j;

      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        j = i;
        while (j < n && /\s/.test(src[j])) j++;
        push('', j);
        continue;
      }
      if (c === '/' && src[i + 1] === '/') {
        j = src.indexOf('\n', i);
        push('c', j < 0 ? n : j);
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        j = src.indexOf('*/', i + 2);
        push('c', j < 0 ? n : j + 2);
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        j = i + 1;
        while (j < n) {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === c) { j++; break; }
          j++;
        }
        push('s', j);
        prev = 'str';
        continue;
      }
      if (c === '/' && regexAllowed(prev)) {
        j = i + 1;
        var inClass = false, closed = false;
        while (j < n && src[j] !== '\n') {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') inClass = true;
          else if (src[j] === ']') inClass = false;
          else if (src[j] === '/' && !inClass) { j++; closed = true; break; }
          j++;
        }
        if (closed) {
          while (j < n && /[gimsuyd]/.test(src[j])) j++;   // flags
          push('s', j);
          prev = 'str';
          continue;
        }
        // unterminated: it was division after all
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        j = i;
        while (j < n && /[0-9a-fA-FxX._+\-]/.test(src[j])) {
          // a sign only continues the number as an exponent
          if ((src[j] === '+' || src[j] === '-') && !/[eE]/.test(src[j - 1])) break;
          j++;
        }
        push('n', j);
        prev = 'num';
        continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        j = i;
        while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
        var word = src.slice(i, j);
        var k = j;
        while (k < n && /\s/.test(src[k])) k++;
        push(JS_KEYWORD.test(word) ? 'k' : (src[k] === '(' ? 'f' : ''), j);
        prev = word;
        continue;
      }
      push('p', i + 1);
      prev = c;
    }
    return out;
  }

  function tokenizeCSS(src) {
    var out = [], i = 0, n = src.length;
    var depth = 0;      // inside a rule's braces
    var inValue = false; // past the colon of a declaration
    function push(cls, j) { out.push({ cls: cls, text: src.slice(i, j) }); i = j; }

    while (i < n) {
      var c = src[i], j;

      if (/\s/.test(c)) {
        j = i;
        while (j < n && /\s/.test(src[j])) j++;
        push('', j);
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        j = src.indexOf('*/', i + 2);
        push('c', j < 0 ? n : j + 2);
        continue;
      }
      if (c === '"' || c === "'") {
        j = i + 1;
        while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; }
        push('s', Math.min(j + 1, n));
        continue;
      }
      if (c === '{') { depth++; inValue = false; push('p', i + 1); continue; }
      if (c === '}') { depth--; inValue = false; push('p', i + 1); continue; }
      if (c === ';') { inValue = false; push('p', i + 1); continue; }
      if (c === ':' && depth > 0) { inValue = true; push('p', i + 1); continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        j = i;
        while (j < n && /[0-9.%a-zA-Z]/.test(src[j])) j++;   // value plus unit
        push('n', j);
        continue;
      }
      if (/[A-Za-z_@#.\-*[\]]/.test(c)) {
        j = i;
        while (j < n && /[A-Za-z0-9_@#.\-*[\]="'~^|$]/.test(src[j])) j++;
        // depth 0 is a selector or at-rule; inside a rule it's a property
        // before the colon and part of the value after it
        push(depth === 0 ? 'f' : (inValue ? '' : 'a'), j);
        continue;
      }
      push('p', i + 1);
    }
    return out;
  }

  function tokenizeHTML(src) {
    var out = [], i = 0, n = src.length;
    function push(cls, j) { out.push({ cls: cls, text: src.slice(i, j) }); i = j; }

    while (i < n) {
      if (src.startsWith('<!--', i)) {
        var end = src.indexOf('-->', i + 4);
        push('c', end < 0 ? n : end + 3);
        continue;
      }
      if (src[i] === '<') {
        push('p', i + 1);                       // the bracket
        if (src[i] === '/') push('p', i + 1);
        var j = i;
        while (j < n && /[A-Za-z0-9-]/.test(src[j])) j++;
        push('f', j);                           // the tag name

        // attributes, up to the closing bracket
        while (i < n && src[i] !== '>') {
          if (/\s/.test(src[i])) {
            j = i;
            while (j < n && /\s/.test(src[j])) j++;
            push('', j);
            continue;
          }
          if (src[i] === '"' || src[i] === "'") {
            var q = src[i];
            j = i + 1;
            while (j < n && src[j] !== q) j++;
            push('s', Math.min(j + 1, n));
            continue;
          }
          if (/[A-Za-z_:@-]/.test(src[i])) {
            j = i;
            while (j < n && /[A-Za-z0-9_:.@-]/.test(src[j])) j++;
            push('a', j);
            continue;
          }
          push('p', i + 1);                     // = / and anything else
        }
        if (i < n) push('p', i + 1);            // >
        continue;
      }
      var next = src.indexOf('<', i);
      push('', next < 0 ? n : next);
    }
    return out;
  }

  var TOKENIZERS = { js: tokenizeJS, css: tokenizeCSS, html: tokenizeHTML };

  /* ---- render -------------------------------------------------------
     Cut the token stream into lines. A comment or template string can run
     across newlines, so its span is closed and reopened at each break;
     leaving it open would put the rest of the file inside one <span> and
     break the per-line blocks the gutter counts. */

  function render(tokens) {
    var lines = [''];
    tokens.forEach(function (t) {
      var parts = t.text.split('\n');
      for (var k = 0; k < parts.length; k++) {
        if (k > 0) lines.push('');
        if (!parts[k]) continue;
        var body = esc(parts[k]);
        lines[lines.length - 1] += t.cls ? '<span class="t-' + t.cls + '">' + body + '</span>' : body;
      }
    });
    return lines.map(function (l) { return '<span class="cl">' + l + '</span>'; }).join('');
  }

  function paint(codeEl, source, lang) {
    var fn = TOKENIZERS[lang];
    codeEl.textContent = source;                  // the plain-text fallback
    if (fn) codeEl.innerHTML = render(fn(source));
    codeEl.closest('.code-file').__source = source;
  }

  /* ---- panels -------------------------------------------------------- */

  function sizeOf(source) {
    var lines = source.replace(/\n$/, '').split('\n').length;
    var kb = new Blob([source]).size / 1024;
    return lines.toLocaleString() + ' lines · ' + (kb < 10 ? kb.toFixed(1) : Math.round(kb)) + ' KB';
  }

  function stamp(file) {
    var meta = file.querySelector('.code-meta');
    if (meta && file.__source) meta.textContent = sizeOf(file.__source);
  }

  function wireCopy(file) {
    var btn = file.querySelector('.code-copy');
    if (!btn) return;
    var idle = btn.textContent;
    var timer = null;

    function flash(label) {
      btn.textContent = label;
      btn.dataset.state = 'done';
      clearTimeout(timer);
      timer = setTimeout(function () {
        btn.textContent = idle;
        delete btn.dataset.state;
      }, 1800);
    }

    btn.addEventListener('click', function () {
      var text = file.__source;
      if (!text) return;
      // Clipboard API needs a secure context; the textarea path covers the
      // rest, and if both are gone the label says so rather than lying.
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(function () { flash('Copied'); },
          function () { flash('Press ⌘C'); });
        return;
      }
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      flash(ok ? 'Copied' : 'Press ⌘C');
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll('.code-file'), function (file) {
    var codeEl = file.querySelector('.code-pane code');
    var lang = file.dataset.lang;
    var src = file.dataset.src;

    if (src) {
      // The markup ships with the no-JavaScript message, since that's the
      // state the panel can't fix by itself. We're running, so what's true
      // now is that a fetch is pending.
      var status = file.querySelector('.code-status');
      if (status) status.textContent = 'Loading…';

      // Reading the file the demo actually loads keeps this page from
      // drifting out of step with it.
      fetch(src).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.text();
      }).then(function (text) {
        if (status) status.remove();
        paint(codeEl, text, lang);
        stamp(file);
      }).catch(function () {
        if (status) status.textContent = 'Could not load. Use the Raw link above.';
      });
    } else if (codeEl && codeEl.textContent.trim()) {
      paint(codeEl, codeEl.textContent.replace(/^\n/, '').replace(/\s+$/, ''), lang);
      stamp(file);
    }

    wireCopy(file);
  });
})();
