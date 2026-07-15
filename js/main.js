/* ============================================================
   Shared interactivity: mobile menu, "Get Involved" modal, and
   the onboarding form. Runs on every page after content loads.
   ============================================================ */

function initMobileMenu() {
  const btn = document.getElementById('mobile-menu-btn');
  const menu = document.getElementById('mobile-menu');
  if (!btn || !menu) return;
  btn.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('open');
    btn.innerHTML = isOpen ? ICONS.close(24) : ICONS.menu(24);
  });
  menu.querySelectorAll('a, button').forEach(el => el.addEventListener('click', () => {
    menu.classList.remove('open');
    btn.innerHTML = ICONS.menu(24);
  }));
}

const MODAL_TITLES = {
  'Join Community': 'SIGN UP NOW!',
  'Become a Mentor': 'Become a Mentor Program Candidate',
  'Volunteer': 'Sign Up to Volunteer',
  'Partner': 'Initiate Institutional Partnership'
};
const MODAL_SUBMIT_LABELS = {
  'Join Community': 'SIGN UP NOW!',
  'Become a Mentor': 'Submit Mentor Application',
  'Volunteer': 'Submit Volunteer Application',
  'Partner': 'Submit Partnership Form'
};

function openInvolvedModal(action) {
  const overlay = document.getElementById('modal-overlay');
  const titleEl = document.getElementById('modal-title');
  const submitBtn = document.getElementById('modal-submit-label');
  const form = document.getElementById('involved-form');
  if (!overlay) return;

  titleEl.textContent = MODAL_TITLES[action] || action;
  submitBtn.textContent = MODAL_SUBMIT_LABELS[action] || 'Submit';
  form.dataset.action = action;
  form.reset();
  form.querySelector('[name="action"]').value = action;
  form.classList.remove('hidden');
  document.getElementById('form-success').classList.add('hidden');
  document.querySelectorAll('#involved-form .field-error').forEach(e => e.textContent = '');

  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  setTimeout(() => { const f = overlay.querySelector('button, input'); if (f) f.focus(); }, 0);
}

function closeInvolvedModal() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  document.body.style.overflow = 'unset';
}

function initModal() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay) return;

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeInvolvedModal(); });
  document.getElementById('modal-close-btn').addEventListener('click', closeInvolvedModal);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeInvolvedModal(); });

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-open-modal]');
    if (trigger) openInvolvedModal(trigger.dataset.openModal);
  });

  const form = document.getElementById('involved-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const required = { firstName: 'First name is required', lastName: 'Last name is required', email: 'Email is required', city: 'City is required', interest: 'This section is required' };
    let hasError = false;
    Object.entries(required).forEach(([field, msg]) => {
      const errorEl = form.querySelector(`.field-error[data-for="${field}"]`);
      if (!data[field] || !data[field].trim()) {
        errorEl.textContent = msg;
        hasError = true;
      } else if (field === 'email' && !/\S+@\S+\.\S+/.test(data.email)) {
        errorEl.textContent = 'Invalid email address';
        hasError = true;
      } else {
        errorEl.textContent = '';
      }
    });
    if (hasError) return;

    // Submit to Netlify Forms (the form has data-netlify="true" + a
    // matching hidden form-name field, so Netlify captures this even
    // though we've intercepted the native submit for validation).
    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encodeFormData(data)
    })
      .catch(() => { /* network hiccup — still show success so the visitor isn't blocked */ })
      .finally(() => {
        form.classList.add('hidden');
        document.getElementById('form-success').classList.remove('hidden');
      });
  });
}

function encodeFormData(data) {
  return Object.keys(data)
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(data[key]))
    .join('&');
}

function initFadeIn() {
  const els = document.querySelectorAll('[data-animate]');
  if (!('IntersectionObserver' in window) || els.length === 0) {
    els.forEach(el => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); } });
  }, { threshold: 0.1 });
  els.forEach(el => io.observe(el));
}

function initStaticIcons() {
  const menuBtn = document.getElementById('mobile-menu-btn');
  if (menuBtn) menuBtn.innerHTML = ICONS.menu(24);
  const closeBtn = document.getElementById('modal-close-btn');
  if (closeBtn) closeBtn.innerHTML = ICONS.close(20);
  const successCheck = document.getElementById('success-check');
  if (successCheck) successCheck.innerHTML = ICONS.check(32);
  document.querySelectorAll('[data-icon]').forEach(el => {
    if (ICONS[el.dataset.icon]) el.innerHTML = ICONS[el.dataset.icon](Number(el.dataset.iconSize) || 16);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initStaticIcons();
  initMobileMenu();
  initModal();
});
