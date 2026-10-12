import { getApp } from '../main.js';
import kuisText from '../materi/Kuis.txt?raw';
import materiText from '../materi/Materi.txt?raw';
import { ic, icons } from './icons.js';
import { renderProfile } from './profile.js';
import {
  recordQuizOpened,
  recordQuizResult,
  recordPetaOpened,
  recordPetaResult,
  recordExamResult,
  recordPretestResult,
  recordPosttestResult,
  configureKuis,
  DARSANA_IDS
} from './achievements.js';

/* =========================================================
   PENGATURAN
   ========================================================= */

const LETTERS = ['A', 'B', 'C', 'D'];
const SHORT_QUIZ_SIZE = 10;

/* Acak urutan pilihan jawaban juga (A-D diberi label ulang). */
const SHUFFLE_OPTIONS = true;

/* Menyimpan soal yang belum pernah keluar agar kuis singkat tidak itu-itu saja. */
const POOL_STORAGE_KEY = 'dharmalearn:kuis-unseen';

/* ---------- Kuis Ketik ---------- */
const TYPING_QUIZ_SIZE = 10;
const TYPING_POOL_KEY = 'dharmalearn:kuis-ketik-unseen';
/* Soal dengan jawaban lebih panjang dari ini dihindari (susah diketik),
   kecuali jumlah soal pendek tidak cukup. */
const TYPING_MAX_WORDS = 8;

/* ---------- Full Quiz (dibatasi, bukan semua soal) ---------- */
const FULL_QUIZ_SIZE = 50;
const FULL_POOL_KEY = 'dharmalearn:kuis-full-unseen';

/* ---------- True / False ---------- */
const TF_SIZE = 10;
const TF_POOL_KEY = 'dharmalearn:kuis-tf-unseen';

/* ---------- Fill in the Blank ---------- */
const BLANK_SIZE = 10;
const BLANK_POOL_KEY = 'dharmalearn:kuis-blank-unseen';

/* ---------- Matching ---------- */
const MATCH_ROUND_SIZE = 5;   /* pasangan per ronde */
const MATCH_ROUNDS = 2;       /* jumlah ronde */

/* ---------- Susun Urutan ---------- */
const ORDER_SIZE = 5;         /* jumlah set urutan per sesi */

/* ---------- Memory Match ---------- */
const MEMORY_PAIRS = 6;

/* ---------- Exam Simulator ---------- */
const EXAM_STORAGE_KEY = 'dharmalearn:exam-setup-v2';
const SPRINT_STORAGE_KEY = 'dharmalearn:sprint-setup-v2';

/* Study Sprint wajib memilih minimal sekian jenis latihan */
const SPRINT_MIN_TYPES = 2;

const LEVEL_CHOICES = [
  { id: 'campuran', label: 'Campuran' },
  { id: 'mudah', label: 'Mudah' },
  { id: 'sedang', label: 'Sedang' },
  { id: 'sulit', label: 'Sulit' }
];

/* Detik per item menurut kesulitan (hanya dipakai Exam). Ubah di sini kalau
   waktunya terasa kurang/kelamaan. */
const EXAM_SECONDS = { mudah: 60, sedang: 40, sulit: 25, campuran: 42 };

/* Bobot waktu tiap jenis (jenis yang lebih lama dikerjakan = bobot lebih besar) */
const EXAM_WEIGHT = {
  abcd: 1, ketik: 1.5, tf: 0.6, blank: 1.3, match: 0.8,
  order: 2, flash: 0.8, peta: 1, memory: 1.2, tts: 2
};

/* [minimal, maksimal] jumlah item per jenis */
const EXAM_LIMITS = {
  abcd: [1, 30], ketik: [1, 20], tf: [1, 30], blank: [1, 20], match: [3, 10],
  order: [1, 7], flash: [1, 20], peta: [1, 12], memory: [3, 10], tts: [4, 12]
};

/* ---------- Peta Sad Darsana ---------- */
const MAP_STORAGE_KEY = 'dharmalearn:peta-v3';
const MAP_QUESTIONS_PER_REGION = 10;
/* Minimal rasio benar untuk menaklukkan satu wilayah */
const MAP_PASS_RATIO = 0.6;

/* ---------- Pre-Test & Post-Test ----------
   Soal tes SELALU sama (urutan id terkecil tiap wilayah) supaya nilai
   Pre-Test dan Post-Test bisa dibandingkan. Urutan & pilihan tetap diacak. */
const TEST_TOTAL = 30;
const PRETEST_KEY = 'dharmalearn:pretest-v2';
const POSTTEST_KEY = 'dharmalearn:posttest-v2';

/* cadangan kalau localStorage diblokir, supaya gate Pre-Test tidak mengunci selamanya */
const testMemory = {};

function loadTest(key) {
  try {
    const raw = JSON.parse(localStorage.getItem(key));
    if (raw && typeof raw === 'object') return raw;
  } catch {
    /* abaikan */
  }

  return testMemory[key] || null;
}

function saveTest(key, data) {
  testMemory[key] = data;

  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* abaikan jika storage tidak tersedia */
  }
}

/* Dipakai dashboard.js untuk memutuskan gate Pre-Test */
export const getPretest = () => loadTest(PRETEST_KEY);
export const getPosttest = () => loadTest(POSTTEST_KEY);

function testQuestions() {
  /* urut id, lalu ambil 30 soal dengan jarak merata dari seluruh bank,
     jadi selalu sama (Pre/Post sebanding) dan tersebar, tidak menumpuk di awal */
  const sorted = [...QUESTION_BANK].sort((a, b) => a.id - b.id);
  if (sorted.length <= TEST_TOTAL) return sorted;

  const step = sorted.length / TEST_TOTAL;
  return Array.from({ length: TEST_TOTAL }, (_, i) => sorted[Math.floor(i * step)]);
}
function buildTestSession(mode) {
  const list = testQuestions();

  if (list.length < 4) {
    showNotice('Soal belum cukup untuk membuat tes. Periksa file Kuis.txt.');
    return null;
  }

  return {
    mode,
    items: shuffle(list).map(q => prepareItem(q)),
    index: 0,
    score: 0,
    results: []
  };
}

/* ---------- Flashcards & Teka-Teki Silang ---------- */
const FLASH_SIZE = 10;
const FLASH_POOL_KEY = 'dharmalearn:flashcard-unseen';

const CROSS_WORDS = 10;               /* target jumlah kata per TTS */
const CROSS_POOL_KEY = 'dharmalearn:tts-unseen';
const CROSS_MAX_LETTERS = 14;        /* jawaban lebih panjang dari ini tidak dipakai */

/* Delapan wilayah = delapan poin utama di Materi.txt (C. Ringkasan Materi).
   Urutan di bawah = urutan perjalanan (mulai dari BAWAH peta, naik ke Moksa).
   `category` HARUS sama dengan nama bagian di CATEGORY_RANGES.
   `glyph` = nama ikon di icons.js. */
const REGIONS = [
  { id: 'pengertian', name: 'Pengertian Darsana', category: 'Pengertian Darsana', focus: 'Hakikat dan fungsi Darsana', glyph: 'eye' },
  { id: 'sad', name: 'Sad Darsana', category: 'Sad Darsana', focus: 'Enam sistem filsafat Hindu', glyph: 'layers' },
  { id: 'nyaya', name: 'Nyaya', category: 'Nyaya', focus: 'Logika & penalaran', glyph: 'search' },
  { id: 'vaiseshika', name: 'Vaiseshika', category: 'Vaiseshika', focus: 'Hakikat realitas', glyph: 'globe' },
  { id: 'samkhya', name: 'Samkhya', category: 'Samkhya', focus: 'Purusa & Prakrti', glyph: 'duo' },
  { id: 'yoga', name: 'Yoga', category: 'Yoga', focus: 'Disiplin & pengendalian diri', glyph: 'activity' },
  { id: 'mimamsa', name: 'Mimamsa', category: 'Mimamsa', focus: 'Weda & kewajiban', glyph: 'book' },
  { id: 'vedanta', name: 'Vedanta', category: 'Vedanta', focus: 'Atman & Brahman', glyph: 'sun' }
];

/* Dipakai halaman Tools */
export const TOPICS = REGIONS.map(({ id, name, category, glyph, focus }) => ({
  id, name, category, glyph, focus
}));

const MODE_LABELS = {
  short: 'Kuis Kilat',
  all: 'Kuis Maraton',
  ketik: 'Kuis Ketik',
  tf: 'Benar / Salah',
  blank: 'Lengkapi Kalimat',
  match: 'Jodohkan',
  order: 'Susun Urutan',
  flash: 'Flashcards',
  peta: 'Peta Sad Darsana',
  memory: 'Cocokkan Kartu',
  tts: 'Teka-Teki Silang',
  custom: 'Kuis Kustom',
    sprint: 'Sprint Belajar',
  pretest: 'Pre-Test',
  posttest: 'Post-Test'
};

/* Daftar bagian yang bisa dimasukkan ke Exam Simulator.
   Urutan di sini = urutan bagian saat ujian berjalan. */
const EXAM_TYPES = [
  { id: 'abcd', group: 'latihan', title: 'Pilihan Ganda (A–D)', icon: 'zap', size: 8, unit: 'soal', desc: 'Pilih satu jawaban benar dari empat pilihan.' },
  { id: 'ketik', group: 'latihan', title: 'Kuis Ketik', icon: 'keyboard', size: 5, unit: 'soal', desc: 'Ketik sendiri jawabannya tanpa pilihan.' },
  { id: 'tf', group: 'latihan', title: 'Benar / Salah', icon: 'toggle', size: 8, unit: 'soal', desc: 'Tentukan apakah jawaban yang diajukan benar atau salah.' },
  { id: 'blank', group: 'latihan', title: 'Lengkapi Kalimat', icon: 'blank', size: 5, unit: 'soal', desc: 'Ketik kata yang hilang dari kalimat materi.' },
  { id: 'match', group: 'game', title: 'Jodohkan', icon: 'link', size: 5, unit: 'pasangan', desc: 'Jodohkan soal dengan jawabannya.' },
  { id: 'flash', group: 'latihan', title: 'Flashcards', icon: 'cards', size: 6, unit: 'kartu', desc: 'Balik kartu lalu nilai hafalanmu sendiri.' },
  // 'peta' dihapus
  { id: 'memory', group: 'game', title: 'Cocokkan Kartu', icon: 'memory', size: 6, unit: 'pasangan', desc: 'Cocokkan kartu soal dan jawaban dengan ingatanmu.' },
  { id: 'tts', group: 'game', title: 'Teka-Teki Silang', icon: 'grid', size: 6, unit: 'kata', desc: 'Isi kotak mendatar dan menurun.' }
];

/* ---------- Helper setup Exam / Sprint (tanpa penyimpanan) ----------
   PENTING: harus berada di level modul (bukan di dalam fungsi lain),
   karena dipakai showExamSetup, showExamIntro, runStage, dll. */

function clampSize(id, n) {
  const [lo, hi] = EXAM_LIMITS[id] || [1, 20];
  const v = Math.round(Number(n));
  return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
}

function sizeFor(sizes, id) {
  const def = EXAM_TYPES.find(t => t.id === id)?.size ?? 1;
  return clampSize(id, sizes?.[id] ?? def);
}

function defaultSetup(kind) {
  return {
    types: kind === 'sprint'
      ? ['abcd', 'tf', 'flash']
      : EXAM_TYPES.map(t => t.id),
    sizes: Object.fromEntries(EXAM_TYPES.map(t => [t.id, t.size])),
    level: kind === 'sprint' ? 'campuran' : 'sedang'
  };
}

/* Batas waktu Exam (ms): jumlah item x bobot jenis x detik per item,
   lalu dibulatkan ke kelipatan STEP detik */
const EXAM_ROUND_SECONDS = 60; /* 60 = menit penuh, 30 = per setengah menit */

function examLimitMs(ids, sizes, level) {
  const perItem = EXAM_SECONDS[level] || EXAM_SECONDS.sedang;

  const seconds = ids.reduce(
    (sum, id) => sum + sizeFor(sizes, id) * (EXAM_WEIGHT[id] || 1) * perItem,
    0
  );

  const step = EXAM_ROUND_SECONDS;
  const rounded = Math.max(step, Math.round(seconds / step) * step);

  return rounded * 1000;
}

/*
  Set urutan untuk "Susun Urutan". `items` ditulis dalam URUTAN YANG BENAR
  (nanti diacak otomatis). Silakan sesuaikan dengan Materi.txt-mu
  atau tambah set baru. `category` kosong = tanpa panel materi.
*/
const ORDER_SETS = [
  {
    title: 'Sad Darsana',
    category: 'Sad Darsana',
    prompt: 'Susun enam sistem Sad Darsana sesuai urutan yang lazim.',
    items: ['Nyaya', 'Vaiseshika', 'Samkhya', 'Yoga', 'Mimamsa', 'Vedanta']
  },
  {
    title: 'Astangga Yoga',
    category: 'Yoga',
    prompt: 'Susun delapan tahapan Astangga Yoga dari yang paling awal.',
    items: ['Yama', 'Niyama', 'Asana', 'Pranayama', 'Pratyahara', 'Dharana', 'Dhyana', 'Samadhi']
  },
  {
    title: 'Panca Avayava',
    category: 'Nyaya',
    prompt: 'Susun lima unsur silogisme Nyaya (Panca Avayava).',
    items: ['Pratijna', 'Hetu', 'Udaharana', 'Upanaya', 'Nigamana']
  },
  {
    title: 'Evolusi Samkhya',
    category: 'Samkhya',
    prompt: 'Susun urutan evolusi (tattva) dari Prakrti dalam Samkhya.',
    items: ['Prakrti', 'Buddhi (Mahat)', 'Ahamkara', 'Manas', 'Tanmatra', 'Mahabhuta']
  },
  {
    title: 'Catur Asrama',
    category: '',
    prompt: 'Susun empat tahap kehidupan (Catur Asrama).',
    items: ['Brahmacari', 'Grhastha', 'Wanaprastha', 'Bhiksuka']
  },
  {
    title: 'Catur Purusartha',
    category: '',
    prompt: 'Susun empat tujuan hidup (Catur Purusartha) sesuai urutan lazim.',
    items: ['Dharma', 'Artha', 'Kama', 'Moksa']
  },
  {
    title: 'Jalan Menuju Moksa',
    category: 'Pengertian Darsana',
    prompt: 'Susun alur belajar Darsana: dari pengertian hingga tujuan akhir.',
    items: ['Pengertian Darsana', 'Sad Darsana', 'Nyaya & Vaiseshika', 'Samkhya & Yoga', 'Mimamsa & Vedanta', 'Moksa']
  }
];

/*
  Label bagian untuk tiap soal (dipakai di halaman soal & hasil).
  Nama bagian HARUS sama dengan judul bab di Materi.txt
  supaya pembahasan bisa dicocokkan otomatis.
*/
/* Nama bagian HARUS sama dengan `category` di REGIONS */
const CATEGORY_TITLES = [
  'Pengertian Darsana',
  'Sad Darsana',
  'Nyaya',
  'Vaiseshika',
  'Samkhya',
  'Yoga',
  'Mimamsa',
  'Vedanta'
];

/* Istilah -> bagian. Dipakai karena soal di Kuis.txt tercampur antar bab. */
const TERM_GROUPS = {
  'Pengertian Darsana': [
    'Darsana', 'Tattva', 'Pramana', 'Prama', 'Moksha', 'Samsara',
    'Karma', 'Dharma', 'Astika', 'Nastika'
  ],
  'Sad Darsana': [
    'Sad Darsana', 'Nyaya dan Vaiseshika', 'Samkhya dan Yoga', 'Mimamsa dan Vedanta'
  ],
  'Nyaya': [
    'Nyaya', 'Nyaya Sutra', 'Rsi Gautama', 'Pratyaksha', 'Anumana', 'Upamana',
    'Shabda', 'Pratijna', 'Hetu', 'Udaharana', 'Upanaya', 'Nigamana',
    'Penerapan Nyaya'
  ],
  'Vaiseshika': [
    'Vaiseshika', 'Vaisheshika Sutra', 'Rsi Kanada', 'Padartha', 'Dravya', 'Guna',
    'Karma dalam Vaiseshika', 'Samanya', 'Vishesha', 'Samavaya', 'Abhava',
    'Paramanu', 'Anu', 'Penerapan Vaiseshika'
  ],
  'Samkhya': [
    'Samkhya', 'Samkhya Karika', 'Ishvarakrishna', 'Rsi Kapila', 'Purusa', 'Prakrti',
    'Mahat atau Buddhi', 'Ahamkara', 'Manas', 'Shrotra', 'Tvak', 'Chakshus', 'Jihva',
    'Ghrana', 'Vak', 'Pani', 'Pada', 'Payu', 'Upastha', 'Shabda Tanmatra',
    'Sparsha Tanmatra', 'Rupa Tanmatra', 'Rasa Tanmatra', 'Gandha Tanmatra',
    'Akasha', 'Vayu', 'Tejas atau Agni', 'Ap atau Jala', 'Prithvi', 'Triguna',
    'Sattva', 'Rajas', 'Tamas', 'Kaivalya', 'Penerapan Samkhya'
  ],
  'Yoga': [
    'Yoga', 'Yoga Sutra', 'Rsi Patanjali', 'Citta Vrtti Nirodha', 'Ashtanga Yoga',
    'Yama', 'Niyama', 'Asana', 'Pranayama', 'Pratyahara', 'Dharana', 'Dhyana',
    'Samadhi', 'Ahimsa', 'Satya', 'Asteya', 'Brahmacharya', 'Aparigraha', 'Saucha',
    'Santosha', 'Tapas', 'Svadhyaya', 'Ishvara Pranidhana', 'Klesha', 'Avidya',
    'Asmita', 'Raga', 'Dvesha', 'Abhinivesha', 'Penerapan Yoga'
  ],
  'Mimamsa': [
    'Mimamsa', 'Mimamsa Sutra', 'Rsi Jaimini', 'Purva Mimamsa', 'Vidhi', 'Apurva',
    'Penerapan Mimamsa'
  ],
  'Vedanta': [
    'Vedanta', 'Uttara Mimamsa', 'Badarayana', 'Brahman', 'Atman', 'Maya',
    'Prasthanatrayi', 'Upanisad', 'Bhagavad Gita', 'Brahma Sutra', 'Advaita',
    'Vishishtadvaita', 'Dvaita', 'Penerapan Vedanta'
  ]
};

const TERM_CATEGORY = new Map();

Object.entries(TERM_GROUPS).forEach(([category, terms]) => {
  terms.forEach(term => TERM_CATEGORY.set(normalizeText(term), category));
});

/* Ambil istilah inti dari sebuah soal:
   - "Manakah istilah ... berikut: <definisi>?"  -> istilahnya = jawaban benar
   - "... menyebut konsep “X”, ..."             -> X
   - "... yang paling sesuai dengan X?"          -> X */
function termOf(q) {
  if (/^manakah istilah/i.test(q.text)) return q.options[q.answer];

  const quoted = q.text.match(/[“"]([^”"]+)[”"]/);
  if (quoted) return quoted[1];

  const match = q.text.match(/sesuai dengan (.+?)\s*\?\s*$/i);
  if (match) return match[1];

  return '';
}

function categoryByTerm(q) {
  if (q.category) return q.category;

  const term = termOf(q);
  const found = TERM_CATEGORY.get(normalizeText(term));

  if (!found) {
    console.warn(`[Kuis] Soal nomor ${q.id}: istilah "${term}" belum punya kategori.`);
  }

  return found || '';
}

/* Samakan teks untuk mencocokkan "Kunci:" dengan isi pilihan */
function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/, '')
    .trim();
}

/* =========================================================
   IKON LOKAL (untuk mode baru; ikon lama tetap dari icons.js)
   ========================================================= */

const LOCAL_ICONS = {
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  gamepad: '<path d="M6 12h4M8 10v4"/><circle cx="15" cy="13" r="1"/><circle cx="18" cy="11" r="1"/><path d="M17.3 5H6.7a4 4 0 0 0-3.9 3.2l-1.6 8A2.5 2.5 0 0 0 3.6 19c.8 0 1.5-.4 2-1l2-2.5h8.8l2 2.5c.5.6 1.2 1 2 1a2.5 2.5 0 0 0 2.4-2.8l-1.6-8A4 4 0 0 0 17.3 5Z"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  toggle: '<rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="8" cy="12" r="2.5"/>',
  blank: '<path d="M4 7h16"/><path d="M4 17h5M15 17h5"/><path d="M10 17h4" stroke-dasharray="1 3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  sort: '<path d="M3 6h10M3 12h7M3 18h4"/><path d="M17 5v14M14 16l3 3 3-3"/>',
  memory: '<rect x="3" y="4" width="8" height="10" rx="2"/><rect x="13" y="10" width="8" height="10" rx="2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  flag: '<path d="M5 22V4"/><path d="M5 4h12l-2 4 2 4H5"/>',
  trend: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/><path d="M15 8h4v4"/>'
};

function ico(name, size = 18, stroke = 2) {
  if (!LOCAL_ICONS[name]) return ic(name, size, stroke);

  const s = typeof size === 'number' ? `${size}px` : size;

  return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${LOCAL_ICONS[name]}</svg>`;
}

/* =========================================================
   HELPERS
   ========================================================= */

const pad = n => String(n).padStart(2, '0');

function e(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* Fisher-Yates: pengacakan yang merata */
function shuffle(list) {
  const result = [...list];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

function showNotice(message) {
  document.querySelector('.kuis-notice')?.remove();

  const notice = document.createElement('div');
  notice.className = 'kuis-notice';
  notice.textContent = message;

  document.body.appendChild(notice);
  requestAnimationFrame(() => notice.classList.add('visible'));

  setTimeout(() => {
    notice.classList.remove('visible');
    setTimeout(() => notice.remove(), 250);
  }, 2400);
}

function starsHtml(count, max = 3) {
  let html = '';

  for (let i = 0; i < max; i += 1) {
    html += `<span class="${i < count ? 'on' : 'off'}">${ic('star', '1em')}</span>`;
  }

  return html;
}

/* Penanda benar / salah di kartu umpan balik */
const mark = (kind, text) =>
  `<b class="kuis-verdict">${ic(kind === 'ok' ? 'check' : 'close', 15, 2.4)}${text}</b>`;

const backBtn = label => `${ic('back', 16)}<span>${label}</span>`;
const nextHtml = `<span>Lanjut</span>${ic('arrow', 16)}`;

/* Label tombol yang dipakai di banyak tempat: ubah di sini saja */
const LABEL_BACK = 'Kembali';
const LABEL_MENU = 'Menu Latihan';
const LABEL_MAP = 'Peta';

/* Scroll sekarang terjadi di .kuis-scroller (bukan window),
   supaya scrollbar mulai tepat di bawah toolbar. */
const getScroll = () => document.querySelector('.kuis-scroller')?.scrollTop || 0;

const setScroll = y => {
  const s = document.querySelector('.kuis-scroller');
  if (s) s.scrollTop = y;
};

/* Kalimat penutup berdasarkan skor */
function praise(percent) {
  if (percent >= 85) return 'Luar biasa! Pemahamanmu sudah sangat baik.';
  if (percent >= 70) return 'Bagus! Sedikit lagi menuju penguasaan penuh.';
  if (percent >= 50) return 'Cukup baik. Ulangi bagian yang masih salah.';
  return 'Ayo pelajari lagi materinya, lalu coba lagi.';
}

/* Pesan semangat Flashcards. Dikocok per putaran, jadi tidak berulang
   sampai semua pesan di kategorinya keluar dulu. */
const CHEER_OK = [
  'Mantap, pertahankan!',
  'Pemahamanmu makin tajam!',
  'Keren, ingatanmu kuat!',
  'Tepat sekali, lanjutkan!',
  'Hebat, kamu di jalur yang benar!',
  'Pelan tapi pasti, kamu makin hafal!',
  'Satu kartu berhasil ditaklukkan!',
  'Luar biasa, terus semangat!'
];

const CHEER_BAD = [
  'Tidak apa-apa, salah itu bagian dari belajar.',
  'Kartu ini muncul lagi di daftar ulang pada hasil akhir.',
  'Sedikit lagi, jangan menyerah!',
  'Ingat jawabannya, nanti pasti hafal.',
  'Setiap kesalahan bikin kamu makin paham.',
  'Tarik napas, lanjut kartu berikutnya!',
  'Kamu pasti bisa menguasainya!',
  'Yang penting sekarang kamu tahu jawabannya.'
];

function makePicker(list) {
  let queue = [];
  let last = '';

  return () => {
    if (!queue.length) {
      queue = shuffle(list);
      /* hindari pesan yang sama berturut-turut di sambungan putaran */
      if (queue[queue.length - 1] === last && queue.length > 1) queue.reverse();
    }
    last = queue.pop();
    return last;
  };
}

const pickCheerOk = makePicker(CHEER_OK);
const pickCheerBad = makePicker(CHEER_BAD);

/* =========================================================
   PARSER KUIS.TXT
   - "12. Teks soal"       -> soal baru
   - "A. teks pilihan"     -> pilihan (maks 4 per soal)
   - "B. Sad Darsana"      -> kalau muncul sesudah 4 pilihan = judul bagian
   - "Kunci: teks jawaban" -> dicocokkan dengan ISI pilihan (bukan huruf),
                              jadi aman walau pilihan diacak.
                              "Kunci: B" (huruf) juga didukung.
   ========================================================= */

function parseKuis(text) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim());

  const questions = [];
  const fileKey = {};

  let current = null;
  let category = '';
  let keyMode = false;

  const flush = () => {
    if (current) questions.push(current);
    current = null;
  };

  for (const line of lines) {
    if (!line) continue;

        const keyLine = line.match(/^kunci(?:\s+jawaban)?\s*:\s*(.+)$/i); 

    if (keyLine && !keyMode) {
      if (current) current.keyText = keyLine[1].trim();
      continue;
    }

    if (/^kunci(\s+jawaban)?\s*:?\s*$/i.test(line)) {
      flush();
      keyMode = true;
      continue;
    }

    if (keyMode) {
      for (const m of line.matchAll(/(\d+)\s*[.:=)\-]?\s*([A-D])\b/gi)) {
        fileKey[Number(m[1])] = m[2].toUpperCase();
      }
      continue;
    }

    const option = line.match(/^([A-D])[.)]\s+(.+)$/);

    if (option) {
      if (current && current.options.length < 4) {
        let value = option[2].trim();
        const cleaned = value.replace(/\s*(\*|\(benar\))\s*$/i, '').trim();

        if (cleaned !== value) {
          current.markedLetter = LETTERS[current.options.length];
          value = cleaned;
        }

        current.options.push(value);
      } else {
        flush();
        category = option[2].trim();
      }
      continue;
    }

    const question = line.match(/^(\d+)[.)]\s+(.+)$/);

    if (question) {
      flush();
      current = {
        id: Number(question[1]),
        category,
        text: question[2].trim(),
        options: [],
        markedLetter: '',
        keyText: ''
      };
      continue;
    }

    if (current) {
      if (current.options.length === 0) current.text += ` ${line}`;
      else current.options[current.options.length - 1] += ` ${line}`;
    }
  }

  flush();

  return { questions, fileKey };
}

function buildBank(text) {
  const { questions, fileKey } = parseKuis(text);

  return questions
    .map(q => {
      let answer = -1;

      if (q.keyText) {
        answer = /^[A-D]$/i.test(q.keyText)
          ? LETTERS.indexOf(q.keyText.toUpperCase())
          : q.options.findIndex(
              o => normalizeText(o) === normalizeText(q.keyText)
            );
      }

      if (answer < 0) {
        answer = LETTERS.indexOf(fileKey[q.id] || q.markedLetter || '');
      }

            return {
        ...q,
        answer,
        category: categoryByTerm({ ...q, answer })
      };
    })
    .filter(q => {
      const valid =
        q.options.length >= 2 && q.answer > -1 && q.answer < q.options.length;

      if (!valid) {
        console.warn(`[Kuis] Soal nomor ${q.id} dilewati (opsi/kunci tidak lengkap).`);
      }

      return valid;
    });
}

const QUESTION_BANK = buildBank(kuisText);

/* Kategori resmi sebuah soal (sudah ditentukan saat bank soal dibuat) */
const categoryOf = q => q.category;

configureKuis({
  bankSize: QUESTION_BANK.length,
  regionSizes: Object.fromEntries(REGIONS.map(r => [r.id, regionPool(r).length]))
});

/* =========================================================
   PARSER MATERI.TXT  (untuk pembahasan di bawah jawaban)
   - Judul bab dikenali dari "1. Pengertian Darsana", "3. Nyaya", dst.
     yang namanya cocok dengan CATEGORY_RANGES.
   - Baris yang diakhiri ":" dianggap pembuka daftar (bullet).
   - "Penerapan:" dijadikan sub-judul.
   ========================================================= */

function parseMateri(text) {
  const titleMap = new Map(
    CATEGORY_TITLES.map(title => [normalizeText(title), title])
  );

  /* judul bab di Materi.txt yang lebih panjang dari nama bagian */
  const aliases = {
    'mimamsa atau purva mimamsa': 'Mimamsa',
    'vedanta atau uttara mimamsa': 'Vedanta',
    'hubungan antarkeenam sistem sad darsana': 'Sad Darsana'
  };

  Object.entries(aliases).forEach(([key, title]) => titleMap.set(key, title));

  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim());

  const sections = {};
  let current = null;

  for (const line of lines) {
    if (!line) continue;

        const heading = line.match(/^\d+[.)]\s+(.+)$/);

    if (heading) {
      /* bab yang tidak dikenal (Penerapan, Kesimpulan, Daftar Rujukan)
         mengakhiri bagian sebelumnya, tidak ikut nempel ke dalamnya */
      current = titleMap.get(normalizeText(heading[1])) || null;
      if (current) sections[current] ??= [];
      continue;
    }

    /* Judul besar HURUF KAPITAL (mis. "D. LATIHAN") = akhir bagian ringkasan */
    if (/^[A-Z]\.\s+[A-Z][A-Z\s&]+$/.test(line)) {
      current = null;
      continue;
    }

    if (current) sections[current].push(line);
  }

  return sections;
}

function materiToHtml(lines) {
  let html = '';
  let listOpen = false;

  const closeList = () => {
    if (listOpen) {
      html += '</ul>';
      listOpen = false;
    }
  };

    for (const line of lines) {
    if (/^\d+(\.\d+)+\s+/.test(line)) {
      closeList();
      html += `<h4>${e(line.replace(/^[\d.]+\s+/, ''))}</h4>`;
      continue;
    }

    const isApplication = /^penerapan\s*:?$/i.test(line);

    /* Di dalam daftar: item pendek. Kalimat panjang / "Penerapan" = daftar selesai */
    if (listOpen) {
      if (!isApplication && line.length <= 70) {
        html += `<li>${e(line)}</li>`;
        continue;
      }
      closeList();
    }

    if (isApplication) {
      html += '<h4>Penerapan</h4>';
      continue;
    }

    if (line.endsWith(':')) {
      html += `<p>${e(line)}</p><ul>`;
      listOpen = true;
      continue;
    }

    html += `<p>${e(line)}</p>`;
  }

  closeList();

  return html;
}

const MATERI_BANK = parseMateri(materiText);

function getMateri(category) {
  const lines = MATERI_BANK[category];
  if (!lines || !lines.length) return null;

  return { title: category, html: materiToHtml(lines) };
}

export { MATERI_BANK };

/* =========================================================
   PENILAIAN JAWABAN KETIK
   Toleran terhadap: huruf besar/kecil, tanda baca, tanda
   diakritik (ś → s), salah ketik kecil, dan urutan kata
   pada jawaban yang terdiri dari beberapa kata kunci.
   ========================================================= */

const STOPWORDS = new Set([
  'yang', 'dan', 'atau', 'di', 'ke', 'dari', 'dengan', 'untuk', 'pada',
  'adalah', 'itu', 'ini', 'dalam', 'sebagai', 'oleh', 'agar', 'serta',
  'yaitu', 'yakni', 'para', 'sebuah', 'suatu'
]);

function simplify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];

    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }

    prev = row;
  }

  return prev[b.length];
}

function allowedTypos(length) {
  if (length <= 4) return 0;
  if (length <= 8) return 1;
  if (length <= 15) return 2;
  return Math.floor(length * 0.12);
}

function keyWords(text) {
  return simplify(text)
    .split(' ')
    .filter(word => word.length > 2 && !STOPWORDS.has(word));
}

function wordCount(text) {
  return simplify(text).split(' ').filter(Boolean).length;
}

function isTypedCorrect(input, answer) {
  const typed = simplify(input);
  const target = simplify(answer);

  if (!typed) return false;
  if (typed === target) return true;
  if (levenshtein(typed, target) <= allowedTypos(target.length)) return true;

  /* Jawaban beberapa kata: cukup memuat sebagian besar kata kuncinya */
  const targetWords = keyWords(answer);

  if (targetWords.length >= 2) {
    const typedWords = keyWords(input);

    const hits = targetWords.filter(word =>
      typedWords.some(
        t => t === word || (word.length >= 6 && levenshtein(t, word) <= 1)
      )
    ).length;

    return (
      hits / targetWords.length >= 0.75 &&
      typedWords.length <= targetWords.length * 2
    );
  }

  return false;
}

/* "Purusa dan Prakrti" -> "P_____  d__  P______" */
function hintFor(answer) {
  return String(answer)
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word[0] + '_'.repeat(Math.max(word.length - 1, 0)))
    .join('  ');
}

/* =========================================================
   BANK "FILL IN THE BLANK"
   Diambil dari kalimat-kalimat di Materi.txt. Kata yang
   dikosongkan dipilih saat soal ditarik (kata berhuruf kapital
   seperti istilah Sanskerta diprioritaskan).
   ========================================================= */

const BLANK_WORD = /^[A-Za-z\u00C0-\u024F]{5,}$/;
const stripWord = w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

function buildBlankBank() {
  const out = [];

  Object.entries(MATERI_BANK).forEach(([category, lines]) => {
    lines.forEach(line => {
      if (line.endsWith(':')) return;

      (line.match(/[^.!?]+[.!?]*/g) || []).forEach(raw => {
        const full = raw.trim();
        const words = full.split(/\s+/);

        if (words.length < 6 || words.length > 40) return;

        const cands = [];

        words.forEach((w, i) => {
          const clean = stripWord(w);

          if (i === 0 || !BLANK_WORD.test(clean)) return;
          if (STOPWORDS.has(clean.toLowerCase())) return;

          cands.push({ i, clean, cap: /^[A-Z\u00C0-\u00DE]/.test(clean) });
        });

        const caps = cands.filter(c => c.cap);
        const pool = caps.length
          ? caps
          : [...cands].sort((a, b) => b.clean.length - a.clean.length).slice(0, 3);

        if (!pool.length) return;

        out.push({ id: `b${out.length}`, category, full, words, cands: pool });
      });
    });
  });

  return out;
}

const BLANK_BANK = buildBlankBank();

function blankItem(entry) {
  const pick = entry.cands[Math.floor(Math.random() * entry.cands.length)];

  const text = entry.words
    .map((w, i) => (i === pick.i ? w.replace(pick.clean, '_____') : w))
    .join(' ');

  return {
    id: entry.id,
    category: entry.category,
    text,
    answer: pick.clean,
    full: entry.full
  };
}

/* =========================================================
   TINGKAT KESULITAN (dihitung otomatis dari bank soal)
   Skor naik kalau jawaban panjang, soal panjang, dan pilihan
   salah mirip dengan jawaban benar. Bank soal dibagi tiga rata.
   ========================================================= */

const LEVEL_RANK = { mudah: 0, sedang: 1, sulit: 2 };

function overlap(a, b) {
  const x = new Set(keyWords(a));
  const y = new Set(keyWords(b));
  if (!x.size || !y.size) return 0;

  let same = 0;
  x.forEach(w => { if (y.has(w)) same += 1; });

  return same / (x.size + y.size - same);
}

function difficultyScore(q) {
  const answer = q.options[q.answer];
  const others = q.options.filter((_, i) => i !== q.answer);
  const similar = others.length ? Math.max(...others.map(o => overlap(answer, o))) : 0;

  return wordCount(answer) + wordCount(q.text) * 0.15 + similar * 6;
}

const LEVEL_OF = (() => {
  const sorted = [...QUESTION_BANK].sort((a, b) => difficultyScore(a) - difficultyScore(b));
  const map = new Map();

  sorted.forEach((q, i) => {
    const r = i / sorted.length;
    map.set(q.id, r < 1 / 3 ? 'mudah' : r < 2 / 3 ? 'sedang' : 'sulit');
  });

  return map;
})();

/* Ambil `count` item; level dipilih diprioritaskan, kalau kurang diisi level terdekat */
function pickByLevel(list, count, level) {
  const mixed = shuffle(list);
  if (!level || level === 'campuran') return mixed.slice(0, count);

  const target = LEVEL_RANK[level];
  const dist = x => Math.abs(LEVEL_RANK[LEVEL_OF.get(x.id)] - target);

  return mixed.sort((a, b) => dist(a) - dist(b)).slice(0, count);
}

function customList(cfg) {
  const pool = QUESTION_BANK.filter(q => cfg.topics.includes(categoryOf(q)));
  return pickByLevel(pool, cfg.count, cfg.level);
}

/* Set buatan AI dari Studio: item sudah berbentuk
   { category, level, text, options?, answer }.
   Dipakai MENGGANTIKAN bank soal bawaan. */
function generatedItems(cfg) {
  return Array.isArray(cfg?.generated?.items) ? cfg.generated.items : [];
}

/* Dipakai halaman Tools: jumlah soal yang tersedia untuk topik terpilih */
export function availableCount(type, categories) {
  const list = QUESTION_BANK.filter(q => categories.includes(categoryOf(q)));
  if (type !== 'tts') return list.length;

  const ids = new Set(list.map(q => q.id));
  return crosswordEntries().filter(en => ids.has(en.id)).length;
}

/* =========================================================
   PEMILIHAN SOAL (ACAK)
   ========================================================= */

/*
  Ingat 5 soal pembuka sesi sebelumnya (tersimpan juga di localStorage)
  supaya soal nomor 1-5 tidak pernah sama di posisi yang sama dua sesi berturut-turut.
*/
const OPENING_SIZE = 5;
const OPENING_STORAGE_KEY = 'dharmalearn:kuis-opening';

function loadOpening() {
  try {
    const raw = JSON.parse(localStorage.getItem(OPENING_STORAGE_KEY));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveOpening(ids) {
  try {
    localStorage.setItem(OPENING_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* abaikan jika storage tidak tersedia */
  }
}

let lastOpening = loadOpening();

/* true jika ada posisi (1-5) yang berisi soal sama dengan sesi sebelumnya */
function sameOpening(list) {
  return list
    .slice(0, OPENING_SIZE)
    .some((q, i) => q.id === lastOpening[i]);
}

function loadPool(key = POOL_STORAGE_KEY) {
  try {
    const raw = JSON.parse(localStorage.getItem(key));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function savePool(pool, key = POOL_STORAGE_KEY) {
  try {
    localStorage.setItem(key, JSON.stringify(pool));
  } catch {
    /* abaikan jika storage tidak tersedia */
  }
}

/* Ambil `size` soal dari kantong "belum keluar" milik `key`.
   Kantong baru diisi ulang kalau habis, jadi soal baru dipakai dulu
   sebelum ada soal yang keluar dua kali. */
function drawFromPool(source, size, key) {
  const ids = source.map(q => q.id);
  const need = Math.min(size, ids.length);

  let pool = shuffle(loadPool(key).filter(id => ids.includes(id)));
  let picked = pool.splice(0, need);

  if (picked.length < need) {
    const refill = shuffle(ids.filter(id => !picked.includes(id)));
    picked = [...picked, ...refill.splice(0, need - picked.length)];
    pool = refill;
  }

  savePool(pool, key);

  return shuffle(picked).map(id => source.find(q => q.id === id));
}

/* Kuis singkat: 10 soal dari kantong soal yang belum keluar */
function drawShort() {
  return drawFromPool(QUESTION_BANK, SHORT_QUIZ_SIZE, POOL_STORAGE_KEY);
}

/* Soal yang jawabannya cukup pendek untuk diketik */
function typableBank() {
  const typable = QUESTION_BANK.filter(
    q => wordCount(q.options[q.answer]) <= TYPING_MAX_WORDS
  );

  return typable.length >= TYPING_QUIZ_SIZE ? typable : QUESTION_BANK;
}

/* Kuis ketik: kantong terpisah. Soal dengan jawaban pendek diprioritaskan. */
function drawTyping() {
  return drawFromPool(typableBank(), TYPING_QUIZ_SIZE, TYPING_POOL_KEY);
}

/* Kuis maraton: 50 soal dari kantong soal yang belum keluar */
function drawAll() {
  return drawFromPool(QUESTION_BANK, FULL_QUIZ_SIZE, FULL_POOL_KEY);
}

/* ---------- True / False ---------- */

function buildTrueFalse(list) {
  /* separuh pernyataan benar, separuh salah */
  const flags = shuffle(list.map((_, i) => i < list.length / 2));

  return list.map((q, k) => {
    const correct = q.options[q.answer];
    const wrongs = q.options.filter((_, i) => i !== q.answer);
    const isTrue = flags[k] || !wrongs.length;
    const shown = isTrue ? correct : wrongs[Math.floor(Math.random() * wrongs.length)];

    return {
      id: q.id,
      category: categoryOf(q),
      text: q.text,
      claim: shown,
      note: isTrue ? '' : `Jawaban sebenarnya: <b>${e(correct)}</b>`,
      options: [
        { text: 'Benar', correct: isTrue },
        { text: 'Salah', correct: !isTrue }
      ]
    };
  });
}

/* ---------- Matching & Memory: pasangan soal-jawaban ---------- */

function makePairs(count, maxQuestion, maxWords) {
  const fit = QUESTION_BANK.filter(
    q => q.text.length <= maxQuestion && wordCount(q.options[q.answer]) <= maxWords
  );

  const source = fit.length >= count ? fit : QUESTION_BANK;
  const seen = new Set();
  const out = [];

  shuffle(source).forEach(q => {
    const key = normalizeText(q.options[q.answer]);

    if (out.length >= count || seen.has(key)) return;
    seen.add(key);

    out.push({
      id: q.id,
      category: categoryOf(q),
      left: q.text,
      right: q.options[q.answer]
    });
  });

  return out;
}

const matchPairs = count => makePairs(count, 140, 10);
const memoryPairs = count => makePairs(count, 95, 6);

/* =========================================================
   TEKA-TEKI SILANG: pembuat layout
   Jawaban dijadikan huruf saja (spasi dibuang), mis.
   "Purusa dan Prakrti" -> PURUSADANPRAKRTI (kalau muat).
   ========================================================= */

function crosswordEntries() {
  return QUESTION_BANK
    .map(q => {
      const answer = q.options[q.answer];
      const letters = simplify(answer).replace(/\s+/g, '').toUpperCase();

      return {
        id: q.id,
        clue: q.text,
        answer,
        letters,
        words: wordCount(answer),
        category: categoryOf(q)
      };
    })
    .filter(
      en =>
        /^[A-Z]+$/.test(en.letters) &&
        en.letters.length >= 3 &&
        en.letters.length <= CROSS_MAX_LETTERS &&
        en.words <= 3
    );
}

function canPlace(grid, word, x, y, dir) {
  const dx = dir === 'across' ? 1 : 0;
  const dy = dir === 'down' ? 1 : 0;

  /* sebelum & sesudah kata harus kosong */
  if (
    grid.has(`${x - dx},${y - dy}`) ||
    grid.has(`${x + dx * word.length},${y + dy * word.length}`)
  ) {
    return false;
  }

  let crosses = 0;

  for (let k = 0; k < word.length; k += 1) {
    const cx = x + dx * k;
    const cy = y + dy * k;
    const cell = grid.get(`${cx},${cy}`);

    if (cell) {
      if (cell.ch !== word[k] || cell.dirs.has(dir)) return false;
      crosses += 1;
    } else if (
      grid.has(`${cx + dy},${cy + dx}`) ||
      grid.has(`${cx - dy},${cy - dx}`)
    ) {
      /* bersebelahan dengan kata lain = tidak boleh */
      return false;
    }
  }

  return crosses > 0;
}

function layoutCrossword(entries, target, keepOrder = false) {
  let best = [];

  for (let attempt = 0; attempt < 80; attempt += 1) {
    /* set AI: percobaan pertama memakai urutan asli, jadi kata-kata awal diprioritaskan */
    const order = keepOrder && attempt === 0 ? [...entries] : shuffle(entries);

    /* kata terpanjang jadi kerangka awal */
    const longest = order.reduce(
      (m, en, i) => (en.letters.length > order[m].letters.length ? i : m),
      0
    );

    [order[0], order[longest]] = [order[longest], order[0]];

    const grid = new Map();
    const placed = [];

    const put = (entry, x, y, dir) => {
      const dx = dir === 'across' ? 1 : 0;
      const dy = dir === 'down' ? 1 : 0;

      for (let k = 0; k < entry.letters.length; k += 1) {
        const key = `${x + dx * k},${y + dy * k}`;
        const cell = grid.get(key) || {
          ch: entry.letters[k],
          dirs: new Set()
        };

        cell.dirs.add(dir);
        grid.set(key, cell);
      }

      placed.push({ entry, x, y, dir });
    };

    put(order[0], 0, 0, 'across');

    for (const en of order.slice(1)) {
      const spots = [];

      for (const p of placed) {
        for (let i = 0; i < en.letters.length; i += 1) {
          for (let j = 0; j < p.entry.letters.length; j += 1) {
            if (en.letters[i] !== p.entry.letters[j]) continue;

            const dir = p.dir === 'across' ? 'down' : 'across';
            const x = dir === 'down' ? p.x + j : p.x - i;
            const y = dir === 'down' ? p.y - i : p.y + j;

            if (canPlace(grid, en.letters, x, y, dir)) {
              spots.push({ x, y, dir });
            }
          }
        }
      }

      if (spots.length) {
        const s = spots[Math.floor(Math.random() * spots.length)];
        put(en, s.x, s.y, s.dir);
      }
    }

    if (placed.length > best.length) best = placed;
    if (best.length >= target) break;
  }

  return best;
}

function buildCrossword(cfg = null) {
  const gen = generatedItems(cfg);
  let all;

  if (gen.length) {
    /* kata dari AI / ujian: ubah jadi bentuk entri yang sama dengan bank bawaan */
    all = gen
      .map((it, k) => {
        const letters = simplify(it.answer).replace(/\s+/g, '').toUpperCase();

        return {
          id: `g${k}`,
          clue: it.text,
          answer: it.answer,
          letters,
          words: wordCount(it.answer),
          category: it.category
        };
      })
      .filter(
        en =>
          /^[A-Z]+$/.test(en.letters) &&
          en.letters.length >= 3 &&
          en.letters.length <= CROSS_MAX_LETTERS
      );
  } else {
    all = crosswordEntries();
    if (cfg) all = all.filter(en => cfg.topics.includes(en.category));
  }

  if (all.length < 4) return null;

  const target = cfg ? cfg.count : CROSS_WORDS;

  const picked = gen.length
    ? all
    : cfg
      ? pickByLevel(all, target + 6, cfg.level)
      : drawFromPool(all, target + 6, CROSS_POOL_KEY);

  const uniq = [];

  picked.forEach(en => {
    if (!uniq.some(u => u.letters === en.letters)) uniq.push(en);
  });

  const placed = layoutCrossword(uniq.slice(0, target + 8), target, gen.length > 0).slice(0, target);
  if (placed.length < 3) return null;

  /* geser koordinat agar mulai dari 0,0 */
  const ends = placed.flatMap(p => [
    [p.x, p.y],
    [
      p.x + (p.dir === 'across' ? p.entry.letters.length - 1 : 0),
      p.y + (p.dir === 'down' ? p.entry.letters.length - 1 : 0)
    ]
  ]);

  const minX = Math.min(...ends.map(a => a[0]));
  const minY = Math.min(...ends.map(a => a[1]));
  const w = Math.max(...ends.map(a => a[0])) - minX + 1;
  const h = Math.max(...ends.map(a => a[1])) - minY + 1;

  const words = placed
    .map(p => ({ ...p.entry, x: p.x - minX, y: p.y - minY, dir: p.dir }))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  /* nomor soal: sel awal yang sama berbagi nomor */
  const starts = new Map();
  const cells = new Map();

  words.forEach((word, wi) => {
    const sk = `${word.x},${word.y}`;
    if (!starts.has(sk)) starts.set(sk, starts.size + 1);
    word.num = starts.get(sk);

    for (let k = 0; k < word.letters.length; k += 1) {
      const x = word.x + (word.dir === 'across' ? k : 0);
      const y = word.y + (word.dir === 'down' ? k : 0);
      const key = `${x},${y}`;
      const cell = cells.get(key) || { letter: word.letters[k] };

      cell[word.dir] = wi;
      if (k === 0) cell.num = word.num;
      cells.set(key, cell);
    }
  });

  return { words, cells, w, h };
}

/* =========================================================
   SESI
   ========================================================= */

function prepareItem(question, keepOptions = false) {
  const options = question.options.map((text, i) => ({
    text,
    correct: i === question.answer
  }));

  return {
    id: question.id,
    category: question.category,
    text: question.text,
    options: SHUFFLE_OPTIONS && !keepOptions ? shuffle(options) : options
  };
}

function typingItem(q) {
  return {
    id: q.id,
    category: q.category,
    text: q.text,
    answer: q.options[q.answer]
  };
}

function buildSession(mode) {
  let list = mode === 'short' ? drawShort() : drawAll();

  /* Kocok ulang sampai soal nomor 1-5 berbeda dari sesi sebelumnya */
  for (let attempt = 0; attempt < 30 && sameOpening(list); attempt += 1) {
    list = shuffle(list);
  }

  lastOpening = list.slice(0, OPENING_SIZE).map(q => q.id);
  saveOpening(lastOpening);

  return {
    mode,
    items: list.map(prepareItem),
    index: 0,
    score: 0,
    results: []
  };
}

function buildTypingSession() {
  return {
    mode: 'ketik',
    items: drawTyping().map(typingItem),
    index: 0,
    score: 0,
    results: []
  };
}

/* =========================================================
   PROGRES PETA (localStorage)
   { regions: { nyaya: { stars: 2, best: 4, tries: 3 }, ... } }
   ========================================================= */

function loadMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(MAP_STORAGE_KEY));
    return raw && typeof raw === 'object' && raw.regions
      ? raw
      : { regions: {} };
  } catch {
    return { regions: {} };
  }
}

function saveMap(map) {
  try {
    localStorage.setItem(MAP_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* abaikan jika storage tidak tersedia */
  }
}

function regionStars(map, index) {
  return map.regions[REGIONS[index]?.id]?.stars || 0;
}

function regionState(map, index) {
  const stars = regionStars(map, index);

  return {
    stars,
    conquered: stars > 0,
    /* Wilayah pertama selalu terbuka; sisanya setelah wilayah sebelumnya ditaklukkan */
    unlocked: index === 0 || regionStars(map, index - 1) > 0
  };
}

function conqueredCount(map) {
  return REGIONS.filter((_, i) => regionStars(map, i) > 0).length;
}

function regionPool(region) {
  return QUESTION_BANK.filter(
    q => normalizeText(categoryOf(q)) === normalizeText(region.category)
  );
}

/* =========================================================
   BLOK HTML YANG DIPAKAI BERSAMA
   ========================================================= */

function playTop(label, index, total) {
  return `
    <header class="kuis-play-top">
      <div class="kuis-play-meta">
        <span class="kuis-play-mode">${e(label)}</span>
        <span class="kuis-play-count">
          <b>${pad(index + 1)}</b> / ${pad(total)}
        </span>
      </div>

      <div class="kuis-bar">
        <span id="kuisBar" style="width:${Math.max(0, (index / total) * 100)}%"></span>
      </div>
    </header>
  `;
}

function reviewHtml(wrongList) {
  if (!wrongList.length) return '';

  return `
    <section class="kuis-review">
      <h3>Soal yang perlu diulang</h3>

      <div class="kuis-review-list">
        ${wrongList
          .map(
            (r, i) => `
              <article class="kuis-review-item">
                <span class="kuis-review-no">${pad(i + 1)}</span>
                <div>
                  ${r.category ? `<span class="kuis-q-cat">${e(r.category)}</span>` : ''}
                  <p class="kuis-review-q">${e(r.question)}</p>
                  <p class="kuis-review-a is-wrong"><b>Jawabanmu:</b> ${e(r.chosen)}</p>
                  <p class="kuis-review-a is-correct"><b>Jawaban benar:</b> ${e(r.correct)}</p>
                </div>
              </article>
            `
          )
          .join('')}
      </div>
    </section>
  `;
}

/* Kartu umpan balik + panel materi. Mengembalikan fungsi buka/tutup materi. */
function mountFeedback(feedback, isCorrect, verdict, category) {
  const materi = getMateri(category);

  feedback.hidden = false;
  feedback.className = `kuis-feedback ${isCorrect ? 'is-correct' : 'is-wrong'}`;

  /* Tidak ada materi yang cocok -> card biasa tanpa panah */
  if (!materi) {
    feedback.innerHTML = `
      <div class="kuis-feedback-toggle is-static">
        <span class="kuis-feedback-text">${verdict}</span>
      </div>
    `;
    return () => {};
  }

  feedback.innerHTML = `
    <button
      class="kuis-feedback-toggle"
      id="kuisMateriToggle"
      type="button"
      aria-expanded="false"
      aria-controls="kuisMateriPanel"
    >
      <span class="kuis-feedback-text">${verdict}</span>
      <span class="kuis-feedback-hint">Lihat materi</span>
      <span class="kuis-feedback-arrow" aria-hidden="true">${ic('arrow', 16)}</span>
    </button>

    <div class="kuis-materi" id="kuisMateriPanel" hidden>
      <span class="kuis-materi-label">MATERI · ${e(materi.title)}</span>
      <div class="kuis-materi-body">${materi.html}</div>
    </div>
  `;

  const toggle = feedback.querySelector('#kuisMateriToggle');
  const panel = feedback.querySelector('#kuisMateriPanel');
  const hint = feedback.querySelector('.kuis-feedback-hint');

  const toggleMateri = () => {
    const open = panel.hidden;

    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    feedback.classList.toggle('is-open', open);
    hint.textContent = open ? 'Tutup materi' : 'Lihat materi';

    if (open) panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  toggle.addEventListener('click', toggleMateri);

  return toggleMateri;
}

/* Kartu menu: dipakai semua mode */
function cardHtml({ mode, icon, label, title, desc, tags, cta, cls = '' }) {
  return `
    <button class="kuis-card ${cls}" data-mode="${mode}" type="button">
      <span class="kuis-card-icon" aria-hidden="true">${ico(icon, 26)}</span>

      <div class="kuis-card-body">
        <span class="kuis-card-label">${label}</span>
        <h2>${title}</h2>
        <p>${desc}</p>
      </div>

      <ul class="kuis-tags">
        ${tags.map(t => `<li>${t}</li>`).join('')}
      </ul>

      <span class="kuis-card-cta">
        <span>${cta}</span>${ic('arrow', 18)}
      </span>
    </button>
  `;
}

function sectionHtml({ num, icon, title, desc, cards, gridCls = '' }) {
  return `
    <section class="kuis-section">
      <header class="kuis-section-head">
        <span class="kuis-section-icon" aria-hidden="true">${ico(icon, 22)}</span>
        <div>
          <h2>${title}</h2>
          <p>${desc}</p>
        </div>
      </header>

      <div class="kuis-modes ${gridCls}">
        ${cards}
      </div>
    </section>
  `;
}

/* =========================================================
   RENDER KUIS
   startAt : 'peta' -> langsung buka peta (dipakai card dashboard)
   custom  : { type, count, topics, level } -> langsung mulai latihan
             kustom dari halaman Tools
   ========================================================= */

export function renderKuis({
  onBack,
  startAt,
  custom,
  name,
  anonymous
} = {}) {
  const app = getApp();
  
  let menuScroll = 0; /* posisi scroll menu, dipulihkan saat kembali ke menu */
  let session = null;
    let revealIO = null;

  /* Tujuan tombol Kembali di kiri atas. Diisi halaman sebelum memanggil shell(),
     lalu dibaca dan dikosongkan lagi oleh shell(). */
  let atMenu = false;
  let pageBack = null;

  /* Status Exam Simulator: { stages, idx, results, startedAt } atau null */
  let exam = null;
  let examTick = null; /* interval timer Exam */

   /* Kalau dibuka dari Tools, tombol Kembali membawa ke Tools */
const fromProfileTest = startAt === 'posttest';
const fromTools = Boolean(custom) || startAt === 'pretest' || fromProfileTest;

  /* Label judul kecil di atas soal (ditambah "Exam 2/5 ·" saat ujian) */
  const lbl = base =>
    exam
              ? `${exam.kind === 'sprint' ? 'Sprint' : 'Ujian'} ${exam.idx + 1}/${exam.stages.length} · ${base}`
      : base;

  /* Saat ujian berjalan, keluar harus dikonfirmasi dulu */
  function confirmLeaveExam() {
    if (!exam) return true;

    const what = exam.kind === 'sprint' ? 'sprint' : 'ujian';

    if (!window.confirm(`Keluar dari ${what}? Progres ${what} ini akan hilang.`)) {
      return false;
    }

    stopExamTimer();
    exam = null;
    return true;
  }

  /* animated = true -> modal memudar dulu (dipakai tombol tutup / Esc) */
  function closeModal(animated = false) {
    document.body.classList.remove('kuis-modal-open');

    document.querySelectorAll('.kuis-modal').forEach(m => {
      if (!animated) {
        m.remove();
        return;
      }

      if (m.classList.contains('is-closing')) return;
      m.classList.add('is-closing');
      setTimeout(() => m.remove(), 240);
    });
  }

  function openProfile() {
    /* Post-Test dibuka dari Profile: cukup kembali ke Profile asal */
    if (fromProfileTest) {
      exit();
      return;
    }
    document.onkeydown = null;
    closeModal();
    document.querySelector('.kuis-notice')?.remove();

    renderProfile({
      name,
      anonymous,
      onBack: fromTools
        ? onBack
        : () => renderKuis({ onBack, startAt, name, anonymous })
    });
  }

  function exit() {
    document.onkeydown = null;
    stopExamTimer();
    closeModal();
    document.querySelector('.kuis-notice')?.remove();
    onBack?.();
  }

  /* Halaman memudar keluar (naik + blur) dulu, baru pindah */
  let leaving = false;

  function leaveThen(fn) {
    if (leaving) return;

    const content = document.querySelector('.kuis-content');
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (!content || reduce) {
      fn();
      return;
    }

    leaving = true;
    content.classList.add('is-leaving');

    setTimeout(() => {
      leaving = false;

      try {
        fn();
      } catch (err) {
        console.error('[Kuis] Gagal membuka halaman:', err);
        content.classList.remove('is-leaving');
        showNotice('Halaman gagal dibuka. Buka Console (F12) untuk lihat penyebabnya.');
      }
    }, 240);
  }

  /* Keluar dari soal: ke menu (atau ke Tools). Saat ujian: minta konfirmasi. */
  const back = () => {
    if (!confirmLeaveExam()) return;
    if (fromTools) exit();
    else showMenu();
  };

    function shell(inner) {
    /* menu -> dashboard (atau Tools); halaman lain -> menu mode; Peta -> peta */
    const target = pageBack || (atMenu || fromTools ? exit : showMenu);

    const backLabel = pageBack
      ? LABEL_MAP
      : atMenu || fromTools
        ? LABEL_BACK
        : LABEL_MENU;

    atMenu = false;
    pageBack = null;

    closeModal();

    app.innerHTML = `
      <main class="page kuis-page">
        <div class="kuis-glow kuis-glow-a"></div>
        <div class="kuis-glow kuis-glow-b"></div>

        <nav class="kuis-nav">
          <button class="kuis-back" id="kuisBack" type="button">
            ${icons.chevronLeft}<span>${backLabel}</span>
          </button>

          <div class="kuis-nav-right">
            <button class="brand" id="kuisBrand" type="button">
              <span class="brand-symbol">ॐ</span>
              <span>DharmaLearn</span>
            </button>

            <button class="kuis-account" id="kuisAccount" type="button" aria-label="Akun" title="Akun">
              ${icons.user}
            </button>
          </div>
        </nav>

        <div class="kuis-scroller" id="kuisScroller">
          <section class="kuis-content">
            ${inner}
          </section>
        </div>
      </main>
    `;

    const guarded = fn => () => {
      if (!confirmLeaveExam()) return;
      leaveThen(fn);
    };

        document.querySelector('#kuisBack').addEventListener('click', guarded(target));
    document.querySelector('#kuisBrand').addEventListener('click', guarded(exit));
    document.querySelector('#kuisAccount').addEventListener('click', guarded(openProfile));

    window.scrollTo(0, 0);
    mountExamTimer();
  }

  /* Halaman hasil sederhana yang dipakai mode-mode baru */
  function showGenericResult({
    eyebrow,
    title,
    percent,
    ringLabel = 'skor',
    stats,
    wrongList = [],
    retry
  }) {
    shell(`
      <section class="kuis-result">

        <header class="kuis-heading">
          <span class="kuis-eyebrow">${e(eyebrow)}</span>
          <h1>${e(title)}</h1>
          <p>${e(praise(percent))}</p>
        </header>

        <div class="kuis-score">
          <div class="kuis-ring" style="--pct:${percent}">
            <div class="kuis-ring-inner">
              <b>${percent}</b>
              <span>${e(ringLabel)}</span>
            </div>
          </div>

          <div class="kuis-stats">
            ${stats
              .map(s => `<div class="kuis-stat"><b>${e(s.v)}</b><span>${e(s.l)}</span></div>`)
              .join('')}
          </div>
        </div>

        ${reviewHtml(wrongList)}

        <div class="kuis-result-actions">
         ${retry ? '<button class="kuis-primary" id="kuisRetry" type="button">Main lagi</button>' : ''}
        </div>

      </section>
    `);


    document.querySelector('#kuisRetry')?.addEventListener('click', retry);

    document.onkeydown = event => {
      if (event.key === 'Escape') back();
    };
  }

  /* ---------------------------------------------------------
     MENU PILIH MODE
     --------------------------------------------------------- */

  /* Banner Post-Test: elemen tersendiri (bukan .kuis-card) di bawah semua section */
  function mountPosttest() {
    const content = document.querySelector('.kuis-content');
    if (!content) return;

    const pre = getPretest();
    const post = getPosttest();

    let status = 'Belum dikerjakan';
    if (post) status = `Terakhir ${post.percent}%${pre ? ` · Pre-Test ${pre.percent}%` : ''}`;
    else if (pre) status = `Pre-Test kamu ${pre.percent}%`;

    content.insertAdjacentHTML('beforeend', `
      <section class="kuis-posttest-wrap">
        <button class="kuis-posttest" id="kuisPosttest" type="button">
          <span class="kuis-posttest-seal" aria-hidden="true">${ico('trend', 28)}</span>

          <span class="kuis-posttest-text">
            <em>UKUR PROGRESMU</em>
            <b class="kuis-posttest-title">POST-TEST</b>
            <span class="kuis-posttest-sub">Lihat seberapa jauh kamu berkembang sejak Pre-Test.</span>
            <small>Soal sama dengan Pre-Test, tanpa pembahasan. ${e(status)}</small>
          </span>

          <span class="kuis-posttest-go"><span>Mulai Post-Test</span>${ic('arrow', 16)}</span>
        </button>
      </section>
    `);

    document.querySelector('#kuisPosttest').addEventListener('click', () => {
      menuScroll = getScroll();
      leaveThen(() => startSession('posttest'));
    });
  }

  function showMenu() {
    session = null;
    stopExamTimer();
    exam = null;

    const total = QUESTION_BANK.length;
    const shortCount = Math.min(SHORT_QUIZ_SIZE, total) || SHORT_QUIZ_SIZE;
    const typingCount = Math.min(TYPING_QUIZ_SIZE, total) || TYPING_QUIZ_SIZE;
    const flashCount = Math.min(FLASH_SIZE, total) || FLASH_SIZE;
    const conquered = conqueredCount(loadMap());

        const fullCount = Math.min(FULL_QUIZ_SIZE, total) || FULL_QUIZ_SIZE;
    const tfCount = Math.min(TF_SIZE, total) || TF_SIZE;

        const latihan = [
      cardHtml({
        mode: 'short', icon: 'zap', label: 'LATIHAN CEPAT', title: 'Kuis Kilat',
        desc: `${shortCount} soal acak dari seluruh bank soal. Cocok untuk latihan harian yang singkat, ringan, dan tidak melelahkan.`,
        tags: [`${shortCount} soal`, 'Pilihan ganda', 'Latihan harian'], cta: 'Mulai kuis'
      }),
      cardHtml({
        mode: 'all', icon: 'trophy', label: 'LATIHAN MARATON', title: 'Kuis Maraton',
        desc: `${fullCount} soal acak dari seluruh bank soal, tanpa pengulangan sampai semua soal terpakai. Cocok untuk uji pemahaman menyeluruh.`,
        tags: [`${fullCount} soal`, 'Menyeluruh', 'Tanpa pengulangan'], cta: 'Mulai kuis'
      }),
      cardHtml({
        mode: 'ketik', icon: 'keyboard', label: 'LATIHAN MENDALAM', title: 'Kuis Ketik',
        desc: 'Tanpa pilihan A sampai D. Ketik jawabanmu sendiri, dan salah ketik kecil tetap dinilai benar oleh sistem.',
        tags: [`${typingCount} soal`, 'Ketik jawaban', 'Toleran typo'], cta: 'Mulai kuis'
      }),
      cardHtml({
        mode: 'tf', icon: 'toggle', label: 'BENAR ATAU SALAH', title: 'Benar / Salah',
        desc: 'Satu jawaban diajukan untuk tiap pertanyaan. Tugasmu menilai apakah jawaban itu benar atau salah, tanpa perlu mengetik.',
        tags: [`${tfCount} soal`, '2 pilihan', 'Cepat'], cta: 'Mulai kuis'
      }),
      cardHtml({
        mode: 'blank', icon: 'blank', label: 'KATA YANG HILANG', title: 'Lengkapi Kalimat',
        desc: 'Kalimat dari materi dengan satu kata yang dikosongkan. Ketik kata yang hilang langsung di dalam kalimatnya sendiri.',
        tags: [`${BLANK_SIZE} kalimat`, 'Dari materi', 'Ketik langsung'], cta: 'Mulai kuis'
      }),
      cardHtml({
        mode: 'flash', icon: 'cards', label: 'HAFALAN', title: 'Flashcards',
        desc: 'Balik kartu untuk melihat jawaban, lalu nilai sendiri apakah kamu sudah hafal. Kartu berganti di setiap sesi.',
        tags: [`${flashCount} kartu`, 'Balik dan nilai', 'Hafalan'], cta: 'Mulai kartu'
      })
    ].join('');

    const game = [
      cardHtml({
        mode: 'peta', icon: 'map', label: 'PERMAINAN PETA', title: 'Peta Sad Darsana',
        desc: `Daki peta dari dasar sampai Moksa. Taklukkan ${REGIONS.length} bagian materi satu per satu untuk membuka wilayah berikutnya.`,
        tags: [`${REGIONS.length} wilayah`, `${conquered}/${REGIONS.length} ditaklukkan`, 'Raih bintang'], cta: 'Mulai peta'
      }),
      cardHtml({
        mode: 'match', icon: 'link', label: 'PERMAINAN JODOHKAN', title: 'Jodohkan',
        desc: 'Pasangkan pertanyaan di kiri dengan jawabannya di kanan. Tiap pasangan yang benar langsung tersambung oleh panah berwarna.',
        tags: [`${MATCH_ROUNDS} ronde`, `${MATCH_ROUND_SIZE} pasangan`, 'Ada panah'], cta: 'Mulai menjodohkan'
      }),
      cardHtml({
        mode: 'memory', icon: 'memory', label: 'ASAH INGATAN', title: 'Cocokkan Kartu',
        desc: 'Ketuk satu kartu soal dan satu jawaban. Isinya tampil di panel atas; makin sedikit langkah, makin tinggi skor.',
        tags: [`${MEMORY_PAIRS} pasangan`, 'Dengan waktu', 'Hitung langkah'], cta: 'Mulai main'
      }),
      cardHtml({
        mode: 'tts', icon: 'grid', label: 'OTAK-ATIK', title: 'Teka-Teki Silang',
        desc: 'Isi kotak mendatar dan menurun berdasarkan petunjuk soal. Susunan kotaknya dibuat acak dan baru setiap kali kamu main.',
        tags: [`~${CROSS_WORDS} kata`, 'Susunan acak', 'Mendatar & menurun'], cta: 'Mulai TTS'
      })
    ].join('');

    const sprintCard = cardHtml({
      mode: 'sprint', icon: 'flag', label: 'LATIHAN GABUNGAN', title: 'Sprint Belajar',
      desc: 'Gabungkan minimal 2 jenis latihan dan atur sendiri jumlah soal tiap bagiannya. Tanpa batas waktu, jadi kamu bebas belajar dengan tempomu.',
      tags: ['Min. 2 jenis', 'Atur jumlah soal', 'Tanpa batas waktu'],
      cta: 'Susun sprint',
      cls: 'kuis-card-exam'
    });

    const examCard = cardHtml({
      mode: 'exam', icon: 'clipboard', label: 'SIMULASI UJIAN', title: 'Simulasi Ujian',
      desc: 'Sama seperti Sprint Belajar, tapi ada batas waktu. Pilih kesulitan: makin sulit, makin ketat waktunya. Skor digabung jadi satu nilai.',
      tags: [`${EXAM_TYPES.length} jenis bagian`, 'Batas waktu', 'Nilai total'],
      cta: 'Susun ujian',
      cls: 'kuis-card-exam'
    });

        atMenu = true;

    shell(`
      <header class="kuis-heading">
        <span class="kuis-eyebrow">UJI PEMAHAMAN</span>
        <h1>Pilih mode latihan</h1>
        <p>
          Dari kuis kilat sampai simulasi ujian, pilih cara belajar
          yang paling cocok untukmu hari ini.
        </p>
      </header>

      ${sectionHtml({
        icon: 'edit', title: 'Latihan',
        desc: 'Asah pemahaman lewat berbagai bentuk soal.',
        cards: latihan
      })}

      ${sectionHtml({
        icon: 'gamepad', title: 'Permainan',
        desc: 'Belajar sambil bermain, tanpa terasa seperti ujian.',
        cards: game
      })}

      ${sectionHtml({
        icon: 'clipboard', title: 'Sprint & Ujian',
        desc: 'Gabungkan beberapa bentuk latihan: santai tanpa timer, atau serius dengan batas waktu.',
        cards: sprintCard + examCard, gridCls: 'kuis-modes-1'
      })}
    `);
    mountPosttest();

    document.querySelectorAll('.kuis-card').forEach(card => {
      card.addEventListener('click', () => {
        menuScroll = getScroll();
        leaveThen(() => startSession(card.dataset.mode));
      });
    });

    /* pulihkan scroll SETELAH banner Post-Test ada (tinggi halaman sudah final) */
    setScroll(menuScroll);

    /* Kartu muncul/hilang mengikuti scroll (naik-turun + blur),
       berulang setiap kartu masuk atau keluar layar. */
    revealIO?.disconnect();
    revealIO = null;

    const grids = document.querySelectorAll('.kuis-modes');

    if (grids.length && 'IntersectionObserver' in window) {
      grids.forEach(g => { g.dataset.reveal = ''; });

      revealIO = new IntersectionObserver(
        entries => {
          let n = 0;

          entries.forEach(entry => {
            const el = entry.target;
            const seen = entry.isIntersecting && entry.intersectionRatio >= 0.12;

            if (seen) {
              /* kartu yang muncul bersamaan masuk bergantian */
              el.style.setProperty('--rd', `${n * 70}ms`);
              el.dataset.pos = 'in';
              n += 1;
            } else {
              el.style.setProperty('--rd', '0ms');
              el.dataset.pos = entry.boundingClientRect.top < 0 ? 'above' : 'below';
            }
          });
        },
        { threshold: [0, 0.12] }
      );

      document.querySelectorAll('.kuis-card').forEach(card => revealIO.observe(card));
    }

    document.onkeydown = event => {
      if (event.key === 'Escape') exit();
    };
  }

  function startSession(mode) {
    if (mode === 'pretest' || mode === 'posttest') {
      session = buildTestSession(mode);
      if (!session) return;

      showQuestion();
      return;
    }

    if (mode === 'exam' || mode === 'sprint') {
      showExamSetup(mode);
      return;
    }

    if (!QUESTION_BANK.length) {
      showNotice('Soal belum terbaca. Periksa file Kuis.txt.');
      return;
    }

    switch (mode) {
      case 'peta':
        showMap();
        return;

      case 'ketik':
        session = buildTypingSession();
        showTypingQuestion();
        return;

      case 'tf':
        session = {
          mode: 'tf',
          items: buildTrueFalse(drawFromPool(QUESTION_BANK, TF_SIZE, TF_POOL_KEY)),
          index: 0,
          score: 0,
          results: []
        };
        showQuestion();
        return;

      case 'blank':
        if (BLANK_BANK.length < 4) {
          showNotice('Kalimat dari Materi.txt belum cukup untuk soal isian.');
          return;
        }

        session = {
          mode: 'blank',
          items: drawFromPool(BLANK_BANK, BLANK_SIZE, BLANK_POOL_KEY).map(blankItem),
          index: 0,
          score: 0,
          results: []
        };
        showTypingQuestion();
        return;

      case 'match':
        showMatching();
        return;

      case 'order':
        showOrder();
        return;

      case 'flash':
        showFlashcards();
        return;

      case 'memory':
        showMemory();
        return;

      case 'tts':
        showCrossword();
        return;

      default:
        session = buildSession(mode);
        showQuestion();
    }
  }

  /* Latihan kustom dari halaman Tools */
  function startCustom(cfg) {
    const gen = generatedItems(cfg);

    /* ---- set buatan AI: mainkan SEMUA item-nya ---- */
    if (gen.length) {
      if (cfg.type === 'flash') {
        showFlashcards(cfg);
        return;
      }

      if (cfg.type === 'tts') {
        showCrossword(cfg);
        return;
      }

      if (cfg.type === 'ketik') {
        session = {
          mode: 'ketik',
          custom: cfg,
          items: gen.map((it, i) => ({
            id: `g${i}`,
            category: it.category,
            text: it.text,
            answer: it.answer
          })),
          index: 0,
          score: 0,
          results: []
        };
        showTypingQuestion();
        return;
      }

/* Benar / Salah: pakai tampilan soal yang sudah ada */
      if (cfg.type === 'bs') {
        session = {
          mode: 'tf',
          custom: cfg,
          items: gen.map((it, i) => ({
            id: `g${i}`,
            category: it.category,
            text: it.text,
            note: it.explain ? e(it.explain) : '',
            options: [
              { text: 'Benar', correct: it.answer === true },
              { text: 'Salah', correct: it.answer === false }
            ]
          })),
          index: 0,
          score: 0,
          results: []
        };
        showQuestion();
        return;
      }

      /* Lengkapi Kalimat: pakai tampilan isian inline */
      if (cfg.type === 'lengkapi') {
        session = {
          mode: 'blank',
          custom: cfg,
          items: gen.map((it, i) => ({
            id: `g${i}`,
            category: it.category,
            text: it.text.replace(/_{3,}/, '_____'),
            answer: it.answer,
            full: it.text.replace(/_{3,}/, it.answer)
          })),
          index: 0,
          score: 0,
          results: []
        };
        showTypingQuestion();
        return;
      }

      /* Jodohkan & Cocokkan Kartu */
      if (cfg.type === 'jodoh' || cfg.type === 'cocok') {
        const list = gen.map((it, i) => ({
          id: `g${i}`,
          category: it.category,
          left: it.text,
          right: it.answer
        }));

        if (cfg.type === 'jodoh') showMatching({ list, cfg });
        else showMemory({ list, cfg });
        return;
      }

      /* pilihan ganda */
      session = {
        mode: 'custom',
        custom: cfg,
        items: gen.map((it, i) =>
          prepareItem(
            {
              id: `g${i}`,
              category: it.category,
              text: it.text,
              options: it.options,
              answer: it.answer
            },
            true
          )
        ),
        index: 0,
        score: 0,
        results: []
      };
      showQuestion();
      return;
    }

    /* ---- latihan kustom dari bank soal bawaan ---- */
    const pool = QUESTION_BANK.filter(q => cfg.topics.includes(categoryOf(q)));

    if (!pool.length) {
      showNotice('Tidak ada soal untuk topik yang dipilih.');
      return;
    }

    if (cfg.type === 'flash') {
      showFlashcards(cfg);
      return;
    }

    if (cfg.type === 'tts') {
      showCrossword(cfg);
      return;
    }

    const list = pickByLevel(pool, cfg.count, cfg.level);

    if (cfg.type === 'ketik') {
      session = {
        mode: 'ketik',
        custom: cfg,
        items: list.map(q => typingItem({ ...q, category: categoryOf(q) })),
        index: 0,
        score: 0,
        results: []
      };
      showTypingQuestion();
      return;
    }

    session = {
      mode: 'custom',
      custom: cfg,
      items: list.map(prepareItem),
      index: 0,
      score: 0,
      results: []
    };
    showQuestion();
  }

  /* ---------------------------------------------------------
     PETA SAD DARSANA
     --------------------------------------------------------- */

    function showMap() {
    session = null;

    recordPetaOpened();

    const map = loadMap();
    const states = REGIONS.map((_, i) => regionState(map, i));
    const conquered = states.filter(s => s.conquered).length;
    const totalStars = states.reduce((sum, s) => sum + s.stars, 0);
    const finished = conquered === REGIONS.length;

    /* Koordinat jalur pada kanvas 400 x H, nanti diskalakan lewat persen.
       Wilayah pertama ada di PALING BAWAH, Moksa di PALING ATAS. */
    const W = 400;
    const STEP = 108;
    const TOP = 78;
    const BOTTOM = 84;
    const count = REGIONS.length;

    const points = REGIONS.map((_, i) => ({
      x: i % 2 === 0 ? 112 : 288,
      y: TOP + (count - i) * STEP
    }));

    /* Titik akhir: Moksa (puncak) */
    points.push({ x: 200, y: TOP });

    const H = TOP + count * STEP + BOTTOM;

    const segments = points
      .slice(0, -1)
      .map((a, i) => {
        const b = points[i + 1];
        const dy = b.y - a.y;
        const d = `M${a.x} ${a.y} C${a.x} ${a.y + dy * 0.6} ${b.x} ${b.y - dy * 0.6} ${b.x} ${b.y}`;

        return `<path class="kuis-peta-seg ${states[i].conquered ? 'is-done' : ''}" d="${d}" />`;
      })
      .join('');

    const nodes = REGIONS.map((region, i) => {
      const s = states[i];
      const p = points[i];
      const state = s.conquered ? 'done' : s.unlocked ? 'current' : 'locked';

      const label = s.unlocked
        ? `${region.name}, ${s.conquered ? `${s.stars} dari 3 bintang` : 'belum ditaklukkan'}`
        : `${region.name}, terkunci`;

      return `
        <button
          class="kuis-peta-node is-${state}"
          data-region="${i}"
          type="button"
          style="--i:${i}; left:${(p.x / W) * 100}%; top:${(p.y / H) * 100}%"
          aria-label="${e(label)}"
        >
          <span class="kuis-peta-orb">${ic(s.unlocked ? region.glyph : 'lock', '1em')}</span>
          <span class="kuis-peta-name">${e(region.name)}</span>
          <span class="kuis-peta-stars">${s.unlocked ? starsHtml(s.stars) : ''}</span>
        </button>
      `;
    }).join('');

    const goalPoint = points[points.length - 1];

    const goal = `
      <div
        class="kuis-peta-goal ${finished ? 'is-reached' : ''}"
        style="--i:${REGIONS.length}; left:${(goalPoint.x / W) * 100}%; top:${(goalPoint.y / H) * 100}%"
      >
        <span class="kuis-peta-orb" aria-hidden="true">${ic('sparkles', '1em')}</span>
        <span class="kuis-peta-name">Moksa</span>
      </div>
    `;

    const need = Math.ceil(MAP_QUESTIONS_PER_REGION * MAP_PASS_RATIO);

    shell(`
      <section class="kuis-peta">

        <header class="kuis-heading">
                    <span class="kuis-eyebrow">PERMAINAN PETA</span>
          <h1>Peta Sad Darsana</h1>
          <p>
            Mulai dari bagian paling bawah dan naik menuju Moksa. Jawab
            minimal ${need} dari ${MAP_QUESTIONS_PER_REGION} soal benar untuk
            membuka wilayah berikutnya.
          </p>
        </header>

        <div class="kuis-peta-summary">
          <span class="kuis-chip"><b>${conquered}</b> / ${REGIONS.length} wilayah</span>
          <span class="kuis-chip"><b>${totalStars}</b> / ${REGIONS.length * 3} bintang</span>
        </div>

        <div class="kuis-peta-board" style="aspect-ratio:${W} / ${H}">
          <svg
            class="kuis-peta-lines"
            viewBox="0 0 ${W} ${H}"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            ${segments}
          </svg>

          ${nodes}
          ${goal}
        </div>

        ${
          finished
            ? `
              <p class="kuis-peta-finish">
                Seluruh materi sudah kamu taklukkan dan Moksa tercapai.
                Ulangi wilayah mana pun untuk mengejar tiga bintang.
              </p>
            `
            : ''
        }

        

      </section>
    `);


    /* Peta dimulai dari bawah: arahkan layar ke wilayah yang sedang dituju */
    requestAnimationFrame(() => {
      const target =
        document.querySelector('.kuis-peta-node.is-current') ||
        document.querySelector('.kuis-peta-goal');

      if (!target) return;

      /* JANGAN pakai scrollIntoView: ia ikut menggeser <main> (overflow hidden)
         sehingga toolbar terdorong keluar layar. Gulung hanya .kuis-scroller. */
      const sc = document.querySelector('.kuis-scroller');
      if (!sc) return;

      const box = target.getBoundingClientRect();
      const view = sc.getBoundingClientRect();
      const top = box.top - view.top + sc.scrollTop - (sc.clientHeight - box.height) / 2;

      sc.scrollTop = Math.max(0, top);
    });

    document.querySelectorAll('.kuis-peta-node').forEach(node => {
      node.addEventListener('click', () => {
        const i = Number(node.dataset.region);

        if (!states[i].unlocked) {
          showNotice(`Taklukkan ${REGIONS[i - 1].name} dulu untuk membuka wilayah ini.`);
          return;
        }

        openRegionModal(i, map);
      });
    });

    document.onkeydown = event => {
      if (event.key !== 'Escape') return;

      if (document.querySelector('.kuis-modal:not(.is-closing)')) closeModal(true);
      else showMenu();
    };
  }

  function openRegionModal(index, map) {
    closeModal();

    const region = REGIONS[index];
    const record = map.regions[region.id] || { stars: 0, best: 0, tries: 0 };
    const count = Math.min(MAP_QUESTIONS_PER_REGION, regionPool(region).length);
    const need = Math.max(1, Math.ceil(count * MAP_PASS_RATIO));
    const materi = getMateri(region.category);

    const modal = document.createElement('div');
    modal.className = 'kuis-modal';

    modal.innerHTML = `
      <div class="kuis-modal-backdrop" data-close></div>

      <div class="kuis-modal-panel" role="dialog" aria-modal="true" aria-label="Wilayah ${e(region.name)}">

        <div class="kuis-modal-scroll">
          <button class="kuis-modal-close" data-close type="button" aria-label="Tutup">${ic('close', 18)}</button>
          <span class="kuis-m-label">WILAYAH ${index + 1} DARI ${REGIONS.length}</span>
          <h2>${e(region.name)}</h2>
          <p class="kuis-modal-sub">${e(region.focus)}</p>

          <div class="kuis-modal-body">
            <div class="kuis-m-block">
              <p>
                <b>${count} soal</b> dari bagian ${e(region.name)}.
                Jawab minimal <b>${need}</b> dengan benar untuk menaklukkan wilayah ini.
              </p>
            </div>

            <div class="kuis-m-block kuis-m-record">
              <span class="kuis-m-label">REKOR</span>
              <div class="kuis-stars">${starsHtml(record.stars)}</div>
              <p>
                ${
                  record.tries
                    ? `Terbaik ${record.best} dari ${count} benar · ${record.tries} percobaan`
                    : 'Belum pernah dicoba.'
                }
              </p>
            </div>

            <button class="kuis-primary" id="kuisRegionGo" type="button" ${count ? '' : 'disabled'}>
              ${record.stars ? 'Ulangi tantangan' : 'Mulai tantangan'}
            </button>

            ${
              materi
                ? `
                  <div class="kuis-m-block kuis-m-materi">
                    <span class="kuis-m-label">RINGKASAN MATERI · BACA DULU SEBELUM MULAI</span>
                    <div class="kuis-materi-body">${materi.html}</div>
                  </div>
                `
                : ''
            }
          </div>
        </div>
      </div>
    `;

    document.querySelector('.kuis-page').appendChild(modal);
    document.body.classList.add('kuis-modal-open');

    modal.querySelectorAll('[data-close]').forEach(el => {
      el.addEventListener('click', () => closeModal(true));
    });

    modal.querySelector('#kuisRegionGo').addEventListener('click', () => {
      startRegion(index);
    });

    modal.querySelector('#kuisRegionGo').focus({ preventScroll: true });
  }

  function startRegion(index) {
    const region = REGIONS[index];
    const pool = regionPool(region);

    if (!pool.length) {
      showNotice(`Soal untuk ${region.name} belum tersedia.`);
      return;
    }

    session = {
      mode: 'peta',
      regionIndex: index,
      items: shuffle(pool)
        .slice(0, MAP_QUESTIONS_PER_REGION)
        .map(prepareItem),
      index: 0,
      score: 0,
      results: []
    };

    showQuestion();
  }

  /* ---------------------------------------------------------
     HALAMAN SOAL (pilihan ganda: Quick, Full, T/F, Peta, Kustom, Exam)
     --------------------------------------------------------- */

  function showQuestion() {
    const total = session.items.length;
    const item = session.items[session.index];
    const isLast = session.index === total - 1;
    const isMap = session.mode === 'peta';
    const isTest = session.mode === 'pretest' || session.mode === 'posttest';

    const modeLabel = lbl(
      isMap
        ? `Peta · ${REGIONS[session.regionIndex].name}`
        : session.label || MODE_LABELS[session.mode]
    );

        const leave = isMap ? showMap : back;

    /* tombol Kembali di kiri atas: dari soal Peta kembali ke peta */
    if (isMap) pageBack = showMap;

    let locked = false;
    let toggleMateri = () => {};

    shell(`
      <section class="kuis-play">

        ${playTop(modeLabel, session.index, total)}

        <article class="kuis-question">
          ${item.category ? `<span class="kuis-q-cat">${e(item.category)}</span>` : ''}

          <h2>${e(item.text)}</h2>

          ${
            item.claim
              ? `
                <p class="kuis-claim">
                  <span>Jawaban yang diajukan</span>
                  ${e(item.claim)}
                </p>
              `
              : ''
          }

          <div class="kuis-options">
            ${item.options
              .map(
                (option, i) => `
                  <button class="kuis-option" data-i="${i}" type="button">
                    <span class="kuis-option-key">${LETTERS[i]}</span>
                    <span class="kuis-option-text">${e(option.text)}</span>
                  </button>
                `
              )
              .join('')}
          </div>

          <div class="kuis-feedback" id="kuisFeedback" hidden></div>
        </article>

                <footer class="kuis-play-actions">
          <button class="kuis-primary" id="kuisNext" type="button" disabled>
            ${isLast ? 'Lihat hasil' : nextHtml}
          </button>
        </footer>

      </section>
    `);

    const buttons = [...document.querySelectorAll('.kuis-option')];
    const feedback = document.querySelector('#kuisFeedback');
    const nextButton = document.querySelector('#kuisNext');
    const bar = document.querySelector('#kuisBar');

    const correctIndex = item.options.findIndex(o => o.correct);

    function choose(i) {
      if (locked || !item.options[i]) return;
      locked = true;

      const chosen = item.options[i];
      const correct = item.options[correctIndex];

      if (chosen.correct) session.score += 1;

      session.results.push({
        category: item.category,
        question: item.text,
        chosen: chosen.text,
        correct: correct.text,
        isCorrect: chosen.correct
      });

      buttons.forEach((button, bi) => {
        button.disabled = true;

        if (isTest) button.classList.add(bi === i ? 'is-picked' : 'is-dim');
        else if (bi === correctIndex) button.classList.add('is-correct');
        else if (bi === i) button.classList.add('is-wrong');
        else button.classList.add('is-dim');
      });

      let verdict = chosen.correct
        ? mark('ok', 'Jawaban benar.')
        : `${mark('bad', 'Kurang tepat.')} Jawaban yang benar: <b>${LETTERS[correctIndex]}.</b> ${e(correct.text)}`;

      /* True/False: tampilkan jawaban sebenarnya kalau pernyataan salah */
      if (item.note) verdict += `<br>${item.note}`;

      if (!isTest) toggleMateri = mountFeedback(feedback, chosen.correct, verdict, item.category);

      bar.style.width = `${((session.index + 1) / total) * 100}%`;

      nextButton.disabled = false;
      nextButton.focus({ preventScroll: true });
    }

    function next() {
      if (!locked) return;
      session.index += 1;

      if (session.index >= total) showResult();
      else showQuestion();
    }

    buttons.forEach((button, i) => {
      button.addEventListener('click', () => choose(i));
    });

    nextButton.addEventListener('click', next);


    document.onkeydown = event => {
      const key = event.key.toLowerCase();

      if (key === 'escape') {
        leave();
        return;
      }

      /* M = buka / tutup materi (setelah menjawab) */
      if (key === 'm' && locked) {
        toggleMateri();
        return;
      }

      const byLetter = LETTERS.map(l => l.toLowerCase()).indexOf(key);
      const byNumber = ['1', '2', '3', '4'].indexOf(key);
      const picked = byLetter > -1 ? byLetter : byNumber;

      if (picked > -1) {
        choose(picked);
        return;
      }

      if (locked && (key === 'enter' || key === 'arrowright' || key === ' ')) {
        event.preventDefault();
        next();
      }
    };
  }

  /* ---------------------------------------------------------
     HALAMAN SOAL KETIK (Kuis Ketik & Fill in the Blank)
     --------------------------------------------------------- */

  function showTypingQuestion() {
    const total = session.items.length;
    const item = session.items[session.index];
    const isLast = session.index === total - 1;
    const isBlank = session.mode === 'blank';

    /* Tingkat Sulit (dari Tools) mematikan petunjuk */
    const noHint = session.custom?.level === 'sulit';

    /* Fill in the Blank: input diselipkan tepat di posisi kata yang hilang */
    const [blankBefore, blankAfter = ''] = String(item.text).split('_____');

    const heading = isBlank
      ? `${e(blankBefore)}<span class="kuis-inline-wrap"><input class="kuis-inline-input" id="kuisTypeInput" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="kata yang hilang" /></span>${e(blankAfter)}`
      : e(item.text);

    let locked = false;
    let toggleMateri = () => {};

    shell(`
      <section class="kuis-play">

        ${playTop(lbl(session.label || MODE_LABELS[session.mode] || MODE_LABELS.ketik), session.index, total)}

        <article class="kuis-question">
          ${item.category ? `<span class="kuis-q-cat">${e(item.category)}</span>` : ''}

          <h2>${heading}</h2>

          <div class="kuis-type">
            ${
              isBlank
                ? '<span class="kuis-type-label">Ketik kata yang hilang langsung di dalam kalimat</span>'
                : '<label class="kuis-type-label" for="kuisTypeInput">Ketik jawabanmu</label>'
            }

            <div class="kuis-type-row">
              ${
                isBlank
                  ? ''
                  : `
                    <div class="kuis-type-field">
                      <input
                        class="kuis-type-input"
                        id="kuisTypeInput"
                        type="text"
                        autocomplete="off"
                        autocapitalize="off"
                        autocorrect="off"
                        spellcheck="false"
                        placeholder="Tulis jawaban di sini..."
                      />
                    </div>
                  `
              }

              <button class="kuis-primary kuis-type-submit" id="kuisCheck" type="button">
                Periksa
              </button>
            </div>

            <div class="kuis-type-tools">
              <button class="kuis-linkbtn" id="kuisHint" type="button" ${noHint ? 'hidden' : ''}>Petunjuk</button>
              <button class="kuis-linkbtn" id="kuisSkip" type="button">Aku tidak tahu</button>
            </div>

            <p class="kuis-type-hint" id="kuisHintText" hidden></p>
          </div>

          <div class="kuis-feedback" id="kuisFeedback" hidden></div>
        </article>

                <footer class="kuis-play-actions">
          <button class="kuis-primary" id="kuisNext" type="button" disabled>
            ${isLast ? 'Lihat hasil' : nextHtml}
          </button>
        </footer>

      </section>
    `);

    const input = document.querySelector('#kuisTypeInput');

    /* Fade di tepi kiri/kanan hanya muncul kalau teks tidak muat satu baris.
       Saat mengetik di ujung, sisi kanan dibiarkan jelas supaya kursor tetap terlihat. */
    const field = input.closest('.kuis-type-field');

    /* Input inline (Fill in the Blank) melebar mengikuti isi, tanpa fade */
    const fit = () => {
      if (isBlank) input.style.width = `${Math.max(8, input.value.length + 3)}ch`;
    };

    function syncFade() {
      fit();
      if (!field) return;

      const max = input.scrollWidth - input.clientWidth;

      field.classList.toggle('is-fade-left', input.scrollLeft > 2);
      field.classList.toggle('is-fade-right', max > 2 && input.scrollLeft < max - 2);
    }

    ['input', 'keyup', 'click', 'focus', 'blur', 'select', 'scroll'].forEach(type => {
      input.addEventListener(type, () => requestAnimationFrame(syncFade));
    });

    const checkButton = document.querySelector('#kuisCheck');
    const hintButton = document.querySelector('#kuisHint');
    const skipButton = document.querySelector('#kuisSkip');
    const hintText = document.querySelector('#kuisHintText');
    const feedback = document.querySelector('#kuisFeedback');
    const nextButton = document.querySelector('#kuisNext');
    const bar = document.querySelector('#kuisBar');

    function submit(skipped = false) {
      if (locked) return;

      const value = input.value.trim();

      if (!skipped && !value) {
        input.classList.remove('is-shake');
        void input.offsetWidth;
        input.classList.add('is-shake');
        input.focus();
        return;
      }

      locked = true;

      const ok = !skipped && isTypedCorrect(value, item.answer);

      if (ok) session.score += 1;

            session.results.push({
        category: item.category,
        question: isBlank ? item.full : item.text,
        chosen: skipped ? '(dilewati)' : value,
        correct: item.answer,
        isCorrect: ok,
        exact: ok && simplify(value) === simplify(item.answer)
      });

      input.disabled = true;
      input.scrollLeft = 0;
      requestAnimationFrame(syncFade);
      input.classList.add(ok ? 'is-correct' : 'is-wrong');
      checkButton.disabled = true;
      hintButton.disabled = true;
      skipButton.disabled = true;

      let verdict;

      if (ok) {
        verdict =
          simplify(value) === simplify(item.answer)
            ? mark('ok', 'Jawaban benar.')
            : `${mark('ok', 'Jawaban benar.')} Penulisan bakunya: <b>${e(item.answer)}</b>`;
      } else {
        verdict = `${skipped ? '<b>Dilewati.</b>' : mark('bad', 'Kurang tepat.')} Jawaban yang benar: <b>${e(item.answer)}</b>`;
      }

      if (isBlank) {
        verdict += `<br><span class="kuis-fullsent">${e(item.full)}</span>`;
      }

      toggleMateri = mountFeedback(feedback, ok, verdict, item.category);

      bar.style.width = `${((session.index + 1) / total) * 100}%`;

      nextButton.disabled = false;
      nextButton.focus({ preventScroll: true });
    }

    function next() {
      if (!locked) return;
      session.index += 1;

      if (session.index >= total) showResult();
      else showTypingQuestion();
    }

    input.addEventListener('keydown', event => {
      /* Cegah handler dokumen ikut jalan saat mengetik */
      event.stopPropagation();

      if (event.key === 'Enter') {
        event.preventDefault();
        submit(false);
      }

      if (event.key === 'Escape') back();
    });

    checkButton.addEventListener('click', () => submit(false));
    skipButton.addEventListener('click', () => submit(true));

        hintButton.addEventListener('click', () => {
      session.hints = (session.hints || 0) + 1;
      hintText.hidden = false;
      hintText.textContent = isBlank
        ? `Petunjuk: ${hintFor(item.answer)}  (${item.answer.length} huruf)`
        : `Petunjuk: ${hintFor(item.answer)}  (${wordCount(item.answer)} kata)`;
      input.focus();
    });

    nextButton.addEventListener('click', next);


    document.onkeydown = event => {
      const key = event.key.toLowerCase();

      if (key === 'escape') {
        back();
        return;
      }

      if (!locked) return;

      if (key === 'm') {
        toggleMateri();
        return;
      }

      if (key === 'enter' || key === 'arrowright' || key === ' ') {
        event.preventDefault();
        next();
      }
    };

    input.focus();
  }

  /* ---------------------------------------------------------
     FLASHCARDS
     --------------------------------------------------------- */

  function showFlashcards(cfg = null) {
    const gen = generatedItems(cfg);

    let deck;

    if (gen.length) {
      deck = gen.map((it, k) => ({
        id: `g${k}`,
        category: it.category,
        text: it.text,
        answer: it.answer
      }));
    } else {
      const source = cfg
        ? customList(cfg)
        : drawFromPool(QUESTION_BANK, FLASH_SIZE, FLASH_POOL_KEY);

      deck = source.map(q => ({
        id: q.id,
        category: categoryOf(q),
        text: q.text,
        answer: q.options[q.answer]
      }));
    }

    const total = deck.length;
    const marks = deck.map(() => null);

    let i = 0;
    let busy = false;
    let wrap = null;
    let card = null;

    shell(`
      <section class="kuis-play fc-play">
        ${playTop(lbl(MODE_LABELS.flash), 0, total)}

        <div class="fc-stage-box">
          <div class="fc-stage" id="fcStage"></div>
          <div class="fc-fx" id="fcFx" aria-live="polite"></div>
        </div>

        <p class="fc-tip">Ketuk kartu untuk membalik · panah kiri/kanan pindah kartu · B benar · S salah</p>

        <div class="fc-actions">
          <button class="kuis-ghost" id="fcPrev" type="button">${backBtn('Sebelumnya')}</button>
          <button class="kuis-ghost fc-bad" id="fcBad" type="button">${ic('close', 16)}<span>Salah</span></button>
          <button class="kuis-ghost fc-ok" id="fcOk" type="button">${ic('check', 16)}<span>Benar</span></button>
          <button class="kuis-primary" id="fcNext" type="button">${nextHtml}</button>
        </div>

        
      </section>
    `);

    const stage = document.querySelector('#fcStage');
    const prevBtn = document.querySelector('#fcPrev');
    const nextBtn = document.querySelector('#fcNext');
    const okBtn = document.querySelector('#fcOk');
    const badBtn = document.querySelector('#fcBad');

    function sync() {
      const flipped = card.classList.contains('is-flipped');
      const canMark = flipped || marks[i] !== null;

      okBtn.disabled = !canMark;
      badBtn.disabled = !canMark;
      okBtn.classList.toggle('is-picked', marks[i] === true);
      badBtn.classList.toggle('is-picked', marks[i] === false);
      prevBtn.disabled = i === 0;
      nextBtn.innerHTML = i === total - 1 ? 'Selesai' : nextHtml;

      document.querySelector('#kuisBar').style.width = `${((i + 1) / total) * 100}%`;
      document.querySelector('.kuis-play-count').innerHTML =
        `<b>${pad(i + 1)}</b> / ${pad(total)}`;
    }

    function mount() {
      const item = deck[i];

      stage.innerHTML = `
        <div class="fc-wrap" id="fcWrap">
          <div class="fc-card" id="fcCard" role="button" tabindex="0" aria-label="Balik kartu">

            <div class="fc-face fc-front">
              ${item.category ? `<span class="kuis-q-cat">${e(item.category)}</span>` : ''}
              <span class="fc-label">PERTANYAAN</span>
              <p class="fc-text">${e(item.text)}</p>
              <span class="fc-flip-hint">Ketuk untuk melihat jawaban</span>
            </div>

            <div class="fc-face fc-back">
              <span class="fc-label">JAWABAN</span>
              <p class="fc-text fc-answer">${e(item.answer)}</p>
              <span class="fc-flip-hint">Ketuk untuk kembali</span>
            </div>

          </div>
        </div>
      `;

      wrap = stage.querySelector('#fcWrap');
      card = stage.querySelector('#fcCard');
      card.addEventListener('click', flip);

      sync();
    }

    function flip() {
      if (busy) return;
      card.classList.toggle('is-flipped');
      sync();
    }

    function burst(kind) {
      const fx = document.querySelector('#fcFx');
      if (!fx) return;

      const ok = kind === 'ok';
      const el = document.createElement('div');

      el.className = `fc-burst ${ok ? 'is-ok' : 'is-bad'}`;
      el.innerHTML = `
        <span class="fc-burst-icon">${ic(ok ? 'check' : 'close', 16, 2.4)}</span>
        <span class="fc-burst-text">${e(ok ? pickCheerOk() : pickCheerBad())}</span>
      `;

      fx.appendChild(el);
      setTimeout(() => el.remove(), 1100);
    }

    /* kind: 'ok' | 'bad' = keluar berwarna + pesan semangat; kosong = keluar biasa */
    function go(delta, kind = null) {
      if (busy) return;

      const target = i + delta;
      if (target < 0) return;

      const last = target >= total;
      const cls = kind
        ? `is-out-${kind}`
        : delta > 0
          ? 'is-out-next'
          : 'is-out-prev';

      busy = true;
      wrap.classList.add(cls);
      if (kind) burst(kind);

      setTimeout(() => {
        busy = false;

        if (last) {
          finish();
          return;
        }

        i = target;
        mount();
      }, kind ? 680 : 260);
    }

    function rate(ok) {
      if (busy) return;
      marks[i] = ok;
      go(1, ok ? 'ok' : 'bad');
    }

    function finish() {
      const correct = marks.filter(m => m === true).length;
      const wrong = marks.filter(m => m === false).length;
      const open = total - correct - wrong;
      const percent = total ? Math.round((correct / total) * 100) : 0;
      const review = deck.filter((_, k) => marks[k] !== true);

      /* Mode ujian: laporkan skor lalu lanjut ke bagian berikutnya */
      if (examAdvance({ correct, total })) return;

      /* Latihan kustom dari Tools tidak dihitung achievement */
            if (!cfg) recordQuizResult({ type: 'flash', correct, total, extra: { open } });
      cfg?.onResult?.({ correct, total });

      let message = 'Ulangi kartunya sampai jawabannya nempel di kepala.';
      if (percent >= 85) message = 'Luar biasa! Hampir semua kartu sudah kamu kuasai.';
      else if (percent >= 70) message = 'Bagus! Tinggal beberapa kartu lagi.';
      else if (percent >= 50) message = 'Cukup baik. Ulangi kartu yang belum hafal.';

      shell(`
        <section class="kuis-result">

          <header class="kuis-heading">
            <span class="kuis-eyebrow">HASIL FLASHCARDS</span>
            <h1>${total} kartu selesai</h1>
            <p>${message}</p>
          </header>

          <div class="kuis-score">
            <div class="kuis-ring" style="--pct:${percent}">
              <div class="kuis-ring-inner">
                <b>${percent}</b>
                <span>hafal</span>
              </div>
            </div>

            <div class="kuis-stats">
              <div class="kuis-stat"><b>${correct}</b><span>Benar</span></div>
              <div class="kuis-stat"><b>${wrong}</b><span>Salah</span></div>
              <div class="kuis-stat"><b>${open}</b><span>Belum dinilai</span></div>
            </div>
          </div>

          ${
            review.length
              ? `
                <section class="kuis-review">
                  <h3>Kartu yang perlu diulang</h3>
                  <div class="kuis-review-list">
                    ${review
                      .map(
                        (r, n) => `
                          <article class="kuis-review-item">
                            <span class="kuis-review-no">${pad(n + 1)}</span>
                            <div>
                              ${r.category ? `<span class="kuis-q-cat">${e(r.category)}</span>` : ''}
                              <p class="kuis-review-q">${e(r.text)}</p>
                              <p class="kuis-review-a is-correct"><b>Jawaban:</b> ${e(r.answer)}</p>
                            </div>
                          </article>
                        `
                      )
                      .join('')}
                  </div>
                </section>
              `
              : ''
          }

          <div class="kuis-result-actions">
      
            ${cfg?.noRetry ? '' : '<button class="kuis-primary" id="kuisRetry" type="button">Main lagi (kartu baru)</button>'}
          </div>

        </section>
      `);

      document.querySelector('#kuisRetry')?.addEventListener('click', () => showFlashcards(cfg));

      document.onkeydown = event => {
        if (event.key === 'Escape') back();
      };
    }

    prevBtn.addEventListener('click', () => go(-1));
    nextBtn.addEventListener('click', () => go(1));
    okBtn.addEventListener('click', () => rate(true));
    badBtn.addEventListener('click', () => rate(false));


    document.onkeydown = event => {
      const key = event.key.toLowerCase();

      if (key === 'escape') return back();
      if (key === 'arrowright') return go(1);
      if (key === 'arrowleft') return go(-1);

      if (key === ' ' || key === 'enter') {
        event.preventDefault();
        return flip();
      }

      if (key === 'b' && !okBtn.disabled) return rate(true);
      if (key === 's' && !badBtn.disabled) return rate(false);
    };

    mount();
  }

  /* ---------------------------------------------------------
     TEKA-TEKI SILANG
     --------------------------------------------------------- */

  function showCrossword(cfg = null) {
    const puzzle = buildCrossword(cfg);

    if (!puzzle) {
      /* saat ujian, bagian ini dilewati saja */
      if (examAdvance({ correct: 0, total: 0, skipped: true })) return;

      showNotice('Soal belum cukup untuk membuat teka-teki silang.');
      if (fromTools) setTimeout(exit, 900);
      return;
    }

    const { words, cells, w, h } = puzzle;

    let active = 0;
    let lastClicked = '';
    let hints = 0;

    const hintLabel = word =>
      `${word.words > 1 ? `${word.words} kata, ` : ''}${word.letters.length} huruf`;

    const clueItem = (word, wi) => `
      <li>
        <button class="kts-clue" data-w="${wi}" type="button">
          <b>${word.num}</b>
          <span>${e(word.clue)} <em>(${hintLabel(word)})</em></span>
        </button>
      </li>
    `;

    let gridHtml = '';

    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const cell = cells.get(`${x},${y}`);

        gridHtml += cell
          ? `
            <div class="kts-cell" data-x="${x}" data-y="${y}" style="--d:${(x + y) * 28}ms">
              ${cell.num ? `<span class="kts-num">${cell.num}</span>` : ''}
              <input
                type="text"
                maxlength="2"
                autocomplete="off"
                autocapitalize="characters"
                autocorrect="off"
                spellcheck="false"
                aria-label="Kotak ${x + 1},${y + 1}"
              />
            </div>
          `
          : '<div class="kts-void"></div>';
      }
    }

    shell(`
      <section class="kuis-play kts-play">
        ${playTop(lbl(MODE_LABELS.tts), -1, words.length)}

        <article class="kuis-question kts-card">
          <div class="kts-scroll">
            <div class="kts-grid" id="ktsGrid" style="grid-template-columns:repeat(${w}, var(--cw))">
              ${gridHtml}
            </div>
          </div>

          <div class="kts-tools">
            <button class="kuis-linkbtn" id="ktsCheck" type="button">Periksa jawaban</button>
            <button class="kuis-linkbtn" id="ktsHint" type="button">Petunjuk (1 huruf)</button>
          </div>

          <p class="fc-tip">Ketuk kotak dua kali untuk ganti arah · tombol panah untuk pindah kotak</p>

          <div class="kts-clues">
            <div>
              <h3>Mendatar</h3>
              <ul>${words.map((wd, wi) => (wd.dir === 'across' ? clueItem(wd, wi) : '')).join('')}</ul>
            </div>
            <div>
              <h3>Menurun</h3>
              <ul>${words.map((wd, wi) => (wd.dir === 'down' ? clueItem(wd, wi) : '')).join('')}</ul>
            </div>
          </div>
        </article>

        <footer class="kuis-play-actions">
         
          <button class="kuis-primary" id="ktsDone" type="button">Selesai</button>
        </footer>
      </section>
    `);

    const grid = document.querySelector('#ktsGrid');
    const clueButtons = [...document.querySelectorAll('.kts-clue')];

    const cellEl = (x, y) => grid.querySelector(`[data-x="${x}"][data-y="${y}"]`);
    const inputAt = (x, y) => cellEl(x, y)?.querySelector('input') || null;

    const posOf = (word, k) => ({
      x: word.x + (word.dir === 'across' ? k : 0),
      y: word.y + (word.dir === 'down' ? k : 0)
    });

    const indexIn = (word, x, y) => {
      const k = word.dir === 'across' ? x - word.x : y - word.y;
      const same = word.dir === 'across' ? y === word.y : x === word.x;
      return same && k >= 0 && k < word.letters.length ? k : -1;
    };

    function typedOf(word) {
      return word.letters
        .split('')
        .map((_, k) => {
          const p = posOf(word, k);
          return inputAt(p.x, p.y).value.toUpperCase() || '';
        })
        .join('');
    }

    /* Penghitung: jumlah kata yang semua kotaknya sudah terisi */
    function progress() {
      const done = words.filter(wd => typedOf(wd).length === wd.letters.length).length;

      document.querySelector('#kuisBar').style.width = `${(done / words.length) * 100}%`;
      document.querySelector('.kuis-play-count').innerHTML =
        `<b>${pad(done)}</b> / ${pad(words.length)} kata`;
    }

    function refresh() {
      grid.querySelectorAll('.kts-cell').forEach(c => c.classList.remove('is-word', 'is-active'));

      const word = words[active];

      for (let k = 0; k < word.letters.length; k += 1) {
        const p = posOf(word, k);
        cellEl(p.x, p.y).classList.add('is-word');
      }

      clueButtons.forEach(b => b.classList.toggle('is-active', Number(b.dataset.w) === active));
    }

    function focusCell(x, y) {
      inputAt(x, y)?.focus({ preventScroll: true });
    }

    function step(x, y, delta) {
      const word = words[active];
      const k = indexIn(word, x, y) + delta;

      if (k < 0 || k >= word.letters.length) return;

      const p = posOf(word, k);
      focusCell(p.x, p.y);
    }

    grid.addEventListener('focusin', ev => {
      const cellNode = ev.target.closest('.kts-cell');
      if (!cellNode) return;

      const x = Number(cellNode.dataset.x);
      const y = Number(cellNode.dataset.y);
      const cell = cells.get(`${x},${y}`);

      cellNode.classList.add('is-active');
      grid.querySelectorAll('.kts-cell.is-active').forEach(c => {
        if (c !== cellNode) c.classList.remove('is-active');
      });

      if (indexIn(words[active], x, y) < 0) {
        const opts = [cell.across, cell.down].filter(v => v !== undefined);
        active = opts.find(v => words[v].dir === words[active].dir) ?? opts[0];
        refresh();
        cellNode.classList.add('is-active');
      }
    });

    grid.addEventListener('click', ev => {
      const cellNode = ev.target.closest('.kts-cell');
      if (!cellNode) return;

      const key = `${cellNode.dataset.x},${cellNode.dataset.y}`;
      const cell = cells.get(key);

      if (
        lastClicked === key &&
        cell.across !== undefined &&
        cell.down !== undefined
      ) {
        active = active === cell.across ? cell.down : cell.across;
        refresh();
        cellNode.classList.add('is-active');
      }

      lastClicked = key;
    });

    grid.addEventListener('input', ev => {
      const input = ev.target;
      const cellNode = input.closest('.kts-cell');

      const value = simplify(input.value).replace(/[^a-z]/g, '').slice(-1).toUpperCase();
      input.value = value;
      cellNode.classList.remove('is-ok', 'is-bad', 'is-revealed');

      if (value) step(Number(cellNode.dataset.x), Number(cellNode.dataset.y), 1);
    });

    /* keyup juga menangkap Backspace (yang tidak memicu event input) */
    grid.addEventListener('input', progress);
    grid.addEventListener('keyup', progress);

    grid.addEventListener('keydown', ev => {
      ev.stopPropagation();

      const input = ev.target;
      const cellNode = input.closest('.kts-cell');
      if (!cellNode) return;

      const x = Number(cellNode.dataset.x);
      const y = Number(cellNode.dataset.y);

      if (ev.key === 'Escape') {
        back();
        return;
      }

      if (ev.key === 'Backspace') {
        ev.preventDefault();
        cellNode.classList.remove('is-ok', 'is-bad', 'is-revealed');

        if (input.value) {
          input.value = '';
        } else {
          step(x, y, -1);

          const k = indexIn(words[active], x, y) - 1;
          if (k >= 0) {
            const p = posOf(words[active], k);
            const prev = inputAt(p.x, p.y);
            prev.value = '';
            prev.closest('.kts-cell').classList.remove('is-ok', 'is-bad', 'is-revealed');
          }
        }
        return;
      }

      const dirs = {
        ArrowRight: [1, 0],
        ArrowLeft: [-1, 0],
        ArrowDown: [0, 1],
        ArrowUp: [0, -1]
      };

      if (dirs[ev.key]) {
        ev.preventDefault();

        const [dx, dy] = dirs[ev.key];
        let nx = x + dx;
        let ny = y + dy;

        while (nx >= 0 && ny >= 0 && nx < w && ny < h) {
          if (inputAt(nx, ny)) {
            focusCell(nx, ny);
            return;
          }
          nx += dx;
          ny += dy;
        }
      }
    });

    clueButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        active = Number(btn.dataset.w);
        refresh();

        const word = words[active];
        let target = posOf(word, 0);

        for (let k = 0; k < word.letters.length; k += 1) {
          const p = posOf(word, k);
          if (!inputAt(p.x, p.y).value) {
            target = p;
            break;
          }
        }

        focusCell(target.x, target.y);
      });
    });

    document.querySelector('#ktsCheck').addEventListener('click', () => {
      let okWords = 0;

      words.forEach(word => {
        if (typedOf(word) === word.letters) okWords += 1;
      });

      cells.forEach((cell, key) => {
        const [cx, cy] = key.split(',');
        const node = grid.querySelector(`[data-x="${cx}"][data-y="${cy}"]`);
        const value = node.querySelector('input').value.toUpperCase();

        node.classList.remove('is-ok', 'is-bad');
        if (value) node.classList.add(value === cell.letter ? 'is-ok' : 'is-bad');
      });

      showNotice(`${okWords} dari ${words.length} kata sudah benar.`);
    });

    document.querySelector('#ktsHint').addEventListener('click', () => {
      const word = words[active];

      for (let k = 0; k < word.letters.length; k += 1) {
        const p = posOf(word, k);
        const input = inputAt(p.x, p.y);

        if (input.value.toUpperCase() !== word.letters[k]) {
          input.value = word.letters[k];
          input.closest('.kts-cell').classList.remove('is-bad');
          input.closest('.kts-cell').classList.add('is-revealed');
          hints += 1;
          progress();
          return;
        }
      }

      showNotice('Kata ini sudah lengkap dan benar.');
    });

    document.querySelector('#ktsDone').addEventListener('click', () => {
      const results = words.map(word => {
        const typed = typedOf(word);
        return { word, typed, isCorrect: typed === word.letters };
      });

      const correct = results.filter(r => r.isCorrect).length;
      const total = words.length;
      const wrong = total - correct;
      const percent = Math.round((correct / total) * 100);

      const wrongList = results
        .filter(r => !r.isCorrect)
        .map(r => ({
          category: r.word.category,
          question: r.word.clue,
          chosen: r.typed || '(kosong)',
          correct: r.word.answer
        }));

      /* Mode ujian: laporkan skor lalu lanjut ke bagian berikutnya */
      if (examAdvance({ correct, total })) return;

      if (!cfg) recordQuizResult({ type: 'tts', correct, total });
      cfg?.onResult?.({ correct, total });

      let message = 'Pelajari lagi materinya, lalu coba teka-teki baru.';
      if (percent >= 85) message = 'Luar biasa! Teka-teki hampir sempurna.';
      else if (percent >= 70) message = 'Bagus! Sedikit lagi.';
      else if (percent >= 50) message = 'Cukup baik. Ulangi bagian yang salah.';

      shell(`
        <section class="kuis-result">

          <header class="kuis-heading">
                        <span class="kuis-eyebrow">HASIL TEKA-TEKI SILANG</span>  
            <h1>Teka-Teki Silang selesai</h1>
            <p>${message}</p>
          </header>

          <div class="kuis-score">
            <div class="kuis-ring" style="--pct:${percent}">
              <div class="kuis-ring-inner">
                <b>${percent}</b>
                <span>skor</span>
              </div>
            </div>

            <div class="kuis-stats">
              <div class="kuis-stat"><b>${correct}</b><span>Benar</span></div>
              <div class="kuis-stat"><b>${wrong}</b><span>Salah</span></div>
              <div class="kuis-stat"><b>${hints}</b><span>Petunjuk</span></div>
            </div>
          </div>

          ${reviewHtml(wrongList)}

          <div class="kuis-result-actions">
   
            ${cfg?.noRetry ? '' : '<button class="kuis-primary" id="kuisRetry" type="button">Main lagi (TTS baru)</button>'}
          </div>

        </section>
      `);


      document.querySelector('#kuisRetry')?.addEventListener('click', () => showCrossword(cfg));

      document.onkeydown = event => {
        if (event.key === 'Escape') back();
      };
    });



    document.onkeydown = event => {
      if (event.key === 'Escape') back();
    };

    /* kotak pertama kata pertama langsung aktif */
    refresh();
    progress();
    const first = posOf(words[0], 0);
    focusCell(first.x, first.y);
  }

  /* ---------------------------------------------------------
     MATCHING
     Ketuk satu kartu di kiri lalu pasangannya di kanan.
     --------------------------------------------------------- */

  function showMatching(opts = {}) {
    const rounds = opts.rounds ?? MATCH_ROUNDS;
const all = opts.list ?? matchPairs(opts.pairs ?? rounds * MATCH_ROUND_SIZE);

    if (all.length < 3) {
      if (examAdvance({ correct: 0, total: 0, skipped: true })) return;
                  showNotice('Soal belum cukup untuk mode Cocokkan Kartu.');
      return;
    }

    const chunks = [];

    for (let i = 0; i < all.length; i += MATCH_ROUND_SIZE) {
      chunks.push(all.slice(i, i + MATCH_ROUND_SIZE));
    }

    /* sisa ronde terakhir yang terlalu kecil digabung ke ronde sebelumnya */
    if (chunks.length > 1 && chunks[chunks.length - 1].length < 3) {
      const rest = chunks.pop();
      chunks[chunks.length - 1].push(...rest);
    }

        const flat = chunks.flat();
    const missed = new Set();
    const roundMistakes = [];
    let mistakes = 0;
    let r = 0;

        function step() {
      const pairs = chunks[r];
      const startMistakes = mistakes;
      const isLast = r === chunks.length - 1;
      const rights = shuffle(pairs);

      let sel = null;
      let matched = 0;
      let busy = false;

      shell(`
        <section class="kuis-play mt-play">

          ${playTop(lbl(MODE_LABELS.match), r, chunks.length)}

          <article class="kuis-question mt-card">
            <span class="kuis-q-cat">Ronde ${r + 1} · hubungkan soal dengan jawabannya</span>

            <div class="mt-cols" id="mtCols">
              <svg class="mt-lines" id="mtLines" aria-hidden="true"></svg>

              <div class="mt-col">
                ${pairs
                  .map(
                    p => `<button class="mt-item mt-left" data-side="l" data-id="${p.id}" type="button">${e(p.left)}</button>`
                  )
                  .join('')}
              </div>

              <div class="mt-col">
                ${rights
                  .map(
                    p => `<button class="mt-item mt-right" data-side="r" data-id="${p.id}" type="button">${e(p.right)}</button>`
                  )
                  .join('')}
              </div>
            </div>

            <p class="fc-tip">Salah pasang: <b id="mtMistakes">${mistakes}</b> · pasangan benar: <b id="mtDone">0</b> / ${pairs.length}</p>
          </article>

          <footer class="kuis-play-actions">
     
            <button class="kuis-primary" id="kuisNext" type="button" disabled>
              ${isLast ? 'Lihat hasil' : nextHtml}
            </button>
          </footer>

        </section>
      `);

      const cols = document.querySelector('#mtCols');
      const svg = document.querySelector('#mtLines');
      const nextBtn = document.querySelector('#kuisNext');
      const doneEl = document.querySelector('#mtDone');
      const missEl = document.querySelector('#mtMistakes');

      /* ---- panah penghubung ---- */
      const links = [];
      let wrongLink = null;
      let hover = null;

      const PAIR_COLORS = ['#7fb7d9', '#e0c46f', '#c79ae0', '#6fd0c8', '#a9a4e8'];
      const PICK_COLOR = '#ebbd86';
      const BAD_COLOR = '#e08678';

      const edge = (el, side) => {
        const c = cols.getBoundingClientRect();
        const rect = el.getBoundingClientRect();

        return {
          x: (side === 'right' ? rect.right : rect.left) - c.left,
          y: rect.top + rect.height / 2 - c.top
        };
      };

      /* titik sambung item: sisi kanan untuk kartu kiri, sisi kiri untuk kartu kanan */
      const portOf = el => edge(el, el.dataset.side === 'l' ? 'right' : 'left');
            const STUB = 14;  /* garis lurus keluar / masuk */
      const HEAD = 10;  /* panjang kepala panah */

      /* rute: lurus keluar, lengkung halus di tengah, lurus masuk */
      function route(a, b) {
        const dir = b.x >= a.x ? 1 : -1;
        const out = a.x + dir * STUB;
        const inn = b.x - dir * (HEAD + STUB);
        const end = b.x - dir * (HEAD - 2);
        const mid = (out + inn) / 2;
        const room = (inn - out) * dir;

        const d =
          room > 10
            ? `M${a.x} ${a.y} L${out} ${a.y} C${mid} ${a.y} ${mid} ${b.y} ${inn} ${b.y} L${end} ${b.y}`
            : `M${a.x} ${a.y} L${end} ${b.y}`;

        return { d, dir };
      }

      /* kepala panah digambar sendiri, arahnya selalu searah garis masuk */
      const headAt = (b, dir, color) => {
        const back = b.x - dir * HEAD;
        const notch = b.x - dir * (HEAD - 3);

        return `<polygon class="mt-head" points="${b.x},${b.y} ${back},${b.y - 5.5} ${notch},${b.y} ${back},${b.y + 5.5}" fill="${color}" />`;
      };

      function drawArrows() {
        if (!sel) hover = null;

        const c = cols.getBoundingClientRect();
        svg.setAttribute('viewBox', `0 0 ${c.width} ${c.height}`);

        const gap = parseFloat(getComputedStyle(cols).columnGap) || 40;

        let html = '';

        /* pasangan benar */
        links.forEach(link => {
          const a = portOf(link.l);
          const b = portOf(link.r);
          const col = PAIR_COLORS[link.ci];
          const { d, dir } = route(a, b);

          html += `
            <g class="mt-link ${link.fresh ? 'is-new' : ''}">
              <path class="mt-glow" pathLength="1" d="${d}" stroke="${col}" />
              <path class="mt-arrow" pathLength="1" d="${d}" stroke="${col}" />
              ${headAt(b, dir, col)}
              <circle class="mt-dot" cx="${a.x}" cy="${a.y}" r="4.5" fill="${col}" />
            </g>
          `;

          link.fresh = false;
        });

        /* salah pasang: panah merah sebentar */
        if (wrongLink) {
          const a = portOf(wrongLink.l);
          const b = portOf(wrongLink.r);
          const { d, dir } = route(a, b);

          html += `
            <path class="mt-arrow is-bad" d="${d}" stroke="${BAD_COLOR}" />
            ${headAt(b, dir, BAD_COLOR)}
            <circle class="mt-dot" cx="${a.x}" cy="${a.y}" r="4.5" fill="${BAD_COLOR}" />
          `;
        }

        /* sedang dipilih: panah putus-putus mengikuti kartu yang disorot */
        if (sel) {
          const side = sel.side === 'l' ? 1 : -1;
          const a = portOf(sel.el);
          const b = hover ? portOf(hover) : { x: a.x + side * (gap - 6), y: a.y };
          const { d, dir } = route(a, b);

          html += `
            <circle class="mt-ring" cx="${a.x}" cy="${a.y}" r="5" stroke="${PICK_COLOR}" />
            <path class="mt-arrow is-pick" d="${d}" stroke="${PICK_COLOR}" />
            ${headAt(b, dir, PICK_COLOR)}
            <circle class="mt-dot" cx="${a.x}" cy="${a.y}" r="4.5" fill="${PICK_COLOR}" />
          `;
        }

        svg.innerHTML = html;
      }
      function clearPick() {
        cols.querySelectorAll('.mt-item.is-selected').forEach(x => x.classList.remove('is-selected'));
      }

      /* preview panah mengikuti kartu di kolom seberang yang sedang disorot */
      cols.addEventListener('pointerover', ev => {
        const item = ev.target.closest('.mt-item');
        const target = sel && item && !item.disabled && item.dataset.side !== sel.side ? item : null;

        if (target === hover) return;
        hover = target;
        drawArrows();
      });

      cols.addEventListener('pointerleave', () => {
        if (!hover) return;
        hover = null;
        drawArrows();
      });

      cols.addEventListener('click', ev => {
        const item = ev.target.closest('.mt-item');
        if (!item || item.disabled || busy) return;

        /* ketuk kartu yang sama = batal pilih */
        if (sel && sel.el === item) {
          clearPick();
          sel = null;
          hover = null;
          drawArrows();
          return;
        }

        /* pilihan pertama, atau ganti pilihan di sisi yang sama */
        if (!sel || sel.side === item.dataset.side) {
          clearPick();
          sel = { el: item, side: item.dataset.side };
          item.classList.add('is-selected');
          hover = null;
          drawArrows();
          return;
        }

        /* pasangan: satu kiri + satu kanan */
        const first = sel.el;
        clearPick();
        sel = null;
        hover = null;

        const l = first.dataset.side === 'l' ? first : item;
        const rt = first.dataset.side === 'r' ? first : item;

        if (l.dataset.id === rt.dataset.id) {
          const ci = links.length % PAIR_COLORS.length;

          [l, rt].forEach(x => {
            x.disabled = true;
            x.classList.add('is-matched');
            x.style.setProperty('--pair', PAIR_COLORS[ci]);
          });

          links.push({ l, r: rt, ci, fresh: true });
          matched += 1;
          doneEl.textContent = matched;
          drawArrows();

                    if (matched === pairs.length) {
            roundMistakes.push(mistakes - startMistakes);
            document.querySelector('#kuisBar').style.width = `${((r + 1) / chunks.length) * 100}%`;
            nextBtn.disabled = false;
            nextBtn.focus({ preventScroll: true });
          }
          return;
        }

        /* salah pasang */
        mistakes += 1;
        missEl.textContent = mistakes;
        missed.add(String(l.dataset.id));

        busy = true;
        wrongLink = { l, r: rt };
        [l, rt].forEach(x => x.classList.add('is-wrong'));
        drawArrows();

        setTimeout(() => {
          [l, rt].forEach(x => x.classList.remove('is-wrong'));
          wrongLink = null;
          busy = false;
          drawArrows();
        }, 650);
      });

      nextBtn.addEventListener('click', () => {
        r += 1;
        if (r >= chunks.length) finish();
        else step();
      });



      document.onkeydown = event => {
        if (event.key === 'Escape') back();
        if (event.key === 'Enter' && !nextBtn.disabled) nextBtn.click();
      };

      if ('ResizeObserver' in window) new ResizeObserver(drawArrows).observe(cols);
      else window.addEventListener('resize', drawArrows);

      drawArrows();
    }

    function finish() {
      const total = flat.length;
      const wrongPairs = flat.filter(p => missed.has(String(p.id)));
            const correct = total - wrongPairs.length;
      const percent = Math.round((correct / total) * 100);

      if (examAdvance({ correct, total })) return;

      opts.cfg?.onResult?.({ correct, total });

      if (!opts.cfg) recordQuizResult({
        type: 'match',
        correct,
        total,
        extra: {
          mistakes,
          steps: total + mistakes,
          rounds: chunks.length,
          perfectRounds: roundMistakes.filter(n => n === 0).length
        }
      });

      showGenericResult({
                eyebrow: 'HASIL JODOHKAN',
        title: 'Menjodohkan selesai',
        percent,
        stats: [
          { v: correct, l: 'Langsung benar' },
          { v: wrongPairs.length, l: 'Sempat salah' },
          { v: mistakes, l: 'Salah pasang' }
        ],
        wrongList: wrongPairs.map(p => ({
          category: p.category,
          question: p.left,
          chosen: 'Sempat salah dipasangkan',
          correct: p.right
        })),
retry: opts.cfg?.noRetry ? null : () => showMatching(opts)
      });
    }

    step();
  }

  /* ---------------------------------------------------------
     SUSUN URUTAN
     Ketuk item untuk menaruhnya di slot berikutnya,
     ketuk slot untuk mengembalikannya.
     --------------------------------------------------------- */

  function showOrder(opts = {}) {
    const size = Math.min(opts.size ?? ORDER_SIZE, ORDER_SETS.length);
    const sets = shuffle(ORDER_SETS).slice(0, size);
    const results = [];

    let k = 0;
    let score = 0;
    let partial = 0;

    function step() {
      const set = sets[k];
      const total = sets.length;
      const isLast = k === total - 1;

      let pool = shuffle(set.items);

      for (let t = 0; t < 10 && pool.join('|') === set.items.join('|'); t += 1) {
        pool = shuffle(set.items);
      }

      const slots = Array(set.items.length).fill(null);

      let checked = false;
      let toggleMateri = () => {};

      shell(`
        <section class="kuis-play od-play">

          ${playTop(lbl(MODE_LABELS.order), k, total)}

          <article class="kuis-question od-card">
            <span class="kuis-q-cat">${e(set.title)}</span>

            <h2>${e(set.prompt)}</h2>

            <div class="od-slots" id="odSlots"></div>

            <span class="od-label">PILIHAN · ketuk untuk menaruh di urutan berikutnya</span>
            <div class="od-pool" id="odPool"></div>

            <div class="kuis-type-tools">
              <button class="kuis-linkbtn" id="odReset" type="button">Ulangi susunan</button>
            </div>

            <div class="kuis-feedback" id="kuisFeedback" hidden></div>
          </article>

          <footer class="kuis-play-actions">
          
            <button class="kuis-primary" id="odAction" type="button" disabled>Periksa</button>
          </footer>

        </section>
      `);

      const slotsEl = document.querySelector('#odSlots');
      const poolEl = document.querySelector('#odPool');
      const resetBtn = document.querySelector('#odReset');
      const action = document.querySelector('#odAction');
      const feedback = document.querySelector('#kuisFeedback');

      function draw() {
        slotsEl.innerHTML = slots
          .map((v, i) => {
            const state = checked ? (v === set.items[i] ? 'is-ok' : 'is-bad') : '';

            return `
              <button class="od-slot ${v ? 'is-filled' : ''} ${state}" data-s="${i}" type="button" ${checked ? 'disabled' : ''}>
                <span class="od-num">${i + 1}</span>
                <span class="od-text">${v ? e(v) : ''}</span>
              </button>
            `;
          })
          .join('');

        poolEl.innerHTML = pool
          .filter(x => !slots.includes(x))
          .map(x => `<button class="od-chip" data-v="${e(x)}" type="button" ${checked ? 'disabled' : ''}>${e(x)}</button>`)
          .join('');

        if (!checked) action.disabled = !slots.every(Boolean);
        resetBtn.disabled = checked;
      }

      slotsEl.addEventListener('click', ev => {
        const btn = ev.target.closest('.od-slot');
        if (!btn || checked) return;

        slots[Number(btn.dataset.s)] = null;
        draw();
      });

      poolEl.addEventListener('click', ev => {
        const btn = ev.target.closest('.od-chip');
        if (!btn || checked) return;

        const empty = slots.indexOf(null);
        if (empty < 0) return;

        slots[empty] = btn.dataset.v;
        draw();
      });

      resetBtn.addEventListener('click', () => {
        if (checked) return;
        slots.fill(null);
        draw();
      });

      function check() {
        if (checked || !slots.every(Boolean)) return;
        checked = true;

        const rightCount = slots.filter((v, i) => v === set.items[i]).length;
        const exact = rightCount === set.items.length;

        if (exact) score += 1;
        partial += rightCount / set.items.length;

        results.push({
          category: set.category,
          question: set.prompt,
          chosen: slots.join(' → '),
          correct: set.items.join(' → '),
          isCorrect: exact
        });

        draw();

        const verdict = exact
          ? mark('ok', 'Urutan benar.')
          : `${mark('bad', 'Kurang tepat.')} ${rightCount} dari ${set.items.length} posisi sudah benar.<br>Urutan yang benar: <b>${set.items.map(e).join(' → ')}</b>`;

        toggleMateri = mountFeedback(feedback, exact, verdict, set.category);

        document.querySelector('#kuisBar').style.width = `${((k + 1) / total) * 100}%`;

        action.textContent = isLast ? 'Lihat hasil' : 'Lanjut';
        action.disabled = false;
        action.focus({ preventScroll: true });
      }

      function next() {
        k += 1;

        if (k >= total) finish();
        else step();
      }

      action.addEventListener('click', () => (checked ? next() : check()));


      document.onkeydown = event => {
        const key = event.key.toLowerCase();

        if (key === 'escape') {
          back();
          return;
        }

        if (key === 'm' && checked) {
          toggleMateri();
          return;
        }

        if (key === 'enter') {
          event.preventDefault();
          if (checked) next();
          else check();
        }
      };

      draw();
    }

    function finish() {
      const total = sets.length;
      const percent = Math.round((score / total) * 100);

      if (examAdvance({ correct: score, total })) return;

      showGenericResult({
        eyebrow: 'HASIL SUSUN URUTAN',
        title: 'Susun Urutan selesai',
        percent,
        stats: [
          { v: score, l: 'Urutan benar' },
          { v: total - score, l: 'Perlu diulang' },
          { v: `${Math.round((partial / total) * 100)}%`, l: 'Posisi tepat' }
        ],
        wrongList: results.filter(x => !x.isCorrect),
        retry: () => showOrder(opts)
      });
    }

    step();
  }

  /* ---------------------------------------------------------
     MEMORY MATCH
     --------------------------------------------------------- */

    function showMemory(opts = {}) {
    const pairs = opts.list ?? memoryPairs(opts.pairs ?? MEMORY_PAIRS);

    if (pairs.length < 3) {
      if (examAdvance({ correct: 0, total: 0, skipped: true })) return;
      showNotice('Soal belum cukup untuk Cocokkan Kartu.');
      return;
    }

    const COLORS = [
      '#7fb7d9', '#e0c46f', '#c79ae0', '#6fd0c8', '#a9a4e8',
      '#e6a27a', '#8fd18f', '#e58fb1', '#9ec1e8', '#d6c27a'
    ];

    /* dua wilayah: soal di satu sisi, jawaban di sisi lain */
    const qCards = shuffle(pairs.map(p => ({ pid: p.id, kind: 'q', text: p.left })));
    const aCards = shuffle(pairs.map(p => ({ pid: p.id, kind: 'a', text: p.right })));
    const cards = [...qCards, ...aCards];

    /* soal = 1, 2, 3 ... ; jawaban = A, B, C ... */
    const keyOf = i =>
      i < qCards.length ? String(i + 1) : String.fromCharCode(65 + i - qCards.length);

    const hint = { q: 'Pilih satu kartu soal', a: 'Pilih satu kartu jawaban' };
    const label = { q: 'SOAL', a: 'JAWABAN' };

    const tileHtml = (c, i) => `
      <button class="mm-tile is-${c.kind}" data-i="${i}" type="button"
        aria-label="${c.kind === 'q' ? 'Soal' : 'Jawaban'} ${keyOf(i)}">
        <span class="mm-tile-key">${keyOf(i)}</span>
        <span class="mm-tile-check" aria-hidden="true">${ic('check', 15, 3)}</span>
      </button>
    `;

    const slotHtml = kind => `
      <div class="mm-slot is-${kind}" id="mmSlot${kind.toUpperCase()}">
        <small>${label[kind]}</small>
        <p>${hint[kind]}</p>
      </div>
    `;

    shell(`
      <section class="kuis-play mm-play">

        ${playTop(lbl(MODE_LABELS.memory), -1, pairs.length)}

        <article class="kuis-question mm-card">
          <div class="mm-stats">
            <span class="kuis-chip">Langkah <b id="mmMoves">0</b></span>
            <span class="kuis-chip">Waktu <b id="mmTime">00:00</b></span>
          </div>

          <div class="mm-deck" aria-live="polite">
            ${slotHtml('q')}
            <span class="mm-vs" aria-hidden="true">${ico('link', 18)}</span>
            ${slotHtml('a')}
          </div>

          <div class="mm-zones" id="mmGrid">
            <section class="mm-zone">
              <h3 class="mm-zone-title">KARTU SOAL</h3>
              <div class="mm-grid">
                ${qCards.map((c, i) => tileHtml(c, i)).join('')}
              </div>
            </section>

            <section class="mm-zone is-a">
              <h3 class="mm-zone-title">KARTU JAWABAN</h3>
              <div class="mm-grid">
                ${aCards.map((c, i) => tileHtml(c, qCards.length + i)).join('')}
              </div>
            </section>
          </div>

          <p class="fc-tip">Ketuk satu kartu soal dan satu kartu jawaban. Isinya muncul di panel atas.</p>

          <ol class="mm-found" id="mmFound" hidden></ol>
        </article>

      </section>
    `);

    const grid = document.querySelector('#mmGrid');
    const movesEl = document.querySelector('#mmMoves');
    const timeEl = document.querySelector('#mmTime');
    const foundEl = document.querySelector('#mmFound');
    const slots = {
      q: document.querySelector('#mmSlotQ'),
      a: document.querySelector('#mmSlotA')
    };

    let sel = { q: null, a: null };
    let lock = false;
    let moves = 0;
    let matched = 0;
    let done = false;

    const started = Date.now();

    function updateProgress() {
      document.querySelector('#kuisBar').style.width = `${(matched / pairs.length) * 100}%`;
      document.querySelector('.kuis-play-count').innerHTML =
        `<b>${pad(matched)}</b> / ${pad(pairs.length)} pasangan`;
    }

    updateProgress();

    const timer = setInterval(() => {
      if (!timeEl.isConnected) {
        clearInterval(timer);
        return;
      }

      if (!done) timeEl.textContent = fmtTime(Date.now() - started);
    }, 500);

    function paintSlot(kind) {
      const tile = sel[kind];
      const el = slots[kind];

      el.classList.toggle('is-filled', Boolean(tile));

      if (!tile) {
        el.innerHTML = `<small>${label[kind]}</small><p>${hint[kind]}</p>`;
        return;
      }

      const i = Number(tile.dataset.i);
      el.innerHTML = `<small>${label[kind]} · ${keyOf(i)}</small><p>${e(cards[i].text)}</p>`;
    }

    function clearSlots() {
      sel = { q: null, a: null };
      paintSlot('q');
      paintSlot('a');
      slots.q.classList.remove('is-ok', 'is-bad');
      slots.a.classList.remove('is-ok', 'is-bad');
      lock = false;
    }

    function finish() {
      done = true;
      clearInterval(timer);

      const total = pairs.length;
      const elapsed = Date.now() - started;

      /* efisiensi: langkah sempurna = jumlah pasangan */
      const correct = Math.min(total, Math.round((total * total) / Math.max(moves, total)));
      const percent = Math.round((correct / total) * 100);

      if (examAdvance({ correct, total })) return;

      opts.cfg?.onResult?.({ correct, total });

      if (!opts.cfg) recordQuizResult({
        type: 'memory',
        correct: total,
        total,
        extra: { moves, mistakes: moves - total }
      });

      showGenericResult({
        eyebrow: 'HASIL COCOKKAN KARTU',
        title: 'Semua pasangan ditemukan',
        percent,
        ringLabel: 'efisiensi',
        stats: [
          { v: total, l: 'Pasangan' },
          { v: moves, l: 'Langkah' },
          { v: fmtTime(elapsed), l: 'Waktu' }
        ],
        retry: opts.cfg?.noRetry ? null : () => showMemory(opts)
      });
    }

    function resolve() {
      const tq = sel.q;
      const ta = sel.a;
      const cq = cards[Number(tq.dataset.i)];
      const ca = cards[Number(ta.dataset.i)];

      moves += 1;
      movesEl.textContent = moves;
      lock = true;

      if (cq.pid === ca.pid) {
        const color = COLORS[matched % COLORS.length];

        [tq, ta].forEach(t => {
          t.classList.remove('is-flipped');
          t.classList.add('is-matched');
          t.style.setProperty('--pair', color);
          t.disabled = true;
        });

        slots.q.classList.add('is-ok');
        slots.a.classList.add('is-ok');

        matched += 1;
        foundEl.hidden = false;
        foundEl.insertAdjacentHTML(
          'beforeend',
          `<li style="--pair:${color}"><b>${e(cq.text)}</b><span>${e(ca.text)}</span></li>`
        );
        updateProgress();

        if (matched === pairs.length) {
          done = true;
          setTimeout(finish, 900);
        } else {
          setTimeout(clearSlots, 750);
        }

        return;
      }

      [tq, ta].forEach(t => t.classList.add('is-miss'));
      slots.q.classList.add('is-bad');
      slots.a.classList.add('is-bad');

      setTimeout(() => {
        [tq, ta].forEach(t => t.classList.remove('is-flipped', 'is-miss'));
        clearSlots();
      }, 950);
    }

    grid.addEventListener('click', ev => {
      const tile = ev.target.closest('.mm-tile');

      if (!tile || lock || done) return;
      if (tile.classList.contains('is-matched')) return;

      const kind = cards[Number(tile.dataset.i)].kind;

      /* ketuk kartu yang sama lagi = batal pilih */
      if (sel[kind] === tile) {
        tile.classList.remove('is-flipped');
        sel[kind] = null;
        paintSlot(kind);
        return;
      }

      /* ganti pilihan di wilayah yang sama */
      sel[kind]?.classList.remove('is-flipped');
      sel[kind] = tile;
      tile.classList.add('is-flipped');
      paintSlot(kind);

      if (sel.q && sel.a) resolve();
    });

    document.onkeydown = event => {
      if (event.key === 'Escape') {
        clearInterval(timer);
        back();
      }
    };
  }
  /* ---------------------------------------------------------
     EXAM SIMULATOR & STUDY SPRINT
     Setup (checklist + jumlah + kesulitan) -> intro tiap bagian ->
     bagian dimainkan dengan mesin latihan yang sama -> hasil gabungan.
     Bedanya: Exam punya batas waktu (sesuai kesulitan), Sprint tidak.
     --------------------------------------------------------- */

  function showExamSetup(kind = 'exam') {
    stopExamTimer();
    exam = null;
    session = null;

    const isSprint = kind === 'sprint';
    const minTypes = isSprint ? SPRINT_MIN_TYPES : 1;
    const setup = defaultSetup(kind);
    const sizes = { ...setup.sizes };
      const levels = LEVEL_CHOICES;

    let level = levels.some(l => l.id === setup.level)
      ? setup.level
      : levels[isSprint ? 0 : 1].id;

    const copy = isSprint
      ? {
                    eyebrow: 'SPRINT BELAJAR',
          title: 'Susun sprintmu', 
          text: 'Pilih minimal 2 jenis latihan dan atur jumlah soal tiap bagiannya. Dikerjakan berurutan seperti ujian, tapi tanpa batas waktu.',
          start: 'Mulai sprint'
        }
      : {
                    eyebrow: 'SIMULASI UJIAN',
          title: 'Susun ujianmu',
          text: 'Centang bagian, atur jumlah soalnya, lalu pilih kesulitan. Makin sulit, makin ketat batas waktunya.',
          start: 'Mulai ujian'
        };

    const levelHint = id =>
      !isSprint
                ? `${EXAM_SECONDS[id]} dtk / butir`
        : id === 'campuran'
          ? 'Semua tingkat'
          : 'Fokus tingkat ini';

    const group = g =>
      EXAM_TYPES.filter(t => t.group === g)
        .map(
          t => `
            <label class="ex-item">
              <input type="checkbox" value="${t.id}" ${setup.types.includes(t.id) ? 'checked' : ''} />
              <span class="ex-box" aria-hidden="true">${ic('check', 14, 3)}</span>
              <span class="ex-icon" aria-hidden="true">${ico(t.icon, 20)}</span>
              <span class="ex-text">
                <b>${e(t.title)}</b>
                <small>${e(t.unit)} · ${e(t.desc)}</small>
              </span>
              <span class="ex-count" data-id="${t.id}">
                <button class="ex-step" data-d="-1" type="button" aria-label="Kurangi ${e(t.title)}">−</button>
                <b class="ex-num">${sizeFor(sizes, t.id)}</b>
                <button class="ex-step" data-d="1" type="button" aria-label="Tambah ${e(t.title)}">+</button>
              </span>
            </label>
          `
        )
        .join('');

    shell(`
      <section class="kuis-result ex-setup">

        <header class="kuis-heading">
          <span class="kuis-eyebrow">${copy.eyebrow}</span>
          <h1>${copy.title}</h1>
          <p>${copy.text}</p>
        </header>

        <div class="ex-toolbar">
          <span class="kuis-chip" id="exSummary"></span>

          <div class="ex-toolbar-actions">
            <button class="kuis-linkbtn" id="exAll" type="button">Pilih semua</button>
            <button class="kuis-linkbtn" id="exNone" type="button">Kosongkan</button>
          </div>
        </div>

        <div class="ex-group">
          <h3>${ico('zap', 16)}<span>Kesulitan</span></h3>
          <div class="ex-levels">
            ${levels
              .map(
                l => `
                  <label class="ex-level">
                    <input type="radio" name="exLevel" value="${l.id}" ${l.id === level ? 'checked' : ''} />
                    <b>${l.label}</b>
                    <small>${levelHint(l.id)}</small>
                  </label>
                `
              )
              .join('')}
          </div>
        </div>

        <div class="ex-group">
          <h3>${ico('edit', 16)}<span>Latihan</span></h3>
          <div class="ex-list">${group('latihan')}</div>
        </div>

        <div class="ex-group">
                    <h3>${ico('gamepad', 16)}<span>Permainan</span></h3>
          <div class="ex-list">${group('game')}</div>
        </div>

                <p class="fc-tip" id="exNote" hidden>Sprint Belajar butuh minimal ${SPRINT_MIN_TYPES} jenis latihan.</p>

        <div class="kuis-result-actions">
          
          <button class="kuis-primary" id="exStart" type="button">
            <span>${copy.start}</span>${ic('arrow', 16)}
          </button>
        </div>

      </section>
    `);

    const boxes = [...document.querySelectorAll('.ex-item input')];
    const summary = document.querySelector('#exSummary');
    const startBtn = document.querySelector('#exStart');
    const note = document.querySelector('#exNote');

    const sizeOf = id => sizeFor(sizes, id);

    const chosen = () =>
      EXAM_TYPES
        .filter(t => boxes.find(b => b.value === t.id)?.checked)
        .map(t => t.id);

    function sync() {
      const ids = chosen();
      const items = ids.reduce((sum, id) => sum + sizeOf(id), 0);

            let text = `<b>${ids.length}</b> bagian · <b>${items}</b> butir`;
      if (!isSprint) text += ` · batas waktu <b>${fmtTime(examLimitMs(ids, sizes, level))}</b>`;

      summary.innerHTML = text;

      const enough = ids.length >= minTypes;
      startBtn.disabled = !enough;
      note.hidden = !isSprint || enough;
    }

    boxes.forEach(b => b.addEventListener('change', sync));

    document.querySelectorAll('.ex-level input').forEach(r => {
      r.addEventListener('change', () => {
        if (!r.checked) return;
        level = r.value;
        sync();
      });
    });

    document.querySelectorAll('.ex-count').forEach(box => {
      const id = box.dataset.id;
      const out = box.querySelector('.ex-num');

      box.addEventListener('click', ev => {
        const btn = ev.target.closest('.ex-step');
        if (!btn) return;

        ev.preventDefault();
        sizes[id] = clampSize(id, sizeOf(id) + Number(btn.dataset.d));
        out.textContent = sizes[id];
        sync();
      });
    });

    document.querySelector('#exAll').addEventListener('click', () => {
      boxes.forEach(b => { b.checked = true; });
      sync();
    });

    document.querySelector('#exNone').addEventListener('click', () => {
      boxes.forEach(b => { b.checked = false; });
      sync();
    });

    startBtn.addEventListener('click', () => {
      const ids = chosen();
      if (ids.length < minTypes) return;

      startExam({
        kind,
        ids,
        sizes: Object.fromEntries(ids.map(id => [id, sizeOf(id)])),
        level
      });
    });


    document.onkeydown = event => {
      if (event.key === 'Escape') showMenu();
    };

    sync();
  }

  function startExam(setup) {
    exam = {
      kind: setup.kind,
      setup,
      stages: setup.ids,
      sizes: setup.sizes,
      level: setup.level,
      /* hanya Exam yang punya batas waktu */
      limitMs: setup.kind === 'exam' ? examLimitMs(setup.ids, setup.sizes, setup.level) : 0,
      idx: 0,
      results: [],
      startedAt: null /* diisi saat bagian pertama dimulai */
    };

    leaveThen(showExamIntro);
  }

  const examStage = () => EXAM_TYPES.find(t => t.id === exam.stages[exam.idx]);

  /* ---------- timer Exam ---------- */

  function stopExamTimer() {
    clearInterval(examTick);
    examTick = null;
  }

  /* Dipasang di nav tiap kali halaman dirender (lihat shell). */
  function mountExamTimer() {
    stopExamTimer();
    if (!exam?.limitMs) return;

    const nav = document.querySelector('.kuis-nav');
    if (!nav) return;

    const pill = document.createElement('div');
    pill.className = 'ex-timer';
    pill.setAttribute('role', 'timer');
    pill.innerHTML = `${ico('clock', 16)}<b>00:00</b><span>sisa</span>`;
    nav.insertBefore(pill, nav.querySelector('.kuis-nav-right'));

    const label = pill.querySelector('b');

    const paint = () => {
      if (!exam?.limitMs || !pill.isConnected) {
        stopExamTimer();
        return;
      }

      const left = exam.startedAt
        ? exam.startedAt + exam.limitMs - Date.now()
        : exam.limitMs;

      label.textContent = fmtTime(Math.ceil(Math.max(0, left) / 1000) * 1000);
      pill.classList.toggle('is-low', left <= exam.limitMs * 0.2);

      if (exam.startedAt && left <= 0) examTimeUp();
    };

    paint();
    examTick = setInterval(paint, 500);
  }

  /* Waktu habis: bagian yang sedang jalan dinilai sebagian (kalau berbasis sesi),
     sisanya dihitung salah, lalu langsung ke halaman hasil. */
  function examTimeUp() {
    if (!exam) return;

    stopExamTimer();
    document.onkeydown = null;

    for (let k = exam.idx; k < exam.stages.length; k += 1) {
      const stage = EXAM_TYPES.find(t => t.id === exam.stages[k]);
      const partial = k === exam.idx && session?.exam;

      exam.results.push({
        id: stage.id,
        title: stage.title,
        icon: stage.icon,
        correct: partial ? session.score : 0,
        total: partial ? session.items.length : sizeFor(exam.sizes, stage.id),
        skipped: false,
        timeout: true
      });
    }

    exam.idx = exam.stages.length;
    session = null;

    showNotice('Waktu habis!');
    showExamResult();
  }

  function showExamIntro() {
    const stage = examStage();
    const n = exam.stages.length;
    const size = sizeFor(exam.sizes, stage.id);

    const timeNote =
      exam.limitMs && !exam.startedAt
        ? ` Waktu total ${fmtTime(exam.limitMs)} mulai berjalan saat kamu menekan tombol di bawah.`
        : '';

    shell(`
      <section class="kuis-result ex-intro">

        <header class="kuis-heading">
          <span class="kuis-eyebrow">BAGIAN ${exam.idx + 1} DARI ${n}</span>
          <h1>${e(stage.title)}</h1>
          <p>${e(stage.desc)} (${size} ${stage.unit}).${e(timeNote)}</p>
        </header>

        <ol class="ex-steps">
          ${exam.stages
            .map((id, k) => {
              const t = EXAM_TYPES.find(x => x.id === id);
              const state = k < exam.idx ? 'is-done' : k === exam.idx ? 'is-now' : '';

              return `
                <li class="${state}">
                  <span class="ex-step-dot">${k < exam.idx ? ic('check', 12, 3) : k + 1}</span>
                  <span>${e(t.title)} · ${sizeFor(exam.sizes, id)} ${e(t.unit)}</span>
                </li>
              `;
            })
            .join('')}
        </ol>

        <div class="kuis-result-actions">
         
          <button class="kuis-primary" id="exGo" type="button">
            <span>Mulai bagian ini</span>${ic('arrow', 16)}
          </button>
        </div>

      </section>
    `);



    document.querySelector('#exGo').addEventListener('click', () => {
      /* jam Exam mulai jalan di klik pertama */
      if (!exam.startedAt) exam.startedAt = Date.now();
      leaveThen(() => runStage(stage.id));
    });

    document.querySelector('#exGo').focus({ preventScroll: true });

    document.onkeydown = event => {
      if (event.key === 'Escape') back();
    };
  }

  /* Dipanggil tiap mode saat selesai. Mengembalikan true kalau sedang ujian/sprint
     (mode tidak perlu menampilkan halaman hasilnya sendiri). */
  function examAdvance(result) {
    if (!exam) return false;

    const stage = examStage();

    exam.results.push({
      id: stage.id,
      title: stage.title,
      icon: stage.icon,
      correct: result.correct,
      total: result.total,
      skipped: Boolean(result.skipped)
    });

    exam.idx += 1;
    session = null; /* supaya penilaian sebagian saat waktu habis tidak membaca sesi lama */

    if (exam.idx >= exam.stages.length) showExamResult();
    else showExamIntro();

    return true;
  }

  function runStage(id) {
    const size = sizeFor(exam.sizes, id);
    const level = exam.level;

    const base = () => ({ exam: true, index: 0, score: 0, results: [] });

    /* set item siap pakai untuk Flashcards */
    const asItems = list =>
      list.map(q => ({
        category: categoryOf(q),
        text: q.text,
        answer: q.options[q.answer]
      }));

    switch (id) {
      case 'abcd':
        session = {
          ...base(),
          mode: 'custom',
          label: 'Pilihan Ganda',
          items: pickByLevel(QUESTION_BANK, size, level).map(q =>
            prepareItem({ ...q, category: categoryOf(q) })
          )
        };
        showQuestion();
        return;

      case 'ketik':
        session = {
          ...base(),
          mode: 'ketik',
          items: pickByLevel(typableBank(), size, level).map(q =>
            typingItem({ ...q, category: categoryOf(q) })
          )
        };
        showTypingQuestion();
        return;

      case 'tf':
        session = {
          ...base(),
          mode: 'tf',
          items: buildTrueFalse(pickByLevel(QUESTION_BANK, size, level))
        };
        showQuestion();
        return;

      case 'blank':
        if (BLANK_BANK.length < 3) {
          examAdvance({ correct: 0, total: 0, skipped: true });
          return;
        }

        session = {
          ...base(),
          mode: 'blank',
          items: shuffle(BLANK_BANK).slice(0, size).map(blankItem)
        };
        showTypingQuestion();
        return;

      case 'match':
        showMatching({ pairs: size });
        return;

      case 'order':
        showOrder({ size });
        return;

      case 'flash':
        showFlashcards({
          exam: true,
          noRetry: true,
          generated: { items: asItems(pickByLevel(QUESTION_BANK, size, level)) }
        });
        return;

      case 'peta': {
        /* utamakan wilayah yang soalnya cukup untuk jumlah yang diminta */
        const fit = REGIONS.filter(rg => regionPool(rg).length >= size);
        const region = shuffle(fit.length ? fit : REGIONS.filter(rg => regionPool(rg).length))[0];

        if (!region) {
          examAdvance({ correct: 0, total: 0, skipped: true });
          return;
        }

        session = {
          ...base(),
          mode: 'custom',
          label: `Peta · ${region.name}`,
          items: pickByLevel(regionPool(region), size, level).map(q =>
            prepareItem({ ...q, category: categoryOf(q) })
          )
        };
        showQuestion();
        return;
      }

      case 'memory':
        showMemory({ pairs: size });
        return;

      case 'tts':
        showCrossword({
          exam: true,
          noRetry: true,
          type: 'tts',
          count: size,
          generated: {
            items: pickByLevel(crosswordEntries(), size + 8, level).map(en => ({
              category: en.category,
              text: en.clue,
              answer: en.answer
            }))
          }
        });
        return;

      default:
        examAdvance({ correct: 0, total: 0, skipped: true });
    }
  }

  function showExamResult() {
    stopExamTimer();

    const rows = exam.results;
    const counted = rows.filter(x => x.total > 0);

    const correct = counted.reduce((s, x) => s + x.correct, 0);
    const total = counted.reduce((s, x) => s + x.total, 0);
    const wrong = total - correct;
    const percent = total ? Math.round((correct / total) * 100) : 0;
    const elapsed = Date.now() - (exam.startedAt ?? Date.now());

    const setup = exam.setup;
    const isSprint = exam.kind === 'sprint';
    const timedOut = rows.some(x => x.timeout);
    const limitMs = exam.limitMs;

        /* matikan pil timer supaya tidak ikut tampil di halaman hasil */
    exam.limitMs = 0;

    /* catat ke achievement */
    const def = defaultSetup(exam.kind);

    recordExamResult({
      kind: exam.kind,
      level: exam.level,
      correct,
      total,
      timedOut,
      stages: rows.map(x => ({
        id: x.id,
        correct: x.correct,
        total: x.total,
        skipped: Boolean(x.skipped)
      })),
      isDefault:
        exam.level === def.level &&
        exam.stages.length === def.types.length &&
        exam.stages.every(
          id => def.types.includes(id) && sizeFor(exam.sizes, id) === sizeFor(def.sizes, id)
        ),
      signature: `${exam.stages.join(',')}|${exam.stages
        .map(id => sizeFor(exam.sizes, id))
        .join(',')}|${exam.level}`
    });

    let grade = 'Perlu belajar lagi';
    if (percent >= 85) grade = 'Sangat baik';
    else if (percent >= 70) grade = 'Baik';
    else if (percent >= 50) grade = 'Cukup';

    shell(`
      <section class="kuis-result ex-result">

        <header class="kuis-heading">
          <span class="kuis-eyebrow">HASIL ${isSprint ? 'SPRINT' : 'UJIAN'}</span>
          <h1>${timedOut ? 'Waktu habis' : e(grade)}</h1>
          <p>${
            timedOut
              ? 'Bagian yang belum selesai dihitung dari jawaban yang sempat kamu kerjakan.'
              : e(praise(percent))
          }</p>
        </header>

        <div class="kuis-score">
          <div class="kuis-ring" style="--pct:${percent}">
            <div class="kuis-ring-inner">
              <b>${percent}</b>
              <span>nilai</span>
            </div>
          </div>

          <div class="kuis-stats">
            <div class="kuis-stat"><b>${correct}</b><span>Benar</span></div>
            <div class="kuis-stat"><b>${wrong}</b><span>Salah</span></div>
            <div class="kuis-stat">
              <b>${fmtTime(limitMs ? Math.min(elapsed, limitMs) : elapsed)}</b>
              <span>Waktu${limitMs ? ` / ${fmtTime(limitMs)}` : ''}</span>
            </div>
          </div>
        </div>

        <section class="ex-breakdown">
          <h3>Rincian per bagian</h3>

          <div class="ex-rows">
            ${rows
              .map(x => {
                const pct = x.total ? Math.round((x.correct / x.total) * 100) : 0;

                return `
                  <div class="ex-row ${x.skipped ? 'is-skipped' : ''}">
                    <span class="ex-row-icon" aria-hidden="true">${ico(x.icon, 18)}</span>

                    <div class="ex-row-main">
                      <div class="ex-row-top">
                        <b>${e(x.title)}</b>
                        <span>${
                          x.skipped
                            ? 'Dilewati'
                            : `${x.correct} / ${x.total}${x.timeout ? ' · waktu habis' : ''}`
                        }</span>
                      </div>

                      <div class="kuis-bar"><span style="width:${x.skipped ? 0 : pct}%"></span></div>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </section>

        <div class="kuis-result-actions">

          <button class="kuis-primary" id="exRetry" type="button">${isSprint ? 'Ulangi sprint' : 'Ulangi ujian'}</button>
        </div>

      </section>
    `);

    /* selesai: status dibersihkan supaya tombol keluar tidak minta konfirmasi */
    exam = null;


    document.querySelector('#exRetry').addEventListener('click', () => startExam(setup));

    document.onkeydown = event => {
      if (event.key === 'Escape') back();
    };
  }

  /* ---------------------------------------------------------
     HALAMAN HASIL (Quick, Full, Ketik, T/F, Blank, Kustom)
     --------------------------------------------------------- */

  function showResult() {
    if (session.mode === 'pretest' || session.mode === 'posttest') {
      showTestResult();
      return;
    }
    if (session.mode === 'peta') {
      showPetaResult();
      return;
    }

    const total = session.items.length;
    const correct = session.score;
    const wrong = total - correct;
    const percent = Math.round((correct / total) * 100);
    const wrongList = session.results.filter(r => !r.isCorrect);
    const mode = session.mode;
    const cfg = session.custom || null;

    /* Mode ujian: laporkan skor lalu lanjut ke bagian berikutnya */
    if (session.exam && examAdvance({ correct, total })) return;

    /* Latihan kustom dari Tools tidak dihitung untuk achievement
       (supaya tidak bisa di-farm dengan kuis 3 soal). */
    if (!cfg) {
      if (mode === 'short' || mode === 'all') {
        const perDarsana = {};

        session.results.forEach(r => {
          const id = (r.category || '').toLowerCase();
          if (!DARSANA_IDS.includes(id)) return;

          perDarsana[id] ??= { correct: 0, total: 0 };
          perDarsana[id].total += 1;
          if (r.isCorrect) perDarsana[id].correct += 1;
        });

        recordQuizResult({
          type: mode === 'short' ? 'quick' : 'full',
          correct,
          total,
          perDarsana
        });
      }

            if (mode === 'ketik') {
        recordQuizResult({
          type: 'ketik',
          correct,
          total,
          extra: {
            hints: session.hints || 0,
            exact: session.results.filter(r => r.exact).length
          }
        });
      }

      if (mode === 'tf' || mode === 'blank') {
        recordQuizResult({ type: mode, correct, total });
      }
    }

    /* kirim skor ke riwayat Studio (kalau dari Tools) */
    cfg?.onResult?.({ correct, total });

    shell(`
      <section class="kuis-result">

        <header class="kuis-heading">
          <span class="kuis-eyebrow">HASIL KUIS</span>
          <h1>${MODE_LABELS[mode] || 'Kuis'} selesai</h1>
          <p>${praise(percent)}</p>
        </header>

        <div class="kuis-score">
          <div class="kuis-ring" style="--pct:${percent}">
            <div class="kuis-ring-inner">
              <b>${percent}</b>
              <span>skor</span>
            </div>
          </div>

          <div class="kuis-stats">
            <div class="kuis-stat">
              <b>${correct}</b>
              <span>Benar</span>
            </div>
            <div class="kuis-stat">
              <b>${wrong}</b>
              <span>Salah</span>
            </div>
            <div class="kuis-stat">
              <b>${total}</b>
              <span>Total soal</span>
            </div>
          </div>
        </div>

        ${reviewHtml(wrongList)}

        <div class="kuis-result-actions">

          ${cfg?.noRetry ? '' : '<button class="kuis-primary" id="kuisRetry" type="button">Ulangi (soal diacak ulang)</button>'}
        </div>

      </section>
    `);

 

    document.querySelector('#kuisRetry')?.addEventListener('click', () => {
      if (cfg) startCustom(cfg);
      else startSession(mode);
    });

    document.onkeydown = event => {
      if (event.key === 'Escape') back();
    };
  }

  /* ---------------------------------------------------------
     HASIL TANTANGAN WILAYAH PETA
     --------------------------------------------------------- */

  function showTestResult() {
    const isPost = session.mode === 'posttest';
    const total = session.items.length;
    const correct = session.score;
    const wrong = total - correct;
    const percent = Math.round((correct / total) * 100);
    const before = getPretest(); /* dibaca SEBELUM menyimpan hasil baru */
    const wrongList = session.results.filter(r => !r.isCorrect);

        saveTest(isPost ? POSTTEST_KEY : PRETEST_KEY, {
      correct,
      total,
      percent,
      date: Date.now()
    });

    if (isPost) recordPosttestResult({ correct, total });
    else recordPretestResult({ correct, total });

    const delta = isPost && before ? percent - before.percent : null;

    let message;
    if (!isPost) {
      message = 'Ini titik awalmu. Semua menu belajar sekarang terbuka, selamat belajar.';
    } else if (delta === null) {
      message = praise(percent);
    } else if (delta > 0) {
      message = `Nilaimu naik ${delta} poin dari Pre-Test. Belajarmu terbayar.`;
    } else if (delta === 0) {
      message = 'Nilaimu sama dengan Pre-Test. Ulangi materi lalu coba lagi.';
    } else {
      message = 'Nilaimu di bawah Pre-Test. Pelajari lagi materinya, lalu coba lagi.';
    }

    const third =
      delta === null
        ? { v: total, l: 'Total soal' }
        : { v: `${delta > 0 ? '+' : ''}${delta}`, l: 'Selisih vs Pre-Test' };

    shell(`
      <section class="kuis-result">

        <header class="kuis-heading">
          <span class="kuis-eyebrow">HASIL ${isPost ? 'POST-TEST' : 'PRE-TEST'}</span>
          <h1>${isPost ? 'Post-Test selesai' : 'Pre-Test selesai'}</h1>
          <p>${e(message)}</p>
        </header>

        <div class="kuis-score">
          <div class="kuis-ring" style="--pct:${percent}">
            <div class="kuis-ring-inner">
              <b>${percent}</b>
              <span>skor</span>
            </div>
          </div>

          <div class="kuis-stats">
            <div class="kuis-stat"><b>${correct}</b><span>Benar</span></div>
            <div class="kuis-stat"><b>${wrong}</b><span>Salah</span></div>
            <div class="kuis-stat"><b>${e(third.v)}</b><span>${e(third.l)}</span></div>
          </div>
        </div>

        ${isPost ? reviewHtml(wrongList) : ''}

        <div class="kuis-result-actions">
          <button class="kuis-primary" id="kuisTestDone" type="button">
            ${isPost ? (fromProfileTest ? 'Kembali ke profil' : 'Kembali ke menu kuis') : 'Masuk ke dashboard'}
          </button>
        </div>

      </section>
    `);

    document.querySelector('#kuisTestDone').addEventListener('click', () => {
      if (isPost && !fromProfileTest) showMenu();
      else exit();
    });

    document.onkeydown = event => {
      if (event.key !== 'Escape') return;

      if (isPost && !fromProfileTest) showMenu();
      else exit();
    };
  }

  function showPetaResult() {
    const index = session.regionIndex;
    const region = REGIONS[index];
    const next = REGIONS[index + 1];

    const total = session.items.length;
    const correct = session.score;
    const wrong = total - correct;
    const percent = Math.round((correct / total) * 100);
    const need = Math.max(1, Math.ceil(total * MAP_PASS_RATIO));
    const passed = correct >= need;
    const stars = passed ? (percent === 100 ? 3 : percent >= 80 ? 2 : 1) : 0;
    const wrongList = session.results.filter(r => !r.isCorrect);

    /* Simpan progres (bintang tertinggi dipertahankan) */
    const map = loadMap();
    const before = map.regions[region.id] || { stars: 0, best: 0, tries: 0 };
    const firstConquest = passed && before.stars === 0;

    map.regions[region.id] = {
      stars: Math.max(before.stars, stars),
      best: Math.max(before.best, correct),
      tries: before.tries + 1
    };

    saveMap(map);

    recordPetaResult({
      regionId: region.id,
      correct,
      total,
      stars
    });

    const allDone = conqueredCount(map) === REGIONS.length;

    let title;
    let message;

    if (passed) {
      title = `${region.name} ditaklukkan`;

      if (allDone && firstConquest) {
        message = 'Seluruh materi sudah kamu taklukkan. Perjalananmu menuju Moksa lengkap.';
      } else if (next && firstConquest) {
        message = `Wilayah ${next.name} kini terbuka.`;
      } else {
        message = stars === 3
          ? 'Sempurna. Tiga bintang untuk wilayah ini.'
          : 'Kamu menguasai wilayah ini. Coba lagi untuk mengejar tiga bintang.';
      }
    } else {
      title = `${region.name} belum ditaklukkan`;
      message = `Butuh minimal ${need} jawaban benar. Pelajari lagi materi ${region.name}, lalu coba kembali.`;
    }

        /* tombol Kembali di kiri atas kembali ke peta */
    pageBack = showMap;

    const primaryHtml =
      passed && next
        ? `<span>Lanjut ke ${e(next.name)}</span>${ic('arrow', 16)}`
        : passed
          ? 'Lihat peta'
          : 'Coba lagi';

    shell(`
      <section class="kuis-result">

        <header class="kuis-heading">
          <span class="kuis-eyebrow">HASIL TANTANGAN</span>
          <h1>${e(title)}</h1>
          <p>${e(message)}</p>
        </header>

        <div class="kuis-score">
          <div class="kuis-ring" style="--pct:${percent}">
            <div class="kuis-ring-inner">
              <b>${percent}</b>
              <span>skor</span>
            </div>
          </div>

          <div class="kuis-stats">
            <div class="kuis-stat">
              <b>${correct}</b>
              <span>Benar</span>
            </div>
            <div class="kuis-stat">
              <b>${wrong}</b>
              <span>Salah</span>
            </div>
            <div class="kuis-stat">
              <div class="kuis-stars kuis-stars-sm">${starsHtml(stars)}</div>
              <span>Bintang</span>
            </div>
          </div>
        </div>

        ${reviewHtml(wrongList)}

        <div class="kuis-result-actions">
          <button class="kuis-primary" id="kuisPetaNext" type="button">${primaryHtml}</button>
        </div>

      </section>
    `);



    document.querySelector('#kuisPetaNext').addEventListener('click', () => {
      if (passed && next) startRegion(index + 1);
      else if (passed) showMap();
      else startRegion(index);
    });

    document.onkeydown = event => {
      if (event.key === 'Escape') showMap();
    };
  }

  /* ---------------------------------------------------------
     MULAI
     --------------------------------------------------------- */

  recordQuizOpened();

  if (custom && (QUESTION_BANK.length || generatedItems(custom).length)) startCustom(custom);
  else if (startAt === 'peta' && QUESTION_BANK.length) showMap();
  else if (startAt === 'pretest' && QUESTION_BANK.length) startSession('pretest');
  else if (startAt === 'posttest' && QUESTION_BANK.length) startSession('posttest');
  else showMenu();
}