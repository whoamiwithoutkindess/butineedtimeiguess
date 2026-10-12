import { getApp } from '../main.js';
import { renderHome } from './home.js';
import { renderAITools } from './aitools.js';
import { renderBelajar } from './belajar.js';
import { renderKuis, getPretest } from './kuis.js';
import { renderAchievement } from './achievements.js';
import { renderProfile } from './profile.js';
import { icons } from './icons.js';
import { getStats } from './stats.js';

/* =========================================================
   KONFIGURASI
   Durasi keluar harus sama dengan --dur-leave di CSS.
   ========================================================= */

const TIMING = Object.freeze({
  pageLeave: 240,
});

/* =========================================================
   TEKS (COPY)
   Semua string UI dikumpulkan di sini supaya mudah direvisi.
   ========================================================= */

const COPY = Object.freeze({
  brand: {
    name: 'DharmaLearn',
    symbol: 'ॐ',
  },

  nav: {
    home: 'Beranda',
    account: 'Akun',
  },

  heading: {
    eyebrow: 'RUANG PEMBELAJARAN',
    greeting: 'Selamat datang,',
    defaultName: 'Pembelajar',
    description:
      'Lanjutkan pembelajaran Sad Darsana dan nilai-nilai Dharma dalam kehidupan sehari-hari.',
  },

  pretest: {
    badge: 'LANGKAH PERTAMA',
    title: 'Mulai dengan Pre-Test',
    description:
      'Kerjakan Pre-Test singkat untuk mengukur pemahaman awal Anda. Hasilnya dapat dibandingkan dengan Post-Test pada menu Kuis.',
    facts: ['2 soal tiap bagian materi', 'Tanpa batas waktu', 'Tanpa pembahasan'],
    cta: 'Mulai Pre-Test',
    note:
      'Menu Materi, Kuis, Pencapaian, dan Alat Belajar akan terbuka setelah Pre-Test selesai.',
  },
});
const EXTRA_ICONS = Object.freeze({
  ai: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
         stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
         aria-hidden="true">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
      <path d="M20 3v4"/>
      <path d="M22 5h-4"/>
      <path d="M4 17v2"/>
      <path d="M5 18H3"/>
    </svg>
  `,
});

const getIcon = (name) => icons[name] ?? EXTRA_ICONS[name] ?? '';

/* Kartu menu: urutan di sini = urutan tampil */
const CARDS = Object.freeze([
  {
    id: 'materialCard',
    icon: 'book',
    label: 'PEMBELAJARAN',
    title: 'Materi',
    text: 'Pelajari Sad Darsana, enam sistem filsafat Hindu, melalui slide ringkas dari Nyaya hingga Vedanta.',
  },
  {
    id: 'quizCard',
    icon: 'quiz',
    label: 'UJI PEMAHAMAN',
    title: 'Latihan',
    text: 'Ukur pemahaman melalui kuis pilihan ganda dan ketik, flashcard, teka-teki silang, peta Sad Darsana, hingga simulasi ujian berwaktu.',
  },
  {
    id: 'achievementCard',
    icon: 'trophy',
    label: 'LENCANA',
    title: 'Pencapaian',
    text: 'Lihat lencana dan pencapaian yang diperoleh selama belajar dan mengerjakan latihan.',
  },
  {
  id: 'toolsCard',
  icon: 'ai',
  label: 'ASISTEN AI',
  title: 'Alat Belajar',
  text: 'Tanyakan materi kepada asisten AI dan buat latihan sesuai topik serta tingkat kesulitan pilihan Anda.',
},
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
const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);

/* Posisi scroll dashboard, disimpan sebelum pindah halaman */
let savedScrollY = 0;

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const jumpTo = (y) =>
  window.scrollTo({ top: y, left: 0, behavior: 'instant' });

/* =========================================================
   TRANSISI HALAMAN
   Halaman memudar + blur + naik sedikit dulu, baru pindah.
   Halaman tujuan masuk lewat animasi `.page` di CSS.
   ========================================================= */

let leaving = false;

function leaveThen(action) {
  if (leaving) return;

  unbindEnter();

  const page = document.querySelector('.page');

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
   Aktif hanya selama gate Pre-Test tampil. Enter diabaikan
   kalau fokus ada di tombol / kolom isian (sudah ditangani
   browser). Pendengar dilepas otomatis saat berpindah halaman.
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
    if (e.target.closest?.('button, a, input, textarea, select, [contenteditable="true"]')) return;

    /* gate sudah hilang (halaman lain aktif): lepas sendiri */
    if (!document.querySelector('#pretestStart')) {
      unbindEnter();
      return;
    }

    e.preventDefault();
    action();
  };

  document.addEventListener('keydown', enterListener);
}

/* =========================================================
   TEMPLATE
   ========================================================= */

function navbarTemplate() {
  const { brand, nav } = COPY;

  return `
    <nav class="navbar dashboard-navbar">
      <button class="nav-login nav-home" id="dashboardHome" type="button">
        ${icons.home}<span>${nav.home}</span>
      </button>

      <div class="dashboard-nav-actions">
        <button class="brand" id="dashboardBrand" type="button">
          <span class="brand-symbol">${brand.symbol}</span>
          <span>${brand.name}</span>
        </button>

        <button
          class="profile-button"
          id="profileButton"
          type="button"
          aria-label="${nav.account}"
          title="${nav.account}"
        >
          ${icons.user}
        </button>
      </div>
    </nav>
  `;
}

function identityTemplate({ grade, school }) {
  if (!grade && !school) return '';

  const chip = (icon, value) =>
    value
      ? `<span class="dashboard-chip">${icon}<span>${escapeHtml(value)}</span></span>`
      : '';

  return `
    <div class="dashboard-identity">
      ${chip(icons.duo, grade)}
      ${chip(icons.home, school)}
    </div>
  `;
}

function headingTemplate({ displayName, grade, school }) {
  const { heading } = COPY;

  return `
    <div class="dashboard-heading">
      <span class="eyebrow">${heading.eyebrow}</span>

      <h1>
        ${heading.greeting}
        <span>${escapeHtml(displayName)}.</span>
      </h1>

      <p>${heading.description}</p>

      ${identityTemplate({ grade, school })}
    </div>
  `;
}

function cardTemplate(card, index) {
  return `
    <button class="dashboard-card" id="${card.id}" type="button" style="--i:${index}">
      <div class="dashboard-card-icon">${getIcon(card.icon)}</div>
      <div class="dashboard-card-content">
        <span class="dashboard-card-label">${card.label}</span>
        <h2>${card.title}</h2>
        <p>${card.text}</p>
      </div>
      <span class="dashboard-card-arrow">${icons.arrow}</span>
    </button>
  `;
}

function pretestGateTemplate() {
  const { pretest } = COPY;

  return `
    <div class="pt-gate">
      <span class="pt-gate-badge">${pretest.badge}</span>

      <h2>${pretest.title}</h2>

      <p>${pretest.description}</p>

      <ul class="pt-gate-facts">
        ${pretest.facts.map((fact) => `<li>${fact}</li>`).join('')}
      </ul>

      <button class="pt-gate-btn" id="pretestStart" type="button">
        <span>${pretest.cta}</span>${icons.arrow}
      </button>

      <small>${pretest.note}</small>
    </div>
  `;
}

/* =========================================================
   HALAMAN DASHBOARD
   ========================================================= */

export function renderDashboard({
  name = COPY.heading.defaultName,
  anonymous = false,
  restoreScroll = false
} = {}) {
  const app = getApp();

  leaving = false;
  unbindEnter();

  /* Identitas diambil dari stats.js, data yang sama dengan halaman Profil.
     Diisi dari form di Home, dan bisa diubah lewat Edit Profile. */
  const profile = getStats()?.profile || {};
  const displayName = String(profile.name || '').trim() || name;
  const grade = String(profile.grade || '').trim();
  const school = String(profile.school || '').trim();

  /* Selama Pre-Test belum selesai, hanya gate yang tampil; kartu menu
     disembunyikan dan dikunci */
  const pretestDone = Boolean(getPretest());

  app.innerHTML = `
    <main class="page dashboard-page">
      <div class="ambient ambient-a"></div>
      <div class="ambient ambient-b"></div>

      ${navbarTemplate()}

      <section class="dashboard-content">
        ${headingTemplate({ displayName, grade, school })}

        ${pretestDone ? '' : pretestGateTemplate()}

        <div class="dashboard-grid" ${pretestDone ? '' : 'inert hidden style="display:none"'}>
          ${CARDS.map(cardTemplate).join('')}
        </div>
      </section>
    </main>
  `;

  /* Pindah halaman: simpan scroll dashboard, animasi keluar,
     halaman tujuan mulai dari atas */
  const goTo = (fn) => () => {
    if (leaving) return;

    savedScrollY = window.scrollY;

    leaveThen(() => {
      fn();
      jumpTo(0);
    });
  };

  /* Balik ke dashboard: posisi scroll dikembalikan */
  const backToDashboard = () =>
    renderDashboard({ name, anonymous, restoreScroll: true });

  const openPretest = goTo(() =>
    renderKuis({ startAt: 'pretest', name, anonymous, onBack: backToDashboard })
  );

  /* Tujuan tiap kartu menu */
  const actions = {
    materialCard: () => renderBelajar({ onBack: backToDashboard }),
    quizCard: () => renderKuis({ onBack: backToDashboard }),
    achievementCard: () => renderAchievement({ onBack: backToDashboard }),
    toolsCard: () => renderAITools({ onBack: backToDashboard }),
  };

  CARDS.forEach(({ id }) => {
    document.querySelector(`#${id}`).onclick = goTo(actions[id]);
  });

  document.querySelector('#dashboardBrand').onclick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* BERANDA (reset, karena keluar dari alur dashboard) */
  document.querySelector('#dashboardHome').onclick = () => {
    if (leaving) return;

    leaveThen(() => {
      savedScrollY = 0;
      renderHome();
      jumpTo(0);
    });
  };

  /* PROFIL */
  document.querySelector('#profileButton').onclick = goTo(() =>
    renderProfile({ name, anonymous, onBack: backToDashboard })
  );

  /* PRE-TEST (gate): tombol, atau Enter */
  if (!pretestDone) {
    document.querySelector('#pretestStart')?.addEventListener('click', openPretest);
    bindEnter(openPretest);
  }

  /* Posisi scroll awal: dikembalikan kalau datang dari tombol kembali,
     selain itu mulai dari atas */
  if (restoreScroll) {
    jumpTo(savedScrollY);
    requestAnimationFrame(() => jumpTo(savedScrollY));
  } else {
    savedScrollY = 0;
    jumpTo(0);
  }
}