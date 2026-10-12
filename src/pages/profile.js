import { getApp } from '../main.js';
import { ic, icons } from './icons.js';
import {
  renderAchievement,
  getProfileSnapshot,
  recordProfileCompleted,
  recordProfileEdited,
  recordAvatarPhoto,
  recordAvatarColor,
  recordShare,
  recordEasterEgg
} from './achievements.js';
import { getStats, updateProfile } from './stats.js';

/* ==========================================================
   PROFILE — DHARMALEARN (REVISI 3)
   ----------------------------------------------------------
   Urutan halaman:
   1. Header (avatar, nama, kelas, sekolah, Edit, Bagikan)
   2. Progres belajar
   3. Ringkasan
   4. Performa latihan

   Perubahan revisi ini:
   - Akurasi: teks "Total soal · Benar" pindah ke samping persen
   - Picker warna: slider Hue, Saturasi, Terang, Opacity
     (masing-masing ada kolom angka) + alpha di kode warna
   - Dialog Edit/Bagikan: animasi blur dibuat halus (tanpa lag)
   - Gambar share: dibuat lebih lega & mirip tampilan asli
     (kartu hero, kartu progres dengan ikon, kartu performa)

   Data progres: getProfileSnapshot() (achievements.js)
   Data identitas: stats.js
   Avatar: localStorage sendiri
   ========================================================== */

const MODES = [
  { key: 'quick', label: 'Quick Quiz', icon: 'zap' },
  { key: 'full', label: 'Full Quiz', icon: 'trophy' },
  { key: 'ketik', label: 'Ketik Quiz', icon: 'keyboard' },
  { key: 'flash', label: 'Flashcard', icon: 'cards' },
  { key: 'tts', label: 'TTS', icon: 'grid' }
];

/* Pasangan warna gradien avatar (preset) */
const AVATAR_COLORS = [
  ['#ebbd86', '#9c5f31'],
  ['#f2b84b', '#b87415'],
  ['#9fd8c8', '#3f7f73'],
  ['#bccbe0', '#6d7f9b'],
  ['#d88cff', '#6a5cff'],
  ['#f0a1a1', '#9c4040']
];

const AVATAR_KEY = 'dharmalearn_profile_avatar_v1';
const AVATAR_SIZE = 256;
const SHARE_FILE = 'dharmalearn-progres.png';

/* Kunci ini harus sama dengan PRETEST_KEY / POSTTEST_KEY di kuis.js */
const PRETEST_KEY = 'dharmalearn:pretest-v2';
const POSTTEST_KEY = 'dharmalearn:posttest-v2';

/* Baca hasil tes: { correct, total, percent, date } atau null kalau belum ada */
function readTest(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key));
    if (raw && Number.isFinite(raw.percent) && raw.total > 0) return raw;
  } catch {
    /* abaikan */
  }

  return null;
}
const HEX6 = /^#[0-9a-f]{6}$/i;
const DARK_TEXT = '#1b130e';
const STAGE_RGB = [33, 25, 20]; /* warna --a-stage, dasar untuk hitung kontras */

let revealObserver = null;
let leaving = false;
let shareToken = 0;
let shareUrl = '';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ----------------------------------------------------------
   HELPER
   ---------------------------------------------------------- */

const esc = (value = '') =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const fmt = (n) => Number(n || 0).toLocaleString('id-ID');
const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const percentOf = (correct, answered) => (answered > 0 ? (correct / answered) * 100 : 0);
const fmtPercent1 = (v) => `${Math.round(v * 10) / 10}%`;
const fmtPercent0 = (v) => `${Math.round(v)}%`;

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/* ----------------------------------------------------------
   UTILITAS WARNA
   ---------------------------------------------------------- */

const clampN = (n, min, max) => Math.max(min, Math.min(max, n));

const toHex = (r, g, b) =>
  `#${[r, g, b]
    .map((n) => Math.round(clampN(n, 0, 255)).toString(16).padStart(2, '0'))
    .join('')}`;

const alphaHex = (a) =>
  Math.round(clampN(a, 0, 1) * 255)
    .toString(16)
    .padStart(2, '0');

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/* Warna CSS: hex biasa kalau opak, rgba() kalau transparan */
function rgba(hex, a = 1) {
  if (a >= 1) return hex;

  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(clampN(a, 0, 1) * 100) / 100})`;
}

/* h: 0-360, s & v: 0-1 */
function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;

  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;

    h *= 60;
    if (h < 0) h += 360;
  }

  return [h, max === 0 ? 0 : d / max, max];
}

function hsvToRgb(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };

  return [f(5) * 255, f(3) * 255, f(1) * 255];
}

const hsvHex = (h, s, v) => toHex(...hsvToRgb(h, s, v));

/* Warna kedua otomatis: lebih gelap dari warna utama */
function deriveSecond(hex) {
  const [h, s, v] = rgbToHsv(...hexToRgb(hex));
  return hsvHex(h, Math.min(1, s * 1.05), v * 0.62);
}

/* Teks avatar: gelap di warna terang, putih di warna gelap.
   Transparansi dihitung terhadap warna latar kartu. */
function textOn(c1, c2, a1 = 1, a2 = 1) {
  const eff = (hex, a) => hexToRgb(hex).map((n, i) => n * a + STAGE_RGB[i] * (1 - a));
  const x = eff(c1, a1);
  const y = eff(c2, a2);
  const mid = x.map((n, i) => (n + y[i]) / 2);
  const lum = (0.2126 * mid[0] + 0.7152 * mid[1] + 0.0722 * mid[2]) / 255;

  return lum > 0.52 ? DARK_TEXT : '#ffffff';
}

let colorCtx = null;

/* Hasil: { hex: '#rrggbb', a: 0..1 | null }  (a = null kalau input tidak menyebut alpha)
   Terima: #abc, abc, #aabbcc, aabbccdd, "12, 34, 56", "12 34 56 0.5",
   rgb()/rgba()/hsl()/hsla() dan nama warna */
function parseColor(input) {
  let s = String(input || '').trim();
  if (!s) return null;

  if (/^([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) s = `#${s}`;

  const nums = s.match(/^(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,]+(\d*\.?\d+))?$/);

  if (nums) {
    const v = nums.slice(1, 4).map(Number);
    if (v.some((n) => n > 255)) return null;

    return {
      hex: toHex(...v),
      a: nums[4] !== undefined ? clampN(parseFloat(nums[4]), 0, 1) : null
    };
  }

  if (!colorCtx) colorCtx = document.createElement('canvas').getContext('2d');

  colorCtx.fillStyle = '#000000';
  colorCtx.fillStyle = s;
  const first = colorCtx.fillStyle;

  colorCtx.fillStyle = '#ffffff';
  colorCtx.fillStyle = s;
  const second = colorCtx.fillStyle;

  if (first !== second) return null;
  if (HEX6.test(first)) return { hex: first.toLowerCase(), a: null };

  const m = first.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);

  return m
    ? { hex: toHex(+m[1], +m[2], +m[3]), a: m[4] !== undefined ? clampN(parseFloat(m[4]), 0, 1) : null }
    : null;
}

/* ----------------------------------------------------------
   AVATAR (warna preset, warna kustom, atau foto)
   custom = { c1, c2, a1, a2, auto }  (a = opacity 0..1)
   ---------------------------------------------------------- */

function loadAvatar() {
  try {
    const raw = JSON.parse(localStorage.getItem(AVATAR_KEY));

    const color =
      Number.isInteger(raw?.color) && raw.color >= 0 && raw.color < AVATAR_COLORS.length
        ? raw.color
        : 0;

    const photo =
      typeof raw?.photo === 'string' && raw.photo.startsWith('data:image/') ? raw.photo : '';

    let custom = null;

    if (raw?.custom && HEX6.test(raw.custom.c1) && HEX6.test(raw.custom.c2)) {
      const alpha = (v) => (Number.isFinite(v) ? clamp01(v) : 1);

      custom = {
        c1: raw.custom.c1.toLowerCase(),
        c2: raw.custom.c2.toLowerCase(),
        a1: alpha(raw.custom.a1),
        a2: alpha(raw.custom.a2),
        auto: raw.custom.auto !== false
      };
    }

    return { color, photo, custom };
  } catch {
    return { color: 0, photo: '', custom: null };
  }
}

function saveAvatar(avatar) {
  try {
    localStorage.setItem(AVATAR_KEY, JSON.stringify(avatar));
    return true;
  } catch {
    return false;
  }
}

/* Foto dipotong persegi dari tengah, diperkecil, lalu disimpan sebagai JPEG kecil */
async function fileToAvatar(file) {
  if (!file || !String(file.type).startsWith('image/')) throw new Error('bukan gambar');

  const url = URL.createObjectURL(file);

  try {
    const img = await loadImage(url);

    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;

    canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const initialOf = (name) => (Array.from(String(name).trim())[0] || 'D').toUpperCase();

/* Warna avatar dalam format CSS + warna teks + apakah ada transparansi */
function avatarPaint(avatar) {
  const c = avatar.custom;

  if (c) {
    return {
      c1: rgba(c.c1, c.a1),
      c2: rgba(c.c2, c.a2),
      text: textOn(c.c1, c.c2, c.a1, c.a2),
      alpha: c.a1 < 1 || c.a2 < 1
    };
  }

  const [c1, c2] = AVATAR_COLORS[avatar.color] || AVATAR_COLORS[0];
  return { c1, c2, text: DARK_TEXT, alpha: false };
}

function avatarHtml(avatar, name, className = 'pf-avatar') {
  if (avatar.photo) {
    return `<div class="${className} has-photo" aria-hidden="true"><img src="${avatar.photo}" alt="" /></div>`;
  }

  const p = avatarPaint(avatar);

  return `<div class="${className}${p.alpha ? ' has-alpha' : ''}" style="--av1:${p.c1};--av2:${p.c2};--avt:${p.text}" aria-hidden="true">${esc(initialOf(name))}</div>`;
}

/* ----------------------------------------------------------
   MODEL DATA
   Satu objek yang dipakai bersama oleh tampilan DOM dan
   gambar share, jadi angkanya pasti sama.
   ---------------------------------------------------------- */

function buildModel(fallbackName) {
  const snap = getProfileSnapshot();

  let profile = {};
  try {
    profile = getStats()?.profile || {};
  } catch {
    profile = {};
  }

  const name = String(profile.name || '').trim() || fallbackName || 'Pembelajar';
  const grade = String(profile.grade || '').trim();
  const school = String(profile.school || '').trim();

  const perf = MODES.map((mode) => {
    const d = snap.modes[mode.key];

    return {
      ...mode,
      sessions: d.sessions,
      answered: d.answered,
      correct: d.correct,
      accuracy: percentOf(d.correct, d.answered)
    };
  });

  const totalSessions = perf.reduce((sum, r) => sum + r.sessions, 0);
  const answered = perf.reduce((sum, r) => sum + r.answered, 0) + snap.peta.answered;
  const correct = perf.reduce((sum, r) => sum + r.correct, 0) + snap.peta.correct;
  const accuracy = percentOf(correct, answered);

  const progress = [
    {
      key: 'materi',
      icon: 'book',
      label: 'Materi',
      value: `${snap.slides.done} / ${snap.slides.total}`,
      note: 'slide selesai',
      ratio: snap.slides.done / snap.slides.total
    },
    ...perf.map((r) => ({
      key: r.key,
      icon: r.icon,
      label: r.label,
      value: fmt(r.sessions),
      note: 'sesi selesai'
    })),
    {
      key: 'peta',
      icon: 'map',
      label: 'Game Peta',
      value: `${snap.peta.stars} / ${snap.peta.maxStars}`,
      note: 'bintang',
      ratio: snap.peta.stars / snap.peta.maxStars
    },
    {
      key: 'ach',
      icon: 'crown',
      label: 'Achievement',
      value: `${snap.achievements.unlocked} / ${snap.achievements.total}`,
      note: 'terbuka',
            ratio: snap.achievements.unlocked / snap.achievements.total,
      link: 'pfAch'
    }
  ];

  const summary = [
    { icon: 'repeat', label: 'Total Sesi', value: fmt(totalSessions), unit: 'sesi selesai' },
    { icon: 'hash', label: 'Total Soal Dijawab', value: fmt(answered), unit: 'soal' },
    { icon: 'checkCircle', label: 'Jawaban Benar', value: fmt(correct), unit: 'soal benar' },
    {
      icon: 'target',
      label: 'Akurasi',
      value: fmtPercent1(accuracy),
      unit: `Total soal ${fmt(answered)} · Benar ${fmt(correct)}`
    },
    {
      icon: 'flag',
      label: 'Sesi Latihan Diselesaikan',
      value: fmt(totalSessions),
      unit: 'sesi selesai'
    },
    { icon: 'flame', label: 'Best Streak', value: fmt(snap.bestStreak), unit: 'sesi sempurna' }
  ];

    const pre = readTest(PRETEST_KEY);
  const post = readTest(POSTTEST_KEY);
  const delta = pre && post ? Math.round(post.percent - pre.percent) : null;

  const tests = [
    {
      key: 'pre',
      icon: 'target',
      label: 'Pre-Test Score',
      value: pre ? fmtPercent0(pre.percent) : '—',
      note: pre ? `${fmt(pre.correct)} / ${fmt(pre.total)} benar` : 'belum dikerjakan',
      ratio: pre ? pre.percent / 100 : 0
    },
    {
      key: 'post',
      icon: 'trendingUp',
      label: 'Post-Test Score',
      value: post ? fmtPercent0(post.percent) : '—',
      note: post
        ? `${fmt(post.correct)} / ${fmt(post.total)} benar${
            delta !== null ? ` · ${delta > 0 ? '+' : ''}${delta} poin` : ''
          }`
        : 'belum dikerjakan, ketuk untuk mulai',
      ratio: post ? post.percent / 100 : 0,
      /* belum dikerjakan -> kartu jadi tombol (arrow) menuju Post-Test */
      link: post ? undefined : 'pfPost'
    }
  ];

  const complete = Boolean(String(profile.name || '').trim() && grade && school);

  return { name, grade, school, complete, avatar: loadAvatar(), progress, summary, tests, perf };
}

/* ----------------------------------------------------------
   HTML
   ---------------------------------------------------------- */

function heroHtml(m) {
  const lines = [m.grade, m.school].filter(Boolean);

  return `
    <header class="pf-hero pf-reveal">
      ${avatarHtml(m.avatar, m.name)}

      <div class="pf-ident">
        <h1>${esc(m.name)}</h1>
        ${
          lines.length
            ? lines.map((line) => `<p class="pf-ident-line">${esc(line)}</p>`).join('')
            : '<p class="pf-ident-line is-empty">Kelas dan sekolah belum diisi</p>'
        }
      </div>

      <div class="pf-actions">
        <button class="pf-btn" id="pfEdit" type="button">
          ${icons.edit}<span>Edit Profile</span>
        </button>
        <button class="pf-btn pf-btn-primary" id="pfShare" type="button">
          ${icons.share}<span>Bagikan</span>
        </button>
      </div>
    </header>
  `;
}

const sectionHead = (title) =>
  `<h2 class="pf-section-title pf-reveal">${esc(title)}</h2>`;

/* Angka + keterangan selalu di dasar kartu (.pf-card-foot).
   Kartu tanpa progress bar tetap dapat slot bar kosong (ghost)
   supaya posisi angka sejajar dengan kartu yang punya bar. */
function progressCard(item) {
  const tag = item.link ? 'button' : 'div';
  const attrs = item.link ? `id="${item.link}" type="button"` : '';

  return `
    <${tag} class="pf-card pf-reveal ${item.link ? 'pf-card-link' : ''}" ${attrs}>
      <div class="pf-card-top">
        <span class="pf-card-icon" aria-hidden="true">${ic(item.icon, 20)}</span>
        <span class="pf-card-label">${esc(item.label)}</span>
        ${item.link ? `<span class="pf-card-arrow" aria-hidden="true">${ic('arrow', 18)}</span>` : ''}
      </div>

      <div class="pf-card-foot">
        <div class="pf-card-value">
          <b>${esc(item.value)}</b>
          ${item.note ? `<small>${esc(item.note)}</small>` : ''}
        </div>

        ${
          item.ratio !== undefined
            ? `<div class="pf-mini" aria-hidden="true" style="--w:${Math.round(clamp01(item.ratio) * 100)}%"><span></span></div>`
            : '<div class="pf-mini is-ghost" aria-hidden="true"></div>'
        }
      </div>
    </${tag}>
  `;
}

function summaryCard(item) {
  return `
    <div class="pf-card pf-reveal">
      <div class="pf-card-top">
        <span class="pf-card-icon" aria-hidden="true">${ic(item.icon, 20)}</span>
        <span class="pf-card-label">${esc(item.label)}</span>
      </div>

      <div class="pf-card-foot">
        <div class="pf-card-value">
          <b>${esc(item.value)}</b>
          ${item.unit ? `<small>${esc(item.unit)}</small>` : ''}
        </div>
      </div>
    </div>
  `;
}

function perfRow(r) {
  const pct = Math.min(100, Math.max(0, r.accuracy));

  return `
    <li class="pf-perf pf-reveal">
      <div class="pf-perf-top">
        <span class="pf-card-icon" aria-hidden="true">${ic(r.icon, 20)}</span>

        <div class="pf-perf-text">
          <b>${esc(r.label)}</b>
          <small>Total soal <b>${fmt(r.answered)}</b> · Benar <b>${fmt(r.correct)}</b></small>
        </div>

        <strong>${fmtPercent0(r.accuracy)}</strong>
      </div>

      <div
        class="pf-bar"
        style="--w:${pct}%"
        role="progressbar"
        aria-label="Akurasi ${esc(r.label)}"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow="${Math.round(pct)}"
      ><span></span></div>
    </li>
  `;
}

/* ----------------------------------------------------------
   TRANSISI HALAMAN & SCROLL
   ---------------------------------------------------------- */

/* Halaman memudar keluar (naik + blur) dulu, baru pindah */
function leaveThen(fn) {
  if (leaving) return;

  const content = document.querySelector('.pf-content');

  if (!content || prefersReducedMotion()) {
    fn();
    return;
  }

  leaving = true;
  content.classList.add('is-leaving');

  setTimeout(() => {
    leaving = false;
    revealObserver?.disconnect();
    revealObserver = null;
    fn();
  }, 240);
}

/* Semua kartu yang sejajar horizontal (satu baris grid) */
function rowOf(el) {
  const grid = el.closest('.pf-grid');
  if (!grid) return [el];

  const top = el.offsetTop;

  return [...grid.children].filter((child) => Math.abs(child.offsetTop - top) < 4);
}

/* Elemen naik + fade + blur saat masuk layar; keluar layar = memudar lagi.
   Status disimpan di data-pos: 'in' | 'above' | 'below'. */
function setupReveal() {
  revealObserver?.disconnect();
  revealObserver = null;

  const targets = [...document.querySelectorAll('.pf-reveal')];

  if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
    targets.forEach((el) => {
      el.dataset.pos = 'in';
    });
    return;
  }

  revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const pos = entry.isIntersecting
          ? 'in'
          : entry.boundingClientRect.top < window.innerHeight / 2
            ? 'above'
            : 'below';

        /* Satu baris = satu gerakan; kartu dalam baris masuk bergantian */
        rowOf(entry.target).forEach((el, i) => {
          el.style.setProperty('--rd', pos === 'in' ? `${i * 70}ms` : '0ms');
          el.dataset.pos = pos;
        });
      }
    },
    { threshold: 0.12, rootMargin: '-6% 0px -6% 0px' }
  );

  targets.forEach((el) => revealObserver.observe(el));
}

/* ----------------------------------------------------------
   MODAL
   ---------------------------------------------------------- */

/* Kunci scroll TANPA membuat halaman bergeser:
   lebar scrollbar yang hilang diganti padding-right yang sama. */
function lockScroll() {
  const sbw = Math.max(0, window.innerWidth - document.documentElement.clientWidth);

  document.body.style.setProperty('--pf-sbw', `${sbw}px`);
  document.body.classList.add('pf-modal-open');
}

function unlockScroll() {
  document.body.classList.remove('pf-modal-open');
  document.body.style.removeProperty('--pf-sbw');
}

function closeModal(animated = false) {
  shareToken += 1;

  const smooth = animated && !prefersReducedMotion();

  /* Saat animasi tutup, scroll baru dibuka setelah modal hilang
     supaya halaman tidak "loncat" di belakang backdrop */
  if (smooth) {
    setTimeout(() => {
      if (!document.querySelector('.pf-modal:not(.is-closing)')) unlockScroll();
    }, 400);
  } else {
    unlockScroll();
  }

  const url = shareUrl;
  shareUrl = '';
  if (url) setTimeout(() => URL.revokeObjectURL(url), animated ? 500 : 0);

  document.querySelectorAll('.pf-modal').forEach((el) => {
    if (!smooth) {
      el.remove();
      return;
    }

    if (el.classList.contains('is-closing')) return;

    el.classList.remove('is-open', 'is-settled');
    el.classList.add('is-closing');
    setTimeout(() => el.remove(), 380);
  });
}

function mountModal(html) {
  closeModal();

  const modal = document.createElement('div');
  modal.className = 'pf-modal';
  modal.innerHTML = html;

  lockScroll();
  document.body.appendChild(modal);

  modal.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeModal(true));
  });

  /* Paksa browser menghitung layout awal dulu, baru mulai transisi
     (animasi jadi mulus, bukan loncat ke keadaan akhir) */
  void modal.offsetWidth;

  requestAnimationFrame(() => {
    modal.classList.add('is-open');

    /* Setelah animasi selesai, lepas lapisan GPU supaya teks tajam */
    setTimeout(() => {
      if (modal.classList.contains('is-open')) modal.classList.add('is-settled');
    }, 600);
  });

  return modal;
}

function notify(message) {
  document.querySelector('.pf-notice')?.remove();

  const notice = document.createElement('div');
  notice.className = 'pf-notice';
  notice.setAttribute('role', 'status');
  notice.textContent = message;

  document.body.appendChild(notice);
  requestAnimationFrame(() => notice.classList.add('visible'));

  setTimeout(() => {
    notice.classList.remove('visible');
    setTimeout(() => notice.remove(), 300);
  }, 2400);
}

/* ----------------------------------------------------------
   COLOR PICKER KUSTOM (di dalam modal Edit)
   - Color wheel (hue = sudut, saturasi = jarak dari tengah)
   - Slider + kolom angka: Hue, Saturasi, Terang, Opacity
   - Kode warna (tempel hex / hex8 / rgb / hsl / nama), RGB
   - Eyedropper (jika didukung) + palet sistem
   - Opsi gradien 2 warna (awal & akhir)
   ---------------------------------------------------------- */

const WHEEL_SIZE = 176;

const SLIDERS = [
  { k: 'h', label: 'Hue', max: 360 },
  { k: 's', label: 'Saturasi', max: 100 },
  { k: 'v', label: 'Terang', max: 100 },
  { k: 'a', label: 'Opacity', max: 100 }
];

function pickerHtml() {
  return `
    <div class="pf-picker" id="pfPicker" hidden>
      <div class="pf-pk-head">
        <span class="pf-av-label">Warna kustom</span>

        <label class="pf-switch">
          <input type="checkbox" id="pfGrad" />
          <span class="pf-switch-ui" aria-hidden="true"></span>
          <em>Gradien 2 warna</em>
        </label>
      </div>

      <div class="pf-pk-tabs" id="pfStops" role="tablist" hidden>
        <button class="pf-pk-tab is-on" type="button" role="tab" data-stop="c1">
          <i aria-hidden="true"></i>Warna awal
        </button>
        <button class="pf-pk-tab" type="button" role="tab" data-stop="c2">
          <i aria-hidden="true"></i>Warna akhir
        </button>
      </div>

      <div class="pf-pk-body">
        <div class="pf-wheel" id="pfWheel" aria-label="Color wheel">
          <canvas aria-hidden="true"></canvas>
          <div class="pf-wheel-shade"></div>
          <span class="pf-wheel-thumb"></span>
        </div>

        <div class="pf-pk-side">
          <label class="pf-pk-row">
            <span>Kode</span>
            <input
              class="pf-pk-input"
              id="pfHex"
              maxlength="40"
              spellcheck="false"
              autocomplete="off"
              placeholder="#rrggbb"
            />
          </label>

          <div class="pf-pk-row">
            <span>RGB</span>
            <div class="pf-rgb">
              <input class="pf-pk-input" type="number" min="0" max="255" inputmode="numeric" aria-label="Merah" />
              <input class="pf-pk-input" type="number" min="0" max="255" inputmode="numeric" aria-label="Hijau" />
              <input class="pf-pk-input" type="number" min="0" max="255" inputmode="numeric" aria-label="Biru" />
            </div>
          </div>

          <div class="pf-pk-row" id="pfEyeRow" hidden>
            <span aria-hidden="true"></span>
            <button class="pf-btn pf-btn-sm pf-btn-block" id="pfEye" type="button">Ambil dari layar</button>
          </div>
        </div>
      </div>

      <div class="pf-sliders">
        ${SLIDERS.map(
          (s) => `
            <div class="pf-sl" data-k="${s.k}">
              <span>${s.label}</span>
              <input
                class="pf-range ${s.k === 'h' ? 'is-hue' : ''} ${s.k === 'a' ? 'is-alpha' : ''}"
                type="range"
                min="0"
                max="${s.max}"
                step="1"
                aria-label="${s.label}"
              />
              <input
                class="pf-pk-input pf-sl-num"
                type="number"
                min="0"
                max="${s.max}"
                inputmode="numeric"
                aria-label="${s.label} (angka)"
              />
            </div>
          `
        ).join('')}
      </div>
    </div>
  `;
}

function setupPicker(modal, draft, refresh) {
  const picker = modal.querySelector('#pfPicker');
  const wheel = modal.querySelector('#pfWheel');
  const canvas = wheel.querySelector('canvas');
  const shade = wheel.querySelector('.pf-wheel-shade');
  const thumb = wheel.querySelector('.pf-wheel-thumb');
  const hexInput = modal.querySelector('#pfHex');
  const rgbInputs = [...modal.querySelectorAll('.pf-rgb input')];
  const eyeRow = modal.querySelector('#pfEyeRow');
  const gradToggle = modal.querySelector('#pfGrad');
  const stops = modal.querySelector('#pfStops');
  const tabs = [...stops.querySelectorAll('.pf-pk-tab')];
  const eyeBtn = modal.querySelector('#pfEye');

  const sl = {};
  modal.querySelectorAll('.pf-sl').forEach((row) => {
    sl[row.dataset.k] = {
      max: SLIDERS.find((s) => s.k === row.dataset.k).max,
      range: row.querySelector('input[type="range"]'),
      num: row.querySelector('input[type="number"]')
    };
  });

  let active = 'c1';
  let hsv = { h: 30, s: 0.6, v: 0.9 };
  let drawn = false;

  const alphaKey = () => (active === 'c1' ? 'a1' : 'a2');
  const hexOfHsv = () => hsvHex(hsv.h, hsv.s, hsv.v);

  /* Gambar wheel sekali (kecerahan penuh); gelapnya lewat overlay */
  function drawWheel() {
    if (drawn) return;
    drawn = true;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const N = Math.round(WHEEL_SIZE * dpr);
    const R = N / 2;

    canvas.width = N;
    canvas.height = N;

    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(N, N);

    for (let y = 0; y < N; y += 1) {
      for (let x = 0; x < N; x += 1) {
        const dx = x + 0.5 - R;
        const dy = y + 0.5 - R;
        const d = Math.hypot(dx, dy);

        if (d > R) continue;

        let h = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (h < 0) h += 360;

        const [r, g, b] = hsvToRgb(h, d / R, 1);
        const i = (y * N + x) * 4;

        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = Math.round(255 * Math.min(1, R - d));
      }
    }

    ctx.putImageData(img, 0, 0);
  }

  function setHsvFromHex(hex) {
    const [h, s, v] = rgbToHsv(...hexToRgb(hex));

    /* abu-abu / hitam: pertahankan hue lama supaya thumb tidak loncat */
    hsv = { h: s === 0 || v === 0 ? hsv.h : h, s, v };
  }

  function paintTabs() {
    tabs.forEach((tab) => {
      const stop = tab.dataset.stop;
      const on = stop === active;

      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', String(on));

      if (draft.custom) {
        tab.querySelector('i').style.background = rgba(
          draft.custom[stop],
          draft.custom[stop === 'c1' ? 'a1' : 'a2']
        );
      }
    });
  }

  /* from = sumber perubahan ('h:range', 'h:num', 'hex', 'rgb', 'wheel', 'load', ...),
     supaya kolom yang sedang diketik tidak ditimpa */
  function paint(from) {
    if (!draft.custom) return;

    const hex = draft.custom[active];
    const a = draft.custom[alphaKey()];
    const rad = (hsv.h * Math.PI) / 180;

    thumb.style.left = `${50 + Math.cos(rad) * hsv.s * 50}%`;
    thumb.style.top = `${50 + Math.sin(rad) * hsv.s * 50}%`;
    thumb.style.background = hex;
    shade.style.opacity = String(1 - hsv.v);

    const values = {
      h: Math.round(hsv.h) % 361,
      s: Math.round(hsv.s * 100),
      v: Math.round(hsv.v * 100),
      a: Math.round(a * 100)
    };

    Object.entries(sl).forEach(([k, el]) => {
      if (from !== `${k}:range`) el.range.value = String(values[k]);
      if (from !== `${k}:num`) el.num.value = String(values[k]);
    });

    /* warna dasar track slider */
    sl.s.range.style.setProperty('--pf-from', hsvHex(hsv.h, 0, hsv.v));
    sl.s.range.style.setProperty('--pf-to', hsvHex(hsv.h, 1, hsv.v));
    sl.v.range.style.setProperty('--pf-from', '#000000');
    sl.v.range.style.setProperty('--pf-to', hsvHex(hsv.h, hsv.s, 1));
    sl.a.range.style.setProperty('--pf-from', rgba(hex, 0.0001));
    sl.a.range.style.setProperty('--pf-to', hex);

    if (from !== 'hex') {
      hexInput.value = a < 1 ? `${hex}${alphaHex(a)}` : hex;
      hexInput.classList.remove('is-bad');
    }

    if (from !== 'rgb') {
      const rgb = hexToRgb(hex);
      rgbInputs.forEach((el, i) => {
        el.value = String(rgb[i]);
      });
    }

    paintTabs();
  }

  function commit(hex, from, alpha) {
    const aKey = alphaKey();

    draft.custom[active] = hex;
    if (alpha !== undefined) draft.custom[aKey] = clamp01(alpha);

    if (active === 'c1' && draft.custom.auto) {
      draft.custom.c2 = deriveSecond(hex);
      draft.custom.a2 = draft.custom.a1;
    }

    draft.photo = '';
    paint(from);
    refresh();
  }

  function pickFromPointer(event) {
    const rect = wheel.getBoundingClientRect();
    const R = rect.width / 2;
    const dx = event.clientX - rect.left - R;
    const dy = event.clientY - rect.top - R;

    let h = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (h < 0) h += 360;

    hsv.h = h;
    hsv.s = Math.min(1, Math.hypot(dx, dy) / R);

    commit(hexOfHsv(), 'wheel');
  }

  /* ----- wheel ----- */

  let dragging = false;

  wheel.addEventListener('pointerdown', (event) => {
    dragging = true;
    wheel.setPointerCapture?.(event.pointerId);
    pickFromPointer(event);
  });

  wheel.addEventListener('pointermove', (event) => {
    if (dragging) pickFromPointer(event);
  });

  const stopDrag = () => {
    dragging = false;
  };

  wheel.addEventListener('pointerup', stopDrag);
  wheel.addEventListener('pointercancel', stopDrag);

  /* ----- slider Hue / Saturasi / Terang / Opacity (+ kolom angka) ----- */

  function applySlider(k, raw, from) {
    const value = clampN(raw, 0, sl[k].max);

    if (k === 'a') {
      commit(draft.custom[active], from, value / 100);
      return;
    }

    if (k === 'h') hsv.h = value >= 360 ? 359.99 : value;
    if (k === 's') hsv.s = value / 100;
    if (k === 'v') hsv.v = value / 100;

    commit(hexOfHsv(), from);
  }

  Object.entries(sl).forEach(([k, el]) => {
    el.range.addEventListener('input', () => applySlider(k, Number(el.range.value), `${k}:range`));

    el.num.addEventListener('input', () => {
      const n = Number.parseInt(el.num.value, 10);
      if (Number.isNaN(n)) return;

      applySlider(k, n, `${k}:num`);
    });

    el.num.addEventListener('change', () => paint('load'));
  });

  /* ----- input kode (bisa ditempel) ----- */

  hexInput.addEventListener('input', () => {
    const parsed = parseColor(hexInput.value);

    if (!parsed) {
      hexInput.classList.toggle('is-bad', hexInput.value.trim() !== '');
      return;
    }

    hexInput.classList.remove('is-bad');
    setHsvFromHex(parsed.hex);

    /* alpha hanya berubah kalau kodenya memang menyebut alpha */
    commit(parsed.hex, 'hex', parsed.a ?? undefined);
  });

  hexInput.addEventListener('change', () => paint('load'));

  /* ----- input RGB ----- */

  rgbInputs.forEach((el) => {
    el.addEventListener('input', () => {
      const v = rgbInputs.map((input) => Number.parseInt(input.value, 10));

      if (!v.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return;

      const hex = toHex(...v);
      setHsvFromHex(hex);
      commit(hex, 'rgb');
    });

    el.addEventListener('change', () => paint('load'));
  });

  /* Enter di dalam picker jangan menyimpan seluruh form */
  picker.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.target.type === 'checkbox') return;

    event.preventDefault();
    event.target.blur?.();
  });

  /* ----- eyedropper (ambil warna dari layar) ----- */

  if ('EyeDropper' in window) {
    eyeRow.hidden = false;

    eyeBtn.addEventListener('click', async () => {
      try {
        const result = await new window.EyeDropper().open();
        const parsed = parseColor(result.sRGBHex);
        if (!parsed) return;

        setHsvFromHex(parsed.hex);
        commit(parsed.hex, 'eye');
      } catch {
        /* dibatalkan */
      }
    });
  }

  /* ----- gradien 2 warna ----- */

  gradToggle.addEventListener('change', () => {
    draft.custom.auto = !gradToggle.checked;
    stops.hidden = draft.custom.auto;

    if (draft.custom.auto) {
      draft.custom.c2 = deriveSecond(draft.custom.c1);
      draft.custom.a2 = draft.custom.a1;

      if (active === 'c2') {
        active = 'c1';
        setHsvFromHex(draft.custom.c1);
      }
    }

    paint('load');
    refresh();
  });

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      active = tab.dataset.stop;
      setHsvFromHex(draft.custom[active]);
      paint('load');
    });
  });

  /* ----- buka / tutup ----- */

  return {
    isOpen: () => !picker.hidden,

    open() {
      if (!draft.custom) {
        const [c1] = AVATAR_COLORS[draft.color] || AVATAR_COLORS[0];
        draft.custom = { c1, c2: deriveSecond(c1), a1: 1, a2: 1, auto: true };
      }

      draft.photo = '';

      if (draft.custom.auto) active = 'c1';

      gradToggle.checked = !draft.custom.auto;
      stops.hidden = draft.custom.auto;

      picker.hidden = false;
      drawWheel();
      setHsvFromHex(draft.custom[active]);
      paint('load');
      refresh();
    },

    close() {
      picker.hidden = true;
    }
  };
}

/* ----------------------------------------------------------
   EDIT PROFIL (nama, kelas, sekolah, avatar)
   ---------------------------------------------------------- */

function openEdit(m, rerender) {
  /* perubahan avatar ditampung dulu, baru disimpan saat klik Simpan */
  const draft = {
    color: m.avatar.color,
    photo: m.avatar.photo,
    custom: m.avatar.custom ? { ...m.avatar.custom } : null
  };

  const modal = mountModal(`
    <div class="pf-modal-backdrop" data-close></div>

    <form class="pf-modal-panel" id="pfEditForm" role="dialog" aria-modal="true" aria-labelledby="pfEditTitle">
      <button class="pf-modal-close" data-close type="button" aria-label="Tutup">${ic('close', 18)}</button>

      <span class="pf-eyebrow">EDIT PROFIL</span>
      <h2 id="pfEditTitle">Data dirimu</h2>

      <div class="pf-av-edit">
        <div id="pfAvPreview"></div>

        <div class="pf-av-controls">
          <span class="pf-av-label">Avatar</span>

          <div class="pf-swatches" role="radiogroup" aria-label="Warna avatar">
            ${AVATAR_COLORS.map(
              ([a, b], i) => `
                <button
                  class="pf-swatch"
                  type="button"
                  role="radio"
                  data-color="${i}"
                  aria-label="Warna ${i + 1}"
                  style="--av1:${a};--av2:${b}"
                ></button>
              `
            ).join('')}

            <button
              class="pf-swatch pf-swatch-custom"
              id="pfCustomSwatch"
              type="button"
              role="radio"
              aria-label="Warna kustom"
              title="Warna kustom"
            ></button>
          </div>

          <div class="pf-av-buttons">
            <button class="pf-btn pf-btn-sm" id="pfAvUpload" type="button">Unggah foto</button>
            <button class="pf-btn pf-btn-sm" id="pfAvRemove" type="button">Hapus foto</button>
          </div>

          <input id="pfAvFile" type="file" accept="image/*" hidden />
        </div>
      </div>

      ${pickerHtml()}

      <label class="pf-field">
        <span>Nama</span>
        <input id="pfName" maxlength="40" autocomplete="off" value="${esc(m.name)}" />
      </label>

      <label class="pf-field">
        <span>Kelas</span>
        <input id="pfGrade" maxlength="20" autocomplete="off" placeholder="contoh: XI IPA 2" value="${esc(m.grade)}" />
      </label>

      <label class="pf-field">
        <span>Sekolah</span>
        <input id="pfSchool" maxlength="60" autocomplete="off" value="${esc(m.school)}" />
      </label>

      <div class="pf-modal-actions">
        <button class="pf-btn" data-close type="button">Batal</button>
        <button class="pf-btn pf-btn-primary" type="submit">Simpan</button>
      </div>
    </form>
  `);

  const nameInput = modal.querySelector('#pfName');
  const preview = modal.querySelector('#pfAvPreview');
  const removeBtn = modal.querySelector('#pfAvRemove');
  const fileInput = modal.querySelector('#pfAvFile');
  const customSwatch = modal.querySelector('#pfCustomSwatch');
  const swatches = [...modal.querySelectorAll('.pf-swatch:not(.pf-swatch-custom)')];

  const refresh = () => {
    preview.innerHTML = avatarHtml(draft, nameInput.value.trim() || m.name, 'pf-avatar pf-avatar-lg');

    swatches.forEach((button) => {
      const on = !draft.photo && !draft.custom && Number(button.dataset.color) === draft.color;
      button.classList.toggle('is-on', on);
      button.setAttribute('aria-checked', String(on));
    });

    /* Swatch custom selalu pelangi (+); statusnya cukup ditandai border putih */
    const customOn = !draft.photo && Boolean(draft.custom);

    customSwatch.classList.toggle('is-on', customOn);
    customSwatch.setAttribute('aria-checked', String(customOn));

    /* tombol selalu tampil; nonaktif kalau memang belum ada foto */
    removeBtn.disabled = !draft.photo;
  };

  const picker = setupPicker(modal, draft, refresh);

  swatches.forEach((button) => {
    button.addEventListener('click', () => {
      draft.color = Number(button.dataset.color);
      draft.photo = '';
      draft.custom = null;
      picker.close();
      refresh();
    });
  });

  /* klik pertama: buka picker; klik lagi saat sudah terbuka: tutup (warna tetap) */
  customSwatch.addEventListener('click', () => {
    if (picker.isOpen() && draft.custom && !draft.photo) picker.close();
    else picker.open();
  });

  modal.querySelector('#pfAvUpload').addEventListener('click', () => fileInput.click());

  removeBtn.addEventListener('click', () => {
    draft.photo = '';
    refresh();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    try {
      draft.photo = await fileToAvatar(file);
      refresh();
    } catch {
      notify('Foto tidak bisa dibaca. Coba foto lain.');
    } finally {
      fileInput.value = '';
    }
  });

  nameInput.addEventListener('input', refresh);

  modal.querySelector('#pfEditForm').addEventListener('submit', (event) => {
    event.preventDefault();

    const saved = saveAvatar(draft);

    const nextName = nameInput.value.trim();
    const nextGrade = modal.querySelector('#pfGrade').value.trim();
    const nextSchool = modal.querySelector('#pfSchool').value.trim();

    if (nextName !== m.name || nextGrade !== m.grade || nextSchool !== m.school) {
      recordProfileEdited();
    }

    if (nextName && nextGrade && nextSchool) recordProfileCompleted();

    if (saved && draft.photo && draft.photo !== m.avatar.photo) recordAvatarPhoto();

    if (
      saved &&
      !draft.photo &&
      (draft.color !== m.avatar.color ||
        JSON.stringify(draft.custom) !== JSON.stringify(m.avatar.custom))
    ) {
      recordAvatarColor();
    }

    updateProfile({
      name: nameInput.value.trim(),
      grade: modal.querySelector('#pfGrade').value.trim(),
      school: modal.querySelector('#pfSchool').value.trim()
    });

    closeModal();
    rerender();

    if (!saved) notify('Avatar tidak bisa disimpan (penyimpanan penuh).');
  });

  refresh();

  /* Fokus nama ditunda sampai animasi buka selesai (anti-lag) dan
     dilewati di layar sentuh supaya keyboard tidak langsung menutup dialog */
  if (!window.matchMedia?.('(pointer: coarse)').matches) {
    setTimeout(() => {
      if (modal.isConnected && modal.classList.contains('is-open')) {
        nameInput.focus({ preventScroll: true });
      }
    }, 460);
  }
}

/* ----------------------------------------------------------
   BAGIKAN (GAMBAR)
   ---------------------------------------------------------- */

async function openShare(m) {
  const modal = mountModal(`
    <div class="pf-modal-backdrop" data-close></div>

    <div class="pf-modal-panel pf-share-panel" role="dialog" aria-modal="true" aria-labelledby="pfShareTitle">
      <button class="pf-modal-close" data-close type="button" aria-label="Tutup">${ic('close', 18)}</button>

      <span class="pf-eyebrow">BAGIKAN</span>
      <h2 id="pfShareTitle">Gambar progres belajarmu</h2>

      <div class="pf-share-preview is-loading" id="pfPreview">
        <span class="pf-spinner" aria-hidden="true"></span>
        <p>Menyiapkan gambar...</p>
      </div>

      <div class="pf-modal-actions">
        <button class="pf-btn" id="pfDownload" type="button" disabled>Unduh gambar</button>
        <button class="pf-btn pf-btn-primary" id="pfShareGo" type="button" disabled>Bagikan</button>
      </div>
    </div>
  `);

  const token = ++shareToken;
  const preview = modal.querySelector('#pfPreview');
  const downloadBtn = modal.querySelector('#pfDownload');
  const shareBtn = modal.querySelector('#pfShareGo');

  let blob;

  try {
    /* tunggu animasi buka selesai dulu supaya render canvas yang berat
       tidak mengganggu animasi dialog */
    await new Promise((resolve) => setTimeout(resolve, 380));
    blob = await renderShareBlob(m);
  } catch {
    if (token !== shareToken || !modal.isConnected) return;

    preview.classList.remove('is-loading');
    preview.innerHTML = '<p class="pf-share-error">Gambar gagal dibuat. Tutup lalu coba lagi.</p>';
    return;
  }

  if (token !== shareToken || !modal.isConnected) return;

  shareUrl = URL.createObjectURL(blob);

  preview.classList.remove('is-loading');
  preview.innerHTML = `<img src="${shareUrl}" alt="Ringkasan progres belajar ${esc(m.name)}" />`;

  /* Unduh */
  downloadBtn.disabled = false;
  downloadBtn.onclick = () => {
    const link = document.createElement('a');
    link.href = shareUrl;
    link.download = SHARE_FILE;
    document.body.appendChild(link);
    link.click();
    link.remove();
    recordShare();
  };

  /* Bagikan (HP) -> kalau tidak didukung: Salin gambar -> kalau tidak: sembunyikan */
  const file = new File([blob], SHARE_FILE, { type: 'image/png' });

  const canShareFile =
    typeof navigator.share === 'function' && Boolean(navigator.canShare?.({ files: [file] }));

  const canCopy = Boolean(navigator.clipboard?.write && window.ClipboardItem);

  if (canShareFile) {
    shareBtn.disabled = false;
    shareBtn.onclick = async () => {
      try {
        await navigator.share({ files: [file], title: 'Progres belajar DharmaLearn' });
        recordShare();
      } catch (error) {
        if (error?.name !== 'AbortError') notify('Gagal membagikan. Coba unduh gambarnya.');
      }
    };
  } else if (canCopy) {
    shareBtn.textContent = 'Salin gambar';
    shareBtn.disabled = false;
    shareBtn.onclick = async () => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        recordShare();
        notify('Gambar disalin.');
      } catch {
        notify('Gagal menyalin. Coba unduh gambarnya.');
      }
    };
  } else {
    shareBtn.hidden = true;
  }
}

/* ----------------------------------------------------------
   GAMBAR SHARE (CANVAS)
   Lebar tetap 1200 px, tinggi dihitung dari konstanta layout.
   Dibuat lega (tidak dipaksa pendek) dan meniru tampilan asli:
   kartu hero, kartu progres dengan ikon, kartu performa.
   ---------------------------------------------------------- */

const SHARE_W = 1200;

const SERIF = "'Noto Serif', Georgia, serif";
const SANS = "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif";

const COLOR = {
  bg: '#15100d',
  stage: '#211914',
  line: 'rgba(255, 242, 220, 0.12)',
  track: 'rgba(255, 242, 220, 0.11)',
  card: 'rgba(255, 255, 255, 0.035)',
  text: '#f5ecdf',
  soft: '#d5c7b5',
  muted: '#9c8f81',
  accent: '#d99a55',
  accentSoft: '#ebbd86',
  accentDeep: '#9c5f31'
};

const L = {
  pad: 80,
  brand: 52,
  afterBrand: 56,
  hero: 200,
  afterHero: 72,
  title: 40,
  afterTitle: 30,
  card: 216,
  gap: 24,
  afterSection: 72,
  perfRow: 140,
  perfGap: 18,
  afterPerf: 64,
  footer: 24
};

function shareHeight() {
  const section = (body) => L.title + L.afterTitle + body;

  const progressH = 4 * L.card + 3 * L.gap; /* 8 kartu, 2 kolom */
  const summaryH = 3 * L.card + 2 * L.gap; /* 6 kartu, 2 kolom */
  const testsH = L.card; /* 2 kartu, 1 baris */
  const perfH = 5 * L.perfRow + 4 * L.perfGap; /* 5 mode */

  return (
    L.pad +
    L.brand +
    L.afterBrand +
    L.hero +
    L.afterHero +
    section(progressH) +
    L.afterSection +
    section(summaryH) +
    L.afterSection +
    section(testsH) +
    L.afterSection +
    section(perfH) +
    L.afterPerf +
    L.footer +
    L.pad
  );
}

/* Ikon SVG dari icons.js -> gambar untuk canvas (gagal = ikon dilewati) */
async function iconImage(name, color) {
  try {
    let svg = String(ic(name, 64));

    svg = svg.replaceAll('currentColor', color);

    if (!/xmlns=/.test(svg)) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    if (!/<svg[^>]*\swidth=/.test(svg)) svg = svg.replace('<svg', '<svg width="64" height="64"');

    return await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  } catch {
    return null;
  }
}

async function renderShareBlob(m) {
  try {
    await Promise.all([
      document.fonts.load(`600 58px ${SERIF}`),
      document.fonts.load(`600 24px ${SANS}`),
      document.fonts.load(`700 24px ${SANS}`)
    ]);
  } catch {
    /* font gagal dimuat: pakai fallback */
  }

  /* foto avatar (kalau ada) dimuat dulu sebelum menggambar */
  let photo = null;

  if (m.avatar.photo) {
    try {
      photo = await loadImage(m.avatar.photo);
    } catch {
      photo = null;
    }
  }

  /* semua ikon dimuat dulu */
  const iconNames = [
    ...new Set(
      [...m.progress, ...m.summary, ...m.tests, ...m.perf]
        .map((item) => item.icon)
        .concat('arrow')
    )
  ];

  const iconMap = {};
  await Promise.all(
    iconNames.map(async (name) => {
      iconMap[name] = await iconImage(name, COLOR.accent);
    })
  );

  const W = SHARE_W;
  const H = shareHeight();
  const inner = W - L.pad * 2;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');

  /* ---------- alat gambar ---------- */

  const roundRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  const write = (str, x, y, font, color, align = 'left', spacing = '0px') => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx) ctx.letterSpacing = spacing;
    ctx.fillText(str, x, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  };

  const widthOf = (str, font) => {
    ctx.font = font;
    return ctx.measureText(str).width;
  };

  const fit = (str, font, maxWidth) => {
    if (widthOf(str, font) <= maxWidth) return str;

    let out = str;
    while (out.length > 1 && widthOf(`${out}…`, font) > maxWidth) out = out.slice(0, -1);

    return `${out}…`;
  };

  const glow = (cx, cy, radius, rgb, alpha) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, `rgba(${rgb}, ${alpha})`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };

  const fillBar = (x, y, w, h, ratio) => {
    roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = COLOR.track;
    ctx.fill();

    const value = clamp01(ratio);
    if (value <= 0) return;

    const fw = Math.max(h, w * value);
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, COLOR.accentDeep);
    g.addColorStop(0.55, COLOR.accent);
    g.addColorStop(1, COLOR.accentSoft);

    roundRect(x, y, fw, h, h / 2);
    ctx.fillStyle = g;
    ctx.fill();
  };

  const panel = (x, y, w, h, r) => {
    roundRect(x, y, w, h, r);
    ctx.fillStyle = COLOR.card;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOR.line;
    ctx.stroke();
  };

  /* kotak ikon (seperti .pf-card-icon) */
  const iconTile = (x, y, name) => {
    roundRect(x, y, 52, 52, 15);
    ctx.fillStyle = 'rgba(217, 154, 85, 0.1)';
    ctx.fill();

    const img = iconMap[name];
    if (img) ctx.drawImage(img, x + 12, y + 12, 28, 28);
  };

  /* judul bagian: serif + garis tipis, seperti .pf-section-title */
  const sectionTitle = (label, y) => {
    const font = `600 32px ${SERIF}`;
    const w = widthOf(label, font);

    write(label, L.pad, y + 32, font, COLOR.text);

    ctx.fillStyle = COLOR.line;
    ctx.fillRect(L.pad + w + 24, y + 20, inner - w - 24, 2);
  };

  const statCard = (x, y, w, h, item) => {
    panel(x, y, w, h, 30);

    /* atas: ikon + label */
    iconTile(x + 32, y + 32, item.icon);

    const arrowRoom = item.link ? 44 : 0;
    const labelFont = `600 24px ${SANS}`;

    write(
      fit(item.label, labelFont, w - 102 - 32 - arrowRoom),
      x + 102,
      y + 66,
      labelFont,
      COLOR.soft
    );

    if (item.link) {
      const arrow = iconMap.arrow;
      if (arrow) ctx.drawImage(arrow, x + w - 32 - 26, y + 45, 26, 26);
    }

    /* bawah: angka + keterangan + bar (posisi sama di semua kartu) */
    const valueFont = `600 62px ${SERIF}`;
    const vy = y + h - 72;

    write(item.value, x + 32, vy, valueFont, COLOR.accentSoft);

    const note = item.note || item.unit;

    if (note) {
      const noteFont = `500 22px ${SANS}`;
      const nx = x + 32 + widthOf(item.value, valueFont) + 16;
      const room = x + w - 32 - nx;

      if (widthOf(note, noteFont) <= room) {
        write(note, nx, vy, noteFont, COLOR.muted);
      } else {
        /* terlalu panjang: turun ke baris bawah angka (seperti wrap di tampilan asli) */
        write(fit(note, noteFont, w - 64), x + 32, vy + 38, noteFont, COLOR.muted);
      }
    }

    if (item.ratio !== undefined) fillBar(x + 32, y + h - 44, w - 64, 10, item.ratio);
  };

  const perfCard = (x, y, w, h, r) => {
    panel(x, y, w, h, 28);

    iconTile(x + 32, y + 28, r.icon);

    write(r.label, x + 102, y + 46, `600 26px ${SANS}`, COLOR.text);
    write(
      `Total soal ${fmt(r.answered)} · Benar ${fmt(r.correct)}`,
      x + 102,
      y + 76,
      `500 20px ${SANS}`,
      COLOR.muted
    );

    write(fmtPercent0(r.accuracy), x + w - 32, y + 64, `600 44px ${SERIF}`, COLOR.accentSoft, 'right');

    fillBar(x + 32, y + h - 40, w - 64, 12, r.accuracy / 100);
  };

  /* ---------- latar ---------- */

  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, W, H);
  glow(W - 80, -40, 640, '217, 154, 85', 0.2);
  glow(40, H + 20, 600, '156, 95, 49', 0.18);

  /* ---------- brand ---------- */

  let y = L.pad;

  roundRect(L.pad, y, 48, 48, 14);
  ctx.fillStyle = 'rgba(217, 154, 85, 0.1)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(217, 154, 85, 0.32)';
  ctx.stroke();

  write('ॐ', L.pad + 24, y + 34, `600 26px ${SERIF}`, COLOR.accentSoft, 'center');
  write('DharmaLearn', L.pad + 64, y + 34, `700 28px ${SANS}`, COLOR.text);
  write('RINGKASAN BELAJAR', W - L.pad, y + 32, `700 18px ${SANS}`, COLOR.accent, 'right', '3px');

  y += L.brand + L.afterBrand;

  /* ---------- hero (avatar + identitas) ---------- */

  roundRect(L.pad, y, inner, L.hero, 40);
  ctx.fillStyle = COLOR.stage;
  ctx.fill();

  ctx.save();
  ctx.clip();
  const heroGlow = ctx.createRadialGradient(L.pad, y, 0, L.pad, y, inner * 0.7);
  heroGlow.addColorStop(0, 'rgba(217, 154, 85, 0.22)');
  heroGlow.addColorStop(1, 'rgba(217, 154, 85, 0)');
  ctx.fillStyle = heroGlow;
  ctx.fillRect(L.pad, y, inner, L.hero);
  ctx.restore();

  roundRect(L.pad, y, inner, L.hero, 40);
  ctx.lineWidth = 2;
  ctx.strokeStyle = COLOR.line;
  ctx.stroke();

  const cx = L.pad + 44 + 64;
  const cy = y + L.hero / 2;

  if (photo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 64, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(photo, cx - 64, cy - 64, 128, 128);
    ctx.restore();
  } else {
    const p = avatarPaint(m.avatar);

    const avatarGradient = ctx.createLinearGradient(cx - 64, cy - 64, cx + 64, cy + 64);
    avatarGradient.addColorStop(0, p.c1);
    avatarGradient.addColorStop(1, p.c2);

    ctx.beginPath();
    ctx.arc(cx, cy, 64, 0, Math.PI * 2);
    ctx.fillStyle = avatarGradient;
    ctx.fill();

    write(initialOf(m.name), cx, cy + 21, `600 62px ${SERIF}`, p.text, 'center');
  }

  const lines = [m.grade, m.school].filter(Boolean);
  const textX = L.pad + 44 + 128 + 40;
  const textW = L.pad + inner - 44 - textX;
  const nameFont = `600 58px ${SERIF}`;

  if (lines.length === 0) {
    write(fit(m.name, nameFont, textW), textX, y + 98, nameFont, COLOR.text);
    write('Kelas dan sekolah belum diisi', textX, y + 142, `500 24px ${SANS}`, COLOR.muted);
  } else if (lines.length === 1) {
    write(fit(m.name, nameFont, textW), textX, y + 92, nameFont, COLOR.text);
    write(fit(lines[0], `500 28px ${SANS}`, textW), textX, y + 138, `500 28px ${SANS}`, COLOR.soft);
  } else {
    write(fit(m.name, nameFont, textW), textX, y + 80, nameFont, COLOR.text);
    write(fit(lines[0], `500 28px ${SANS}`, textW), textX, y + 124, `500 28px ${SANS}`, COLOR.soft);
    write(fit(lines[1], `500 26px ${SANS}`, textW), textX, y + 162, `500 26px ${SANS}`, COLOR.muted);
  }

  y += L.hero + L.afterHero;

  /* ---------- progres belajar (2 kolom) ---------- */

  const colW = (inner - L.gap) / 2;

  sectionTitle('Progres belajar', y);
  y += L.title + L.afterTitle;

  m.progress.forEach((item, i) => {
    statCard(
      L.pad + (i % 2) * (colW + L.gap),
      y + Math.floor(i / 2) * (L.card + L.gap),
      colW,
      L.card,
      item
    );
  });

  y += 4 * L.card + 3 * L.gap + L.afterSection;

  /* ---------- ringkasan (2 kolom) ---------- */

  sectionTitle('Ringkasan', y);
  y += L.title + L.afterTitle;

  m.summary.forEach((item, i) => {
    statCard(
      L.pad + (i % 2) * (colW + L.gap),
      y + Math.floor(i / 2) * (L.card + L.gap),
      colW,
      L.card,
      item
    );
  });

  y += 3 * L.card + 2 * L.gap + L.afterSection;

  /* ---------- hasil tes (pre / post) ---------- */

  sectionTitle('Hasil tes', y);
  y += L.title + L.afterTitle;

  m.tests.forEach((item, i) => {
    statCard(L.pad + i * (colW + L.gap), y, colW, L.card, {
      ...item,
      /* di gambar tidak ada tombol: arrow dibuang, catatan dipendekkan
         supaya tidak turun baris dan menimpa progress bar */
      link: undefined,
      note: item.link ? 'belum dikerjakan' : String(item.note).split(' · ')[0]
    });
  });

  y += L.card + L.afterSection;

  /* ---------- performa latihan ---------- */

  sectionTitle('Performa latihan', y);
  y += L.title + L.afterTitle;

  m.perf.forEach((r, i) => {
    perfCard(L.pad, y + i * (L.perfRow + L.perfGap), inner, L.perfRow, r);
  });

  y += 5 * L.perfRow + 4 * L.perfGap + L.afterPerf;

  /* ---------- footer ---------- */

  const date = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  write(`Dibuat dengan DharmaLearn · ${date}`, W / 2, y + L.footer - 2, `500 20px ${SANS}`, COLOR.muted, 'center');

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob gagal'))), 'image/png');
  });
}

/* ----------------------------------------------------------
   RENDER HALAMAN
   ---------------------------------------------------------- */

export function renderProfile({
  name = 'Pembelajar',
  anonymous = false,
  fromAchievement = false,
  onBack
} = {}) {
  const app = getApp();
  const m = buildModel(name);

  if (m.complete && !anonymous) recordProfileCompleted();

  /* reset state modul tiap halaman dibuka */
  revealObserver?.disconnect();
  revealObserver = null;
  leaving = false;
  closeModal();

  app.innerHTML = `
    <main class="page pf-page">
      <div class="pf-glow pf-glow-a"></div>
      <div class="pf-glow pf-glow-b"></div>

      <nav class="pf-nav">
        <button class="pf-nav-back" id="pfBack" type="button">
          ${icons.chevronLeft}<span>Kembali</span>
        </button>

        <div class="pf-nav-right">
          <button class="pf-nav-brand" id="pfBrand" type="button">
          <span class="ach-nav-symbol">ॐ</span>  
          <span>DharmaLearn</span>
          </button>
        </div>
      </nav>

      <section class="pf-content">
        ${heroHtml(m)}

        <section class="pf-section">
          ${sectionHead('Progres belajar')}
          <div class="pf-grid pf-grid-progress">
            ${m.progress.map(progressCard).join('')}
          </div>
        </section>

        <section class="pf-section">
          ${sectionHead('Ringkasan')}
          <div class="pf-grid pf-grid-summary">
            ${m.summary.map(summaryCard).join('')}
          </div>
        </section>

        <section class="pf-section">
          ${sectionHead('Hasil tes')}
          <div class="pf-grid pf-grid-tests">
            ${m.tests.map(progressCard).join('')}
          </div>
        </section>

        <section class="pf-section">
          ${sectionHead('Performa latihan')}
          <ul class="pf-perf-list">
            ${m.perf.map(perfRow).join('')}
          </ul>
        </section>
      </section>
    </main>
  `;

  const goBack = () => {
    document.onkeydown = null;
    closeModal();
    onBack?.();
  };

  const rerender = () => renderProfile({ name, anonymous, fromAchievement, onBack });

  const openAchievement = () => {
    document.onkeydown = null;
    closeModal();
    /* fromProfile: supaya dari Achievement tombol akun cukup mundur ke sini */
    renderAchievement({ onBack: rerender, name, anonymous, fromProfile: true });
  };

  /* Import dinamis: menghindari circular import profile <-> kuis */
  const openPosttest = async () => {
    document.onkeydown = null;
    closeModal();

    try {
      const { renderKuis } = await import('./kuis.js');
      renderKuis({ startAt: 'posttest', onBack: rerender, name, anonymous });
    } catch {
      rerender();
      notify('Post-Test gagal dibuka. Coba lagi.');
    }
  };

  document.querySelector('#pfBack').onclick = () => leaveThen(goBack);
  document.querySelector('#pfBrand').onclick = () => leaveThen(goBack);
  /* Profile ini dibuka DARI Achievement -> cukup mundur (Achievement dibuang dari stack) */
  document.querySelector('#pfAch').onclick = () =>
    leaveThen(fromAchievement ? goBack : openAchievement);

  const postBtn = document.querySelector('#pfPost');
  if (postBtn) postBtn.onclick = () => leaveThen(openPosttest);
  document.querySelector('#pfEdit').onclick = () => openEdit(m, rerender);
  document.querySelector('#pfShare').onclick = () => openShare(m);

  document.onkeydown = (event) => {
    if (event.key !== 'Escape') return;

    if (document.querySelector('.pf-modal:not(.is-closing)')) closeModal(true);
    else leaveThen(goBack);
  };

  /* easter egg "om": ketuk avatar 7 kali berturut-turut (jeda maks 1,2 dtk antar ketukan) */
  let taps = 0;
  let tapTimer;

  document.querySelector('.pf-hero .pf-avatar')?.addEventListener('click', () => {
    taps += 1;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      taps = 0;
    }, 1200);
  });

  window.scrollTo(0, 0);
  setupReveal();
}