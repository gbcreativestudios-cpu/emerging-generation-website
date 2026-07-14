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
      if (value.trim() === '') {
        data[key] = [];
      } else {
        data[key] = stripQuotes(value.trim());
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

  document.querySelectorAll('[data-logo]').forEach(el => { el.src = settings.logo; el.alt = settings.org_name + ' Logo'; });
  document.querySelectorAll('[data-logo-white]').forEach(el => { el.src = settings.logo_white; el.alt = settings.org_name + ' Logo'; });
  document.querySelectorAll('[data-org-name]').forEach(el => el.textContent = settings.org_name);
  document.querySelectorAll('[data-org-tagline]').forEach(el => el.textContent = settings.org_tagline);
  document.querySelectorAll('[data-nav-cta]').forEach(el => el.textContent = settings.nav_cta_label);
  document.querySelectorAll('[data-footer-blurb]').forEach(el => el.textContent = settings.footer_blurb);
  document.querySelectorAll('[data-contact-email]').forEach(el => el.textContent = settings.contact_email);
  document.querySelectorAll('[data-contact-location]').forEach(el => el.textContent = settings.contact_location);
  document.querySelectorAll('[data-footer-note]').forEach(el => el.textContent = settings.footer_note);
  document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());

  return settings;
}

/* ---------- Speakers ---------- */

const SPEAKER_FILES = [
  'stella-orji-dada.md',
  'marcus-chen.md',
  'amina-diop.md',
  'david-kovac.md',
  'elena-rodriguez.md',
  'tariq-mansoor.md'
];

async function loadAllSpeakers() {
  const speakers = await Promise.all(SPEAKER_FILES.map(async (file) => {
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
      order: Number(data.order || 999),
      bio: body
    };
  }));
  speakers.sort((a, b) => a.order - b.order);
  return speakers;
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

  document.getElementById('page-content').innerHTML = `
    <section class="relative overflow-hidden bg-white pt-24 pb-20">
      <div class="max-w-5xl mx-auto px-6 text-center flex flex-col items-center">
        <span class="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-secondary-10 text-secondary text-xs font-semibold tracking-wider uppercase mb-8">${ICONS.calendar(12)} ${data.hero.badge}</span>
        <h1 class="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tight text-primary uppercase leading-none">${data.hero.title}</h1>
        <span class="block text-2xl md:text-3xl font-extrabold tracking-wide text-secondary uppercase mt-2 mb-6">${data.hero.theme}</span>
        <p class="text-neutral-500 text-lg md:text-xl leading-relaxed max-w-xl mx-auto mb-10">${data.hero.paragraph}</p>
        <div class="mb-20">
          <button data-open-modal="Join Community" class="bg-accent hover-bg-accent-dark text-white font-black text-lg md:text-xl px-12 py-5 rounded-2xl transition-all shadow-lg hover:scale-[1.02] focus:outline-none flex items-center justify-center min-h-[64px]">${data.hero.cta_label}</button>
        </div>
        <div class="w-full max-w-4xl aspect-[21/9] rounded-3xl overflow-hidden shadow-xl border border-neutral-100 relative group">
          <img src="${data.hero.image}" alt="Immigrant and newcomer youth connected together outdoors" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out">
          <div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent flex items-end p-8">
            <p class="text-white font-medium text-sm md:text-base backdrop-blur-sm bg-white/10 px-4 py-2 rounded-xl">${data.hero.image_caption}</p>
          </div>
        </div>
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
      <div class="max-w-5xl mx-auto px-6">
        <div class="grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
          <div class="md:col-span-5">
            <div class="aspect-[3/4] rounded-3xl overflow-hidden shadow-md border border-neutral-200 bg-neutral-100">
              <img src="${data.founder.image}" alt="${data.founder.name}, Founder" class="w-full h-full object-cover" onerror="this.replaceWith(Object.assign(document.createElement('div'), {className:'w-full h-full flex items-center justify-center text-primary/40', innerHTML: ICONS.user(64)}))">
            </div>
          </div>
          <div class="md:col-span-7">
            <span class="text-xs font-bold text-secondary uppercase tracking-widest block mb-3">${data.founder.eyebrow}</span>
            <h2 class="text-3xl font-bold text-primary mb-1">${data.founder.name}</h2>
            <p class="text-sm font-semibold text-secondary mb-6">${data.founder.title}</p>
            <div class="text-neutral-700 space-y-4 leading-relaxed text-sm md:text-base">
              ${data.founder.paragraphs.map(p => `<p>${p}</p>`).join('')}
              <blockquote class="border-l-4 border-accent pl-4 italic text-primary font-semibold my-6 text-base md:text-lg leading-relaxed">"${data.founder.quote}"</blockquote>
              <p>${data.founder.closing_paragraph}</p>
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
              <hr class="border-neutral-100">
              <div>
                <h3 class="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">Key Speaking Topics</h3>
                <ul class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  ${speaker.topics.map(t => `<li class="flex items-center gap-2 text-neutral-600 font-medium"><span class="w-1.5 h-1.5 rounded-full bg-secondary flex-shrink-0"></span>${t}</li>`).join('')}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  document.title = speaker.name + ' — The Emerging Generation';
}
