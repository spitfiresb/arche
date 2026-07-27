/* Client-side language switcher. A fixed flag button (top right) opens a
   menu of languages; picking one fetches /assets/i18n/<code>.json and swaps
   the text of every [data-i18n] element in place. The English strings live
   in the markup itself, so the page needs no JS to read in English; other
   languages are pure dictionary swaps. Dates render through Intl, so month
   names and word order are correct in every locale for free. The choice
   persists in localStorage and re-applies on every page load.

   The button shows the flag of the selected language. Flags name countries,
   not languages, so the mapping is a judgement call wherever a language
   crosses borders: the most-spoken country wins (Brazil for Portuguese,
   Egypt for Arabic). There is no neutral "language" flag to fall back on —
   the usual answer to that problem is a globe icon instead of flags at all. */
(() => {
  const LANGS = [
    ['en', 'English',    'English'],
    ['es', 'Español',    'Spanish'],
    ['fr', 'Français',   'French'],
    ['de', 'Deutsch',    'German'],
    ['it', 'Italiano',   'Italian'],
    ['pt', 'Português',  'Portuguese'],
    ['ru', 'Русский',    'Russian'],
    ['tr', 'Türkçe',     'Turkish'],
    ['hi', 'हिन्दी',       'Hindi'],
    ['ko', '한국어',      'Korean'],
    ['ja', '日本語',      'Japanese'],
    ['zh', '中文',        'Chinese'],
    ['ar', 'العربية',    'Arabic'],
    ['ur', 'اردو',       'Urdu'],
  ];
  const RTL = new Set(['ar', 'ur']);
  // BCP 47 tags for <html lang> and Intl; the file codes stay short.
  const TAG = { zh: 'zh-Hans', pt: 'pt-BR' };

  const KEY = 'site-lang';
  let current = localStorage.getItem(KEY);
  if (!LANGS.some((l) => l[0] === current)) current = 'en';

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Flags -----------------------------------------------------------

     Hand-drawn at icon size on a shared 60x40 field. Fine detail (Egypt's
     eagle, Spain's arms, India's chakra spokes) is a few pixels wide once
     painted, so each is simplified to the shape that still reads: what
     carries a flag this small is its colour blocking and one silhouette. */

  // Points of a five-pointed star, for the flags that carry one.
  function star(cx, cy, r, rot = -90) {
    const p = [];
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.382 : r;
      const a = ((rot + i * 36) * Math.PI) / 180;
      p.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
    }
    return p.join(' ');
  }

  // One of the four trigrams on the Korean flag: three bars, each either
  // whole or split, turned to face the centre.
  function trigram(cx, cy, rot, bars) {
    const rows = bars
      .map((whole, i) => {
        const y = (-3.2 + i * 2.3).toFixed(2);
        return whole
          ? `<rect x="-5" y="${y}" width="10" height="1.5"/>`
          : `<rect x="-5" y="${y}" width="4.2" height="1.5"/>` +
            `<rect x="0.8" y="${y}" width="4.2" height="1.5"/>`;
      })
      .join('');
    return `<g transform="translate(${cx} ${cy}) rotate(${rot})">${rows}</g>`;
  }

  // Three horizontal bands, top to bottom.
  const bandsH = (a, b, c) =>
    `<rect width="60" height="13.34" fill="${a}"/>` +
    `<rect y="13.33" width="60" height="13.34" fill="${b}"/>` +
    `<rect y="26.66" width="60" height="13.34" fill="${c}"/>`;

  // Three vertical bands, left to right.
  const bandsV = (a, b, c) =>
    `<rect width="20.01" height="40" fill="${a}"/>` +
    `<rect x="20" width="20.01" height="40" fill="${b}"/>` +
    `<rect x="40" width="20" height="40" fill="${c}"/>`;

  const FLAGS = {
    // English keeps the split mark the switcher opened with: the Union Jack
    // and the Stars and Stripes cut on the diagonal, since neither country
    // owns the language on its own.
    en: (id) =>
      `<defs>
         <clipPath id="us${id}"><path d="M0 0 H60 L0 40 Z"/></clipPath>
         <clipPath id="uk${id}"><path d="M60 0 V40 H0 Z"/></clipPath>
       </defs>
       <g clip-path="url(#us${id})">
         <rect width="60" height="40" fill="#B22234"/>
         <g stroke="#fff" stroke-width="3.08">
           <path d="M0 4.62 H60"/><path d="M0 10.77 H60"/><path d="M0 16.92 H60"/>
           <path d="M0 23.08 H60"/><path d="M0 29.23 H60"/><path d="M0 35.38 H60"/>
         </g>
         <rect width="26" height="21.54" fill="#3C3B6E"/>
         <g fill="#fff">
           <circle cx="4" cy="4" r="1.15"/><circle cx="10.5" cy="4" r="1.15"/><circle cx="17" cy="4" r="1.15"/><circle cx="23" cy="4" r="1.15"/>
           <circle cx="7.2" cy="8" r="1.15"/><circle cx="13.7" cy="8" r="1.15"/><circle cx="20.2" cy="8" r="1.15"/>
           <circle cx="4" cy="12" r="1.15"/><circle cx="10.5" cy="12" r="1.15"/><circle cx="17" cy="12" r="1.15"/><circle cx="23" cy="12" r="1.15"/>
           <circle cx="7.2" cy="16" r="1.15"/><circle cx="13.7" cy="16" r="1.15"/><circle cx="20.2" cy="16" r="1.15"/>
         </g>
       </g>
       <g clip-path="url(#uk${id})">
         <rect width="60" height="40" fill="#012169"/>
         <path d="M0 0 L60 40 M60 0 L0 40" stroke="#fff" stroke-width="8"/>
         <path d="M0 0 L60 40 M60 0 L0 40" stroke="#C8102E" stroke-width="3.2"/>
         <path d="M30 0 V40 M0 20 H60" stroke="#fff" stroke-width="13"/>
         <path d="M30 0 V40 M0 20 H60" stroke="#C8102E" stroke-width="7.5"/>
       </g>`,

    // Spain. The arms sit a third in from the hoist, and at this size they
    // are three pixels wide, so they are drawn as the shield's silhouette
    // and nothing else: any interior detail turns into a smudge.
    es: () =>
      `<rect width="60" height="40" fill="#AA151B"/>
       <rect y="10" width="60" height="20" fill="#F1BF00"/>
       <path d="M13 14.4 h6.4 v5.6 a3.2 3.2 0 0 1 -6.4 0 z" fill="#AD1519"/>`,

    fr: () => bandsV('#002395', '#FFFFFF', '#ED2939'),
    de: () => bandsH('#000000', '#DD0000', '#FFCE00'),
    it: () => bandsV('#009246', '#FFFFFF', '#CE2B37'),
    ru: () => bandsH('#FFFFFF', '#0039A6', '#D52B1E'),

    // Brazil, the most-spoken Portuguese. The celestial globe keeps its
    // banner as a single white sweep.
    pt: () =>
      `<rect width="60" height="40" fill="#009B3A"/>
       <path d="M30 4 L56 20 L30 36 L4 20 Z" fill="#FEDF00"/>
       <circle cx="30" cy="20" r="9" fill="#002776"/>
       <path d="M21.6 16.8 A 10.5 10.5 0 0 1 38.6 17.6" stroke="#fff"
             stroke-width="2.6" fill="none"/>`,

    // Turkey.
    tr: () =>
      `<rect width="60" height="40" fill="#E30A17"/>
       <circle cx="24" cy="20" r="8.4" fill="#fff"/>
       <circle cx="27.2" cy="20" r="6.7" fill="#E30A17"/>
       <polygon points="${star(37.5, 20, 4.3)}" fill="#fff"/>`,

    // India. The chakra's twenty-four spokes collapse to a ring at this
    // size, so it is drawn as a ring with the few spokes that survive.
    hi: () =>
      `${bandsH('#FF9933', '#FFFFFF', '#138808')}
       <circle cx="30" cy="20" r="5.2" fill="none" stroke="#000080" stroke-width="1.5"/>
       <g stroke="#000080" stroke-width="0.9">
         <path d="M30 15.4 V24.6 M25.4 20 H34.6 M26.8 16.8 L33.2 23.2 M33.2 16.8 L26.8 23.2"/>
       </g>`,

    // South Korea. The taegeuk keeps its S-curve, and the trigrams keep
    // which of their bars are whole and which are split: heaven at the
    // hoist top, earth opposite it, water and fire on the other diagonal.
    ko: () =>
      `<rect width="60" height="40" fill="#fff"/>
       <circle cx="30" cy="20" r="8" fill="#CD2E3A"/>
       <path d="M22 20 a4 4 0 0 1 8 0 a4 4 0 0 0 8 0 a8 8 0 0 1 -16 0 Z" fill="#0047A0"/>
       <g fill="#111">
         ${trigram(13.5, 9.5, -55.5, [1, 1, 1])}
         ${trigram(46.5, 9.5, 55.5, [0, 1, 0])}
         ${trigram(13.5, 30.5, 55.5, [1, 0, 1])}
         ${trigram(46.5, 30.5, -55.5, [0, 0, 0])}
       </g>`,

    ja: () =>
      `<rect width="60" height="40" fill="#fff"/>
       <circle cx="30" cy="20" r="10.5" fill="#BC002D"/>`,

    zh: () =>
      `<rect width="60" height="40" fill="#EE1C25"/>
       <polygon points="${star(11, 10, 6.4)}" fill="#FFFF00"/>
       <polygon points="${star(21.5, 4.4, 2.2, -70)}" fill="#FFFF00"/>
       <polygon points="${star(25.4, 8.6, 2.2, -50)}" fill="#FFFF00"/>
       <polygon points="${star(25.4, 14.2, 2.2, -30)}" fill="#FFFF00"/>
       <polygon points="${star(21.5, 18.4, 2.2, -10)}" fill="#FFFF00"/>`,

    // Egypt, the most populous Arabic-speaking country. The Eagle of
    // Saladin keeps only its spread-wing silhouette; the red, white and
    // black bands are what identify the flag at this size anyway.
    ar: () =>
      `${bandsH('#CE1126', '#FFFFFF', '#000000')}
       <path d="M30 15.2 L34.9 17.4 L32.5 19.2 L33.4 24 L30 22.1
                L26.6 24 L27.5 19.2 L25.1 17.4 Z" fill="#C09300"/>`,

    // Pakistan.
    ur: () =>
      `<rect width="60" height="40" fill="#01411C"/>
       <rect width="15" height="40" fill="#fff"/>
       <circle cx="37" cy="20" r="8.6" fill="#fff"/>
       <circle cx="40.4" cy="18.2" r="7.2" fill="#01411C"/>
       <polygon points="${star(46.5, 12.6, 3.6, -60)}" fill="#fff"/>`,
  };

  let flagSeq = 0;
  function flagMarkup(code) {
    const draw = FLAGS[code] || FLAGS.en;
    // clipPath ids have to be unique per instance or a second flag on the
    // page would inherit the first one's clip.
    return `<svg viewBox="0 0 60 40" aria-hidden="true" focusable="false">${draw(++flagSeq)}</svg>`;
  }

  /* ---- Dictionary ------------------------------------------------------ */

  const cache = {};
  async function load(code) {
    if (!cache[code]) {
      const res = await fetch(`/assets/i18n/${code}.json`);
      if (!res.ok) throw new Error(`i18n: ${code} ${res.status}`);
      cache[code] = await res.json();
    }
    return cache[code];
  }

  const SEL = '[data-i18n],[data-i18n-html],[data-i18n-letters],[data-i18n-date],time.band-date[datetime]';

  // Write one element's new content. Everything that can change on a
  // language switch goes through here, so the animation only has to know
  // "swap this node now" and not what kind of node it is.
  function updateNode(el, dict, fmt) {
    const k = el.getAttribute('data-i18n');
    if (k && dict[k] != null) el.textContent = dict[k];

    const kh = el.getAttribute('data-i18n-html');
    if (kh && dict[kh] != null) el.innerHTML = dict[kh];

    // The award ribbon animates per character, so the translated string is
    // split back into the <i style="--i:n"> pieces the CSS steps through.
    const kl = el.getAttribute('data-i18n-letters');
    if (kl && dict[kl] != null) {
      el.setAttribute('aria-label', dict[kl]);
      el.textContent = '';
      let i = 0;
      for (const ch of dict[kl]) {
        if (ch === ' ') { el.append(' '); continue; }
        const b = document.createElement('i');
        b.style.setProperty('--i', i++);
        b.textContent = ch;
        el.append(b);
      }
    }

    const iso = el.getAttribute('data-i18n-date') || el.getAttribute('datetime');
    if (iso && /^\d{4}-\d{2}$/.test(iso)) {
      // mid-month keeps UTC rounding from ever slipping into the wrong month
      el.textContent = fmt.format(new Date(`${iso}-15T12:00:00Z`));
    }
  }

  // Everything that isn't a text node in the flow: document metadata and
  // the couple of aria labels that are written in English in the markup.
  function updateChrome(dict, code) {
    document.documentElement.lang = TAG[code] || code;
    document.documentElement.dir = RTL.has(code) ? 'rtl' : 'ltr';

    const back = document.querySelector('a.back');
    if (back && dict['common.back']) back.setAttribute('aria-label', dict['common.back']);
    const page = document.body.getAttribute('data-i18n-page');
    if (page && dict['title.' + page]) document.title = dict['title.' + page];
    const btn = document.querySelector('.lang-btn');
    if (btn && dict['lang.label']) btn.setAttribute('aria-label', dict['lang.label']);
  }

  /* ---- The swap -------------------------------------------------------

     Text doesn't cut from one language to the next, it rolls: each line
     blurs out and lifts, swaps while it can't be read, then settles back
     in from below. The delay is keyed to how far down the viewport a line
     sits, so the change reads as a wave running down the page rather than
     forty elements blinking at once. */

  const SWAP_MS = 520; // one pass: fade down, turn over, come back up
  const STEP = 16;     // per-line delay down the page
  const MAX_LAG = 520; // cap, so a long page still finishes promptly

  let swapToken = 0;
  // The animation and the pending text write for each line currently in the
  // wave, so a new wave can take an element back cleanly instead of layering
  // a second animation on top of the first.
  const running = new WeakMap();

  function stopSwap(el) {
    const r = running.get(el);
    if (!r) return;
    running.delete(el);
    clearTimeout(r.timer);
    try { r.anim.cancel(); } catch (e) { /* already gone */ }
  }

  function swap(dict, code, animate) {
    const fmt = new Intl.DateTimeFormat(TAG[code] || code, {
      year: 'numeric', month: 'long', timeZone: 'UTC',
    });
    const nodes = [...document.querySelectorAll(SEL)];

    if (!animate || reduced || !document.body.animate) {
      nodes.forEach((el) => { stopSwap(el); updateNode(el, dict, fmt); });
      updateChrome(dict, code);
      return;
    }

    const mine = ++swapToken;
    updateChrome(dict, code);

    // Order by where each line sits, so the wave runs top to bottom.
    const tops = nodes.map((el) => el.getBoundingClientRect().top);
    const min = Math.min(...tops);
    const span = Math.max(...tops) - min || 1;
    let lastLag = 0;

    nodes.forEach((el, i) => {
      stopSwap(el); // hand the line back before starting it over
      const lag = Math.min(((tops[i] - min) / span) * (nodes.length * STEP), MAX_LAG);
      lastLag = Math.max(lastLag, lag);

      /* One animation per line, and it ends exactly where it began: fully
         visible. Nothing here fills forwards, so the moment it ends — or is
         cancelled part way by the next switch — the line goes back to being
         styled by the stylesheet. An interrupted wave can leave text from
         the wrong language on screen for a moment, which the next wave
         corrects; it can never leave the page blank. */
      const anim = el.animate(
        [
          { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0)', offset: 0 },
          { opacity: 0, filter: 'blur(3px)', transform: 'translateY(-5px)', offset: 0.42 },
          { opacity: 0, filter: 'blur(3px)', transform: 'translateY(6px)', offset: 0.58 },
          { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0)', offset: 1 },
        ],
        { duration: SWAP_MS, delay: lag, easing: 'cubic-bezier(0.33, 0, 0.2, 1)' },
      );

      // The words turn over while the line is at its most faded.
      const timer = setTimeout(() => {
        if (mine === swapToken) updateNode(el, dict, fmt);
      }, lag + SWAP_MS * 0.5);

      running.set(el, { anim, timer });
      anim.finished
        .then(() => { if (running.get(el) && running.get(el).anim === anim) running.delete(el); })
        .catch(() => {});
    });

    // Whatever became of the individual lines, the page is settled and in
    // one language by the time the wave should have passed.
    setTimeout(() => {
      if (mine !== swapToken) return;
      nodes.forEach((el) => { stopSwap(el); updateNode(el, dict, fmt); });
    }, lastLag + SWAP_MS + 160);
  }

  /* ---- Wiring ---------------------------------------------------------- */

  let flagTimer = 0;
  function paintFlag(code, animate) {
    const btn = document.querySelector('.lang-btn');
    if (!btn) return;
    // A pending flip from an earlier pick would otherwise land after this
    // one and leave the button showing the wrong country.
    clearTimeout(flagTimer);
    if (!animate || reduced || !btn.animate) { btn.innerHTML = flagMarkup(code); return; }
    // Turn the button over and change the flag on the back of the flip.
    btn.animate(
      [
        { transform: 'rotateY(0deg)' },
        { transform: 'rotateY(90deg)', offset: 0.5 },
        { transform: 'rotateY(0deg)' },
      ],
      { duration: 420, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' },
    );
    flagTimer = setTimeout(() => { btn.innerHTML = flagMarkup(code); }, 210);
  }

  async function setLang(code, animate) {
    current = code;
    localStorage.setItem(KEY, code);
    let dict;
    try {
      dict = await load(code);
    } catch (e) {
      return; // dictionary missing: leave the page in the language it is in
    }
    paintFlag(code, animate);
    swap(dict, code, animate);
    document.querySelectorAll('.lang-menu [data-lang]').forEach((b) => {
      b.setAttribute('aria-selected', String(b.getAttribute('data-lang') === code));
    });
  }

  function build() {
    const wrap = document.createElement('div');
    wrap.className = 'lang-switch';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lang-btn';
    btn.setAttribute('aria-label', 'Change language');
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = flagMarkup(current);

    const menu = document.createElement('ul');
    menu.className = 'lang-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;

    for (const [code, native, english] of LANGS) {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');

      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-lang', code);
      b.setAttribute('aria-selected', String(code === current));
      b.lang = TAG[code] || code;

      // Each row carries its own flag, so the menu reads as a set of places
      // rather than a list of words.
      const chip = document.createElement('span');
      chip.className = 'ln-flag';
      chip.innerHTML = flagMarkup(code);

      const text = document.createElement('span');
      text.className = 'ln-text';
      const nat = document.createElement('span');
      nat.className = 'ln-native';
      nat.textContent = native;
      text.append(nat);
      if (english !== native) {
        const en = document.createElement('span');
        en.className = 'ln-en';
        en.textContent = english;
        text.append(en);
      }

      b.append(chip, text);
      b.addEventListener('click', () => {
        if (code !== current) setLang(code, true);
        close();
      });
      li.append(b);
      menu.append(li);
    }

    /* The panel doesn't appear, it opens: it grows out of the button it
       hangs from while its rows come up the list a beat apart. Closing is
       the same move run faster, since a menu you are done with shouldn't
       keep you waiting. */
    let menuAnim = null;
    // Whether the menu is meant to be open, which is not the same as
    // whether it is still on screen: during the closing animation it is
    // both visible and already closed, and a click then should reopen it
    // rather than close it a second time.
    let isOpen = false;
    const rows = [...menu.children];

    function open() {
      if (isOpen) return;
      isOpen = true;
      if (menuAnim) { menuAnim.cancel(); menuAnim = null; }
      menu.hidden = false;
      wrap.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      if (reduced || !menu.animate) return;

      menu.animate(
        [
          { opacity: 0, transform: 'translateY(-6px) scale(0.94)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' },
        ],
        { duration: 210, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      );
      rows.forEach((row, i) => {
        row.animate(
          [
            { opacity: 0, transform: 'translateY(-5px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          // backwards fill only: it holds the row down until its turn and
          // lets go of it entirely once the row has arrived.
          { duration: 200, delay: 45 + i * 22, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'backwards' },
        );
      });
    }

    function close() {
      if (!isOpen) return;
      isOpen = false;
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
      if (reduced || !menu.animate) { menu.hidden = true; return; }

      if (menuAnim) menuAnim.cancel();
      menuAnim = menu.animate(
        [
          { opacity: 1, transform: 'translateY(0) scale(1)' },
          { opacity: 0, transform: 'translateY(-5px) scale(0.96)' },
        ],
        { duration: 130, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
      );
      const done = menuAnim;
      done.finished
        .then(() => {
          // Only the close that is still current gets to hide the panel;
          // reopening mid-close cancels this and rejects the promise.
          if (menuAnim !== done) return;
          menu.hidden = true;
          menuAnim.cancel();
          menuAnim = null;
        })
        .catch(() => {});
    }
    btn.addEventListener('click', () => (isOpen ? close() : open()));
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) { close(); btn.focus(); }
    });

    wrap.append(btn, menu);
    document.body.append(wrap);
  }

  function init() {
    build();
    // A page loaded already in another language shouldn't play the wave;
    // it only means something when it marks a change the reader asked for.
    if (current !== 'en') setLang(current, false);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
