import { getApp } from '../main.js';
import { ic, icons } from './icons.js';
import { renderProfile } from './profile.js';

/* ==========================================================
   ACHIEVEMENT SYSTEM — DHARMALEARN (200 achievement)
   ----------------------------------------------------------
   Achievement hanya terbuka kalau fiturnya MENCATAT lewat fungsi
   record* di bawah. Semua fungsi record* mengembalikan array
   achievement yang baru terbuka dan otomatis menampilkan notifikasi.

   BELAJAR
     recordSlideOpened(i)  recordSlideDone(i)
     recordSummaryRead('singkat' | 'lengkap')
     recordConceptMapOpened()  recordConceptBranch(id)
     recordAudioPlayed(id)  recordAudioFinished(id)
     recordVideoPlayed(id)  recordVideoFinished(id)
     recordGlossaryOpened()  recordGlossaryTerm(termId)
   LATIHAN
     recordQuizOpened()
     recordQuizResult({ type, correct, total, extra })
        type: quick | full | ketik | tf | blank | flash | tts | match | memory
     recordPetaOpened()  recordPetaResult({ regionId, correct, total, stars })
     recordExamResult({ kind: 'exam' | 'sprint', ... })
     recordPretestResult({ correct, total, set })
     recordPosttestResult({ correct, total, set })
   ADVANCED TOOLS
     recordChatOpened()  recordChatMessage({ topic })  recordChatTried()
     recordStudioOpened()  recordStudioCreated({ type })  recordStudioCompleted()
     recordProfileCompleted()  recordProfileEdited()
     recordAvatarPhoto()  recordAvatarColor()
     recordShare()  recordEasterEgg(id)

   Halaman: renderAchievement({ onBack, name, anonymous })
   Ikon grup (field `icon`) = nama ikon dari icons.js.
   ========================================================== */

const STORAGE_KEY = 'dharmalearn_achievements_v3';
const V2_STORAGE_KEY = 'dharmalearn_achievements_v2';
const LEGACY_STORAGE_KEY = 'dharmalearn_achievements_v1';

/* ----------------------------------------------------------
   KONFIGURASI — sesuaikan dengan isi aplikasimu
   ---------------------------------------------------------- */

export const MATERI_SLIDE_COUNT = 36;

/* ISI: indeks slide (mulai dari 0) yang menjadi slide PERTAMA tiap bagian
   materi. Dipakai achievement #6. Contoh: [0, 4, 10, 16, 22, 28, 33] */
const SLIDE_SECTION_STARTS = [0];

/* ISI: jumlah audio, video, dan easter egg yang benar-benar ada */
const AUDIO_TOTAL = 1;
const VIDEO_TOTAL = 1;
const EASTER_EGG_TOTAL = 3;

const GLOSSARY_TOTAL = 117;

/* Dipanggil belajar.js sekali saat dimuat.
   - Mengisi awal tiap bagian materi (achievement #6).
   - Memperingatkan di Console kalau angka di file ini tidak cocok dengan data asli. */
export function configureMateri({ slideCount, sectionStarts, glossaryTotal } = {}) {
  if (Array.isArray(sectionStarts) && sectionStarts.length) {
    SLIDE_SECTION_STARTS.splice(0, SLIDE_SECTION_STARTS.length, ...sectionStarts);
  }

  if (slideCount && slideCount !== MATERI_SLIDE_COUNT) {
    console.warn(
      `[Achievement] Slide asli ${slideCount}, tapi MATERI_SLIDE_COUNT = ${MATERI_SLIDE_COUNT}. ` +
        `Ubah MATERI_SLIDE_COUNT jadi ${slideCount}, kalau tidak slide ke-${MATERI_SLIDE_COUNT}+ tidak tercatat.`
    );
  }

  if (glossaryTotal && glossaryTotal !== GLOSSARY_TOTAL) {
    console.warn(
      `[Achievement] Glosarium asli ${glossaryTotal} istilah, tapi GLOSSARY_TOTAL = ${GLOSSARY_TOTAL}. ` +
        `Ubah GLOSSARY_TOTAL jadi ${glossaryTotal}.`
    );
  }
}

/* Dipanggil kuis.js sekali saat dimuat. Hanya memperingatkan di Console. */
export function configureKuis({ bankSize = 0, regionSizes = {} } = {}) {
  if (bankSize < 50) {
    console.warn(
      `[Achievement] Bank soal cuma ${bankSize}. Kuis Maraton butuh 50 soal, jadi #53 dan #57 mustahil.`
    );
  }

  Object.entries(regionSizes).forEach(([id, n]) => {
    if (n < PETA_QUESTIONS) {
      console.warn(
        `[Achievement] Wilayah peta "${id}" cuma punya ${n} soal (butuh ${PETA_QUESTIONS}). ` +
          'Wilayah ini tidak bisa dapat 10/10, jadi #108-110 terhambat.'
      );
    }
  });
}

export const DARSANA_IDS = [
  'nyaya',
  'vaiseshika',
  'samkhya',
  'yoga',
  'mimamsa',
  'vedanta'
];

/* ISI kalau peta konsep punya cabang lain di luar enam Darsana.
   Id cabang harus sama dengan yang dikirim ke recordConceptBranch(). */
const CONCEPT_BRANCHES = [...DARSANA_IDS];

/* Urutan wilayah Game Peta (sama dengan REGIONS di kuis.js) */
export const PETA_REGION_IDS = [
  'pengertian',
  'sad',
  'nyaya',
  'vaiseshika',
  'samkhya',
  'yoga',
  'mimamsa',
  'vedanta'
];

const REGION_COUNT = PETA_REGION_IDS.length;
const PETA_MAX_STARS = REGION_COUNT * 3;
const PETA_QUESTIONS = 10; /* soal per wilayah */

/* Jenis latihan di Sprint Belajar / Simulasi Ujian (id = EXAM_TYPES di kuis.js) */
const PRACTICE_TYPES = ['abcd', 'ketik', 'tf', 'blank', 'match', 'flash', 'memory', 'tts'];

/* Level Simulasi Ujian. Hapus 'campuran' kalau patch B10 tidak dipasang. */
const EXAM_LEVELS = ['mudah', 'sedang', 'sulit', 'campuran'];

/* Memory Match: di spec "langkah" = satu kartu dibuka, di game satu giliran
   membuka 2 kartu. 18 kartu = 9 giliran, 12 kartu = 6 giliran.
   PERINGATAN: 6 giliran = tanpa satu pun salah tebak (peluang sangat kecil).
   Saran agar bisa dicapai: MEMORY_MAX_MOVES_FRUGAL = 8 dan
   MEMORY_PERFECT_MAX_MISTAKES = 2. */
const MEMORY_MAX_MOVES_EFFICIENT = 9;
const MEMORY_MAX_MOVES_FRUGAL = 6;
const MEMORY_PERFECT_MAX_MISTAKES = 0;

/* Semua mode latihan dan permainan (achievement #191 dan #197) */
const ALL_MODES = [
  'quick', 'full', 'ketik', 'tf', 'blank', 'flash',
  'peta', 'match', 'memory', 'tts', 'sprint', 'exam'
];

/* Jenis sesi yang tersimpan di attempts */
const MODE_KEYS = ['quick', 'full', 'ketik', 'tf', 'blank', 'flash', 'tts', 'match', 'memory'];

/* "Kuis" untuk achievement bersyarat skor kuis (#16, #20, #33) */
const QUIZ_KEYS = ['quick', 'full', 'ketik', 'tf', 'blank'];

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* ----------------------------------------------------------
   PENYIMPANAN
   Sekarang: localStorage. Kalau nanti pindah ke Supabase,
   cukup ganti loadProgress() dan saveProgress().
   ---------------------------------------------------------- */

function emptyProgress() {
  return {
    materiOpened: false,
    materiCompleted: false,
    darsanaDone: [],

    /* slide */
    slidesDone: [], /* gabungan semua slide yang pernah selesai */
    slidesOpened: [],
    slidePass: [], /* slide selesai pada putaran yang sedang berjalan */
    slidePasses: 0, /* berapa kali seluruh slide diselesaikan */
    slideReopened: [], /* slide dibuka lagi setelah putaran pertama selesai */
    slideSkipped: false, /* melompati slide pada putaran pertama */

    /* belajar lainnya */
    summaries: { singkat: 0, lengkap: 0 },
    conceptMapOpened: false,
    conceptBranches: [],
    audioPlayed: [],
    audioFinished: {},
    videoPlayed: [],
    videoFinished: {},
    glossaryOpened: false,
    glossaryTerms: [],

    /* latihan */
    quizOpened: false,
    petaOpened: false,
    attempts: [],
    petaAttempts: [],
    sprints: [],
    exams: [],
    pretests: [],
    posttests: [],

    /* advanced tools */
    chat: { opened: false, messages: 0, topics: [], tried: false },
    studio: { opened: false, created: 0, types: [], completed: 0 },
    profile: { complete: false, edited: false, photo: false, color: false },
    shares: [],
    eggs: [],
    progressViewed: false,

    unlocked: {}
  };
}

const LIST_KEYS = [
  'darsanaDone', 'slidesDone', 'slidesOpened', 'slidePass', 'slideReopened',
  'conceptBranches', 'audioPlayed', 'videoPlayed', 'glossaryTerms',
  'attempts', 'petaAttempts', 'sprints', 'exams', 'pretests', 'posttests',
  'shares', 'eggs'
];

const MAP_KEYS = ['audioFinished', 'videoFinished', 'unlocked'];
const GROUP_KEYS = ['summaries', 'chat', 'studio', 'profile'];

function mergeProgress(raw) {
  const base = emptyProgress();
  const merged = { ...base, ...raw };

  GROUP_KEYS.forEach((key) => {
    merged[key] = { ...base[key], ...(raw?.[key] || {}) };
  });

  LIST_KEYS.forEach((key) => {
    if (!Array.isArray(merged[key])) merged[key] = base[key];
  });

  MAP_KEYS.forEach((key) => {
    const value = merged[key];
    if (!value || typeof value !== 'object' || Array.isArray(value)) merged[key] = {};
  });

  return merged;
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return mergeProgress(JSON.parse(raw));

    /* v2 -> v3: nomor achievement berubah. Statistik dipertahankan,
       daftar terbuka dihitung ulang (diam-diam, tanpa notifikasi). */
    const v2 = localStorage.getItem(V2_STORAGE_KEY);

    if (v2) {
      const migrated = mergeProgress({ ...JSON.parse(v2), unlocked: {} });
      evaluate(migrated);
      saveProgress(migrated);
      return migrated;
    }

    /* Migrasi dari v1: riwayat kuis dipertahankan, achievement dihitung ulang
       (nomor achievement lama berbeda artinya dengan yang baru). */
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);

    if (legacy) {
      const old = JSON.parse(legacy);

      return mergeProgress({
        quizOpened: Boolean(old.quizOpened),
        attempts: Array.isArray(old.attempts) ? old.attempts : [],
        petaAttempts: (Array.isArray(old.petaAttempts) ? old.petaAttempts : []).filter(
          (a) => a.total >= PETA_QUESTIONS
        )
      });
    }
  } catch {
    /* data rusak: mulai dari awal */
  }

  return emptyProgress();
}

function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    /* penyimpanan penuh / diblokir: abaikan */
  }
}

/* ----------------------------------------------------------
   HELPER PERHITUNGAN
   ---------------------------------------------------------- */

const addUnique = (list, value) => {
  if (!list.includes(value)) list.push(value);
};

const maxOf = (values) => values.reduce((max, v) => Math.max(max, v), 0);

const scoreOf = (attempt) =>
  attempt.total > 0 ? (attempt.correct / attempt.total) * 100 : 0;

const isPerfect = (attempt) =>
  attempt.total > 0 && attempt.correct === attempt.total;

const byType = (attempts, type) =>
  attempts.filter((a) => a.type === type);

const countWhere = (list, predicate) =>
  list.filter((a) => predicate(scoreOf(a))).length;

const anyWhere = (list, predicate) =>
  list.some((a) => predicate(scoreOf(a)));

/* Urutan berturut-turut terpanjang yang memenuhi syarat */
function longestStreak(list, predicate) {
  let best = 0;
  let current = 0;

  for (const attempt of list) {
    if (predicate(scoreOf(attempt))) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }

  return best;
}

/* Dua percobaan berurutan dengan kenaikan skor minimal `minGain` poin */
function consecutiveGain(list, minGain) {
  for (let i = 1; i < list.length; i++) {
    const gain = scoreOf(list[i]) - scoreOf(list[i - 1]);
    if (gain > 0 && gain >= minGain) return true;
  }

  return false;
}

/* Jumlah semua soal yang dijawab / dijawab benar */
function totals(attempts) {
  return attempts.reduce(
    (sum, a) => ({
      answered: sum.answered + a.total,
      correct: sum.correct + a.correct
    }),
    { answered: 0, correct: 0 }
  );
}

/* Pretest dan post-test yang setara (set sama) dengan kenaikan >= 20 poin */
function hasPrePostGain(p) {
  return p.pretests.some((pre) =>
    p.posttests.some(
      (post) =>
        (post.set || 'default') === (pre.set || 'default') &&
        scoreOf(post) - scoreOf(pre) >= 20
    )
  );
}

/* ---------- Game Peta ---------- */

const bestStarsOf = (list) =>
  Math.min(3, list.reduce((max, a) => Math.max(max, a.stars || 0), 0));

const isPetaPerfect = (a) => isPerfect(a) && a.total >= PETA_QUESTIONS;

function buildPeta(attempts) {
  const byRegion = {};
  PETA_REGION_IDS.forEach((id) => (byRegion[id] = []));
  attempts.forEach((a) => byRegion[a.regionId]?.push(a));

  const lists = PETA_REGION_IDS.map((id) => byRegion[id]);
  const best = lists.map(bestStarsOf);
  const sum = totals(attempts);

  return {
    attempts,
    stars: best.reduce((total, s) => total + s, 0),
    conquered: best.filter((s) => s > 0).length,
    threeStar: best.filter((s) => s >= 3).length,
    perfect: lists.filter((list) => list.some(isPetaPerfect)).length,
    answered: sum.answered,
    correct: sum.correct
  };
}

/* ---------- Sprint & Ujian ---------- */

const sprintStages = (s) => s.stages.filter((x) => !x.skipped && x.total > 0);

const isSprintPerfect = (s) => {
  const stages = sprintStages(s);
  return stages.length > 0 && stages.every(isPerfect);
};

const levelCount = (list, level) => list.filter((x) => x.level === level).length;

/* ----------------------------------------------------------
   DEFINISI ACHIEVEMENT
   check(ctx)    -> true jika syarat terpenuhi
   progress(ctx) -> { value, target } (opsional, untuk bar progres)
   ---------------------------------------------------------- */

/* Achievement berbasis angka: otomatis punya check + progress */
const count = (get, target) => ({
  check: (ctx) => get(ctx) >= target,
  progress: (ctx) => ({ value: Math.min(get(ctx), target), target })
});

const sessions = (key, n) => count((c) => c[key].length, n);
const perfectOnce = (key) => (c) => c[key].some(isPerfect);
const scoreAtLeast = (key, min) => (c) => anyWhere(c[key], (s) => s >= min);
const manyAtLeast = (key, min, n) => count((c) => countWhere(c[key], (s) => s >= min), n);
const streakOf = (key, min, n) => count((c) => longestStreak(c[key], (s) => s >= min), n);
const correctTotal = (key, n) => count((c) => totals(c[key]).correct, n);

export const TIER_LABEL = {
  bronze: 'Perunggu',
  silver: 'Perak',
  gold: 'Emas',
  legend: 'Legenda'
};

const N = MATERI_SLIDE_COUNT;

export const GROUPS = [
  /* ================= SECTION 1: BELAJAR ================= */
  {
    id: '1A',
    title: 'Belajar · Slide Materi',
    icon: 'book',
    items: [
      { id: 1, title: 'Langkah Pertama', desc: 'Membuka slide materi pertama.', ...count((c) => c.slideOpened, 1) },
      { id: 2, title: 'Mulai Mendalami', desc: `Menyelesaikan 5 dari ${N} slide materi.`, ...count((c) => c.slideDone, 5) },
      { id: 3, title: 'Setengah Perjalanan', desc: `Menyelesaikan ${N / 2} dari ${N} slide materi.`, ...count((c) => c.slideDone, N / 2) },
      { id: 4, title: 'Penjelajah Materi', desc: `Menyelesaikan seluruh ${N} slide materi.`, ...count((c) => c.slideDone, N) },
      { id: 5, title: 'Kembali Menggali', desc: `Membaca kembali seluruh ${N} slide setelah menyelesaikan materi pertama kali.`, ...count((c) => c.slideReopened, N) },
      { id: 6, title: 'Penjelajah Awal', desc: 'Membuka slide pertama dari setiap bagian materi yang tersedia.', check: (c) => SLIDE_SECTION_STARTS.length > 0 && c.startsOpened >= SLIDE_SECTION_STARTS.length,
        progress: (c) => ({ value: c.startsOpened, target: Math.max(SLIDE_SECTION_STARTS.length, 1) })
      },
      { id: 7, title: 'Tidak Ada yang Terlewat', desc: `Membuka seluruh ${N} slide materi.`, ...count((c) => c.slideOpened, N) },
      {
        id: 8,
        title: 'Penuntut Ilmu',
        desc: `Menyelesaikan seluruh ${N} slide tanpa melewati slide yang belum dibuka.`,
        check: (c) => c.slideDone >= N && !c.p.slideSkipped
      },
      { id: 9, title: 'Perjalanan Kedua', desc: 'Menyelesaikan seluruh slide untuk kedua kalinya.', ...count((c) => c.p.slidePasses, 2) },
      { id: 10, title: 'Sang Pembelajar', desc: 'Menyelesaikan seluruh slide sebanyak 5 kali.', ...count((c) => c.p.slidePasses, 5) }
    ]
  },
  {
    id: '1B',
    title: 'Belajar · Ringkasan Pintar',
    icon: 'layers',
    items: [
      { id: 11, title: 'Ringkas dan Jelas', desc: 'Membaca ringkasan singkat sampai selesai.', ...count((c) => c.p.summaries.singkat, 1) },
      { id: 12, title: 'Pendalaman Dharma', desc: 'Membaca ringkasan lengkap sampai selesai.', ...count((c) => c.p.summaries.lengkap, 1) },
      {
        id: 13,
        title: 'Dua Sisi Pemahaman',
        desc: 'Menyelesaikan ringkasan singkat dan lengkap.',
        check: (c) => c.p.summaries.singkat > 0 && c.p.summaries.lengkap > 0
      },
      { id: 14, title: 'Sekali Lagi', desc: 'Membaca ulang ringkasan singkat sebanyak 3 kali.', ...count((c) => c.p.summaries.singkat, 3) },
      { id: 15, title: 'Mendalami Setiap Kata', desc: 'Membaca ulang ringkasan lengkap sebanyak 3 kali.', ...count((c) => c.p.summaries.lengkap, 3) },
      {
        id: 16,
        title: 'Ringkasan di Luar Kepala',
        desc: 'Menyelesaikan kedua ringkasan dan memperoleh skor minimal 90% pada satu kuis.',
        check: (c) => c.p.summaries.singkat > 0 && c.p.summaries.lengkap > 0 && c.bestQuiz >= 90
      }
    ]
  },
  {
    id: '1C',
    title: 'Belajar · Peta Konsep',
    icon: 'map',
    items: [
      {
        id: 17,
        title: 'Melihat Gambaran Besar',
        desc: 'Membuka peta konsep untuk pertama kalinya.',
        check: (c) => c.p.conceptMapOpened || c.branches > 0
      },
      { id: 18, title: 'Memahami Hubungan', desc: 'Menjelajahi seluruh cabang peta konsep.', ...count((c) => c.branches, CONCEPT_BRANCHES.length) },
      { id: 19, title: 'Penjelajah Konsep', desc: 'Membuka setiap bagian peta konsep Sad Darsana.', ...count((c) => c.darsanaBranches, DARSANA_IDS.length) },
      {
        id: 20,
        title: 'Benang Merah Pengetahuan',
        desc: 'Menjelajahi peta konsep dan memperoleh skor minimal 80% pada satu kuis.',
        check: (c) => (c.p.conceptMapOpened || c.branches > 0) && c.bestQuiz >= 80
      }
    ]
  },
  {
    id: '1D',
    title: 'Belajar · Audio',
    icon: 'activity',
    items: [
      { id: 21, title: 'Pendengar Pertama', desc: 'Memutar audio materi untuk pertama kalinya.', ...count((c) => c.audioStarted, 1) },
      { id: 22, title: 'Simak Sampai Akhir', desc: 'Mendengarkan satu audio materi sampai selesai.', ...count((c) => c.audioDone, 1) },
      { id: 23, title: 'Dengarkan Kembali', desc: 'Mendengarkan audio yang sama sebanyak 3 kali.', ...count((c) => c.audioRepeat, 3) },
      { id: 24, title: 'Belajar dengan Telinga', desc: 'Menyelesaikan seluruh audio materi yang tersedia.', ...count((c) => c.audioDone, AUDIO_TOTAL) }
    ]
  },
  {
    id: '1E',
    title: 'Belajar · Video',
    icon: 'eye',
    items: [
      { id: 25, title: 'Penonton Pertama', desc: 'Memutar video materi untuk pertama kalinya.', ...count((c) => c.videoStarted, 1) },
      { id: 26, title: 'Tontonan Tuntas', desc: 'Menonton satu video materi sampai selesai.', ...count((c) => c.videoDone, 1) },
      { id: 27, title: 'Penjelajah Visual', desc: 'Menyelesaikan seluruh video materi yang tersedia.', ...count((c) => c.videoDone, VIDEO_TOTAL) },
      { id: 28, title: 'Putar Kembali', desc: 'Menonton video yang sama sebanyak 3 kali.', ...count((c) => c.videoRepeat, 3) }
    ]
  },
  {
    id: '1F',
    title: 'Belajar · Glosarium',
    icon: 'search',
    items: [
      {
        id: 29,
        title: 'Kata Pertama',
        desc: 'Membuka glosarium untuk pertama kalinya.',
        check: (c) => c.p.glossaryOpened || c.glossary > 0
      },
      { id: 30, title: 'Pemburu Istilah', desc: 'Membuka 10 istilah berbeda dari glosarium.', ...count((c) => c.glossary, 10) },
      { id: 31, title: 'Pengumpul Makna', desc: 'Membuka 25 istilah berbeda dari glosarium.', ...count((c) => c.glossary, 25) },
      { id: 32, title: 'Kamus Berjalan', desc: `Membuka seluruh ${GLOSSARY_TOTAL} istilah glosarium.`, ...count((c) => c.glossary, GLOSSARY_TOTAL) },
      {
        id: 33,
        title: 'Istilah yang Melekat',
        desc: 'Membuka 10 istilah glosarium dan memperoleh skor minimal 80% pada kuis terkait.',
        check: (c) => c.glossary >= 10 && c.bestQuiz >= 80
      },
      { id: 34, title: 'Penjelajah Bahasa Dharma', desc: 'Membuka 50 istilah berbeda dari glosarium.', ...count((c) => c.glossary, 50) }
    ]
  },
  {
    id: '1G',
    title: 'Belajar · Kombinasi',
    icon: 'sparkles',
    items: [
      { id: 35, title: 'Belajar dari Berbagai Arah', desc: 'Menggunakan minimal 4 dari 6 fitur belajar yang tersedia.', ...count((c) => c.featuresUsed, 4) },
      {
        id: 36,
        title: 'Penguasaan Materi',
        desc: 'Menyelesaikan seluruh slide, kedua ringkasan, peta konsep, seluruh audio, seluruh video, dan seluruh istilah glosarium.',
        ...count((c) => c.materiParts, 6)
      }
    ]
  },

  /* ================= SECTION 2: LATIHAN ================= */
  {
    id: '2A',
    title: 'Latihan · Pretest',
    icon: 'target',
    items: [
      { id: 37, title: 'Langkah Awal Evaluasi', desc: 'Menyelesaikan pretest pertama.', ...count((c) => c.p.pretests.length, 1) },
      {
        id: 38,
        title: 'Potret Pengetahuan',
        desc: 'Menyelesaikan pretest dan melihat hasil evaluasinya.',
        check: (c) => c.p.pretests.some((x) => x.viewed)
      },
      {
        id: 39,
        title: 'Ternyata Sudah Tahu',
        desc: 'Mendapatkan skor minimal 80% pada pretest pertama.',
        check: (c) => c.p.pretests.length > 0 && scoreOf(c.p.pretests[0]) >= 80
      },
      {
        id: 40,
        title: 'Bekal Sebelum Belajar',
        desc: 'Menyelesaikan pretest sebelum menuntaskan seluruh materi.',
        check: (c) => c.p.pretests.some((x) => x.beforeMateri)
      },
      {
        id: 41,
        title: 'Siap Menjadi Lebih Baik',
        desc: 'Meningkatkan skor minimal 20 poin persentase antara pretest dan post-test yang setara.',
        check: (c) => c.prePostGain
      },
      {
        title: 'Tiga Puluh Soal Pertama',
        desc: 'Menyelesaikan seluruh 30 soal dalam satu sesi pretest sampai hasil muncul.',
        check: (c) => c.p.pretests.some((x) => x.total >= 30)
      },
      {
        title: 'Modal Awal',
        desc: 'Mendapatkan minimal 15 jawaban benar dari 30 soal pretest.',
        check: (c) => c.p.pretests.some((x) => x.total >= 30 && x.correct >= 15),
        progress: (c) => ({
          value: Math.min(maxOf(c.p.pretests.map((x) => x.correct)), 15),
          target: 15
        })
      },
      {
        title: 'Fondasi Kuat',
        desc: 'Mendapatkan minimal 24 jawaban benar dari 30 soal pretest.',
        check: (c) => c.p.pretests.some((x) => x.total >= 30 && x.correct >= 24),
        progress: (c) => ({
          value: Math.min(maxOf(c.p.pretests.map((x) => x.correct)), 24),
          target: 24
        })
      }
    ]
  },
  {
    id: '2B',
    title: 'Latihan · Kuis Kilat',
    icon: 'zap',
    items: [
      { id: 42, title: 'Kuis Pertama', desc: 'Menyelesaikan Kuis Kilat pertama.', ...sessions('quick', 1) },
      { id: 43, title: 'Pemanasan Otak', desc: 'Menyelesaikan 5 sesi Kuis Kilat.', ...sessions('quick', 5) },
      { id: 44, title: 'Sepuluh Kali Berpikir', desc: 'Menyelesaikan 10 sesi Kuis Kilat.', ...sessions('quick', 10) },
      { id: 45, title: 'Langkah Konsisten', desc: 'Menyelesaikan 25 sesi Kuis Kilat.', ...sessions('quick', 25) },
      { id: 46, title: 'Mesin Kuis', desc: 'Menyelesaikan 50 sesi Kuis Kilat.', ...sessions('quick', 50) },
      { id: 47, title: 'Jawaban Sempurna', desc: 'Mendapatkan skor 100% dalam satu sesi Kuis Kilat.', check: scoreAtLeast('quick', 100) },
      { id: 48, title: 'Akurasi Tinggi', desc: 'Mendapatkan skor minimal 90% dalam 5 sesi Kuis Kilat berbeda.', ...manyAtLeast('quick', 90, 5) },
      { id: 49, title: 'Tanpa Kesalahan', desc: 'Menjawab seluruh 10 soal dengan benar dalam 3 sesi Kuis Kilat berturut-turut.', ...streakOf('quick', 100, 3) },
      {
        id: 50,
        title: 'Bangkit Kembali',
        desc: 'Meningkatkan skor minimal 30 poin persentase dibandingkan sesi sebelumnya.',
        check: (c) => consecutiveGain(c.quick, 30)
      },
      { id: 51, title: 'Konsistensi Jawaban', desc: 'Mendapatkan skor minimal 80% dalam 10 sesi Kuis Kilat berturut-turut.', ...streakOf('quick', 80, 10) }
    ]
  },
  {
    id: '2C',
    title: 'Latihan · Kuis Maraton',
    icon: 'trophy',
    items: [
      { id: 52, title: 'Marathon Pertama', desc: 'Menyelesaikan Kuis Maraton pertama yang terdiri dari 50 soal.', ...sessions('full', 1) },
      {
        id: 53,
        title: 'Lima Puluh Tantangan',
        desc: 'Menjawab seluruh 50 soal dalam satu sesi Kuis Maraton sampai selesai.',
        check: (c) => c.full.some((a) => a.total >= 50)
      },
      { id: 54, title: 'Pelari Jarak Jauh', desc: 'Menyelesaikan 5 sesi Kuis Maraton.', ...sessions('full', 5) },
      { id: 55, title: 'Maraton Berulang', desc: 'Menyelesaikan 10 sesi Kuis Maraton.', ...sessions('full', 10) },
      { id: 56, title: 'Ahli Marathon', desc: 'Menyelesaikan 25 sesi Kuis Maraton.', ...sessions('full', 25) },
      {
        id: 57,
        title: 'Marathon Sempurna',
        desc: 'Menjawab seluruh 50 soal dengan benar dalam satu sesi Kuis Maraton.',
        check: (c) => c.full.some((a) => a.total >= 50 && isPerfect(a))
      },
      { id: 58, title: 'Hampir Tanpa Cela', desc: 'Mendapatkan skor minimal 90% dalam satu sesi Kuis Maraton.', check: scoreAtLeast('full', 90) },
      { id: 59, title: 'Ketahanan Pengetahuan', desc: 'Mendapatkan skor minimal 80% dalam 5 sesi Kuis Maraton berbeda.', ...manyAtLeast('full', 80, 5) },
      { id: 60, title: 'Lima Puluh Tanpa Salah', desc: 'Mendapatkan skor minimal 90% dalam 3 sesi Kuis Maraton berturut-turut.', ...streakOf('full', 90, 3) },
      { id: 61, title: 'Juara Marathon', desc: 'Mendapatkan skor 100% dalam 3 sesi Kuis Maraton berbeda.', ...manyAtLeast('full', 100, 3) }
    ]
  },
  {
    id: '2D',
    title: 'Latihan · Kuis Ketik',
    icon: 'keyboard',
    items: [
      { id: 62, title: 'Ketikan Pertama', desc: 'Menyelesaikan kuis ketik pertama.', ...sessions('ketik', 1) },
      { id: 63, title: 'Jari dan Pikiran', desc: 'Menyelesaikan 5 sesi kuis ketik.', ...sessions('ketik', 5) },
      { id: 64, title: 'Ahli Mengetik', desc: 'Menyelesaikan 10 sesi kuis ketik.', ...sessions('ketik', 10) },
      { id: 65, title: 'Kata demi Kata', desc: 'Menyelesaikan 25 sesi kuis ketik.', ...sessions('ketik', 25) },
      { id: 66, title: 'Master Kuis Ketik', desc: 'Menyelesaikan 50 sesi kuis ketik.', ...sessions('ketik', 50) },
      {
        id: 67,
        title: 'Jawaban Tepat',
        desc: 'Menjawab seluruh 10 soal dengan benar dalam satu sesi kuis ketik.',
        check: (c) => c.ketik.some((a) => a.total >= 10 && isPerfect(a))
      },
      {
        id: 68,
        title: 'Tanpa Petunjuk',
        desc: 'Menyelesaikan satu sesi kuis ketik tanpa menggunakan petunjuk atau bantuan jawaban.',
        check: (c) => c.ketik.some((a) => a.extra && a.extra.hints === 0)
      },
      {
        id: 69,
        title: 'Ejaan Sempurna',
        desc: 'Menjawab seluruh 10 soal tanpa kesalahan pengetikan berdasarkan aturan penilaian sistem.',
        check: (c) =>
          c.ketik.some((a) => a.total >= 10 && isPerfect(a) && a.extra && a.extra.exact === a.total)
      },
      { id: 70, title: 'Ketepatan Beruntun', desc: 'Mendapatkan skor 100% dalam 3 sesi kuis ketik berturut-turut.', ...streakOf('ketik', 100, 3) },
      { id: 71, title: 'Penulis Pengetahuan', desc: 'Menjawab 100 soal kuis ketik dengan benar secara kumulatif.', ...correctTotal('ketik', 100) }
    ]
  },
  {
    id: '2E',
    title: 'Latihan · Benar / Salah',
    icon: 'checkCircle',
    items: [
      { id: 72, title: 'Benar atau Salah', desc: 'Menyelesaikan sesi Benar / Salah pertama.', ...sessions('tf', 1) },
      { id: 73, title: 'Penentu Fakta', desc: 'Menyelesaikan 5 sesi Benar / Salah.', ...sessions('tf', 5) },
      { id: 74, title: 'Pembaca Pernyataan', desc: 'Menyelesaikan 10 sesi Benar / Salah.', ...sessions('tf', 10) },
      { id: 75, title: 'Penguji Fakta', desc: 'Menyelesaikan 25 sesi Benar / Salah.', ...sessions('tf', 25) },
      { id: 76, title: 'Ahli Pernyataan', desc: 'Menyelesaikan 50 sesi Benar / Salah.', ...sessions('tf', 50) },
      {
        id: 77,
        title: 'Semua Benar',
        desc: 'Menjawab seluruh 10 soal dengan benar dalam satu sesi Benar / Salah.',
        check: (c) => c.tf.some((a) => a.total >= 10 && isPerfect(a))
      },
      { id: 78, title: 'Tidak Terkecoh', desc: 'Mendapatkan skor minimal 90% dalam 5 sesi Benar / Salah berbeda.', ...manyAtLeast('tf', 90, 5) },
      { id: 79, title: 'Ketajaman Penilaian', desc: 'Menjawab 100 soal Benar / Salah dengan benar secara kumulatif.', ...correctTotal('tf', 100) }
    ]
  },
  {
    id: '2F',
    title: 'Latihan · Lengkapi Kalimat',
    icon: 'hash',
    items: [
      { id: 80, title: 'Isi Bagian Kosong', desc: 'Menyelesaikan sesi Lengkapi Kalimat pertama.', ...sessions('blank', 1) },
      { id: 81, title: 'Pelengkap Pengetahuan', desc: 'Menyelesaikan 5 sesi Lengkapi Kalimat.', ...sessions('blank', 5) },
      { id: 82, title: 'Pencari Kata', desc: 'Menyelesaikan 10 sesi Lengkapi Kalimat.', ...sessions('blank', 10) },
      { id: 83, title: 'Pengisi Kekosongan', desc: 'Menyelesaikan 25 sesi Lengkapi Kalimat.', ...sessions('blank', 25) },
      { id: 84, title: 'Ahli Melengkapi', desc: 'Menyelesaikan 50 sesi Lengkapi Kalimat.', ...sessions('blank', 50) },
      {
        id: 85,
        title: 'Kata yang Tepat',
        desc: 'Menjawab seluruh 10 soal dengan benar dalam satu sesi Lengkapi Kalimat.',
        check: (c) => c.blank.some((a) => a.total >= 10 && isPerfect(a))
      },
      { id: 86, title: 'Ingatan Istilah', desc: 'Melengkapi 100 jawaban dengan benar secara kumulatif.', ...correctTotal('blank', 100) },
      { id: 87, title: 'Tanpa Kekosongan', desc: 'Mendapatkan skor 100% dalam 3 sesi Lengkapi Kalimat berturut-turut.', ...streakOf('blank', 100, 3) }
    ]
  },
  {
    id: '2G',
    title: 'Latihan · Flashcards',
    icon: 'cards',
    items: [
      { id: 88, title: 'Kartu Pertama', desc: 'Menyelesaikan sesi Flashcards pertama.', ...sessions('flash', 1) },
      { id: 89, title: 'Balik dan Pelajari', desc: 'Menyelesaikan 5 sesi Flashcards.', ...sessions('flash', 5) },
      { id: 90, title: 'Pengumpul Kartu', desc: 'Menyelesaikan 10 sesi Flashcards.', ...sessions('flash', 10) },
      { id: 91, title: 'Kartu demi Kartu', desc: 'Menyelesaikan 25 sesi Flashcards.', ...sessions('flash', 25) },
      { id: 92, title: 'Master Flashcards', desc: 'Menyelesaikan 50 sesi Flashcards.', ...sessions('flash', 50) },
      {
        id: 93,
        title: 'Semua Terkuasai',
        desc: 'Menjawab seluruh 10 kartu dengan benar dalam satu sesi.',
        check: (c) => c.flash.some((a) => a.total >= 10 && isPerfect(a))
      },
      { id: 94, title: 'Ingatan Kuat', desc: 'Menguasai 100 kartu Flashcards secara kumulatif.', ...correctTotal('flash', 100) },
      {
        id: 95,
        title: 'Tidak Ada Kartu Terlewat',
        desc: 'Meninjau seluruh 10 kartu dalam satu sesi Flashcards.',
        check: (c) => c.flash.some((a) => a.total >= 10 && a.extra && a.extra.open === 0)
      },
      { id: 96, title: 'Penguasaan Kartu', desc: 'Menyelesaikan 10 sesi Flashcards dengan skor penguasaan minimal 90%.', ...manyAtLeast('flash', 90, 10) }
    ]
  },
  {
    id: '2H',
    title: 'Permainan · Peta Sad Darsana',
    icon: 'star',
    items: [
      {
        id: 97,
        title: 'Penjelajah Peta',
        desc: 'Membuka permainan peta Sad Darsana untuk pertama kalinya.',
        check: (c) => c.p.petaOpened || c.peta.attempts.length > 0
      },
      { id: 98, title: 'Wilayah Pertama', desc: 'Menyelesaikan satu wilayah peta.', ...count((c) => c.peta.conquered, 1) },
      { id: 99, title: 'Empat Penjuru', desc: 'Menyelesaikan 4 dari 8 wilayah peta.', ...count((c) => c.peta.conquered, 4) },
      { id: 100, title: 'Penakluk Delapan Wilayah', desc: 'Menyelesaikan seluruh 8 wilayah peta.', ...count((c) => c.peta.conquered, REGION_COUNT) },
      { id: 101, title: 'Bintang Pertama', desc: 'Mendapatkan bintang pertama.', ...count((c) => c.peta.stars, 1) },
      { id: 102, title: 'Kolektor Bintang', desc: 'Mengumpulkan total 6 bintang.', ...count((c) => c.peta.stars, 6) },
      { id: 103, title: 'Langit Berbintang', desc: 'Mengumpulkan total 12 bintang.', ...count((c) => c.peta.stars, 12) },
      { id: 104, title: 'Pemburu Bintang', desc: 'Mengumpulkan total 18 bintang.', ...count((c) => c.peta.stars, 18) },
      { id: 105, title: 'Dua Puluh Empat Bintang', desc: 'Mengumpulkan seluruh 24 bintang.', ...count((c) => c.peta.stars, PETA_MAX_STARS) },
      { id: 106, title: 'Tiga Bintang Sekaligus', desc: 'Mendapatkan 3 bintang dalam satu wilayah.', ...count((c) => c.peta.threeStar, 1) },
      { id: 107, title: 'Delapan Wilayah Sempurna', desc: 'Mendapatkan 3 bintang di setiap wilayah.', ...count((c) => c.peta.threeStar, REGION_COUNT) },
      { id: 108, title: 'Pengetahuan Tanpa Batas', desc: 'Menjawab seluruh 10 soal dengan benar dalam satu wilayah.', ...count((c) => c.peta.perfect, 1) },
      { id: 109, title: 'Wilayah Tanpa Cela', desc: 'Menjawab seluruh 10 soal dengan benar di 4 wilayah berbeda.', ...count((c) => c.peta.perfect, 4) },
      {
        id: 110,
        title: 'Penguasa Peta',
        desc: 'Mendapatkan 24 bintang dan menjawab seluruh 10 soal dengan benar di semua 8 wilayah.',
        ...count((c) => Math.min(c.peta.stars, PETA_MAX_STARS) + c.peta.perfect, PETA_MAX_STARS + REGION_COUNT)
      }
    ]
  },
  {
    id: '2I',
    title: 'Permainan · Jodohkan',
    icon: 'duo',
    items: [
      { id: 111, title: 'Pasangan Pertama', desc: 'Menyelesaikan ronde Jodohkan pertama.', ...sessions('match', 1) },
      {
        id: 112,
        title: 'Lima Pasangan',
        desc: 'Memasangkan seluruh 5 pasangan dengan benar dalam satu ronde.',
        check: (c) => c.match.some((a) => a.extra && a.extra.perfectRounds >= 1)
      },
      {
        id: 113,
        title: 'Dua Ronde Tuntas',
        desc: 'Menyelesaikan kedua ronde dalam satu sesi Jodohkan.',
        check: (c) => c.match.some((a) => a.extra && a.extra.rounds >= 2)
      },
      { id: 114, title: 'Pencocok Andal', desc: 'Menyelesaikan 10 sesi Jodohkan.', ...sessions('match', 10) },
      {
        id: 115,
        title: 'Pasangan Sempurna',
        desc: 'Memasangkan seluruh 10 pasangan dalam satu sesi tanpa kesalahan.',
        check: (c) => c.match.some((a) => a.total >= 10 && a.extra && a.extra.mistakes === 0)
      },
      { id: 116, title: 'Ahli Hubungan Konsep', desc: 'Menyelesaikan 25 sesi Jodohkan.', ...sessions('match', 25) },
      {
        id: 118,
        title: 'Efisiensi Tinggi',
        desc: 'Menyelesaikan permainan Jodohkan dengan total maksimal 12 langkah.',
        check: (c) => c.match.some((a) => a.extra && a.extra.steps <= 12)
      },
      {
        id: 119,
        title: 'Tanpa Salah Langkah',
        desc: 'Menyelesaikan satu sesi Jodohkan tanpa satu pun percobaan pasangan yang salah.',
        check: (c) => c.match.some((a) => a.extra && a.extra.mistakes === 0)
      },
    ]
  },
  {
    id: '2J',
    title: 'Permainan · Cocokkan Kartu',
    icon: 'gem',
    items: [
      { id: 121, title: 'Ingatan Pertama', desc: 'Menyelesaikan permainan Cocokkan Kartu pertama.', ...sessions('memory', 1) },
      {
        id: 122,
        title: 'Enam Pasangan Terbuka',
        desc: 'Menemukan seluruh 6 pasangan dalam satu sesi.',
        check: (c) => c.memory.some((a) => a.total >= 6)
      },
      { id: 123, title: 'Ingatan Tajam', desc: 'Menyelesaikan 5 sesi Cocokkan Kartu.', ...sessions('memory', 5) },
      { id: 124, title: 'Pembalik Kartu', desc: 'Menyelesaikan 10 sesi Cocokkan Kartu.', ...sessions('memory', 10) },
      { id: 126, title: 'Penjaga Ingatan', desc: 'Menyelesaikan 25 sesi Cocokkan Kartu.', ...sessions('memory', 25) },
      {
        id: 127,
        title: 'Langkah Efisien',
        desc: 'Menyelesaikan Cocokkan Kartu dengan maksimal 18 kartu dibuka (9 giliran).',
        check: (c) => c.memory.some((a) => a.extra && a.extra.moves <= MEMORY_MAX_MOVES_EFFICIENT)
      },
      {
        id: 128,
        title: 'Ingatan Hemat Langkah',
        desc: 'Menyelesaikan Cocokkan Kartu dengan maksimal 12 kartu dibuka (6 giliran).',
        check: (c) => c.memory.some((a) => a.extra && a.extra.moves <= MEMORY_MAX_MOVES_FRUGAL)
      },
      {
        id: 130,
        title: 'Memori Kilat',
        desc: 'Menyelesaikan satu sesi Cocokkan Kartu dengan maksimal 12 kartu dibuka dan tanpa kesalahan.',
        check: (c) =>
          c.memory.some(
            (a) =>
              a.extra &&
              a.extra.moves <= MEMORY_MAX_MOVES_FRUGAL &&
              a.extra.mistakes <= MEMORY_PERFECT_MAX_MISTAKES
          )
      }
    ]
  },
  {
    id: '2K',
    title: 'Permainan · Teka-Teki Silang',
    icon: 'grid',
    items: [
      { id: 131, title: 'Kotak Pertama', desc: 'Menyelesaikan teka-teki silang pertama.', ...sessions('tts', 1) },
      { id: 132, title: 'Pengisi Kotak', desc: 'Menyelesaikan 5 sesi teka-teki silang.', ...sessions('tts', 5) },
      { id: 133, title: 'Pemburu Jawaban', desc: 'Menyelesaikan 10 sesi teka-teki silang.', ...sessions('tts', 10) },
      { id: 134, title: 'Silang Pengetahuan', desc: 'Menyelesaikan 25 sesi teka-teki silang.', ...sessions('tts', 25) },
      { id: 135, title: 'Teka-Teki Sempurna', desc: 'Mengisi seluruh jawaban dengan benar dalam satu sesi.', check: perfectOnce('tts') },
      { id: 136, title: 'Ahli Teka-Teki', desc: 'Menyelesaikan 50 sesi teka-teki silang.', ...sessions('tts', 50) }
    ]
  },
  {
    id: '2L',
    title: 'Sprint & Ujian · Sprint Belajar',
    icon: 'flag',
    items: [
      { id: 137, title: 'Sprint Pertama', desc: 'Menyelesaikan satu sesi Sprint Belajar.', ...count((c) => c.sprints.length, 1) },
      {
        id: 138,
        title: 'Perancang Belajar',
        desc: 'Membuat dan menjalankan satu konfigurasi Sprint Belajar kustom.',
        check: (c) => c.sprints.some((s) => !s.isDefault)
      },
      {
        id: 139,
        title: 'Kombinasi Cerdas',
        desc: 'Menyelesaikan Sprint Belajar yang menggabungkan minimal 2 jenis latihan berbeda.',
        check: (c) => c.sprints.some((s) => sprintStages(s).length >= 2)
      },
      {
        id: 140,
        title: 'Campuran Pengetahuan',
        desc: 'Menyelesaikan Sprint Belajar yang menggabungkan minimal 4 jenis latihan berbeda.',
        check: (c) => c.sprints.some((s) => sprintStages(s).length >= 4)
      },
      { id: 141, title: 'Sprint Tanpa Batas', desc: 'Menyelesaikan 10 sesi Sprint Belajar.', ...count((c) => c.sprints.length, 10) },
      { id: 142, title: 'Arsitek Sprint', desc: 'Menyelesaikan 5 konfigurasi Sprint Belajar yang berbeda.', ...count((c) => c.sprintConfigs, 5) },
      {
        id: 143,
        title: 'Sprint Sempurna',
        desc: 'Menyelesaikan satu sesi Sprint Belajar dengan skor 100% pada seluruh latihan yang digunakan.',
        check: (c) => c.sprints.some(isSprintPerfect)
      },
      { id: 144, title: 'Ahli Kombinasi', desc: 'Menggunakan seluruh jenis latihan yang tersedia dalam Sprint Belajar setidaknya sekali.', ...count((c) => c.sprintTypes, PRACTICE_TYPES.length) },
      { id: 145, title: 'Sprint Campuran', desc: 'Menyelesaikan Sprint Belajar dengan kesulitan campuran.', ...count((c) => levelCount(c.sprints, 'campuran'), 1) },
      { id: 146, title: 'Sprint Mudah', desc: 'Menyelesaikan Sprint Belajar dengan kesulitan mudah.', ...count((c) => levelCount(c.sprints, 'mudah'), 1) },
      { id: 147, title: 'Sprint Menengah', desc: 'Menyelesaikan Sprint Belajar dengan kesulitan sedang.', ...count((c) => levelCount(c.sprints, 'sedang'), 1) },
      { id: 148, title: 'Sprint Sulit', desc: 'Menyelesaikan Sprint Belajar dengan kesulitan sulit.', ...count((c) => levelCount(c.sprints, 'sulit'), 1) },
      { id: 149, title: 'Seratus Tantangan', desc: 'Menyelesaikan 100 sesi latihan individual yang tergabung dalam Sprint Belajar.', ...count((c) => c.sprintStageCount, 100) }
    ]
  },
  {
    id: '2M',
    title: 'Sprint & Ujian · Simulasi Ujian',
    icon: 'flame',
    items: [
      { id: 150, title: 'Ulangan Pertama', desc: 'Menyelesaikan simulasi ujian pertama.', ...count((c) => c.exams.length, 1) },
      { id: 151, title: 'Siap Menghadapi Ujian', desc: 'Menyelesaikan simulasi ujian dengan tingkat kesulitan mudah.', ...count((c) => levelCount(c.exams, 'mudah'), 1) },
      { id: 152, title: 'Naik Tingkat', desc: 'Menyelesaikan simulasi ujian dengan tingkat kesulitan sedang.', ...count((c) => levelCount(c.exams, 'sedang'), 1) },
      { id: 153, title: 'Tantangan Berat', desc: 'Menyelesaikan simulasi ujian dengan tingkat kesulitan sulit.', ...count((c) => levelCount(c.exams, 'sulit'), 1) },
      { id: 154, title: 'Ujian Sempurna', desc: 'Mendapatkan skor 100% dalam satu simulasi ujian.', check: (c) => c.exams.some(isPerfect) },
      { id: 155, title: 'Melawan Waktu', desc: 'Menyelesaikan simulasi ujian sebelum waktu habis.', check: (c) => c.exams.some((e) => !e.timedOut) },
      {
        id: 156,
        title: 'Ketenangan di Bawah Tekanan',
        desc: 'Mendapatkan skor minimal 90% dalam simulasi ujian sulit.',
        check: (c) => c.exams.some((e) => e.level === 'sulit' && scoreOf(e) >= 90)
      },
      { id: 157, title: 'Ahli Simulasi', desc: 'Menyelesaikan 10 simulasi ujian.', ...count((c) => c.exams.length, 10) },
      {
        id: 158,
        title: 'Semua Tingkat Ditaklukkan',
        desc: 'Menyelesaikan simulasi ujian pada seluruh tingkat kesulitan yang tersedia.',
        ...count((c) => EXAM_LEVELS.filter((l) => levelCount(c.exams, l) > 0).length, EXAM_LEVELS.length)
      },
      {
        id: 159,
        title: 'Juara Ulangan',
        desc: 'Mendapatkan skor minimal 90% dalam 5 simulasi ujian berturut-turut.',
        ...count((c) => longestStreak(c.exams, (s) => s >= 90), 5)
      },
      { id: 160, title: 'Ujian Campuran', desc: 'Menyelesaikan simulasi ujian dengan kesulitan campuran.', ...count((c) => levelCount(c.exams, 'campuran'), 1) },
      { id: 161, title: 'Ujian Mudah', desc: 'Menyelesaikan 5 simulasi ujian dengan kesulitan mudah.', ...count((c) => levelCount(c.exams, 'mudah'), 5) },
      { id: 162, title: 'Ujian Menengah', desc: 'Menyelesaikan 5 simulasi ujian dengan kesulitan sedang.', ...count((c) => levelCount(c.exams, 'sedang'), 5) },
      { id: 163, title: 'Ujian Sulit', desc: 'Menyelesaikan 5 simulasi ujian dengan kesulitan sulit.', ...count((c) => levelCount(c.exams, 'sulit'), 5) },
      {
        id: 164,
        title: 'Penakluk Waktu',
        desc: 'Menyelesaikan 5 simulasi ujian sebelum waktu habis dengan skor minimal 80%.',
        ...count((c) => c.exams.filter((e) => !e.timedOut && scoreOf(e) >= 80).length, 5)
      }
    ]
  },
  {
    id: '2N',
        title: 'Sprint & Ujian · Post-test',
    icon: 'trendingUp',
    items: [
      { id: 165, title: 'Langkah Penutup', desc: 'Menyelesaikan post-test pertama.', ...count((c) => c.p.posttests.length, 1) },
      {
        id: 166,
        title: 'Bukti Perkembangan',
        desc: 'Menyelesaikan post-test setelah menyelesaikan materi.',
        check: (c) => c.p.posttests.some((x) => x.afterMateri)
      },
      {
        id: 167,
        title: 'Peningkatan Nyata',
        desc: 'Mendapatkan skor post-test minimal 20 poin persentase lebih tinggi daripada pretest yang setara.',
        check: (c) => c.prePostGain
      },
      { id: 168, title: 'Penguasaan Akhir', desc: 'Mendapatkan skor minimal 90% pada post-test.', check: (c) => anyWhere(c.p.posttests, (s) => s >= 90) },
      { id: 169, title: 'Hasil Sempurna', desc: 'Mendapatkan skor 100% pada post-test.', check: (c) => anyWhere(c.p.posttests, (s) => s >= 100) },
      {
        id: 170,
        title: 'Tuntas Belajar',
        desc: 'Menyelesaikan seluruh materi, pretest, dan post-test.',
        check: (c) => c.slideDone >= N && c.p.pretests.length > 0 && c.p.posttests.length > 0
      },
      {
        title: 'Post-test Tuntas',
        desc: 'Menyelesaikan seluruh 30 soal dalam satu sesi post-test sampai hasil muncul.',
        check: (c) => c.p.posttests.some((x) => x.total >= 30)
      },
      {
        title: 'Hampir Sempurna',
        desc: 'Mendapatkan minimal 27 jawaban benar dari 30 soal post-test.',
        check: (c) => c.p.posttests.some((x) => x.total >= 30 && x.correct >= 27),
        progress: (c) => ({
          value: Math.min(maxOf(c.p.posttests.map((x) => x.correct)), 27),
          target: 27
        })
      },
      {
        title: 'Tiga Puluh dari Tiga Puluh',
        desc: 'Menjawab benar seluruh 30 soal post-test tanpa satu pun jawaban salah.',
        check: (c) => c.p.posttests.some((x) => x.total >= 30 && x.correct >= 30),
        progress: (c) => ({
          value: Math.min(maxOf(c.p.posttests.map((x) => x.correct)), 30),
          target: 30
        })
      }
    ]
  },

  /* ================= SECTION 3: ADVANCED TOOLS DAN EASTER EGG ================= */
  {
    id: '3A',
    title: 'Alat Bantu · AI Chatbot',
    icon: 'globe',
    items: [
      { id: 171, title: 'Halo, AI!', desc: 'Membuka AI chatbot untuk pertama kalinya.', check: (c) => c.p.chat.opened || c.p.chat.messages > 0 },
      { id: 172, title: 'Teman Diskusi', desc: 'Mengirim 10 pesan kepada AI chatbot.', ...count((c) => c.p.chat.messages, 10) },
      { id: 173, title: 'Tanya Sampai Paham', desc: 'Mengirim 50 pesan kepada AI chatbot.', ...count((c) => c.p.chat.messages, 50) },
      { id: 174, title: 'Diskusi Dharma', desc: 'Menggunakan AI chatbot untuk membahas minimal 5 topik berbeda terkait Sad Darsana.', ...count((c) => c.p.chat.topics.length, 5) },
      { id: 175, title: 'Coba Tanya AI!', desc: 'Menekan atau menjalankan fitur AI yang secara khusus disediakan untuk mencoba kemampuan chatbot.', check: (c) => c.p.chat.tried }
    ]
  },
  {
    id: '3B',
    title: 'Alat Bantu · Studio',
    icon: 'wheel',
    items: [
      { id: 176, title: 'Masuk Studio', desc: 'Membuka Studio untuk pertama kalinya.', check: (c) => c.p.studio.opened || c.p.studio.created > 0 },
      { id: 177, title: 'Kreator Latihan', desc: 'Membuat latihan pertama melalui Studio.', ...count((c) => c.p.studio.created, 1) },
      { id: 178, title: 'Koleksi Kreasi', desc: 'Membuat 5 latihan berbeda melalui Studio.', ...count((c) => c.p.studio.created, 5) },
      { id: 179, title: 'Studio Serbaguna', desc: 'Membuat minimal 3 jenis latihan berbeda melalui Studio.', ...count((c) => c.p.studio.types.length, 3) },
      { id: 180, title: 'Kreator Andal', desc: 'Menyelesaikan latihan buatan sendiri yang dibuat melalui Studio.', ...count((c) => c.p.studio.completed, 1) }
    ]
  },
  {
    id: '3C',
    title: 'Alat Bantu · Profil dan Kustomisasi',
    icon: 'user',
    items: [
      { id: 181, title: 'Identitas Dharma', desc: 'Melengkapi seluruh data diri wajib pada profil.', check: (c) => c.p.profile.complete },
      { id: 182, title: 'Profil Personal', desc: 'Mengubah minimal satu data profil setelah pendaftaran.', check: (c) => c.p.profile.edited },
      { id: 183, title: 'Wajah Baru', desc: 'Mengunggah foto profil untuk pertama kalinya.', check: (c) => c.p.profile.photo },
      { id: 184, title: 'Sentuhan Warna', desc: 'Mengubah warna avatar untuk pertama kalinya.', check: (c) => c.p.profile.color },
      {
        id: 185,
        title: 'Identitas Lengkap',
        desc: 'Melengkapi data diri, memasang foto profil, dan mengatur warna avatar.',
        check: (c) => c.p.profile.complete && c.p.profile.photo && c.p.profile.color
      }
    ]
  },
  {
    id: '3D',
    title: 'Alat Bantu · Berbagi dan Easter Egg',
    icon: 'sparkles',
    items: [
      { id: 186, title: 'Bagikan Perjalanan', desc: 'Membagikan statistik profil menggunakan fitur berbagi yang tersedia.', ...count((c) => c.p.shares.length, 1) },
      {
        id: 187,
        title: 'Pamer Pencapaian',
        desc: 'Membagikan statistik profil setelah mendapatkan minimal 10 achievement.',
        check: (c) => c.p.shares.some((s) => s.unlocked >= 10)
      },
      {
        title: 'Penjaga Progres',
        desc: 'Membuka halaman progres dan melihat statistik belajar setelah 5 sesi latihan.',
        check: (c) => c.p.progressViewed
      }
    ]
  },

  /* ================= SECTION 4: PENCAPAIAN MENYELURUH ================= */
  {
    id: '4A',
    title: 'Pencapaian Menyeluruh',
    icon: 'crown',
    items: [
      {
        id: 191,
        title: 'Penjelajah DharmaLearn',
        desc: 'Menggunakan seluruh fitur belajar dan seluruh jenis latihan setidaknya satu kali.',
        ...count((c) => c.featuresUsed + c.modesUsed, 6 + ALL_MODES.length)
      },
      {
        id: 192,
        title: 'Penguasa Sad Darsana',
        desc: `Menyelesaikan seluruh ${N} slide, mendapatkan 24 bintang peta, dan memperoleh skor minimal 90% pada satu Kuis Maraton.`,
        ...count(
          (c) => (c.slideDone >= N ? 1 : 0) + (c.peta.stars >= PETA_MAX_STARS ? 1 : 0) + (anyWhere(c.full, (s) => s >= 90) ? 1 : 0),
          3
        )
      },
      { id: 193, title: 'Kolektor Pemula', desc: 'Mendapatkan 25 achievement berbeda.', ...count((c) => c.unlockedCount, 25) },
      { id: 194, title: 'Kolektor Berpengalaman', desc: 'Mendapatkan 50 achievement berbeda.', ...count((c) => c.unlockedCount, 50) },
      { id: 195, title: 'Kolektor Ahli', desc: 'Mendapatkan 100 achievement berbeda.', ...count((c) => c.unlockedCount, 100) },
      { id: 196, title: 'Kolektor Legendaris', desc: 'Mendapatkan 150 achievement berbeda.', ...count((c) => c.unlockedCount, 150) },
      {
        id: 197,
        title: 'Semua Mode Dicoba',
        desc: 'Menyelesaikan minimal satu sesi dari setiap jenis latihan dan permainan yang tersedia.',
        ...count((c) => c.modesUsed, ALL_MODES.length)
      },
      {
        id: 198,
        title: 'Pembelajar Multitalenta',
        desc: 'Mendapatkan skor minimal 80% pada Kuis Kilat, Kuis Maraton, kuis ketik, Benar / Salah, Lengkapi Kalimat, Flashcards, Jodohkan, Cocokkan Kartu, teka-teki silang, dan simulasi ujian.',
        ...count((c) => c.talentCount, 10)
      },
      {
        id: 199,
        title: 'Penguasaan Menyeluruh',
        desc: 'Menyelesaikan seluruh materi belajar, mendapatkan 24 bintang peta, menyelesaikan post-test dengan skor minimal 90%, dan menyelesaikan simulasi ujian sulit dengan skor minimal 90%.',
        ...count(
          (c) =>
            (c.materiParts >= 6 ? 1 : 0) +
            (c.peta.stars >= PETA_MAX_STARS ? 1 : 0) +
            (anyWhere(c.p.posttests, (s) => s >= 90) ? 1 : 0) +
            (c.exams.some((e) => e.level === 'sulit' && scoreOf(e) >= 90) ? 1 : 0),
          4
        )
      },
      {
        id: 200,
        title: 'Legenda DharmaLearn',
        desc: 'Membuka seluruh 199 achievement lainnya.',
        ...count((c) => c.unlockedOthers, 199)
      }
    ]
  }
];

/* Deskripsi seragam (9-13 kata) supaya kartu di halaman Pencapaian rapi.
   Menimpa field `desc` di GROUPS; syarat (check) tidak disentuh. */
const DESC = {
  1: 'Membuka slide materi pertama untuk memulai perjalanan belajarmu di DharmaLearn.',
  2: `Menyelesaikan 5 dari ${N} slide materi dengan membaca sampai tuntas.`,
  3: `Menyelesaikan ${N / 2} dari ${N} slide materi, tepat separuh dari seluruh perjalanan.`,
  4: `Menyelesaikan seluruh ${N} slide materi dari slide pertama sampai slide terakhir.`,
  5: `Membaca kembali seluruh ${N} slide setelah materi selesai dipelajari untuk pertama kalinya.`,
  6: 'Membuka slide pertama dari setiap bagian materi yang tersedia di DharmaLearn.',
  7: `Membuka seluruh ${N} slide materi, termasuk yang belum sempat kamu selesaikan.`,
  8: `Menyelesaikan seluruh ${N} slide secara berurutan tanpa melompati slide yang belum dibuka.`,
  9: 'Menyelesaikan seluruh slide materi untuk kedua kalinya dari awal sampai akhir.',
  10: 'Menyelesaikan seluruh slide materi sebanyak 5 kali putaran dari awal sampai akhir.',
  11: 'Membaca ringkasan singkat sampai selesai untuk mengingat poin-poin utama materi.',
  12: 'Membaca ringkasan lengkap sampai selesai untuk memahami materi secara lebih mendalam.',
  13: 'Menyelesaikan ringkasan singkat dan ringkasan lengkap, masing-masing minimal satu kali.',
  14: 'Membaca ulang ringkasan singkat sampai selesai sebanyak 3 kali untuk memperkuat ingatan.',
  15: 'Membaca ulang ringkasan lengkap sampai selesai sebanyak 3 kali untuk memperkuat pemahaman.',
  16: 'Menyelesaikan kedua ringkasan dan meraih skor minimal 90% pada satu kuis.',
  17: 'Membuka peta konsep untuk pertama kalinya dan melihat gambaran besar materi.',
  18: 'Menjelajahi seluruh cabang pada peta konsep sampai tidak ada yang terlewat.',
  19: 'Membuka setiap bagian peta konsep Sad Darsana, dari Nyaya sampai Vedanta.',
  20: 'Menjelajahi peta konsep lalu meraih skor minimal 80% pada satu kuis.',
  21: 'Memutar audio materi untuk pertama kalinya dan mulai belajar lewat pendengaran.',
  22: 'Mendengarkan satu audio materi sampai selesai hingga detik terakhir rekaman.',
  23: 'Mendengarkan audio yang sama sampai selesai sebanyak 3 kali untuk mengulang materi.',
  24: 'Mendengarkan seluruh audio materi yang tersedia sampai selesai, satu per satu.',
  25: 'Memutar video materi untuk pertama kalinya dan mulai belajar lewat tayangan.',
  26: 'Menonton satu video materi sampai selesai hingga detik terakhir tayangan.',
  27: 'Menonton seluruh video materi yang tersedia sampai selesai, satu per satu.',
  28: 'Menonton video yang sama sampai selesai sebanyak 3 kali untuk mengulang materi.',
  29: 'Membuka glosarium untuk pertama kalinya dan mulai mengenal istilah-istilah penting.',
  30: 'Membuka 10 istilah berbeda dari glosarium untuk melihat arti dan penjelasannya.',
  31: 'Membuka 25 istilah berbeda dari glosarium untuk melihat arti dan penjelasannya.',
  32: `Membuka seluruh ${GLOSSARY_TOTAL} istilah glosarium sampai tidak ada yang terlewat.`,
  33: 'Membuka 10 istilah glosarium lalu meraih skor minimal 80% pada kuis terkait.',
  34: 'Membuka 50 istilah berbeda dari glosarium untuk melihat arti dan penjelasannya.',
  35: 'Menggunakan minimal 4 dari 6 fitur belajar yang tersedia di DharmaLearn.',
  36: 'Menuntaskan seluruh slide, kedua ringkasan, peta konsep, audio, video, dan glosarium.',
  37: 'Menyelesaikan pretest pertama untuk mengetahui kemampuan awalmu sebelum belajar materi.',
  38: 'Menyelesaikan pretest dan membuka halaman hasil untuk melihat evaluasinya secara lengkap.',
  39: 'Meraih skor minimal 80% pada pretest pertama, bukti bahwa kamu sudah paham.',
  40: 'Menyelesaikan pretest sebelum seluruh slide materi kamu tuntaskan sampai habis.',
  41: 'Menaikkan skor minimal 20 poin persentase dari pretest ke post-test yang setara.',
  42: 'Menyelesaikan Kuis Kilat pertama dari awal sampai halaman hasil muncul.',
  43: 'Menyelesaikan 5 sesi Kuis Kilat untuk memanaskan otak sebelum belajar lebih dalam.',
  44: 'Menyelesaikan 10 sesi Kuis Kilat sampai halaman hasil muncul di setiap sesi.',
  45: 'Menyelesaikan 25 sesi Kuis Kilat sampai halaman hasil muncul di setiap sesi.',
  46: 'Menyelesaikan 50 sesi Kuis Kilat sampai halaman hasil muncul di setiap sesi.',
  47: 'Meraih skor 100% dalam satu sesi Kuis Kilat tanpa jawaban salah.',
  48: 'Meraih skor minimal 90% dalam 5 sesi Kuis Kilat yang berbeda.',
  49: 'Menjawab seluruh 10 soal dengan benar dalam 3 sesi Kuis Kilat berturut-turut.',
  50: 'Menaikkan skor minimal 30 poin persentase dibandingkan sesi sebelumnya pada Kuis Kilat.',
  51: 'Meraih skor minimal 80% dalam 10 sesi Kuis Kilat berturut-turut tanpa terputus.',
  52: 'Menyelesaikan Kuis Maraton pertama yang terdiri dari 50 soal sampai selesai.',
  53: 'Menjawab seluruh 50 soal dalam satu sesi Kuis Maraton sampai selesai.',
  54: 'Menyelesaikan 5 sesi Kuis Maraton sampai halaman hasil muncul di setiap sesi.',
  55: 'Menyelesaikan 10 sesi Kuis Maraton sampai halaman hasil muncul di setiap sesi.',
  56: 'Menyelesaikan 25 sesi Kuis Maraton sampai halaman hasil muncul di setiap sesi.',
  57: 'Menjawab seluruh 50 soal dengan benar dalam satu sesi Kuis Maraton.',
  58: 'Meraih skor minimal 90% dalam satu sesi Kuis Maraton sampai selesai.',
  59: 'Meraih skor minimal 80% dalam 5 sesi Kuis Maraton yang berbeda.',
  60: 'Meraih skor minimal 90% dalam 3 sesi Kuis Maraton berturut-turut tanpa terputus.',
  61: 'Meraih skor 100% dalam 3 sesi Kuis Maraton yang berbeda.',
  62: 'Menyelesaikan kuis ketik pertama dengan mengetik jawaban sampai halaman hasil muncul.',
  63: 'Menyelesaikan 5 sesi kuis ketik sampai halaman hasil muncul di setiap sesi.',
  64: 'Menyelesaikan 10 sesi kuis ketik sampai halaman hasil muncul di setiap sesi.',
  65: 'Menyelesaikan 25 sesi kuis ketik sampai halaman hasil muncul di setiap sesi.',
  66: 'Menyelesaikan 50 sesi kuis ketik sampai halaman hasil muncul di setiap sesi.',
  67: 'Menjawab seluruh 10 soal dengan benar dalam satu sesi kuis ketik.',
  68: 'Menyelesaikan satu sesi kuis ketik tanpa memakai petunjuk atau bantuan jawaban.',
  69: 'Menjawab seluruh 10 soal tanpa kesalahan pengetikan menurut aturan penilaian sistem.',
  70: 'Meraih skor 100% dalam 3 sesi kuis ketik berturut-turut tanpa terputus.',
  71: 'Menjawab 100 soal kuis ketik dengan benar secara kumulatif dari semua sesi.',
  72: 'Menyelesaikan sesi Benar / Salah pertama sampai halaman hasil muncul.',
  73: 'Menyelesaikan 5 sesi Benar / Salah sampai halaman hasil muncul tiap sesi.',
  74: 'Menyelesaikan 10 sesi Benar / Salah sampai halaman hasil muncul tiap sesi.',
  75: 'Menyelesaikan 25 sesi Benar / Salah sampai halaman hasil muncul tiap sesi.',
  76: 'Menyelesaikan 50 sesi Benar / Salah sampai halaman hasil muncul tiap sesi.',
  77: 'Menjawab seluruh 10 soal dengan benar dalam satu sesi Benar / Salah.',
  78: 'Meraih skor minimal 90% dalam 5 sesi Benar / Salah yang berbeda.',
  79: 'Menjawab 100 soal Benar / Salah dengan benar, dihitung dari semua sesi.',
  80: 'Menyelesaikan sesi Lengkapi Kalimat pertama sampai halaman hasil muncul di layar.',
  81: 'Menyelesaikan 5 sesi Lengkapi Kalimat sampai halaman hasil muncul tiap sesi.',
  82: 'Menyelesaikan 10 sesi Lengkapi Kalimat sampai halaman hasil muncul tiap sesi.',
  83: 'Menyelesaikan 25 sesi Lengkapi Kalimat sampai halaman hasil muncul tiap sesi.',
  84: 'Menyelesaikan 50 sesi Lengkapi Kalimat sampai halaman hasil muncul tiap sesi.',
  85: 'Menjawab seluruh 10 soal dengan benar dalam satu sesi Lengkapi Kalimat.',
  86: 'Melengkapi 100 jawaban dengan benar, dihitung kumulatif dari semua sesi Lengkapi Kalimat.',
  87: 'Meraih skor 100% dalam 3 sesi Lengkapi Kalimat berturut-turut tanpa terputus.',
  88: 'Menyelesaikan sesi Flashcards pertama sampai halaman hasil muncul di layar.',
  89: 'Menyelesaikan 5 sesi Flashcards sampai halaman hasil muncul di setiap sesi.',
  90: 'Menyelesaikan 10 sesi Flashcards sampai halaman hasil muncul di setiap sesi.',
  91: 'Menyelesaikan 25 sesi Flashcards sampai halaman hasil muncul di setiap sesi.',
  92: 'Menyelesaikan 50 sesi Flashcards sampai halaman hasil muncul di setiap sesi.',
  93: 'Menjawab seluruh 10 kartu dengan benar dalam satu sesi Flashcards sampai selesai.',
  94: 'Menguasai 100 kartu Flashcards secara kumulatif dari semua sesi yang selesai.',
  95: 'Meninjau seluruh 10 kartu dalam satu sesi Flashcards tanpa melewatkan satu pun.',
  96: 'Menyelesaikan 10 sesi Flashcards dengan skor penguasaan minimal 90% di setiap sesi.',
  97: 'Membuka permainan Peta Sad Darsana untuk pertama kalinya dan mulai menjelajah.',
  98: 'Menyelesaikan satu wilayah pada Peta Sad Darsana dan meraih bintang pertamamu.',
  99: 'Menyelesaikan 4 dari 8 wilayah pada Peta Sad Darsana dengan meraih bintang.',
  100: 'Menyelesaikan seluruh 8 wilayah pada Peta Sad Darsana dengan meraih bintang.',
  101: 'Meraih bintang pertama dari salah satu wilayah pada Peta Sad Darsana.',
  102: 'Mengumpulkan total 6 bintang dari seluruh wilayah pada Peta Sad Darsana.',
  103: 'Mengumpulkan total 12 bintang dari seluruh wilayah pada Peta Sad Darsana.',
  104: 'Mengumpulkan total 18 bintang dari seluruh wilayah pada Peta Sad Darsana.',
  105: 'Mengumpulkan seluruh 24 bintang dari semua wilayah pada Peta Sad Darsana.',
  106: 'Meraih 3 bintang penuh dalam satu wilayah pada Peta Sad Darsana.',
  107: 'Meraih 3 bintang penuh di setiap wilayah pada Peta Sad Darsana.',
  108: 'Menjawab seluruh 10 soal dengan benar dalam satu wilayah Peta Sad Darsana.',
  109: 'Menjawab seluruh 10 soal dengan benar di 4 wilayah berbeda pada Peta.',
  110: 'Meraih 24 bintang dan menjawab seluruh soal dengan benar di semua wilayah.',
  111: 'Menyelesaikan ronde Jodohkan pertama sampai halaman hasil muncul di layar.',
  112: 'Memasangkan seluruh 5 pasangan dengan benar dalam satu ronde permainan Jodohkan.',
  113: 'Menyelesaikan kedua ronde dalam satu sesi Jodohkan sampai halaman hasil muncul.',
  114: 'Menyelesaikan 10 sesi Jodohkan sampai halaman hasil muncul di setiap sesi.',
  115: 'Memasangkan seluruh 10 pasangan dalam satu sesi Jodohkan tanpa satu pun kesalahan.',
  116: 'Menyelesaikan 25 sesi Jodohkan sampai halaman hasil muncul di setiap sesi.',
  117: 'Menyelesaikan permainan Jodohkan dengan total maksimal 20 langkah selama satu sesi penuh.',
  118: 'Menyelesaikan permainan Jodohkan dengan total maksimal 12 langkah selama satu sesi penuh.',
  119: 'Menyelesaikan satu sesi Jodohkan tanpa satu pun percobaan pasangan yang salah.',
  120: 'Menyelesaikan satu sesi Jodohkan dengan maksimal 10 langkah dan tanpa kesalahan.',
  121: 'Menyelesaikan permainan Cocokkan Kartu pertama sampai semua pasangan kartu berhasil ditemukan.',
  122: 'Menemukan seluruh 6 pasangan kartu dalam satu sesi permainan Cocokkan Kartu.',
  123: 'Menyelesaikan 5 sesi Cocokkan Kartu sampai semua pasangan berhasil ditemukan.',
  124: 'Menyelesaikan 10 sesi Cocokkan Kartu sampai semua pasangan berhasil ditemukan.',
  125: 'Menemukan seluruh 6 pasangan tanpa satu pun kesalahan pencocokan dalam satu sesi.',
  126: 'Menyelesaikan 25 sesi Cocokkan Kartu sampai semua pasangan berhasil ditemukan.',
  127: 'Menyelesaikan Cocokkan Kartu dengan maksimal 18 kartu dibuka, setara 9 giliran.',
  128: 'Menyelesaikan Cocokkan Kartu dengan maksimal 12 kartu dibuka, setara 6 giliran.',
  129: 'Menemukan seluruh 6 pasangan tanpa satu pun percobaan pasangan yang salah.',
  130: 'Menyelesaikan satu sesi Cocokkan Kartu dengan maksimal 12 kartu dibuka tanpa kesalahan.',
  131: 'Menyelesaikan teka-teki silang pertama sampai semua kotak berhasil terisi penuh.',
  132: 'Menyelesaikan 5 sesi teka-teki silang sampai halaman hasil muncul di setiap sesi.',
  133: 'Menyelesaikan 10 sesi teka-teki silang sampai halaman hasil muncul di setiap sesi.',
  134: 'Menyelesaikan 25 sesi teka-teki silang sampai halaman hasil muncul di setiap sesi.',
  135: 'Mengisi seluruh jawaban dengan benar dalam satu sesi teka-teki silang sampai selesai.',
  136: 'Menyelesaikan 50 sesi teka-teki silang sampai halaman hasil muncul di setiap sesi.',
  137: 'Menyelesaikan satu sesi Sprint Belajar dari tahap pertama sampai tahap terakhir.',
  138: 'Membuat dan menjalankan satu konfigurasi Sprint Belajar kustom buatanmu sendiri sampai selesai.',
  139: 'Menyelesaikan Sprint Belajar yang menggabungkan minimal 2 jenis latihan yang berbeda.',
  140: 'Menyelesaikan Sprint Belajar yang menggabungkan minimal 4 jenis latihan yang berbeda.',
  141: 'Menyelesaikan 10 sesi Sprint Belajar dari tahap pertama sampai tahap terakhir.',
  142: 'Menyelesaikan 5 konfigurasi Sprint Belajar yang berbeda dari tahap pertama sampai akhir.',
  143: 'Menyelesaikan satu Sprint Belajar dengan skor 100% pada seluruh latihan yang dipakai.',
  144: 'Memakai seluruh jenis latihan yang tersedia dalam Sprint Belajar setidaknya satu kali.',
  145: 'Menyelesaikan satu Sprint Belajar dengan tingkat kesulitan campuran dari awal sampai akhir.',
  146: 'Menyelesaikan satu Sprint Belajar dengan tingkat kesulitan mudah dari awal sampai akhir.',
  147: 'Menyelesaikan satu Sprint Belajar dengan tingkat kesulitan sedang dari awal sampai akhir.',
  148: 'Menyelesaikan satu Sprint Belajar dengan tingkat kesulitan sulit dari awal sampai akhir.',
  149: 'Menyelesaikan 100 sesi latihan individual yang tergabung dalam Sprint Belajar sampai selesai.',
  150: 'Menyelesaikan simulasi ujian pertama dari soal pertama sampai halaman hasil muncul.',
  151: 'Menyelesaikan satu simulasi ujian dengan tingkat kesulitan mudah sampai hasil muncul.',
  152: 'Menyelesaikan satu simulasi ujian dengan tingkat kesulitan sedang sampai hasil muncul.',
  153: 'Menyelesaikan satu simulasi ujian dengan tingkat kesulitan sulit sampai hasil muncul.',
  154: 'Meraih skor 100% dalam satu simulasi ujian tanpa satu pun jawaban salah.',
  155: 'Menyelesaikan satu simulasi ujian sebelum waktu habis hingga hasil akhir muncul.',
  156: 'Meraih skor minimal 90% dalam satu simulasi ujian dengan tingkat kesulitan sulit.',
  157: 'Menyelesaikan 10 simulasi ujian dari soal pertama sampai halaman hasil muncul.',
  158: 'Menyelesaikan simulasi ujian pada seluruh tingkat kesulitan yang tersedia, termasuk campuran.',
  159: 'Meraih skor minimal 90% dalam 5 simulasi ujian berturut-turut tanpa terputus.',
  160: 'Menyelesaikan satu simulasi ujian dengan tingkat kesulitan campuran sampai hasil muncul.',
  161: 'Menyelesaikan 5 simulasi ujian dengan tingkat kesulitan mudah sampai hasil muncul.',
  162: 'Menyelesaikan 5 simulasi ujian dengan tingkat kesulitan sedang sampai hasil muncul.',
  163: 'Menyelesaikan 5 simulasi ujian dengan tingkat kesulitan sulit sampai hasil muncul.',
  164: 'Menyelesaikan 5 simulasi ujian sebelum waktu habis dengan skor minimal 80%.',
  165: 'Menyelesaikan post-test pertama sampai hasil muncul, sebagai penutup perjalanan belajarmu.',
  166: 'Menyelesaikan post-test setelah seluruh slide materi selesai kamu pelajari sampai akhir.',
  167: 'Meraih skor post-test minimal 20 poin persentase di atas pretest yang setara.',
  168: 'Meraih skor minimal 90% pada post-test sebagai bukti penguasaan akhir materi.',
  169: 'Meraih skor 100% pada post-test tanpa satu pun jawaban yang salah.',
  170: 'Menyelesaikan seluruh materi, pretest, dan post-test dari awal sampai akhir.',
  171: 'Membuka AI chatbot untuk pertama kalinya dan mulai berdiskusi tentang materi.',
  172: 'Mengirim 10 pesan kepada AI chatbot dan menerima balasan dari setiap pesan.',
  173: 'Mengirim 50 pesan kepada AI chatbot dan menerima balasan dari setiap pesan.',
  174: 'Membahas minimal 5 topik berbeda terkait Sad Darsana bersama AI chatbot.',
  175: 'Menekan fitur AI yang khusus disediakan untuk mencoba kemampuan chatbot.',
  176: 'Membuka Studio untuk pertama kalinya dan mulai melihat alat pembuat latihan.',
  177: 'Membuat latihan pertama melalui Studio sampai latihan berhasil tersimpan di riwayat.',
  178: 'Membuat 5 latihan berbeda melalui Studio sampai semuanya berhasil tersimpan di riwayat.',
  179: 'Membuat minimal 3 jenis latihan berbeda melalui Studio sampai berhasil tersimpan.',
  180: 'Menyelesaikan latihan buatan sendiri dari Studio sampai halaman hasil muncul di layar.',
  181: 'Melengkapi seluruh data diri wajib pada profil sampai tidak ada yang tersisa.',
  182: 'Mengubah minimal satu data pada profilmu setelah proses pendaftaran selesai.',
  183: 'Mengunggah foto profil untuk pertama kalinya sebagai pengganti avatar bawaan.',
  184: 'Mengubah warna avatar untuk pertama kalinya agar tampilan profil lebih personal.',
  185: 'Melengkapi data diri, memasang foto profil, dan mengatur warna avatar sendiri.',
  186: 'Membagikan statistik profil memakai fitur berbagi yang tersedia di halaman profil.',
  187: 'Membagikan statistik profil setelah kamu mendapatkan minimal 10 achievement berbeda.',
  188: 'Menemukan satu easter egg tersembunyi di DharmaLearn lewat pemicu khususnya.',
  189: 'Menemukan 3 easter egg berbeda yang tersembunyi di DharmaLearn lewat pemicu khususnya.',
  190: 'Menemukan seluruh easter egg tersembunyi yang tersedia di DharmaLearn tanpa ada terlewat.',
  191: 'Memakai seluruh fitur belajar dan seluruh jenis latihan setidaknya satu kali.',
  192: 'Menuntaskan semua slide, meraih 24 bintang peta, dan skor 90% Kuis Maraton.',
  193: 'Mendapatkan 25 achievement berbeda dari seluruh pencapaian yang tersedia di DharmaLearn.',
  194: 'Mendapatkan 50 achievement berbeda dari seluruh pencapaian yang tersedia di DharmaLearn.',
  195: 'Mendapatkan 100 achievement berbeda dari seluruh pencapaian yang tersedia di DharmaLearn.',
  196: 'Mendapatkan 150 achievement berbeda dari seluruh pencapaian yang tersedia di DharmaLearn.',
  197: 'Menyelesaikan minimal satu sesi dari setiap jenis latihan dan permainan yang tersedia.',
  198: 'Meraih skor minimal 80% di sepuluh jenis latihan, permainan, dan ujian.',
  199: 'Menuntaskan materi, 24 bintang peta, post-test 90%, dan simulasi ujian sulit 90%.',
  200: 'Membuka seluruh 199 achievement lainnya sampai koleksi DharmaLearn benar-benar lengkap.'
};

GROUPS.forEach((g) =>
  g.items.forEach((a) => {
    if (DESC[a.id]) a.desc = DESC[a.id];
  })
);

/* ID resmi = urutan di GROUPS (1..200), sama persis dengan nomor di spec.
   Angka `id:` yang masih tertulis di item lama hanya dipakai DESC di atas. */
{
  let seq = 0;
  GROUPS.forEach((g) =>
    g.items.forEach((a) => {
      seq += 1;
      a.id = seq;
    })
  );
}

export const ACHIEVEMENTS = GROUPS.flatMap((g) => g.items);

if (ACHIEVEMENTS.length !== 200) {
  console.warn(`[Achievement] Jumlah achievement ${ACHIEVEMENTS.length}, seharusnya 200.`);
}

const GROUP_OF = new Map();
GROUPS.forEach((g) => g.items.forEach((a) => GROUP_OF.set(a.id, g)));

/* Tingkat: otomatis dari posisi dalam grup (awal = perunggu, tengah = perak,
   akhir = emas). Yang di bawah ini ditimpa manual. */
const POSITION_TIER = new Map();

GROUPS.forEach((g) =>
  g.items.forEach((a, i) => {
    const ratio = i / g.items.length;
    POSITION_TIER.set(a.id, ratio < 0.4 ? 'bronze' : ratio < 0.75 ? 'silver' : 'gold');
  })
);

const TIER_OVERRIDES = {
  36: 'legend',
  60: 'legend', 64: 'legend',   /* Marathon Sempurna, Juara Marathon */
  79: 'legend',                 /* Ahli Pernyataan (50 sesi) */
  113: 'legend',                /* Penguasa Peta */
  169: 'legend', 172: 'legend', /* Tuntas Belajar, 30 dari 30 post-test */
  191: 'gold', 192: 'legend', 193: 'bronze', 194: 'silver', 195: 'gold',
  196: 'legend', 197: 'gold', 198: 'gold', 199: 'legend', 200: 'legend'
};

const tierOf = (id) => TIER_OVERRIDES[id] || POSITION_TIER.get(id) || 'bronze';

/* ----------------------------------------------------------
   EVALUASI
   ---------------------------------------------------------- */

function buildContext(p) {
  const by = {};
  MODE_KEYS.forEach((key) => {
    by[key] = byType(p.attempts, key);
  });

  const inRange = (list) =>
    [...new Set(list)].filter((i) => Number.isInteger(i) && i >= 0 && i < MATERI_SLIDE_COUNT);

  const slidesDone = inRange(p.slidesDone);
  const slidesOpened = new Set([...inRange(p.slidesOpened), ...slidesDone]);
  const reopened = inRange(p.slideReopened);

  const quizzes = QUIZ_KEYS.flatMap((key) => by[key]);
  const bestQuiz = quizzes.reduce((best, a) => Math.max(best, scoreOf(a)), 0);

  /* audio & video */
  const finishedCount = (map) => Object.values(map).filter((n) => n > 0).length;
  const startedCount = (played, finished) =>
    new Set([...played.map(String), ...Object.keys(finished)]).size;

  const audioDone = finishedCount(p.audioFinished);
  const videoDone = finishedCount(p.videoFinished);
  const audioStarted = startedCount(p.audioPlayed, p.audioFinished);
  const videoStarted = startedCount(p.videoPlayed, p.videoFinished);

  /* glosarium & peta konsep */
  const glossary = new Set(p.glossaryTerms.map(String)).size;
  const branchSet = new Set(p.conceptBranches.map(String));
  const branches = CONCEPT_BRANCHES.filter((id) => branchSet.has(id)).length;
  const darsanaBranches = DARSANA_IDS.filter((id) => branchSet.has(id)).length;

  const featuresUsed = [
    slidesOpened.size > 0,
    p.summaries.singkat + p.summaries.lengkap > 0,
    p.conceptMapOpened || branchSet.size > 0,
    audioStarted > 0,
    videoStarted > 0,
    p.glossaryOpened || glossary > 0
  ].filter(Boolean).length;

  const materiParts = [
    slidesDone.length >= MATERI_SLIDE_COUNT,
    p.summaries.singkat > 0 && p.summaries.lengkap > 0,
    branches >= CONCEPT_BRANCHES.length,
    audioDone >= AUDIO_TOTAL,
    videoDone >= VIDEO_TOTAL,
    glossary >= GLOSSARY_TOTAL
  ].filter(Boolean).length;

  const peta = buildPeta(p.petaAttempts);

  /* sprint & ujian */
  const sprintTypeSet = new Set(
    p.sprints.flatMap((s) => sprintStages(s).map((x) => x.id))
  );

  const sprintConfigs = new Set(p.sprints.map((s) => s.signature).filter(Boolean)).size;

  const sprintStageCount = p.sprints.reduce(
    (sum, s) => sum + s.stages.filter((x) => !x.skipped).length,
    0
  );

  /* mode yang pernah dimainkan */
  const modesUsed = ALL_MODES.filter((mode) => {
    if (mode === 'peta') return peta.attempts.length > 0;
    if (mode === 'sprint') return p.sprints.length > 0;
    if (mode === 'exam') return p.exams.length > 0;
    return by[mode].length > 0;
  }).length;

  /* #198: skor >= 80% di setiap jenis latihan */
  const talentCount = [
    anyWhere(by.quick, (s) => s >= 80),
    anyWhere(by.full, (s) => s >= 80),
    anyWhere(by.ketik, (s) => s >= 80),
    anyWhere(by.tf, (s) => s >= 80),
    anyWhere(by.blank, (s) => s >= 80),
    anyWhere(by.flash, (s) => s >= 80),
    anyWhere(by.match, (s) => s >= 80),
    anyWhere(by.memory, (s) => s >= 80),
    anyWhere(by.tts, (s) => s >= 80),
    anyWhere(p.exams, (s) => s >= 80)
  ].filter(Boolean).length;

  const unlockedIds = Object.keys(p.unlocked);

  return {
    p,
    ...by,
    quizzes,
    bestQuiz,

    slideDone: slidesDone.length,
    slideOpened: slidesOpened.size,
    slideReopened: reopened.length,
    startsOpened: SLIDE_SECTION_STARTS.filter((i) => slidesOpened.has(i)).length,

    audioDone,
    videoDone,
    audioStarted,
    videoStarted,
    audioRepeat: maxOf(Object.values(p.audioFinished)),
    videoRepeat: maxOf(Object.values(p.videoFinished)),

    glossary,
    branches,
    darsanaBranches,
    featuresUsed,
    materiParts,

    peta,
    sprints: p.sprints,
    exams: p.exams,
    sprintTypes: sprintTypeSet.size,
    sprintConfigs,
    sprintStageCount,

    modesUsed,
    talentCount,
    prePostGain: hasPrePostGain(p),

    unlockedCount: unlockedIds.length,
    unlockedOthers: unlockedIds.filter((id) => id !== '200').length
  };
}

/* Cek semua achievement yang belum terbuka. Achievement yang sudah
   terbuka tidak pernah dicabut lagi. Diulang beberapa putaran karena
   achievement koleksi (#193-#196, #200) bergantung pada achievement lain. */
function evaluate(p) {
  const newlyUnlocked = [];

  for (let pass = 0; pass < 5; pass += 1) {
    const ctx = buildContext(p);
    let changed = false;

    for (const achievement of ACHIEVEMENTS) {
      if (p.unlocked[achievement.id]) continue;

      if (achievement.check(ctx)) {
        p.unlocked[achievement.id] = new Date().toISOString();
        newlyUnlocked.push(achievement);
        changed = true;
      }
    }

    if (!changed) break;
  }

  return newlyUnlocked;
}

const MAX_TOASTS = 3;
const TIER_RANK = { bronze: 0, silver: 1, gold: 2, legend: 3 };

function queueToasts(list) {
  /* yang paling langka tampil duluan */
  const sorted = [...list].sort(
    (a, b) => TIER_RANK[tierOf(b.id)] - TIER_RANK[tierOf(a.id)]
  );

  sorted.slice(0, MAX_TOASTS).forEach(showAchievementToast);

  /* Kalau sekaligus terbuka banyak, sisanya diringkas satu notifikasi */
  if (list.length > MAX_TOASTS) {
    showToast({
      icon: 'sparkles',
      kicker: 'Pencapaian terbuka',
      title: `+${list.length - MAX_TOASTS} achievement lainnya`,
      tier: 'gold'
    });
  }
}

function commit(mutate) {
  const p = loadProgress();
  mutate(p);

  const newlyUnlocked = evaluate(p);
  saveProgress(p);

  queueToasts(newlyUnlocked);

  return newlyUnlocked;
}

/* ----------------------------------------------------------
   API UNTUK FILE LAIN
   ---------------------------------------------------------- */

const clampScore = (correct, total) => Math.max(0, Math.min(Number(correct) || 0, total));

/* ----- belajar: slide ----- */

const validSlide = (i) => Number.isInteger(i) && i >= 0 && i < MATERI_SLIDE_COUNT;

export function recordMateriOpened() {
  return commit((p) => {
    p.materiOpened = true;
  });
}

/* Dipertahankan agar pemanggil lama tidak error. */
export function recordMateriDone(darsanaId) {
  return commit((p) => {
    p.materiOpened = true;
    if (DARSANA_IDS.includes(darsanaId)) addUnique(p.darsanaDone, darsanaId);
  });
}

/* Panggil setiap kali sebuah slide ditampilkan */
export function recordSlideOpened(index) {
  if (!validSlide(index)) return [];

  return commit((p) => {
    p.materiOpened = true;

    if (p.slidePasses === 0) {
      /* putaran pertama: melompati slide yang belum dibuka dicatat */
      const highest = p.slidesOpened.reduce((max, i) => Math.max(max, i), -1);
      if (index > highest + 1) p.slideSkipped = true;
    } else {
      addUnique(p.slideReopened, index);
    }

    addUnique(p.slidesOpened, index);
  });
}

/* Panggil saat pengguna selesai dengan sebuah slide (pindah ke slide berikutnya) */
export function recordSlideDone(index) {
  if (!validSlide(index)) return [];

  return commit((p) => {
    p.materiOpened = true;

    addUnique(p.slidesOpened, index);
    addUnique(p.slidesDone, index);
    addUnique(p.slidePass, index);

    if (p.slidePass.length >= MATERI_SLIDE_COUNT) {
      p.slidePasses += 1;
      p.slidePass = [];
    }

    if (p.slidesDone.length >= MATERI_SLIDE_COUNT) p.materiCompleted = true;
  });
}

/* ----- belajar: ringkasan, peta konsep, audio, video, glosarium ----- */

/* kind: 'singkat' | 'lengkap'. Panggil saat ringkasan dibaca sampai selesai. */
export function recordSummaryRead(kind) {
  if (!['singkat', 'lengkap'].includes(kind)) return [];

  return commit((p) => {
    p.materiOpened = true;
    p.summaries[kind] += 1;
  });
}

export function recordConceptMapOpened() {
  return commit((p) => {
    p.conceptMapOpened = true;
  });
}

export function recordConceptBranch(id) {
  return commit((p) => {
    p.conceptMapOpened = true;
    addUnique(p.conceptBranches, String(id));
  });
}

export function recordAudioPlayed(id) {
  return commit((p) => {
    addUnique(p.audioPlayed, String(id));
  });
}

export function recordAudioFinished(id) {
  return commit((p) => {
    const key = String(id);
    addUnique(p.audioPlayed, key);
    p.audioFinished[key] = (p.audioFinished[key] || 0) + 1;
  });
}

export function recordVideoPlayed(id) {
  return commit((p) => {
    addUnique(p.videoPlayed, String(id));
  });
}

export function recordVideoFinished(id) {
  return commit((p) => {
    const key = String(id);
    addUnique(p.videoPlayed, key);
    p.videoFinished[key] = (p.videoFinished[key] || 0) + 1;
  });
}

export function recordGlossaryOpened() {
  return commit((p) => {
    p.glossaryOpened = true;
  });
}

export function recordGlossaryTerm(termId) {
  return commit((p) => {
    p.glossaryOpened = true;
    addUnique(p.glossaryTerms, String(termId));
  });
}

/* ----- latihan ----- */

export function recordQuizOpened() {
  return commit((p) => {
    p.quizOpened = true;
  });
}

const RECORD_TYPES = ['quick', 'full', 'ketik', 'tf', 'blank', 'flash', 'tts', 'match', 'memory'];

/* extra (opsional, per jenis):
   ketik : { hints, exact }
   flash : { open }
   match : { mistakes, steps, rounds, perfectRounds }
   memory: { moves, mistakes } */
export function recordQuizResult({
  type,
  correct,
  total,
  perDarsana = null,
  extra = null
}) {
  if (!RECORD_TYPES.includes(type)) return [];
  if (!(total > 0)) return [];

  return commit((p) => {
    p.quizOpened = true;
    p.attempts.push({
      type,
      correct: clampScore(correct, total),
      total,
      perDarsana,
      extra,
      at: new Date().toISOString()
    });
  });
}

export function recordPetaOpened() {
  return commit((p) => {
    p.quizOpened = true;
    p.petaOpened = true;
  });
}

export function recordPetaResult({ regionId, correct, total, stars = 0 }) {
  if (!PETA_REGION_IDS.includes(regionId)) return [];
  if (!(total > 0)) return [];

  return commit((p) => {
    p.quizOpened = true;
    p.petaOpened = true;
    p.petaAttempts.push({
      regionId,
      correct: clampScore(correct, total),
      total,
      stars: Math.max(0, Math.min(3, stars)),
      at: new Date().toISOString()
    });
  });
}

/* Sprint Belajar dan Simulasi Ujian.
   stages: [{ id, correct, total, skipped }], signature: teks unik konfigurasi,
   isDefault: true kalau konfigurasinya sama dengan bawaan. */
export function recordExamResult({
  kind,
  level,
  correct = 0,
  total = 0,
  timedOut = false,
  stages = [],
  isDefault = false,
  signature = ''
}) {
  if (!['exam', 'sprint'].includes(kind)) return [];

  return commit((p) => {
    p.quizOpened = true;

    const record = {
      kind,
      level,
      correct: clampScore(correct, total),
      total,
      timedOut: Boolean(timedOut),
      isDefault: Boolean(isDefault),
      signature,
      stages: stages.map((x) => ({
        id: x.id,
        correct: x.correct,
        total: x.total,
        skipped: Boolean(x.skipped)
      })),
      at: new Date().toISOString()
    };

    (kind === 'sprint' ? p.sprints : p.exams).push(record);
  });
}

/* Posisi materi saat pretest/post-test dikerjakan */
const slidesAllDone = (p) =>
  new Set(p.slidesDone.filter(validSlide)).size >= MATERI_SLIDE_COUNT;

/* set: nama paket soal. Pretest dan post-test yang "setara" memakai set yang sama. */
export function recordPretestResult({ correct, total, set = 'default', viewed = true }) {
  if (!(total > 0)) return [];

  return commit((p) => {
    p.pretests.push({
      correct: clampScore(correct, total),
      total,
      set,
      viewed: Boolean(viewed),
      beforeMateri: !slidesAllDone(p),
      at: new Date().toISOString()
    });
  });
}

export function recordPosttestResult({ correct, total, set = 'default' }) {
  if (!(total > 0)) return [];

  return commit((p) => {
    p.posttests.push({
      correct: clampScore(correct, total),
      total,
      set,
      afterMateri: slidesAllDone(p),
      at: new Date().toISOString()
    });
  });
}

/* ----- advanced tools ----- */

export function recordChatOpened() {
  return commit((p) => {
    p.chat.opened = true;
  });
}

/* topic: id topik Darsana yang dibahas (mis. 'nyaya'); kosongkan kalau tidak diketahui */
export function recordChatMessage({ topic = '' } = {}) {
  return commit((p) => {
    p.chat.opened = true;
    p.chat.messages += 1;
    if (topic) addUnique(p.chat.topics, String(topic));
  });
}

export function recordChatTried() {
  return commit((p) => {
    p.chat.opened = true;
    p.chat.tried = true;
  });
}

export function recordStudioOpened() {
  return commit((p) => {
    p.studio.opened = true;
  });
}

/* Panggil HANYA kalau latihan berhasil dibuat. type: jenis latihan yang dibuat. */
export function recordStudioCreated({ type = '' } = {}) {
  return commit((p) => {
    p.studio.opened = true;
    p.studio.created += 1;
    if (type) addUnique(p.studio.types, String(type));
  });
}

/* Panggil saat latihan buatan Studio selesai dikerjakan */
export function recordStudioCompleted() {
  return commit((p) => {
    p.studio.opened = true;
    p.studio.completed += 1;
  });
}

export function recordProfileCompleted() {
  return commit((p) => {
    p.profile.complete = true;
  });
}

export function recordProfileEdited() {
  return commit((p) => {
    p.profile.edited = true;
  });
}

export function recordAvatarPhoto() {
  return commit((p) => {
    p.profile.photo = true;
  });
}

export function recordAvatarColor() {
  return commit((p) => {
    p.profile.color = true;
  });
}

/* Panggil setelah pengguna benar-benar membagikan statistik */
export function recordShare() {
  return commit((p) => {
    p.shares.push({
      unlocked: Object.keys(p.unlocked).length,
      at: new Date().toISOString()
    });
  });
}

/* id: nama unik easter egg. Panggil di pemicu khusus easter egg, bukan di halaman biasa. */
const EGG_TITLES = {
  konami: 'Kode Rahasia',
  moksa: 'Kata Pembebasan',
  om: 'Gema Om'
};

export function recordEasterEgg(id) {
  const isNew = !loadProgress().eggs.includes(String(id));
  const unlocked = commit((p) => {
    addUnique(p.eggs, String(id));
  });

  /* antrean toast otomatis berurutan: toast easter egg ikut antre di belakang */
  if (isNew) {
    showToast({
      icon: 'sparkles',
      kicker: 'Easter egg ditemukan',
      title: EGG_TITLES[id] || 'Rahasia tersembunyi',
      tier: 'gold'
    });
  }

  return unlocked;
}

/* Easter egg global (dipasang sekali dari main.js):
   1. Kode Konami: ↑ ↑ ↓ ↓ ← → ← → B A
   2. Mengetik "moksa" di luar kolom input */
let eggsInstalled = false;

export function installEasterEggs() {
  if (eggsInstalled || typeof document === 'undefined') return;
  eggsInstalled = true;

  const KONAMI = [
    'arrowup', 'arrowup', 'arrowdown', 'arrowdown',
    'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'
  ];

  let pos = 0;
  let typed = '';

  /* addEventListener (bukan document.onkeydown) supaya tidak menimpa handler tiap halaman */
  document.addEventListener('keydown', (ev) => {
    const t = ev.target;

    if (
      t instanceof HTMLElement &&
      (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
    ) {
      return;
    }

    const key = String(ev.key).toLowerCase();

    pos = key === KONAMI[pos] ? pos + 1 : key === KONAMI[0] ? 1 : 0;

    if (pos === KONAMI.length) {
      pos = 0;
      recordEasterEgg('konami');
    }

    if (key.length === 1) {
      typed = (typed + key).slice(-5);

      if (typed === 'moksa') {
        typed = '';
        recordEasterEgg('moksa');
      }
    }
  });
}
/* Best Streak = jumlah sesi latihan sempurna (semua soal benar) yang
   berturut-turut terpanjang, menurut urutan waktu. Cocokkan Kartu tidak
   dihitung karena tidak punya skor benar/salah. */
function bestPerfectStreak(p) {
  let best = 0;
  let run = 0;

  for (const attempt of p.attempts) {
    if (attempt.type === 'memory') continue;

    if (isPerfect(attempt)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }

  return best;
}

/* Semua angka untuk halaman Profile (satu sumber data) */
export function getProfileSnapshot() {
  const p = loadProgress();

  /* #190 Penjaga Progres: halaman progres dibuka setelah >= 5 sesi latihan */
  const sessionTotal =
    p.attempts.length + p.petaAttempts.length + p.sprints.length + p.exams.length;

  if (sessionTotal >= 5) p.progressViewed = true;

  const fresh = evaluate(p);
  saveProgress(p);
  queueToasts(fresh);

  const ctx = buildContext(p);
  const mode = (list) => ({ sessions: list.length, ...totals(list) });

  return {
    slides: {
      done: ctx.slideDone,
      total: MATERI_SLIDE_COUNT
    },
    modes: {
      quick: mode(ctx.quick),
      full: mode(ctx.full),
      ketik: mode(ctx.ketik),
      tf: mode(ctx.tf),
      blank: mode(ctx.blank),
      flash: mode(ctx.flash),
      tts: mode(ctx.tts),
      match: mode(ctx.match),
      memory: mode(ctx.memory)
    },
    peta: {
      stars: ctx.peta.stars,
      maxStars: PETA_MAX_STARS,
      answered: ctx.peta.answered,
      correct: ctx.peta.correct
    },
    achievements: {
      unlocked: Object.keys(p.unlocked).length,
      total: ACHIEVEMENTS.length
    },
    bestStreak: bestPerfectStreak(p)
  };
}

export function getAchievementSummary() {
  const p = loadProgress();

  return {
    unlocked: Object.keys(p.unlocked).length,
    total: ACHIEVEMENTS.length
  };
}

/* ----------------------------------------------------------
   NOTIFIKASI
   `icon` = nama ikon dari icons.js
   ---------------------------------------------------------- */

/* Tampilan notifikasi ngikut kelangkaan:
   perunggu = sederhana & singkat
   perak    = + kilau sekali
   emas     = + kilau 2x, ikon berdenyut, lebih lama
   legenda  = lebih besar, border berputar, percikan, getar, paling lama */
const TOAST_CFG = {
  bronze: { label: 'Pencapaian terbuka', ms: 2600, icon: 22 },
  silver: { label: 'Pencapaian Perak', ms: 3200, icon: 22 },
  gold: { label: 'Pencapaian Emas', ms: 3900, icon: 24 },
  legend: { label: 'PENCAPAIAN LEGENDA', ms: 7200, icon: 30 }
};

const toastQueue = [];
let toastBusy = false;

function pumpToasts() {
  if (toastBusy) return;

  const next = toastQueue.shift();
  if (!next) return;

  toastBusy = true;

  playToast(next, () => {
    toastBusy = false;
    setTimeout(pumpToasts, 200);
  });
}

/* Semua toast masuk antrean, tampil satu per satu */
function showToast(options) {
  toastQueue.push(options);
  pumpToasts();
}
/* ---------- efek layar penuh khusus LEGENDA ---------- */

const LEGEND_SOUND = true; /* ubah ke false kalau tidak mau ada bunyi */

let audioCtx = null;

function playChime() {
  if (!LEGEND_SOUND) return;

  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;

    audioCtx = audioCtx || new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const t0 = audioCtx.currentTime;

    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const t = t0 + i * 0.09;

      osc.type = 'triangle';
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);

      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.95);
    });
  } catch {
    /* audio diblokir: abaikan */
  }
}

function createLegendFx(cx) {
  const fx = document.createElement('div');
  const colors = ['#d88cff', '#6a5cff', '#ffd479', '#ffffff', '#f2b84b'];

  const confetti = Array.from({ length: 64 }, (_, i) => {
    const w = 6 + Math.random() * 7;

    return `<i style="--x:${(Math.random() * 100).toFixed(1)}vw;--dx:${(Math.random() * 180 - 90).toFixed(0)}px;--d:${(Math.random() * 1000).toFixed(0)}ms;--t:${(2400 + Math.random() * 1800).toFixed(0)}ms;--r:${(360 + Math.random() * 900).toFixed(0)}deg;--c:${colors[i % colors.length]};--w:${w.toFixed(1)}px"></i>`;
  }).join('');

  fx.className = 'ach-fx';
  fx.style.setProperty('--cx', `${cx}px`);
  fx.setAttribute('aria-hidden', 'true');
  fx.innerHTML = `
    <span class="ach-fx-flash"></span>
    <span class="ach-fx-edge"></span>
    <span class="ach-fx-rays"></span>
    ${confetti}
  `;

  document.documentElement.appendChild(fx);

  return fx;
}

function playToast({ icon, kicker, title, tier = 'gold' }, done) {
  const cfg = TOAST_CFG[tier] || TOAST_CFG.bronze;
  const isLegend = tier === 'legend';
  const toast = document.createElement('div');

  const sparks = isLegend
    ? Array.from(
        { length: 16 },
        (_, i) => `<i class="ach-spark" style="--a:${i * 22.5}deg;--d:${(i % 4) * 90}ms"></i>`
      ).join('')
    : '';

  toast.className = `ach-toast tier-${tier}`;
  toast.setAttribute('role', 'status');
  toast.innerHTML = `
    <span class="ach-toast-mark" aria-hidden="true">${ic(icon, cfg.icon)}</span>
    <span class="ach-toast-text">
      <small>${escapeHtml(kicker || cfg.label)}</small>
      <strong>${escapeHtml(title)}</strong>
    </span>
    <em class="ach-toast-rank">${escapeHtml(TIER_LABEL[tier] || '')}</em>
    ${sparks}
  `;

  /* titik tengah dihitung SEKALI lalu dikunci (px), supaya notif tidak
     ikut bergeser saat layout halaman berubah setelah dia muncul */
  const centerX = Math.round(document.documentElement.clientWidth / 2);

  const fx = isLegend && !prefersReducedMotion() ? createLegendFx(centerX) : null;

  /* dipasang ke <html>, bukan <body>, supaya tidak ikut bergeser
     saat halaman/transisi mengubah <body> */
  document.documentElement.appendChild(toast);

  /* kunci posisi & lebar dalam px: setelah ini tidak ada yang bisa
     menggeser notif (scrollbar, CSS halaman lain, ukuran font, dll.) */
  toast.style.boxSizing = 'border-box';
  toast.style.maxWidth = 'none';
  toast.style.width = `${toast.offsetWidth + 2}px`;
  toast.style.left = `${centerX}px`;
  toast.style.viewTransitionName = 'ach-toast';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('visible'));
  });

  if (isLegend) {
    playChime();

    try {
      navigator.vibrate?.([40, 60, 40, 60, 120]);
    } catch {
      /* perangkat tidak mendukung getar */
    }
  }

  setTimeout(() => {
    toast.classList.remove('visible');
    fx?.classList.add('is-out');

    setTimeout(() => {
      toast.remove();
      fx?.remove();
      done();
    }, 650);
  }, cfg.ms);
}
function showAchievementToast(achievement) {
  const group = GROUP_OF.get(achievement.id);
  const tier = tierOf(achievement.id);
  const label = TOAST_CFG[tier].label;

  showToast({
    icon: group?.icon || 'check',
    kicker: tier === 'legend' ? label : `${label} · ${group?.title || ''}`,
    title: achievement.title,
    tier
  });
}

/* ----------------------------------------------------------
   HALAMAN ACHIEVEMENT
   ---------------------------------------------------------- */

let revealObserver = null;
let swapToken = 0;
let leaving = false;

const SWAP_OUT_MS = 280;

const FILTER_TEST = {
  all: () => true,
  unlocked: (p, a) => Boolean(p.unlocked[a.id]),
  locked: (p, a) => !p.unlocked[a.id]
};

/* Halaman memudar keluar (naik + blur) dulu, baru pindah */
function leaveThen(fn) {
  if (leaving) return;

  const content = document.querySelector('.ach-content');

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

export function renderAchievement({ onBack, name, anonymous, fromProfile = false } = {}) {
  const app = getApp();
  const p = loadProgress();

  /* pastikan state terbaru ikut ter-evaluasi saat halaman dibuka */
  evaluate(p);
  saveProgress(p);

  const ctx = buildContext(p);
  const unlockedCount = Object.keys(p.unlocked).length;
  const total = ACHIEVEMENTS.length;
  const percent = Math.round((unlockedCount / total) * 100);

  const tierStats = Object.keys(TIER_LABEL).map((tier) => {
    const all = ACHIEVEMENTS.filter((a) => tierOf(a.id) === tier);
    const done = all.filter((a) => p.unlocked[a.id]).length;
    return { tier, done, total: all.length };
  });

  /* reset state modul tiap halaman dibuka */
  revealObserver?.disconnect();
  revealObserver = null;
  swapToken += 1;
  leaving = false;

  app.innerHTML = `
    <main class="page ach-page">
      <div class="ach-glow ach-glow-a"></div>
      <div class="ach-glow ach-glow-b"></div>

      <nav class="ach-nav">
        <button class="ach-nav-back" id="achBack" type="button">
          ${icons.chevronLeft}<span>Kembali</span>
        </button>

        <div class="ach-nav-right">
          <button class="ach-nav-brand" id="achBrand" type="button">
          <span class="ach-nav-symbol">ॐ</span>  
          <span>DharmaLearn</span>
          </button>

          <button class="ach-nav-account" id="achAccount" type="button" aria-label="Akun" title="Akun">
            ${icons.user}
          </button>
        </div>
      </nav>

      <div class="ach-scroller" id="achScroller">
      <section class="ach-content">
        <header class="ach-heading">
          <span class="ach-eyebrow">PERJALANAN BELAJAR</span>
          <h1>Pencapaian</h1>
                    <p>Pencapaian dari belajar, latihan, permainan, dan alat bantu yang sudah kamu selesaikan.</p>
        </header>

        <div class="ach-hero">
          <div
            class="ach-ring"
            role="progressbar"
            aria-label="Progres pencapaian"
            aria-valuemin="0"
            aria-valuemax="${total}"
            aria-valuenow="${unlockedCount}"
          >
            <div class="ach-ring-arc" id="achRingArc"></div>
            <div class="ach-ring-inner">
              <b id="achCount">${unlockedCount}</b>
              <span>dari ${total}</span>
            </div>
          </div>

          <div class="ach-hero-info">
            <h2>${percent}% pencapaian terbuka</h2>
            <p>${
              unlockedCount === total
                ? 'Semua pencapaian sudah terbuka. Luar biasa.'
                : `Tinggal ${total - unlockedCount} lagi. Lanjut belajar dan main kuis untuk membukanya.`
            }</p>

            <ul class="ach-tiers">
              ${tierStats
                .map(
                  (t) => `
                    <li class="tier-${t.tier}">
                      <i aria-hidden="true"></i>
                      <span>${TIER_LABEL[t.tier]}</span>
                      <b>${t.done}/${t.total}</b>
                    </li>
                  `
                )
                .join('')}
            </ul>
          </div>
        </div>

        <div class="ach-filters" role="group" aria-label="Filter pencapaian">
          <button class="ach-filter is-active" data-filter="all" type="button">
            Semua <b>${total}</b>
          </button>
          <button class="ach-filter" data-filter="unlocked" type="button">
            Terbuka <b>${unlockedCount}</b>
          </button>
          <button class="ach-filter" data-filter="locked" type="button">
            Terkunci <b>${total - unlockedCount}</b>
          </button>
        </div>

        ${catsHtml(p)}

        <div class="ach-groups" id="achGroups">
          ${groupsHtml('all', p, ctx)}
        </div>
      </section>
      </div>
    </main>
  `;

  const goBack = () => {
    if (typeof onBack === 'function') onBack();
  };

  const openProfile = () => {
    /* Achievement ini dibuka DARI Profile -> cukup mundur ke Profile tadi,
       jangan tumpuk Profile baru di stack (itu penyebab loop). */
    if (fromProfile) {
      goBack();
      return;
    }

    renderProfile({
      name,
      anonymous,
      fromAchievement: true,
      onBack: () => renderAchievement({ onBack, name, anonymous })
    });
  };

  document.querySelector('#achBack').onclick = () => leaveThen(goBack);
  document.querySelector('#achBrand').onclick = () => leaveThen(goBack);
  document.querySelector('#achAccount').onclick = () => leaveThen(openProfile);

  /* scroll sekarang ada di #achScroller, mulai dari atas otomatis */

  const cats = setupCategories();
  setupFilters(p, ctx, cats.refresh);
  setupReveal();
  animateHero(percent, unlockedCount);
}

/* ----------------------------------------------------------
   RENDER DAFTAR
   Daftar dirender ulang sesuai filter (bukan sekadar disembunyikan),
   sehingga setiap kartu baru selalu mulai dari keadaan awal dan
   bisa beranimasi masuk dengan benar.
   ---------------------------------------------------------- */

/* ----------------------------------------------------------
   KATEGORI (bilah di atas daftar)
   Nama kategori = teks sebelum " · " pada judul grup.
   ---------------------------------------------------------- */

const categoryOf = (group) => group.title.split(' · ')[0];

const CATEGORIES = [...new Set(GROUPS.map(categoryOf))];

function catsHtml(p) {
  return `
    <nav class="ach-cats" id="achCats" aria-label="Kategori pencapaian">
      <span class="ach-cat-pill" aria-hidden="true"></span>
      ${CATEGORIES.map((cat) => {
        const items = GROUPS.filter((g) => categoryOf(g) === cat).flatMap((g) => g.items);
        const done = items.filter((a) => p.unlocked[a.id]).length;

        return `
          <button class="ach-cat" type="button" data-cat="${escapeHtml(cat)}">
            <span>${escapeHtml(cat)}</span>
            <b>${done}/${items.length}</b>
          </button>
        `;
      }).join('')}
    </nav>
  `;
}

/* Kategori:
   - chip aktif = satu "pil" yang meluncur ke chip tujuan (tanpa singgah)
   - awal: kategori paling atas langsung aktif
   - klik chip: pil langsung pindah, halaman di-scroll dengan animasi easing,
     dan highlight dikunci sampai pengguna scroll sendiri
   - scroll manual: pil mengikuti kategori yang sedang terlihat */
function setupCategories() {
  const sc = document.querySelector('#achScroller');
  const bar = document.querySelector('#achCats');

  if (!sc || !bar) return { refresh() {} };

  const pill = bar.querySelector('.ach-cat-pill');
  const chips = [...bar.querySelectorAll('.ach-cat')];
  const groups = () => [...document.querySelectorAll('.ach-group')];
  const firstGroup = (cat) => groups().find((el) => el.dataset.cat === cat);
  const chipOf = (cat) => chips.find((c) => c.dataset.cat === cat);

  let activeCat;
  let pinned = null;
  let tween = 0;
  let ticking = false;

  const placePill = (instant = false) => {
    const chip = chipOf(activeCat);

    if (!pill) return;

    if (!chip) {
      pill.classList.remove('is-on');
      return;
    }

    /* pertama kali muncul: langsung di tempat, tanpa meluncur dari mana-mana */
    const jump = instant || !pill.classList.contains('is-on');

    if (jump) pill.classList.add('is-instant');

    pill.style.width = `${chip.offsetWidth}px`;
    pill.style.height = `${chip.offsetHeight}px`;
    pill.style.transform = `translate(${chip.offsetLeft}px, ${chip.offsetTop}px)`;
    pill.classList.add('is-on');

    if (jump) {
      void pill.offsetWidth;
      pill.classList.remove('is-instant');
    }
  };

  const setActive = (cat, instant = false) => {
    if (cat === activeCat && !instant) return;
    activeCat = cat;

    chips.forEach((chip) => {
      const on = chip.dataset.cat === cat;
      chip.classList.toggle('is-active', on);

      if (on) chip.setAttribute('aria-current', 'true');
      else chip.removeAttribute('aria-current');
    });

    placePill(instant);

    /* di layar sempit bilah bisa digeser: bawa chip aktif ke tengah */
    const chip = chipOf(cat);

    if (chip) {
      bar.scrollTo({
        left: chip.offsetLeft - (bar.clientWidth - chip.offsetWidth) / 2,
        behavior: instant ? 'auto' : 'smooth'
      });
    }
  };

  /* animasi scroll sendiri (easing) supaya durasinya konsisten */
  const scrollToY = (y) => {
    cancelAnimationFrame(tween);

    const from = sc.scrollTop;
    const to = Math.max(0, Math.min(y, sc.scrollHeight - sc.clientHeight));

    if (prefersReducedMotion() || Math.abs(to - from) < 2) {
      sc.scrollTop = to;
      return;
    }

    const dur = Math.min(950, 450 + Math.abs(to - from) * 0.12);
    const t0 = performance.now();

    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      sc.scrollTop = from + (to - from) * e;

      if (t < 1) tween = requestAnimationFrame(step);
    };

    tween = requestAnimationFrame(step);
  };

  const spy = () => {
    ticking = false;
    if (pinned) return;

    const list = groups();

    if (!list.length) {
      setActive(null);
      return;
    }

    const line = sc.getBoundingClientRect().top + bar.offsetHeight + 40;
    const scrollable = sc.scrollHeight > sc.clientHeight + 8;
    const atBottom = scrollable && sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4;

    /* default = kategori paling atas */
    let current = list[0].dataset.cat;

    for (const el of list) {
      if (el.getBoundingClientRect().top <= line) current = el.dataset.cat;
      else break;
    }

    if (atBottom) current = list[list.length - 1].dataset.cat;

    setActive(current);
  };

  chips.forEach((chip) =>
    chip.addEventListener('click', () => {
      const target = firstGroup(chip.dataset.cat);
      if (!target) return;

      pinned = chip.dataset.cat;
      setActive(pinned);

      const top =
        sc.scrollTop +
        target.getBoundingClientRect().top -
        sc.getBoundingClientRect().top -
        bar.offsetHeight -
        24;

      scrollToY(top);
    })
  );

  /* pengguna scroll sendiri -> lepas kunci, spy aktif lagi */
  const release = () => {
    pinned = null;
    cancelAnimationFrame(tween);
  };

  ['wheel', 'touchstart', 'pointerdown'].forEach((name) =>
    sc.addEventListener(name, release, { passive: true })
  );

  const onKey = () => {
    if (!sc.isConnected) {
      document.removeEventListener('keydown', onKey);
      return;
    }

    release();
  };

  document.addEventListener('keydown', onKey);

  sc.addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(spy);
    },
    { passive: true }
  );

  /* ukuran berubah (resize / font selesai dimuat): posisikan ulang pil */
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => placePill(true)).observe(bar);
  }

  document.fonts?.ready.then(() => placePill(true));

  /* dipanggil tiap daftar diganti (pindah filter) */
  const refresh = () => {
    chips.forEach((chip) => {
      chip.disabled = !firstGroup(chip.dataset.cat);
    });

    pinned = null;
    activeCat = undefined;
    spy();
  };

  refresh();

  return { refresh };
}

function groupsHtml(filter, p, ctx) {
  const html = GROUPS.map((group) => renderGroup(group, p, ctx, filter)).join('');
  return html || emptyHtml(filter);
}

function emptyHtml(filter) {
  const text =
    filter === 'unlocked'
      ? 'Belum ada pencapaian yang terbuka. Buka materi atau kerjakan kuis untuk memulai.'
      : 'Semua pencapaian sudah terbuka.';

  return `<p class="ach-empty ach-reveal">${escapeHtml(text)}</p>`;
}

function renderGroup(group, p, ctx, filter) {
  const test = FILTER_TEST[filter] || FILTER_TEST.all;
  const visible = group.items.filter((a) => test(p, a));

  if (!visible.length) return '';

  const done = group.items.filter((a) => p.unlocked[a.id]).length;
  const pct = Math.round((done / group.items.length) * 100);

  return `
    <section
      class="ach-group ${done === group.items.length ? 'is-complete' : ''}"
      id="ach-group-${group.id}"
      data-cat="${escapeHtml(categoryOf(group))}"
    >
      <header class="ach-group-head ach-reveal">
        <span class="ach-group-icon" aria-hidden="true">${ic(group.icon, 26)}</span>

        <div class="ach-group-title">
          <h2>${escapeHtml(group.title)}</h2>
          <div class="ach-group-bar" aria-hidden="true">
            <span style="width:${pct}%"></span>
          </div>
        </div>

        <span class="ach-group-count">${done}/${group.items.length}</span>
      </header>

      <ul class="ach-list">
        ${visible.map((a) => renderItem(a, p, ctx, group)).join('')}
      </ul>
    </section>
  `;
}

function renderItem(achievement, p, ctx, group) {
  const unlockedAt = p.unlocked[achievement.id];
  const tier = tierOf(achievement.id);

    /* Achievement tanpa progress() (cuma check) dianggap 0/1 */
  const progress = unlockedAt
    ? null
    : achievement.progress
      ? achievement.progress(ctx)
      : { value: 0, target: 1 };

  let footer;

  if (unlockedAt) {
    footer = `<small class="ach-status">Terbuka ${escapeHtml(formatDate(unlockedAt))}</small>`;
  } else {
    const pct = Math.round((progress.value / progress.target) * 100);
    footer = `
      <div class="ach-prog">
        <div class="ach-prog-track" aria-hidden="true"><span style="width:${pct}%"></span></div>
        <small>${progress.value} / ${progress.target}</small>
      </div>
    `;
  }

  return `
    <li class="ach-item ach-reveal tier-${tier} ${unlockedAt ? 'is-unlocked' : 'is-locked'}">
      <div class="ach-medal" aria-hidden="true">
        <span class="ach-medal-icon">${ic(group.icon, 26)}</span>
        ${unlockedAt ? '' : `<span class="ach-medal-lock">${ic('lock', 11, 2.2)}</span>`}
      </div>

      <div class="ach-body">
        <div class="ach-body-top">
          <h3>${escapeHtml(achievement.title)}</h3>
          <span class="ach-tier-tag">${TIER_LABEL[tier]}</span>
        </div>
        <p>${escapeHtml(achievement.desc)}</p>
        ${footer}
      </div>
    </li>
  `;
}

/* ----------------------------------------------------------
   INTERAKSI HALAMAN
   ---------------------------------------------------------- */

/* Pindah filter:
   1. daftar memudar keluar (naik + blur)
   2. isi daftar diganti, kartu baru mulai dari keadaan awal
   3. kartu masuk lagi lewat observer scroll (naik + blur -> jelas) */
function setupFilters(p, ctx, onMount) {
  const buttons = [...document.querySelectorAll('.ach-filter')];
  const groupsEl = document.querySelector('#achGroups');

  let current = 'all';

  const mount = (filter) => {
    groupsEl.innerHTML = groupsHtml(filter, p, ctx);

    /* kembali ke keadaan normal tanpa transisi */
    groupsEl.classList.add('is-swap-reset');
    groupsEl.classList.remove('is-swapping');
    void groupsEl.offsetHeight;
    groupsEl.classList.remove('is-swap-reset');

    /* kalau halaman sedang di-scroll jauh, bawa bilah filter kembali terlihat */
    const sc = document.querySelector('#achScroller');
    const bar = document.querySelector('.ach-filters');

    if (sc && bar) {
      const catsH = document.querySelector('#achCats')?.offsetHeight || 0;
      const gap = catsH + 28;
      const delta = bar.getBoundingClientRect().top - sc.getBoundingClientRect().top;
      if (delta < gap) sc.scrollTop += delta - gap;
    }

    setupReveal();
    onMount?.();
  };

  const switchTo = (filter) => {
    if (filter === current) return;
    current = filter;

    buttons.forEach((b) =>
      b.classList.toggle('is-active', b.dataset.filter === filter)
    );

    if (prefersReducedMotion()) {
      mount(filter);
      return;
    }

    const token = ++swapToken;

    groupsEl.classList.add('is-swapping');

    setTimeout(() => {
      if (token !== swapToken) return;
      mount(filter);
    }, SWAP_OUT_MS);
  };

  buttons.forEach((b) =>
    b.addEventListener('click', () => switchTo(b.dataset.filter))
  );
}

/* Semua kartu yang sejajar horizontal (satu baris grid) */
function rowOf(el) {
  const list = el.closest('.ach-list');
  if (!list) return [el];

  const top = el.offsetTop;

  return [...list.children].filter(
    (child) => Math.abs(child.offsetTop - top) < 4
  );
}

/* Kartu naik + fade + blur saat masuk layar; keluar layar = memudar lagi.
   Status disimpan di atribut data-pos: 'in' | 'above' | 'below'. */
function setupReveal() {
  revealObserver?.disconnect();
  revealObserver = null;

  const targets = [...document.querySelectorAll('.ach-reveal')];

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
          : entry.boundingClientRect.top <
              (entry.rootBounds
                ? entry.rootBounds.top + entry.rootBounds.height / 2
                : window.innerHeight / 2)
            ? 'above'
            : 'below';

        /* Satu baris = satu gerakan: semua kartu sejajar ikut bareng */
        rowOf(entry.target).forEach((el) => {
          el.dataset.pos = pos;
        });
      }
    },
    {
      root: document.querySelector('#achScroller'),
      threshold: 0.12,
      rootMargin: '-6% 0px -6% 0px'
    }
  );

  targets.forEach((el) => revealObserver.observe(el));
}

function animateHero(percent, unlockedCount) {
  const arc = document.querySelector('#achRingArc');
  const counter = document.querySelector('#achCount');

  if (!arc || !counter) return;

  if (prefersReducedMotion()) {
    arc.style.setProperty('--ach-pct', percent);
    return;
  }

  counter.textContent = '0';

  requestAnimationFrame(() =>
    requestAnimationFrame(() => arc.style.setProperty('--ach-pct', percent))
  );

  if (unlockedCount === 0) return;

  const start = performance.now();
  const duration = 1100;

  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    counter.textContent = Math.round(unlockedCount * eased);
    if (t < 1) requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return '';
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}