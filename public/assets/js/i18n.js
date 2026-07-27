/* Client-side language switcher. A fixed flag button (top right) opens a
   menu of languages; picking one fetches /assets/i18n/<code>.json and swaps
   the text of every [data-i18n] element in place. The English strings live
   in the markup itself, so the page needs no JS to read in English; other
   languages are pure dictionary swaps. Dates render through Intl, so month
   names and word order are correct in every locale for free. The choice
   persists in localStorage and re-applies on every page load. */
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

  const cache = {};
  async function load(code) {
    if (!cache[code]) {
      const res = await fetch(`/assets/i18n/${code}.json`);
      if (!res.ok) throw new Error(`i18n: ${code} ${res.status}`);
      cache[code] = await res.json();
    }
    return cache[code];
  }

  function formatDates(code) {
    const fmt = new Intl.DateTimeFormat(TAG[code] || code, {
      year: 'numeric', month: 'long', timeZone: 'UTC',
    });
    document.querySelectorAll('[data-i18n-date], time.band-date[datetime]').forEach((el) => {
      const iso = el.getAttribute('data-i18n-date') || el.getAttribute('datetime');
      if (!/^\d{4}-\d{2}$/.test(iso || '')) return;
      // mid-month keeps UTC rounding from ever slipping into the wrong month
      el.textContent = fmt.format(new Date(`${iso}-15T12:00:00Z`));
    });
  }

  function apply(dict, code) {
    document.documentElement.lang = TAG[code] || code;
    document.documentElement.dir = RTL.has(code) ? 'rtl' : 'ltr';

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const v = dict[el.getAttribute('data-i18n')];
      if (v != null) el.textContent = v;
    });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const v = dict[el.getAttribute('data-i18n-html')];
      if (v != null) el.innerHTML = v;
    });
    // Letter-by-letter spans (the award ribbon animates per character): the
    // translated string is split back into <i style="--i:n"> pieces.
    document.querySelectorAll('[data-i18n-letters]').forEach((el) => {
      const v = dict[el.getAttribute('data-i18n-letters')];
      if (v == null) return;
      el.setAttribute('aria-label', v);
      el.textContent = '';
      let i = 0;
      for (const ch of v) {
        if (ch === ' ') { el.append(' '); continue; }
        const b = document.createElement('i');
        b.style.setProperty('--i', i++);
        b.textContent = ch;
        el.append(b);
      }
    });

    formatDates(code);

    const back = document.querySelector('a.back');
    if (back && dict['common.back']) back.setAttribute('aria-label', dict['common.back']);
    const page = document.body.getAttribute('data-i18n-page');
    if (page && dict['title.' + page]) document.title = dict['title.' + page];
    const btn = document.querySelector('.lang-btn');
    if (btn && dict['lang.label']) btn.setAttribute('aria-label', dict['lang.label']);
  }

  async function setLang(code) {
    current = code;
    localStorage.setItem(KEY, code);
    try {
      apply(await load(code), code);
    } catch (e) { /* dictionary missing: leave the page as it is */ }
    document.querySelectorAll('.lang-menu [data-lang]').forEach((b) => {
      b.setAttribute('aria-selected', String(b.getAttribute('data-lang') === code));
    });
  }

  /* Half Union Jack, half Stars and Stripes, split on the diagonal. Colored
     in the markup; CSS grays it down until hover. */
  const FLAG = `
<svg viewBox="0 0 60 40" aria-hidden="true" focusable="false">
  <defs>
    <clipPath id="i18n-us"><path d="M0 0 H60 L0 40 Z"/></clipPath>
    <clipPath id="i18n-uk"><path d="M60 0 V40 H0 Z"/></clipPath>
  </defs>
  <g clip-path="url(#i18n-us)">
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
  <g clip-path="url(#i18n-uk)">
    <rect width="60" height="40" fill="#012169"/>
    <path d="M0 0 L60 40 M60 0 L0 40" stroke="#fff" stroke-width="8"/>
    <path d="M0 0 L60 40 M60 0 L0 40" stroke="#C8102E" stroke-width="3.2"/>
    <path d="M30 0 V40 M0 20 H60" stroke="#fff" stroke-width="13"/>
    <path d="M30 0 V40 M0 20 H60" stroke="#C8102E" stroke-width="7.5"/>
  </g>
</svg>`;

  function build() {
    const wrap = document.createElement('div');
    wrap.className = 'lang-switch';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'lang-btn';
    btn.setAttribute('aria-label', 'Change language');
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = FLAG;

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
      const nat = document.createElement('span');
      nat.className = 'ln-native';
      nat.textContent = native;
      b.append(nat);
      if (english !== native) {
        const en = document.createElement('span');
        en.className = 'ln-en';
        en.textContent = english;
        b.append(en);
      }
      b.addEventListener('click', () => { setLang(code); close(); });
      li.append(b);
      menu.append(li);
    }

    function open() {
      menu.hidden = false;
      wrap.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
    function close() {
      menu.hidden = true;
      wrap.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
    btn.addEventListener('click', () => (menu.hidden ? open() : close()));
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menu.hidden) { close(); btn.focus(); }
    });

    wrap.append(btn, menu);
    document.body.append(wrap);
  }

  function init() {
    build();
    if (current !== 'en') setLang(current);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
