/* ============================================================
   Content loader — fetches the JSON / Markdown files that Decap
   CMS edits (under /content) and injects them into the static
   HTML skeleton at runtime. No build step required: publish a
   change in the CMS, Netlify deploys the updated files, and the
   browser picks them up on next load.
   ============================================================ */

async function loadJSON(path) {
  const res = await fetch(path + '?v=' + Date.now());
  if (!res.ok) throw new Error('Failed to load ' + path);
  return res.json();
}

/* Very small YAML-frontmatter parser — good enough for the flat
   key/value + simple list structure used in content/speakers/*.md */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw.trim() };
  const [, fm, body] = match;
  const data = {};
  const lines = fm.split(/\r?\n/);
  let currentKey = null;
  for (const line of lines) {
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && currentKey) {
      data[currentKey] = data[currentKey] || [];
      data[currentKey].push(stripQuotes(listItem[1].trim()));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (kv) {
      const [, key, value] = kv;
      currentKey = key;
      const trimmed = value.trim();
      if (trimmed === '' || trimmed === '[]') {
        data[key] = [];
      } else {
        data[key] = stripQuotes(trimmed);
      }
    }
  }
  return { data, body: body.trim() };
}

function stripQuotes(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function slugFromPath(path) {
  return path.split('/').pop().replace(/\.md$/, '');
}

/* ---------- Shared: settings (logo, colors, footer, nav) ---------- */

async function renderSettings() {
  const settings = await loadJSON('/content/settings.json');

  // Apply brand colors as CSS variables so every page updates
  const root = document.documentElement.style;
  root.setProperty('--color-primary', settings.colors.primary);
  root.setProperty('--color-secondary', settings.colors.secondary);
  root.setProperty('--color-accent', settings.colors.accent);
  root.setProperty('--color-yellow', settings.colors.accent_yellow);

  document.querySelectorAll('[data-logo]').forEach(el => { el.src = settings.logo; el.alt = settings.org_name + ' Logo'; if (settings.logo_height) el.style.height = settings.logo_height + 'px'; });
  document.querySelectorAll('[data-logo-white]').forEach(el => { el.src = settings.logo_white; el.alt = settings.org_name + ' Logo'; if (settings.footer_logo_height) el.style.height = settings.footer_logo_height + 'px'; });
  const faviconEl = document.getElementById('favicon-link');
  if (faviconEl && settings.favicon) faviconEl.href = settings.favicon;
  document.querySelectorAll('[data-org-name]').forEach(el => el.textContent = settings.org_name);
  document.querySelectorAll('[data-org-tagline]').forEach(el => el.textContent = settings.org_tagline);
  document.querySelectorAll('[data-nav-cta]').forEach(el => el.textContent = settings.nav_cta_label);
  document.querySelectorAll('[data-footer-blurb]').forEach(el => el.textContent = settings.footer_blurb);
  document.querySelectorAll('[data-contact-email]').forEach(el => el.textContent = settings.contact_email);
  document.querySelectorAll('[data-contact-location]').forEach(el => el.textContent = settings.contact_location);
  document.querySelectorAll('[data-footer-note]').forEach(el => el.textContent = settings.footer_note);
  document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());
  document.querySelectorAll('[data-form-success-heading]').forEach(el => el.textContent = settings.form_success_heading);
  document.querySelectorAll('[data-form-success-message]').forEach(el => el.textContent = settings.form_success_message);

  // Footer social icons — only enabled entries render, in the order
  // set in the CMS. Each icon links out to whatever URL was entered.
  const socialContainer = document.querySelector('[data-footer-social]');
  if (socialContainer) {
    const links = (settings.social_links || []).filter(s => s.enabled && s.url);
    socialContainer.innerHTML = links.map(s => `
      <a href="${s.url}" target="_blank" rel="noopener noreferrer" aria-label="${s.label || s.platform}"
         class="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
        ${ICONS[s.platform] ? ICONS[s.platform](16) : ''}
      </a>`).join('');
  }

  return settings;
}

/* ---------- Speakers ---------- */

// Fallback only — used if manifest.json is ever missing (e.g. very first
// deploy before the build script has run once). Normally the manifest,
// generated fresh on every build, is what drives this.
const SPEAKER_FILES_FALLBACK = [
  'stella-orji-dada.md',
  'marcus-chen.md',
  'amina-diop.md',
  'david-kovac.md',
  'elena-rodriguez.md',
  'tariq-mansoor.md'
];

async function loadAllSpeakers() {
  let files;
  try {
    const manifestRes = await fetch('/content/speakers/manifest.json?v=' + Date.now());
    if (!manifestRes.ok) throw new Error('no manifest');
    files = await manifestRes.json();
  } catch {
    files = SPEAKER_FILES_FALLBACK;
  }

  const speakers = await Promise.all(files.map(async (file) => {
    const res = await fetch('/content/speakers/' + file + '?v=' + Date.now());
    const raw = await res.text();
    const { data, body } = parseFrontmatter(raw);
    return {
      id: slugFromPath(file),
      name: data.name,
      position: data.position,
      image: data.image,
      experience: data.experience,
      topics: data.topics || [],
      showTopics: data.show_topics !== false,
      order: Number(data.order || 999),
      visible: data.visible !== false,
      bio: body
    };
  }));
  return speakers.filter(s => s.visible).sort((a, b) => a.order - b.order);
}

function speakerCardHTML(speaker, large) {
  return `
    <a href="/speaker.html?id=${encodeURIComponent(speaker.id)}" class="block bg-neutral-50 rounded-3xl overflow-hidden border border-neutral-100 shadow-sm hover:shadow-md transition-all group">
      <div class="aspect-[4/3] overflow-hidden relative bg-neutral-100">
        <img src="${speaker.image}" alt="${speaker.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.replaceWith(Object.assign(document.createElement('div'), {className:'w-full h-full flex items-center justify-center bg-neutral-100 text-primary/40', innerHTML: ICONS.user(32)}))">
      </div>
      <div class="p-8">
        <h3 class="font-bold text-lg text-primary mb-1 group-hover:text-secondary transition-colors">${speaker.name}</h3>
        <p class="text-sm text-neutral-500 font-medium${large ? ' mb-4' : ''}">${speaker.position}</p>
        ${large ? `<span class="inline-flex items-center gap-2 text-xs font-bold text-accent group-hover:opacity-80 transition-colors uppercase tracking-wider">View Dedicated Profile ${ICONS.arrowRight(14)}</span>` : ''}
      </div>
    </a>`;
}

/* ---------- Home page ---------- */

async function renderHomePage() {
  const data = await loadJSON('/content/home.json');
  const speakers = (await loadAllSpeakers()).slice(0, 3);
  const iconMap = { compass: 'compass', sparkles: 'sparkles', heart: 'heart', users: 'users', briefcase: 'briefcase' };
  const colorMap = { accent: 'accent', secondary: 'secondary', yellow: 'yellow', primary: 'primary' };

  const pillarsHTML = data.pillars.map(p => `
    <div class="bg-white p-10 rounded-3xl shadow-sm border border-neutral-100 flex flex-col justify-between" data-animate>
      <div>
        <div class="w-12 h-12 rounded-2xl bg-primary-5 flex items-center justify-center text-primary mb-6">${ICONS[iconMap[p.icon]](24)}</div>
        <h3 class="text-xl font-bold text-primary mb-4">${p.title}</h3>
        <p class="text-neutral-500 leading-relaxed text-sm">${p.description}</p>
      </div>
    </div>`).join('');

  const benefitsHTML = data.benefits.items.map(b => `
    <div class="bg-white/5 p-8 rounded-2xl border border-white/10 shadow-sm flex flex-col justify-between" data-animate>
      <div>
        <div class="text-accent font-bold text-3xl mb-4">${b.number}</div>
        <h4 class="font-bold text-base text-white mb-2">${b.title}</h4>
        <p class="text-white/70 text-xs leading-relaxed">${b.description}</p>
      </div>
    </div>`).join('');

  const involvedHTML = data.get_involved.items.map(i => `
    <div class="bg-neutral-50 p-8 rounded-3xl border-t-4 border-${colorMap[i.color]} shadow-sm flex flex-col justify-between" data-animate>
      <div>
        <div class="w-10 h-10 rounded-xl bg-${colorMap[i.color]}-10 text-${colorMap[i.color]} flex items-center justify-center mb-6">${ICONS[iconMap[i.icon]](20)}</div>
        <h3 class="text-xl font-bold text-primary mb-3">${i.title}</h3>
        <p class="text-neutral-500 text-sm leading-relaxed mb-8">${i.description}</p>
      </div>
      <button data-open-modal="${i.action}" class="w-full text-center bg-${colorMap[i.color]} ${i.color === 'yellow' ? 'text-neutral-900' : 'text-white'} hover-bg-${colorMap[i.color]}-dark font-bold py-3 rounded-xl transition-all shadow-sm focus:outline-none">${i.button_label}</button>
    </div>`).join('');

  // ---- Hero (green card + group photo + scrolling ticker) ----
  // Headline = plain start + highlighted ending, typed out on load by
  // initHeroTypewriter(). All of it is editable under Home Page → Hero.
  const hero = data.hero;
  const headStart = hero.headline_start || '';
  const headHighlight = hero.headline_highlight || '';
  // The green ending types first, then the headline keeps cycling through
  // these words (and loops back to the first). The hidden "ghost" copy uses
  // the longest word so the card height never changes as words swap.
  const highlightWords = [headHighlight, ...(hero.rotating_words || [])].filter(Boolean);
  const longestWord = highlightWords.reduce((a, b) => (b.length > a.length ? b : a), '');
  const headlineFull = (headStart + ' ' + headHighlight).trim();
  const tickerWords = (hero.ticker_words && hero.ticker_words.length ? hero.ticker_words : []);
  const star = '<span class="hero-ticker-star" aria-hidden="true">&#10033;</span>';
  // Words are repeated inside one group so the group is always wider than
  // the screen; the group itself is duplicated so the loop never gaps.
  const tickerGroup = '<div class="hero-ticker-group">' +
    [...tickerWords, ...tickerWords].map(w => `<span>${w}</span>${star}`).join('') + '</div>';
  const heroSubHTML = hero.subline ? `<p class="hero-sub hero-reveal" style="--d:.16s;--rise:12px">${hero.subline}</p>` : '';

  document.getElementById('page-content').innerHTML = `
    <section class="hero" id="hero">
      <span class="hero-ring hero-ring--orange" data-depth="0.3" aria-hidden="true"></span>
      <span class="hero-ring hero-ring--green" data-depth="0.3" aria-hidden="true"></span>

      <div class="hero-card-wrap">
        <div class="hero-card hero-reveal" data-depth="0.16" style="--d:0s;--rise:16px">
          <h1 class="hero-title" aria-label="${headlineFull}">
            <span class="hero-title-ghost" aria-hidden="true">${headStart} <span class="hl">${longestWord}</span></span>
            <span class="hero-title-typed" aria-hidden="true" data-typewriter data-start="${headStart}" data-words="${highlightWords.join('|')}"></span>
          </h1>
          ${heroSubHTML}
          <div class="hero-cta-row hero-reveal" style="--d:.3s;--rise:12px">
            <button data-open-modal="Join Community" class="bg-accent hover-bg-accent-dark text-white font-semibold text-base h-12 px-6 inline-flex items-center justify-center rounded-xl transition-all shadow-md focus:outline-none">${hero.cta_label}</button>
          </div>
        </div>
      </div>

      <div class="hero-photo" data-depth="0.08">
        <img src="${hero.group_image}" alt="A diverse group of newcomer youth laughing together" fetchpriority="high">
      </div>

      <div class="hero-ticker" aria-label="${tickerWords.join(', ')}">
        <div class="hero-ticker-track" aria-hidden="true">${tickerGroup}${tickerGroup}</div>
      </div>
    </section>

    <section class="bg-primary text-white py-24 border-t border-white/5">
      <div class="max-w-4xl mx-auto px-6 text-center">
        <span class="text-xs font-bold text-accent uppercase tracking-widest block mb-3">${data.who_we_are.eyebrow}</span>
        <h2 class="text-3xl md:text-4xl font-bold text-white mb-6 tracking-tight">${data.who_we_are.heading}</h2>
        <p class="text-white/80 text-lg leading-relaxed mb-8 max-w-2xl mx-auto">${data.who_we_are.paragraph}</p>
        <a href="/about.html" class="inline-flex items-center gap-2 text-white font-bold hover-text-accent transition-colors focus:outline-none group">${data.who_we_are.link_label} <span class="group-hover:translate-x-1 transition-transform">${ICONS.arrowRight(18)}</span></a>
      </div>
    </section>

    <section class="bg-neutral-50 py-24 border-y border-neutral-100">
      <div class="max-w-7xl mx-auto px-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">${pillarsHTML}</div>
      </div>
    </section>

    <section class="bg-white py-24">
      <div class="max-w-7xl mx-auto px-6">
        <div class="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
          <div>
            <span class="text-xs font-bold text-secondary uppercase tracking-widest block mb-3">${data.speakers_preview.eyebrow}</span>
            <h2 class="text-3xl md:text-4xl font-bold text-primary tracking-tight">${data.speakers_preview.heading}</h2>
          </div>
          <a href="/speakers.html" class="inline-flex items-center gap-2 text-accent font-bold hover-text-accent transition-colors focus:outline-none group">${data.speakers_preview.link_label} <span class="group-hover:translate-x-1 transition-transform">${ICONS.arrowRight(18)}</span></a>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">${speakers.map(s => speakerCardHTML(s, false)).join('')}</div>
      </div>
    </section>

    <section class="bg-primary text-white py-24 border-t border-white/5">
      <div class="max-w-7xl mx-auto px-6">
        <div class="text-center mb-16">
          <span class="text-xs font-bold text-accent uppercase tracking-widest block mb-3">${data.benefits.eyebrow}</span>
          <h2 class="text-3xl md:text-4xl font-bold text-white tracking-tight">${data.benefits.heading}</h2>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-8">${benefitsHTML}</div>
      </div>
    </section>

    <section class="bg-white py-24 border-t border-neutral-100">
      <div class="max-w-7xl mx-auto px-6">
        <div class="text-center mb-16">
          <span class="text-xs font-bold text-secondary uppercase tracking-widest block mb-3">${data.get_involved.eyebrow}</span>
          <h2 class="text-3xl md:text-4xl font-bold text-primary tracking-tight">${data.get_involved.heading}</h2>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-8">${involvedHTML}</div>
      </div>
    </section>`;
  initFadeIn();
  // Wait (briefly) for the group photo so the hero never appears with a
  // missing picture, then reveal everything together in a quick stagger.
  const heroImg = document.querySelector('.hero-photo img');
  await Promise.race([
    heroImg && heroImg.decode ? heroImg.decode().catch(() => {}) : Promise.resolve(),
    new Promise(r => setTimeout(r, 1800))
  ]);
  // Home page: show the page instantly (no fade) so the rings, photo and
  // ticker are simply there; only the card's contents stagger in.
  revealPageContent({ instant: true });
  initHeroIntro();
  initHeroParallax();
}

/* Hero intro. The card, headline, subline, button, photo and ticker all
   appear together in a quick stagger (see .hero-reveal in style.css) — the
   card never shows up empty. The headline starts typing the instant it
   appears, then the green word keeps cycling (emerging → connecting → …).
   With reduced motion on, everything is simply there and the word stays put. */
function initHeroIntro() {
  const hero = document.getElementById('hero');
  const el = document.querySelector('[data-typewriter]');
  const start = el ? (el.dataset.start || '') : '';
  const words = el ? (el.dataset.words || '').split('|').filter(Boolean) : [];
  const paint = (plain, hl) => {
    el.innerHTML = plain + (hl ? `<span class="hl">${hl}</span>` : '') + '<span class="hero-cursor"></span>';
  };
  // Prefill the headline BEFORE revealing the card (see run() below), so the
  // very first frame already has text in it.
  if (el && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const t = (start + ' ' + (words[0] || '')).split(' ');
    paint(t.slice(0, Math.max(0, t.length - 3)).join(' ') + ' ', '');
  }
  if (hero) hero.classList.add('is-ready');
  if (!el) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.innerHTML = start + (words[0] ? ` <span class="hl">${words[0]}</span>` : '');
    return;
  }

  // Timings (ms) — tweak here if it feels too fast or slow.
  const TYPE = 55;        // per character typed
  const ERASE = 30;       // per character erased
  const HOLD = 2200;      // pause on a finished word
  const GAP = 350;        // pause after erasing, before the next word
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  (async function run() {
    // The card opens already "nearly done typing": everything except the last
    // three words (waiting. It's emerging.) is on screen from the first frame,
    // and typing carries on from there — so it never shows up empty.
    const lead = start + ' ';
    const first = words[0] || '';
    const tokens = (lead + first).split(' ');
    const prefill = tokens.slice(0, Math.max(0, tokens.length - 3)).join(' ') + ' ';
    const prefillLen = Math.min(prefill.length, lead.length);
    paint(lead.slice(0, prefillLen), '');
    for (let i = prefillLen + 1; i <= lead.length; i++) { paint(lead.slice(0, i), ''); await sleep(TYPE); }
    for (let i = 1; i <= first.length; i++) { paint(lead, first.slice(0, i)); await sleep(TYPE); }
    if (words.length < 2) {
      setTimeout(() => { const c = el.querySelector('.hero-cursor'); if (c) c.remove(); }, 1600);
      return;
    }
    // 2) Keep cycling the green word
    let idx = 0;
    while (true) {
      await sleep(HOLD);
      const current = words[idx];
      for (let i = current.length - 1; i >= 0; i--) { paint(lead, current.slice(0, i)); await sleep(ERASE); }
      await sleep(GAP);
      idx = (idx + 1) % words.length;
      const next = words[idx];
      for (let i = 1; i <= next.length; i++) { paint(lead, next.slice(0, i)); await sleep(TYPE); }
    }
  })();
}

/* Hero parallax. Each layer lags the page scroll by a different amount
   (data-depth = fraction of the scroll it trails by): the rings trail most,
   then the card, then the photo, and the ticker moves with the page. So as
   you scroll, the photo rises over the card a little and the ticker slides
   up over the hero, as if covering it. Uses the standalone `translate`
   property so it never fights the intro animation's `transform`. */
function initHeroParallax() {
  const hero = document.getElementById('hero');
  if (!hero) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layers = [...hero.querySelectorAll('[data-depth]')].map(el => ({ el, f: parseFloat(el.dataset.depth) || 0 }));
  let ticking = false;
  function update() {
    const limit = hero.offsetHeight * 0.6;
    const y = Math.min(Math.max(window.scrollY, 0), limit);
    layers.forEach(l => { l.el.style.translate = `0 ${(y * l.f).toFixed(1)}px`; });
    ticking = false;
  }
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  window.addEventListener('resize', update);
  update();
}

/* ---------- About page ---------- */

async function renderAboutPage() {
  const data = await loadJSON('/content/about.json');
  const valueIconMap = { shield: 'shield', sparkles: 'sparkles', compass: 'compass', award: 'award', users: 'users', heart: 'heart' };
  const valueColorCycle = ['primary', 'secondary', 'accent', 'yellow', 'primary', 'secondary'];

  const valuesHTML = data.values.items.map((v, i) => {
    const c = valueColorCycle[i % valueColorCycle.length];
    return `
    <div class="bg-white p-8 rounded-2xl shadow-sm border border-neutral-100 flex gap-4" data-animate>
      <div class="w-10 h-10 rounded-xl bg-${c}-5 flex items-center justify-center text-${c} flex-shrink-0">${ICONS[valueIconMap[v.icon]](20)}</div>
      <div>
        <h4 class="font-bold text-primary mb-2">${v.title}</h4>
        <p class="text-neutral-500 text-xs leading-relaxed">${v.description}</p>
      </div>
    </div>`;
  }).join('');

  const involvedItems = [
    { color: 'accent', icon: 'users', title: 'Join Community', description: 'Become part of a safe, welcoming space of immigrant youth. Build deep friendships, share stories, and grow together.', button_label: 'Join Now', action: 'Join Community' },
    { color: 'secondary', icon: 'compass', title: 'Become a Mentor', description: 'Guide a newcomer youth through their academic, career, and personal transition in Canada. Share your wisdom and build a legacy.', button_label: 'Apply', action: 'Become a Mentor' },
    { color: 'yellow', icon: 'heart', title: 'Volunteer', description: 'Support our events, workshops, and wellness circles. Your time and energy can create directly tangible differences in young lives.', button_label: 'Sign Up', action: 'Volunteer' },
    { color: 'primary', icon: 'briefcase', title: 'Partner With Us', description: 'Collaborate with us as a corporate sponsor, school, or community organization to provide pathways and systemic support.', button_label: 'Partner', action: 'Partner' }
  ];
  const involvedHTML = involvedItems.map(i => `
    <div class="bg-neutral-50 p-8 rounded-3xl border-t-4 border-${i.color} shadow-sm flex flex-col justify-between" data-animate>
      <div>
        <div class="w-10 h-10 rounded-xl bg-${i.color}-10 text-${i.color} flex items-center justify-center mb-6">${ICONS[i.icon](20)}</div>
        <h3 class="text-xl font-bold text-primary mb-3">${i.title}</h3>
        <p class="text-neutral-500 text-sm leading-relaxed mb-8">${i.description}</p>
      </div>
      <button data-open-modal="${i.action}" class="w-full text-center bg-${i.color} ${i.color === 'yellow' ? 'text-neutral-900' : 'text-white'} hover-bg-${i.color}-dark font-bold py-3 rounded-xl transition-all shadow-sm focus:outline-none">${i.button_label}</button>
    </div>`).join('');

  // Founder story is split into paragraphs on blank lines — paste it as
  // one block or with blank lines between paragraphs, either works.
  // Each of the 3 pieces (story / quote / closing) has its own on/off
  // toggle in the CMS.
  const founderStoryHTML = data.founder.show_story !== false
    ? (data.founder.story || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => `<p>${p}</p>`).join('')
    : '';
  const founderQuoteHTML = data.founder.show_quote !== false && data.founder.quote
    ? `<blockquote class="border-l-4 border-accent pl-4 italic text-primary font-semibold my-6 text-base md:text-lg leading-relaxed">"${data.founder.quote}"</blockquote>`
    : '';
  const founderClosingHTML = data.founder.show_closing !== false && data.founder.closing_paragraph
    ? `<p>${data.founder.closing_paragraph}</p>`
    : '';

  document.getElementById('page-content').innerHTML = `
    <section class="bg-neutral-50 py-24 border-b border-neutral-100">
      <div class="max-w-4xl mx-auto px-6 text-center">
        <span class="text-xs font-bold text-secondary uppercase tracking-widest block mb-3">${data.hero.eyebrow}</span>
        <h1 class="text-4xl md:text-5xl lg:text-6xl font-bold text-primary tracking-tight mb-6">${data.hero.heading}</h1>
        <p class="text-neutral-500 text-lg md:text-xl leading-relaxed max-w-2xl mx-auto">${data.hero.paragraph}</p>
      </div>
    </section>

    <section class="bg-white py-24">
      <div class="max-w-3xl mx-auto px-6 text-center">
        <h2 class="text-3xl font-bold text-primary mb-6">${data.who_we_are.heading}</h2>
        <p class="text-neutral-600 text-lg leading-relaxed mb-6">${data.who_we_are.paragraph_1}</p>
        <p class="text-neutral-600 text-lg leading-relaxed">${data.who_we_are.paragraph_2}</p>
      </div>
    </section>

    <section class="bg-neutral-50 py-24 border-y border-neutral-100">
      <div class="max-w-4xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div>
          <span class="text-xs font-bold text-secondary uppercase tracking-widest block mb-3">${data.vision.eyebrow}</span>
          <h2 class="text-3xl font-bold text-primary tracking-tight mb-6">${data.vision.heading}</h2>
          <p class="text-neutral-600 leading-relaxed mb-4">${data.vision.paragraph}</p>
        </div>
        <div class="rounded-3xl overflow-hidden shadow-md"><img src="${data.vision.image}" alt="Vision representing youth collaborating" class="w-full h-full object-cover"></div>
      </div>
    </section>

    <section class="bg-white py-24">
      <div class="max-w-4xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div class="rounded-3xl overflow-hidden shadow-md order-last md:order-first"><img src="${data.mission.image}" alt="Mission representing action and support" class="w-full h-full object-cover"></div>
        <div>
          <span class="text-xs font-bold text-secondary uppercase tracking-widest block mb-3">${data.mission.eyebrow}</span>
          <h2 class="text-3xl font-bold text-primary tracking-tight mb-6">${data.mission.heading}</h2>
          <p class="text-neutral-600 leading-relaxed mb-4">${data.mission.paragraph}</p>
        </div>
      </div>
    </section>

    <section class="bg-neutral-50 py-24 border-y border-neutral-100">
      <div class="max-w-7xl mx-auto px-6">
        <div class="text-center mb-16">
          <span class="text-xs font-bold text-secondary uppercase tracking-widest block mb-3">${data.values.eyebrow}</span>
          <h2 class="text-3xl md:text-4xl font-bold text-primary tracking-tight">${data.values.heading}</h2>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">${valuesHTML}</div>
      </div>
    </section>

    <section class="bg-white py-24">
      <div class="max-w-4xl mx-auto px-6 text-center">
        <span class="text-xs font-bold text-secondary uppercase tracking-widest block mb-3">${data.promise.eyebrow}</span>
        <h2 class="text-3xl font-bold text-primary mb-6">${data.promise.heading}</h2>
        <p class="text-neutral-600 text-lg leading-relaxed max-w-2xl mx-auto">${data.promise.paragraph}</p>
      </div>
    </section>

    <section class="bg-neutral-50 py-24 border-y border-neutral-100">
      <div class="max-w-4xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div>
          <span class="text-xs font-bold text-secondary uppercase tracking-widest block mb-3">${data.who_we_serve.eyebrow}</span>
          <h2 class="text-3xl font-bold text-primary mb-6">${data.who_we_serve.heading}</h2>
          <p class="text-neutral-600 leading-relaxed">${data.who_we_serve.paragraph}</p>
        </div>
        <div class="rounded-3xl overflow-hidden shadow-md"><img src="${data.who_we_serve.image}" alt="Who we serve" class="w-full h-full object-cover"></div>
      </div>
    </section>

    <section class="bg-white py-24">
      <div class="max-w-4xl mx-auto px-6 text-center">
        <span class="text-xs font-bold text-secondary uppercase tracking-widest block mb-3">${data.why_us.eyebrow}</span>
        <h2 class="text-3xl font-bold text-primary mb-6">${data.why_us.heading}</h2>
        <p class="text-neutral-600 text-lg leading-relaxed max-w-2xl mx-auto">${data.why_us.paragraph}</p>
      </div>
    </section>

    <section class="bg-neutral-50 py-24 border-t border-neutral-100">
      <div class="max-w-7xl mx-auto px-6">
        <div class="grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
          <div class="md:col-span-4">
            <div class="aspect-[3/4] rounded-3xl overflow-hidden shadow-md border border-neutral-200 bg-neutral-100">
              <img src="${data.founder.image}" alt="${data.founder.name}, Founder" class="w-full h-full object-cover" onerror="this.replaceWith(Object.assign(document.createElement('div'), {className:'w-full h-full flex items-center justify-center text-primary/40', innerHTML: ICONS.user(64)}))">
            </div>
          </div>
          <div class="md:col-span-8">
            <span class="text-xs font-bold text-secondary uppercase tracking-widest block mb-3">${data.founder.eyebrow}</span>
            <h2 class="text-3xl font-bold text-primary mb-1">${data.founder.name}</h2>
            <p class="text-sm font-semibold text-secondary mb-6">${data.founder.title}</p>
            <div class="text-neutral-700 space-y-4 leading-relaxed text-sm md:text-base">
              ${founderStoryHTML}
              ${founderQuoteHTML}
              ${founderClosingHTML}
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="bg-white py-24 border-t border-neutral-100">
      <div class="max-w-7xl mx-auto px-6">
        <div class="text-center mb-16">
          <span class="text-xs font-bold text-secondary uppercase tracking-widest block mb-3">${data.get_involved.eyebrow}</span>
          <h2 class="text-3xl md:text-4xl font-bold text-primary tracking-tight">${data.get_involved.heading}</h2>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-8">${involvedHTML}</div>
      </div>
    </section>`;
  initFadeIn();
  revealPageContent();
}

/* ---------- Speakers list page ---------- */

async function renderSpeakersPage() {
  const speakers = await loadAllSpeakers();
  document.getElementById('page-content').innerHTML = `
    <div class="bg-white py-24">
      <div class="max-w-7xl mx-auto px-6">
        <div class="text-center mb-16">
          <span class="text-xs font-bold text-secondary uppercase tracking-widest block mb-3">Our Roster</span>
          <h1 class="text-4xl md:text-5xl font-bold text-primary tracking-tight">Our Speakers & Faculty</h1>
          <p class="text-neutral-500 text-sm md:text-base mt-4 max-w-xl mx-auto">A diverse collective of established mentors, leaders, educators, and mental wellness practitioners dedicated to serving Canadian newcomer youth.</p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">${speakers.map(s => speakerCardHTML(s, true)).join('')}</div>
      </div>
    </div>`;
  revealPageContent();
}

/* ---------- Speaker detail page ---------- */

async function renderSpeakerDetailPage() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const speakers = await loadAllSpeakers();
  const speaker = speakers.find(s => s.id === id) || speakers[0];

  document.getElementById('page-content').innerHTML = `
    <div class="bg-white py-24">
      <div class="max-w-4xl mx-auto px-6">
        <a href="/speakers.html" class="inline-flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-primary mb-12 transition-colors focus:outline-none">${ICONS.arrowLeft(16)} Back to Speakers Page</a>
        <div class="grid grid-cols-1 md:grid-cols-12 gap-12 items-start">
          <div class="md:col-span-5">
            <div class="aspect-[3/4] rounded-3xl overflow-hidden shadow-md border border-neutral-200 bg-neutral-100">
              <img src="${speaker.image}" alt="${speaker.name}" class="w-full h-full object-cover" onerror="this.replaceWith(Object.assign(document.createElement('div'), {className:'w-full h-full flex items-center justify-center text-primary/40', innerHTML: ICONS.user(64)}))">
            </div>
          </div>
          <div class="md:col-span-7">
            <h1 class="text-3xl md:text-4xl font-bold text-primary tracking-tight mb-2">${speaker.name}</h1>
            <p class="text-secondary font-semibold text-lg mb-8">${speaker.position}</p>
            <div class="space-y-6">
              <div>
                <h3 class="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Biography</h3>
                <p class="text-neutral-600 leading-relaxed text-sm md:text-base">${speaker.bio}</p>
              </div>
              <hr class="border-neutral-100">
              <div>
                <h3 class="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2">Experience & Background</h3>
                <p class="text-neutral-600 leading-relaxed text-sm md:text-base">${speaker.experience}</p>
              </div>
              ${speaker.showTopics && speaker.topics.length > 0 ? `
              <hr class="border-neutral-100">
              <div>
                <h3 class="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">Key Speaking Topics</h3>
                <ul class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  ${speaker.topics.map(t => `<li class="flex items-center gap-2 text-neutral-600 font-medium"><span class="w-1.5 h-1.5 rounded-full bg-secondary flex-shrink-0"></span>${t}</li>`).join('')}
                </ul>
              </div>` : ''}
            </div>
          </div>
        </div>
      </div>
    </div>`;
  document.title = speaker.name + ' — The Emerging Generation';
  revealPageContent();
}


/* ---------- Gallery ---------- */
/* Page structure (all editable in Decap → Gallery):
     /gallery.html                       → a thumbnail for each collection
                                           (e.g. "Unshaken 2026 Media").
     /gallery.html?c=<slug>              → that collection: a Photos thumbnail
                                           and/or a Videos thumbnail.
     /gallery.html?c=<slug>&view=photos  → photos, in optional headed categories.
     /gallery.html?c=<slug>&view=videos  → videos, each with an optional title.
   Layout rule for photos and videos: 3 or fewer = equal-size thumbnails in a
   row; 4 or more = masonry (first row always starts level at the top). */

// Local images go through Netlify's image resizer so phone-sized originals
// don't make the page heavy. If that isn't available (e.g. a local preview)
// the <img> quietly falls back to the original file.
function galleryImg(path, width) {
  if (!path || /^https?:/i.test(path)) return path;
  return '/.netlify/images?url=' + encodeURIComponent(path) + '&w=' + width;
}
const GALLERY_IMG_FALLBACK = 'onerror="this.onerror=null;this.src=this.dataset.orig"';

function gallerySlug(title) {
  return String(title || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim()
    .replace(/\s+/g, '-').replace(/-+/g, '-') || 'album';
}

// Each collection (e.g. "Unshaken 2026 Media") has a photos part and/or a videos part.
function galleryCollectionsFrom(data) {
  const seen = {};
  const out = [];
  (data.collections || []).forEach(c => {
    const groups = (c.photo_sections || []).map(g => {
      let photos = [].concat(g.photos || []).filter(Boolean);
      if (g.newest_first) photos = photos.slice().reverse();
      return { heading: g.heading || '', photos };
    }).filter(g => g.photos.length);
    const photos = groups.flatMap(g => g.photos);
    const videos = (c.videos || []).map(parseGalleryVideo).filter(Boolean);
    if (!photos.length && !videos.length) return;
    let slug = gallerySlug(c.title);
    seen[slug] = (seen[slug] || 0) + 1;
    if (seen[slug] > 1) slug += '-' + seen[slug];
    const videoThumb = videos.map(galleryVideoThumbURL).find(Boolean) || '';
    out.push({
      title: c.title || 'Untitled', slug, groups, photos, videos,
      cover: c.cover || photos[0] || videoThumb,
      photosCover: c.photos_cover || photos[0] || '',
      videosCover: c.videos_cover || videoThumb
    });
  });
  return out;
}

/* ----- Videos: any link ----- */

const VIDEO_SHAPES = { landscape: '16 / 9', square: '1 / 1', vertical: '9 / 16' };

function parseGalleryVideo(v) {
  if (!v) return null;
  const base = { title: v.title || '', custom: v.thumbnail || '' };
  const shapeChoice = VIDEO_SHAPES[v.shape] ? v.shape : '';
  const url = (v.video_url || '').trim();
  if (url) {
    let m;
    if ((m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/))) {
      const vertical = /\/shorts\//.test(url);
      return { ...base, kind: 'youtube', platform: 'YouTube', id: m[1], shape: shapeChoice || (vertical ? 'vertical' : 'landscape') };
    }
    if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/))) {
      return { ...base, kind: 'vimeo', platform: 'Vimeo', id: m[1], shape: shapeChoice || 'landscape' };
    }
    if ((m = url.match(/instagram\.com\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]+)/))) {
      const type = m[1] === 'reels' ? 'reel' : m[1];
      return { ...base, kind: 'instagram', platform: 'Instagram', url, embed: `https://www.instagram.com/${type}/${m[2]}/embed`, shape: shapeChoice || (type === 'p' ? 'square' : 'vertical') };
    }
    if ((m = url.match(/tiktok\.com\/(?:@[\w.-]+\/video|embed\/v2)\/(\d+)/))) {
      return { ...base, kind: 'tiktok', platform: 'TikTok', url, embed: `https://www.tiktok.com/embed/v2/${m[1]}`, shape: shapeChoice || 'vertical' };
    }
    if (/facebook\.com|fb\.watch/.test(url)) {
      return { ...base, kind: 'facebook', platform: 'Facebook', url, embed: 'https://www.facebook.com/plugins/video.php?show_text=false&href=' + encodeURIComponent(url), shape: shapeChoice || 'landscape' };
    }
    if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url)) {
      return { ...base, kind: 'file', platform: 'Video', src: url, shape: shapeChoice || 'landscape' };
    }
    // Any other link (X, LinkedIn, a short TikTok link, a website…): shown as a
    // card that opens the original in a new tab.
    let host = 'Video';
    try { host = new URL(url).hostname.replace(/^www\./, '').replace(/^(vm|vt)\./, ''); } catch (e) { /* keep default */ }
    const known = /tiktok/.test(host) ? 'TikTok' : host;
    return { ...base, kind: 'link', platform: known, url, shape: shapeChoice || (/tiktok/.test(host) ? 'vertical' : 'landscape') };
  }
  if (v.video_file) return { ...base, kind: 'file', platform: 'Video', src: v.video_file, shape: shapeChoice || 'landscape' };
  return null;
}

function galleryVideoThumbURL(v) {
  if (v.custom) return v.custom;
  if (v.kind === 'youtube') return 'https://i.ytimg.com/vi/' + v.id + '/hqdefault.jpg';
  return '';
}

// Thumbnail priority: your own image → the platform's own frame (YouTube,
// Vimeo, TikTok when it will share it) → first moments of an uploaded file →
// a brand-coloured card naming the platform.
function galleryVideoCardHTML(v, shape) {
  let thumb = '';
  if (v.custom) {
    thumb = `<img src="${galleryImg(v.custom, 900)}" data-orig="${encodeURI(v.custom)}" alt="" loading="lazy" decoding="async" ${GALLERY_IMG_FALLBACK}>`;
  } else if (v.kind === 'youtube') {
    thumb = `<img src="https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg" alt="" loading="lazy" decoding="async"
      onload="if(this.naturalWidth<=120){this.onload=null;this.src='https://i.ytimg.com/vi/${v.id}/hqdefault.jpg'}"
      onerror="this.onerror=function(){this.remove()};this.src='https://i.ytimg.com/vi/${v.id}/hqdefault.jpg'">`;
  } else if (v.kind === 'file') {
    thumb = `<video src="${encodeURI(v.src)}#t=0.5" muted playsinline preload="metadata" tabindex="-1" aria-hidden="true"></video>`;
  }
  const hasThumb = Boolean(thumb) || v.kind === 'vimeo';
  const chip = hasThumb ? '' : `<span class="video-chip">${v.platform}${v.kind === 'link' ? ' ↗' : ''}</span>`;
  const label = `${v.kind === 'link' ? 'Open' : 'Play'} video${v.title ? ': ' + v.title : ''}`;
  const attrs = v.kind === 'file' ? `data-file="${encodeURI(v.src)}"`
    : v.kind === 'youtube' ? `data-embed="https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0"`
    : v.kind === 'vimeo' ? `data-embed="https://player.vimeo.com/video/${v.id}?autoplay=1" data-vimeo="${v.id}"`
    : v.kind === 'link' ? ''
    : `data-embed="${v.embed}"${v.kind === 'tiktok' ? ` data-tiktok="${encodeURI(v.url)}"` : ''}`;
  const inner = `${thumb}${chip}<span class="video-play">${ICONS.play(28)}</span>`;
  const poster = v.kind === 'link'
    ? `<a class="video-poster" href="${encodeURI(v.url)}" target="_blank" rel="noopener noreferrer" aria-label="${label}">${inner}</a>`
    : `<button type="button" class="video-poster" ${attrs} aria-label="${label}">${inner}</button>`;
  return `
    <div class="video-item" data-animate>
      <div class="video-card" style="aspect-ratio:${VIDEO_SHAPES[shape]}">${poster}</div>
      ${v.title ? `<p class="mt-3 font-semibold text-primary leading-snug">${v.title}</p>` : ''}
    </div>`;
}

function galleryVideoGroupHTML(videos) {
  const counts = { landscape: 0, square: 0, vertical: 0 };
  videos.forEach(v => counts[v.shape]++);
  const dominant = ['landscape', 'square', 'vertical'].sort((a, b) => counts[b] - counts[a])[0];
  if (videos.length <= 3) {
    // Equal thumbnails: every card uses the section's most common shape
    const cols = dominant === 'landscape' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
    return `<div class="grid ${cols} gap-4 md:gap-6">${videos.map(v => galleryVideoCardHTML(v, dominant)).join('')}</div>`;
  }
  const tall = counts.vertical + counts.square > 0;
  const cols = tall ? '--c0:2;--c1:3;--c2:4' : '--c0:1;--c1:2;--c2:3';
  return `<div class="masonry" style="${cols}">${videos.map(v => `<div class="masonry-item">${galleryVideoCardHTML(v, v.shape)}</div>`).join('')}</div>`;
}

function initGalleryVideos() {
  document.querySelectorAll('button.video-poster').forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.file) {
      const vid = document.createElement('video');
      vid.src = decodeURI(btn.dataset.file); vid.controls = true; vid.autoplay = true; vid.playsInline = true;
      btn.replaceWith(vid);
    } else {
      const frame = document.createElement('iframe');
      frame.src = btn.dataset.embed;
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write';
      frame.allowFullscreen = true;
      frame.title = 'Event video';
      btn.replaceWith(frame);
    }
  }));
  // Vimeo and TikTok hand out thumbnails through a public lookup
  const lookups = [
    ['[data-vimeo]', btn => 'https://vimeo.com/api/oembed.json?width=1280&url=' + encodeURIComponent('https://vimeo.com/' + btn.dataset.vimeo)],
    ['[data-tiktok]', btn => 'https://www.tiktok.com/oembed?url=' + encodeURIComponent(decodeURI(btn.dataset.tiktok))]
  ];
  lookups.forEach(([selector, makeUrl]) => {
    document.querySelectorAll('button.video-poster' + selector).forEach(btn => {
      if (btn.querySelector('img')) return;
      fetch(makeUrl(btn))
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(info => {
          if (!info.thumbnail_url) return;
          const img = new Image();
          img.alt = ''; img.decoding = 'async'; img.src = info.thumbnail_url;
          btn.querySelector('.video-chip')?.remove();
          btn.prepend(img);
        })
        .catch(() => { /* keep the plain card */ });
    });
  });
}

/* ----- Masonry (4+ items): columns fill left-to-right so the first row is
   level at the top; each item spans as many 1px rows as it is tall. ----- */
function initMasonry() {
  const grids = [...document.querySelectorAll('.masonry')];
  if (!grids.length) return;
  let frame;
  const layout = () => {
    grids.forEach(g => {
      const gap = parseFloat(getComputedStyle(g).columnGap) || 12;
      g.querySelectorAll(':scope > .masonry-item').forEach(it => {
        it.style.gridRowEnd = 'span ' + Math.ceil(it.firstElementChild.offsetHeight + gap);
      });
      g.classList.add('is-laid-out');
    });
  };
  const queue = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(layout); };
  grids.forEach(g => g.addEventListener('load', queue, true));   // images finishing loading
  window.addEventListener('resize', queue);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(queue);
  layout();
}

/* ----- Pages ----- */

const GALLERY_TITLE_SUFFIX = ' — The Emerging Generation';

function galleryCardHTML(href, img, title, sub) {
  const pic = img
    ? `<img src="${galleryImg(img, 900)}" data-orig="${encodeURI(img)}" alt="" loading="lazy" decoding="async" ${GALLERY_IMG_FALLBACK} class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">`
    : `<div class="w-full h-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white/90">${ICONS.play(44)}</div>`;
  return `
    <a href="${href}" class="block bg-neutral-50 rounded-3xl overflow-hidden border border-neutral-100 shadow-sm hover:shadow-md transition-all group" data-animate>
      <div class="aspect-[4/3] overflow-hidden bg-neutral-100">${pic}</div>
      <div class="p-6">
        <h2 class="font-bold text-lg md:text-xl text-primary group-hover:text-secondary transition-colors leading-snug">${title}</h2>
        ${sub ? `<p class="text-sm text-neutral-500 font-medium mt-1">${sub}</p>` : ''}
      </div>
    </a>`;
}

function galleryShell(inner, wide) {
  document.getElementById('page-content').innerHTML = `
    <div class="bg-white py-12 md:py-20">
      <div class="max-w-7xl mx-auto ${wide ? 'px-4' : 'px-6'} md:px-6">${inner}</div>
    </div>`;
}

const galleryBack = (href, label) =>
  `<a href="${href}" class="inline-flex items-center gap-2 text-sm font-bold text-neutral-500 hover:text-primary mb-6 transition-colors focus:outline-none">${ICONS.arrowLeft(16)} ${label}</a>`;

async function renderGalleryPage() {
  let data = {};
  try { data = await loadJSON('/content/gallery.json'); } catch (e) { /* empty gallery */ }
  const collections = galleryCollectionsFrom(data);
  const params = new URLSearchParams(window.location.search);
  const col = collections.find(c => c.slug === params.get('c'));
  if (col) {
    const view = params.get('view');
    if (view === 'photos' && col.photos.length) return renderGalleryPhotos(col);
    if (view === 'videos' && col.videos.length) return renderGalleryVideos(col);
    return renderGalleryCollection(col);
  }
  return renderGalleryIndex(collections);
}

function galleryFinish() {
  initGalleryVideos();
  initMasonry();
  initFadeIn();
  revealPageContent();
}

// Gallery home: one thumbnail per collection, nothing else.
function renderGalleryIndex(collections) {
  document.title = 'Gallery' + GALLERY_TITLE_SUFFIX;
  galleryShell(`
    <h1 class="sr-only">Gallery</h1>
    ${collections.length ? `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
      ${collections.map(c => galleryCardHTML('/gallery.html?c=' + encodeURIComponent(c.slug), c.cover, c.title)).join('')}
    </div>` : '<p class="text-center text-neutral-400 py-16">Photos and videos from our events will appear here.</p>'}`);
  galleryFinish();
}

// Inside a collection: a Photos thumbnail and/or a Videos thumbnail.
function renderGalleryCollection(col) {
  document.title = col.title + GALLERY_TITLE_SUFFIX;
  const base = '/gallery.html?c=' + encodeURIComponent(col.slug) + '&view=';
  const cards = [];
  if (col.photos.length) cards.push(galleryCardHTML(base + 'photos', col.photosCover, 'Photos'));
  if (col.videos.length) cards.push(galleryCardHTML(base + 'videos', col.videosCover, 'Videos'));
  galleryShell(`
    ${galleryBack('/gallery.html', 'Back to Gallery')}
    <h1 class="text-3xl md:text-5xl font-bold text-primary tracking-tight mb-10 md:mb-14">${col.title}</h1>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 md:gap-8 ${cards.length === 1 ? 'sm:max-w-[calc(50%-1rem)]' : ''}">${cards.join('')}</div>`);
  galleryFinish();
}

function renderGalleryVideos(col) {
  document.title = col.title + ' — Videos' + GALLERY_TITLE_SUFFIX;
  galleryShell(`
    ${galleryBack('/gallery.html?c=' + encodeURIComponent(col.slug), 'Back to ' + col.title)}
    <h1 class="text-3xl md:text-5xl font-bold text-primary tracking-tight mb-10 md:mb-14">Videos</h1>
    ${galleryVideoGroupHTML(col.videos)}`);
  galleryFinish();
}

function galleryPhotoGroupHTML(photos, start) {
  const photo = (src, i, equal) => `
    <button type="button" class="gallery-item${equal ? ' gallery-item--equal' : ''}" data-index="${start + i}" data-animate aria-label="Open photo ${start + i + 1}">
      <img src="${galleryImg(src, 700)}" data-orig="${encodeURI(src)}" alt="" loading="${start + i < 12 ? 'eager' : 'lazy'}" decoding="async" ${GALLERY_IMG_FALLBACK}>
    </button>`;
  if (photos.length <= 3) {
    return `<div class="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">${photos.map((s, i) => photo(s, i, true)).join('')}</div>`;
  }
  return `<div class="masonry" style="--c0:2;--c1:3;--c2:4">${photos.map((s, i) => `<div class="masonry-item">${photo(s, i, false)}</div>`).join('')}</div>`;
}

function renderGalleryPhotos(col) {
  document.title = col.title + ' — Photos' + GALLERY_TITLE_SUFFIX;
  let start = 0;
  const groupsHTML = col.groups.map(g => {
    const html = `<section>
      ${g.heading ? `<h2 class="text-xl md:text-2xl font-bold text-primary tracking-tight mb-5 md:mb-6">${g.heading}</h2>` : ''}
      ${galleryPhotoGroupHTML(g.photos, start)}</section>`;
    start += g.photos.length;
    return html;
  }).join('');
  galleryShell(`
    ${galleryBack('/gallery.html?c=' + encodeURIComponent(col.slug), 'Back to ' + col.title)}
    <h1 class="text-3xl md:text-5xl font-bold text-primary tracking-tight mb-10 md:mb-14">Photos</h1>
    <div class="space-y-14 md:space-y-20">${groupsHTML}</div>`, true);
  initGalleryLightbox(col.photos);
  initMasonry();
  initFadeIn();
  revealPageContent();
}

function initGalleryLightbox(photos) {
  if (!photos.length) return;
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Photo viewer');
  box.hidden = true;
  box.innerHTML = `
    <button type="button" class="lb-btn lb-close" aria-label="Close">${ICONS.close(26)}</button>
    <button type="button" class="lb-btn lb-prev" aria-label="Previous photo">${ICONS.arrowLeft(26)}</button>
    <img class="lb-img" alt="">
    <button type="button" class="lb-btn lb-next" aria-label="Next photo">${ICONS.arrowRight(26)}</button>`;
  document.body.appendChild(box);

  const img = box.querySelector('.lb-img');
  let index = 0, opener = null;

  const preload = (i) => { const n = new Image(); n.src = galleryImg(photos[(i + photos.length) % photos.length], 1800); };
  function show(i) {
    index = (i + photos.length) % photos.length;
    img.classList.remove('is-in');
    img.onerror = () => { img.onerror = null; img.src = encodeURI(photos[index]); };
    img.onload = () => img.classList.add('is-in');
    img.src = galleryImg(photos[index], 1800);
    preload(index + 1); preload(index - 1);
  }
  function open(i, trigger) {
    opener = trigger || null;
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    show(i);
    box.querySelector('.lb-close').focus();
  }
  function close() {
    box.hidden = true;
    document.body.style.overflow = '';
    img.removeAttribute('src');
    if (opener) opener.focus();
  }

  document.querySelectorAll('.gallery-item').forEach(el =>
    el.addEventListener('click', () => open(Number(el.dataset.index), el)));
  box.querySelector('.lb-close').addEventListener('click', close);
  box.querySelector('.lb-prev').addEventListener('click', (e) => { e.stopPropagation(); show(index - 1); });
  box.querySelector('.lb-next').addEventListener('click', (e) => { e.stopPropagation(); show(index + 1); });
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  window.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(index - 1);
    else if (e.key === 'ArrowRight') show(index + 1);
  });

  // Swipe left / right on touch screens
  let startX = null;
  box.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
  box.addEventListener('touchend', (e) => {
    if (startX === null) return;
    const dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
  }, { passive: true });
}
