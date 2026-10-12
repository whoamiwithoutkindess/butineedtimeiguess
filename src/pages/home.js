import { getApp } from '../main.js';
import { renderDashboard } from './dashboard.js';
import { getStats, updateProfile } from './stats.js';
import { ic } from './icons.js';

/* =========================================================
   KONFIGURASI
   Semua angka waktu ada di sini. Kalau mau ubah, cukup ubah
   di satu tempat. Durasi keluar & tutup harus sama dengan
   durasi animasi `.is-leaving` / `.is-closing` di CSS.
   ========================================================= */

const TIMING = Object.freeze({
  pageLeave: 240,
  modalClose: 220,
  typingStart: 500,
  typingFieldPause: 170,
  typingMinDelay: 16,
  typingMaxDelay: 46,
  typingBudget: 1800,
});

/* =========================================================
   TEKS (COPY)
   Semua string yang tampil di UI dikumpulkan di sini supaya
   mudah direvisi atau diterjemahkan tanpa menyentuh template.
   ========================================================= */

const COPY = Object.freeze({
  brand: {
    name: 'DharmaLearn',
    symbol: 'ॐ',
  },

  nav: {
    about: 'Tentang',
  },

  home: {
    eyebrow: 'PEMBELAJARAN AGAMA HINDU',
    titleLead: 'Kenali Dharma,',
    titleAccent: 'dengan caramu sendiri.',
    description:
      'Pelajari ajaran, nilai, dan filosofi Hindu melalui materi yang ringkas dan runtut. Progres belajar tercatat otomatis tanpa perlu membuat akun.',
    cta: 'Mulai Belajar',
    footer: 'DharmaLearn · Media Pembelajaran Agama Hindu',
  },

  about: {
    eyebrow: 'TENTANG APLIKASI',
    title: 'Tim Pengembang',
    description:
      'DharmaLearn dikembangkan oleh tim berikut sebagai media pembelajaran agama Hindu.',
    close: 'Tutup',
  },

  profile: {
    back: 'Kembali',
    titleNew: 'Lengkapi Data Anda',
    titleReturning: 'Selamat Datang Kembali',
    descriptionNew:
      'Nama, kelas, dan sekolah digunakan untuk mencatat progres belajar Anda. Tanpa akun, tanpa kata sandi.',
    descriptionReturning:
      'Data Anda masih tersimpan di perangkat ini. Perbarui bila perlu, atau langsung lanjutkan belajar.',
    privacyNote:
      'Akun lokal, tanpa akun online. Data hanya tersimpan di perangkat ini dan tidak dikirim ke server mana pun.',
    submitNew: 'Mulai Belajar',
    submitReturning: 'Lanjutkan Belajar',
    required: (label) => `${label} wajib diisi.`,
  },
});

/* Anggota tim pengembang */
const MEMBERS = Object.freeze([
  { name: 'I Kadek Agus Meingantara', absen: '14/XI A' },
  { name: 'I Kadek Deny Bawa Sagiarta', absen: '15/XI A' },
  { name: 'Putu Agung Kesuma Wijaya', absen: '26/XI A' },
  { name: 'I Putu Tristan Putra Yugiawan', absen: '28/XI A' },
  { name: 'Made Alvito Abimanyu', absen: '37/XI A' },
  { name: 'Pande Putu Shiro Handara', absen: '42/XI A' },
]);

/* Kolom profil. Id-nya sama dengan data di stats.js, jadi langsung
   terbaca di halaman Profil dan Dashboard. */
const FIELDS = Object.freeze([
  { id: 'name', label: 'Nama Lengkap', icon: 'user', placeholder: 'Contoh: Deny', max: 40, autocomplete: 'name' },
  { id: 'grade', label: 'Kelas', icon: 'duo', placeholder: 'Contoh: XI A', max: 20, autocomplete: 'off' },
  { id: 'school', label: 'Asal Sekolah', icon: 'home', placeholder: 'Nama sekolah', max: 60, autocomplete: 'organization' },
]);

/* =========================================================
   UTILITAS
   ========================================================= */

const reduceMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/* Semua data dinamis yang masuk ke template wajib lewat sini */
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);


/* =========================================================
   TRANSISI HALAMAN
   Halaman memudar + blur + naik sedikit dulu, baru pindah.
   Halaman tujuan masuk lewat animasi `.page` di CSS.
   ========================================================= */

let leaving = false;

function leaveThen(action) {
  const page = document.querySelector('.page');

  if (leaving) return;

  unbindEnter();

  if (!page || reduceMotion()) {
    action();
    return;
  }

  leaving = true;
  page.classList.add('is-leaving');

  setTimeout(action, TIMING.pageLeave);
}

/* =========================================================
   PINTASAN ENTER
   Hanya satu pendengar aktif pada satu waktu: tiap halaman
   mendaftarkan aksinya sendiri, dan dilepas saat berpindah.
   Enter diabaikan kalau fokus ada di tombol / kolom isian
   (sudah ditangani browser) atau saat modal sedang terbuka.
   ========================================================= */

let enterListener = null;

function unbindEnter() {
  if (!enterListener) return;

  document.removeEventListener('keydown', enterListener);
  enterListener = null;
}

function bindEnter(action) {
  unbindEnter();

  enterListener = (e) => {
    if (e.key !== 'Enter' || e.repeat || e.isComposing || e.defaultPrevented) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (document.querySelector('.about-overlay')) return;
    if (e.target.closest?.('button, a, input, textarea, select, [contenteditable="true"]')) return;

    e.preventDefault();
    action();
  };

  document.addEventListener('keydown', enterListener);
}

/* =========================================================
   TEMPLATE
   ========================================================= */

function homeTemplate() {
  const { brand, nav, home } = COPY;

  return `
    <main class="page home-page">
      <div class="ambient ambient-a"></div>
      <div class="ambient ambient-b"></div>

      <nav class="navbar">
        <button class="brand" id="brandHome" type="button">
          <span class="brand-symbol">${brand.symbol}</span>
          <span>${brand.name}</span>
        </button>

        <button class="nav-login" id="navAbout" type="button">
          ${ic('info', 16)}
          <span>${nav.about}</span>
        </button>
      </nav>

      <section class="hero">
        <div class="hero-copy">
          <span class="eyebrow">${home.eyebrow}</span>

          <h1>
            ${home.titleLead}<br>
            <span>${home.titleAccent}</span>
          </h1>

          <p>${home.description}</p>

          <div class="hero-actions">
            <button class="primary-button" id="heroStart" type="button">
              <span>${home.cta}</span>
              <span class="cta-icon">${ic('back', 22)}</span>
            </button>
          </div>
        </div>

        <div class="dharma-art" aria-hidden="true">
          <div class="sun"></div>

          <div class="lotus">
            ${'<i></i>'.repeat(8)}
          </div>

          <div class="art-ring ring-one"></div>
          <div class="art-ring ring-two"></div>

          <div class="om-center">${brand.symbol}</div>
        </div>
      </section>

      <footer>${home.footer}</footer>
    </main>
  `;
}

function aboutTemplate() {
  const { about } = COPY;

  return `
    <div
      class="about-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="aboutTitle"
    >
      <button
        class="about-close"
        id="closeAbout"
        type="button"
        aria-label="${about.close}"
      >
        ${ic('close', 18)}
      </button>

      <span class="eyebrow">${about.eyebrow}</span>

      <h2 id="aboutTitle">${about.title}</h2>

      <p class="about-description">${about.description}</p>

      <div class="about-members">
        ${MEMBERS.map((m, i) => `
          <div class="about-member" style="--i:${i}">
            <div class="about-member-index">${i + 1}</div>
            <div class="about-member-info">
              <span class="about-member-name">${esc(m.name)}</span>
              <span class="about-member-absen">${esc(m.absen)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function fieldTemplate(f) {
  return `
    <div class="anon-field" data-field="${f.id}">
      <label for="f-${f.id}">${f.label}</label>

      <div class="anon-field-box">
        ${ic(f.icon, 18)}
        <input
          class="anon-input"
          id="f-${f.id}"
          type="text"
          maxlength="${f.max}"
          placeholder="${esc(f.placeholder)}"
          autocomplete="${f.autocomplete}"
        >
      </div>

      <span class="anon-error" role="alert"></span>
    </div>
  `;
}

function profileTemplate(isReturning) {
  const { brand, profile } = COPY;

  return `
    <main class="page anon-page">
      <div class="ambient ambient-a"></div>
      <div class="ambient ambient-b"></div>

      <section class="anon-card">
        <button
          class="anon-back"
          id="backHome"
          type="button"
          aria-label="${profile.back}"
        >
          ${ic('back', 20)}
        </button>

        <div class="anon-head">
          <span class="brand-symbol large">${brand.symbol}</span>

          <h1>${isReturning ? profile.titleReturning : profile.titleNew}</h1>

          <p>${isReturning ? profile.descriptionReturning : profile.descriptionNew}</p>
        </div>

        <form class="anon-form" id="profileForm" novalidate>
          ${FIELDS.map(fieldTemplate).join('')}

          <p class="anon-note">
            ${ic('info', 16)}
            <span>${profile.privacyNote}</span>
          </p>

          <button class="primary-button" type="submit">
            ${isReturning ? profile.submitReturning : profile.submitNew}
          </button>
        </form>
      </section>
    </main>
  `;
}

/* =========================================================
   HALAMAN HOME
   ========================================================= */

export function renderHome() {
  const app = getApp();

  leaving = false;
  app.innerHTML = homeTemplate();

  document.querySelector('#brandHome').onclick = () => leaveThen(renderHome);
  document.querySelector('#heroStart').onclick = () => leaveThen(renderAnonymous);
  document.querySelector('#navAbout').onclick = openAbout;

  bindEnter(() => leaveThen(renderAnonymous));
}

/* Modal Tentang */
function openAbout() {
  const modal = document.createElement('div');

  modal.className = 'about-overlay';
  modal.innerHTML = aboutTemplate();

  document.body.appendChild(modal);

  const closeBtn = modal.querySelector('#closeAbout');

  /* Tutup: memudar + blur + turun sedikit, baru dihapus */
  const closeModal = () => {
    if (modal.classList.contains('is-closing')) return;

    document.removeEventListener('keydown', onKeydown);

    if (reduceMotion()) {
      modal.remove();
      return;
    }

    modal.classList.add('is-closing');
    setTimeout(() => modal.remove(), TIMING.modalClose);
  };

  function onKeydown(e) {
    if (e.key === 'Escape') closeModal();
  }

  closeBtn.onclick = closeModal;

  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };

  document.addEventListener('keydown', onKeydown);
  closeBtn.focus({ preventScroll: true });
}

/* =========================================================
   PROFIL TERSIMPAN + EFEK KETIK
   Kalau user pernah mengisi, kolom "diketik" otomatis seperti
   remember me. Bukan login otomatis: user tetap menekan tombol,
   dan bebas mengubah isinya.
   ========================================================= */

function readSavedProfile() {
  try {
    const p = getStats()?.profile || {};

    const saved = Object.fromEntries(
      FIELDS.map((f) => [f.id, String(p[f.id] || '').trim()])
    );

    return saved.name ? saved : null;
  } catch {
    return null;
  }
}

function typeInto(form, values) {
  const inputs = FIELDS.map((f) => form.querySelector(`#f-${f.id}`));
  const boxes = inputs.map((input) => input.closest('.anon-field-box'));
  const chars = FIELDS.map((f) => Array.from(values[f.id] || ''));

  let stopped = false;

  /* selesaikan seketika: dipanggil saat user menyentuh form,
     atau kalau animasi dimatikan */
  const finish = () => {
    if (stopped) return;
    stopped = true;

    FIELDS.forEach((_, i) => {
      inputs[i].value = chars[i].join('');
    });

    boxes.forEach((box) => box.classList.remove('is-typing'));
    form.removeEventListener('focusin', finish);
    form.removeEventListener('pointerdown', finish);
  };

  if (reduceMotion()) {
    finish();
    return finish;
  }

  form.addEventListener('focusin', finish);
  form.addEventListener('pointerdown', finish);

  const total = chars.reduce((n, list) => n + list.length, 0);
  const delay = Math.max(
    TIMING.typingMinDelay,
    Math.min(TIMING.typingMaxDelay, TIMING.typingBudget / Math.max(total, 1))
  );

  let field = 0;
  let count = 0;

  const step = () => {
    if (stopped) return;

    /* halaman sudah diganti: hentikan */
    if (!form.isConnected) {
      stopped = true;
      return;
    }

    if (field >= FIELDS.length) {
      finish();
      return;
    }

    const list = chars[field];

    boxes[field].classList.add('is-typing');

    if (count < list.length) {
      count += 1;
      inputs[field].value = list.slice(0, count).join('');
      setTimeout(step, delay);
      return;
    }

    boxes[field].classList.remove('is-typing');
    field += 1;
    count = 0;
    setTimeout(step, list.length ? TIMING.typingFieldPause : 0);
  };

  /* tunggu animasi masuk halaman selesai dulu */
  setTimeout(step, TIMING.typingStart);

  /* dikembalikan supaya Enter bisa menyelesaikan ketikan seketika */
  return finish;
}

/* =========================================================
   HALAMAN DATA DIRI (tanpa akun)
   Nama, kelas, sekolah -> disimpan di perangkat -> dashboard
   Semua class di sini diawali `anon-` supaya tidak bentrok dengan
   style form di halaman lain (mis. `.field` milik halaman login).
   ========================================================= */

export function renderAnonymous() {
  const app = getApp();
  const saved = readSavedProfile();

  leaving = false;
  app.innerHTML = profileTemplate(Boolean(saved));

  const form = document.querySelector('#profileForm');

  const setError = (fieldEl, message) => {
    const input = fieldEl.querySelector('.anon-input');

    fieldEl.classList.toggle('is-invalid', Boolean(message));
    fieldEl.querySelector('.anon-error').textContent = message || '';
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  };

  /* hapus pesan error begitu kolom diisi lagi */
  form.querySelectorAll('.anon-input').forEach((input) => {
    input.addEventListener('input', () => setError(input.closest('.anon-field'), ''));
  });

  document.querySelector('#backHome').onclick = () => leaveThen(renderHome);

  const finishTyping = saved ? typeInto(form, saved) : null;

  /* Enter di luar kolom isian: selesaikan ketikan lalu kirim form */
  bindEnter(() => {
    finishTyping?.();
    form.requestSubmit();
  });

  form.onsubmit = (e) => {
    e.preventDefault();

    const profile = {};
    let firstInvalid = null;

    FIELDS.forEach((f) => {
      const fieldEl = form.querySelector(`.anon-field[data-field="${f.id}"]`);
      const input = fieldEl.querySelector('.anon-input');
      const value = input.value.trim().replace(/\s+/g, ' ');

      profile[f.id] = value;

      if (!value) {
        setError(fieldEl, COPY.profile.required(f.label));
        if (!firstInvalid) firstInvalid = input;
      } else {
        setError(fieldEl, '');
      }
    });

    /* masih ada kolom kosong: berhenti di sini, jangan pindah halaman */
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    /* simpan ke stats.js: dipakai Dashboard dan halaman Profil */
    updateProfile(profile);

    leaveThen(() => renderDashboard({ name: profile.name, anonymous: true }));
  };
}