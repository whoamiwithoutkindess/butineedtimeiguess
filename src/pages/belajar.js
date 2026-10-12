import { getApp } from '../main.js';
import materiText from '../materi/Materi.txt?raw';
import {
  recordMateriOpened,
  recordMateriDone,
  recordSlideOpened,
  recordSlideDone,
  recordSummaryRead,
  recordConceptMapOpened,
  recordConceptBranch,
  recordAudioPlayed,
  recordAudioFinished,
  recordVideoPlayed,
  recordVideoFinished,
  recordGlossaryOpened,
  recordGlossaryTerm
} from './achievements.js';
import { icons } from './icons.js';
import { configureMateri } from './achievements.js';
import { renderProfile } from './profile.js';

/* =========================================================
   HELPERS
   ========================================================= */

const e = escapeHTML;

const pad = n => String(n).padStart(2, '0');
const stripColon = t => String(t || '').replace(/:\s*$/, '').trim();
const stripDot = t => String(t || '').replace(/[.\s]+$/, '').trim();
const normalize = t =>
  String(t || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function escapeHTML(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function firstSentence(text) {
  const match = String(text || '').match(/^.+?[.!?](?=\s|$)/);
  return match ? match[0] : String(text || '');
}

/* ikon inline (stroke) untuk halaman baru */
const svg = (d, size = 24) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

const ui = {
  slides: svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  summary: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
  map: svg('<circle cx="12" cy="5" r="2.5"/><circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M11 7.3 7 16.7M13 7.3l4 9.4"/>'),
  audio: svg('<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/>'),
  video: svg('<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5.5 3.5-5.5 3.5z" fill="currentColor"/>'),
  book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M20 17v4H6.5A2.5 2.5 0 0 1 4 18.5"/>'),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>', 20),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', 20),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>', 16),
  copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>', 18),
  play: svg('<path d="M8 5l11 7-11 7z" fill="currentColor"/>', 22),
  pause: svg('<path d="M8 5v14M16 5v14" stroke-width="3"/>', 22),
    back10: svg('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.4"/><path d="M3.5 3.5v5h5"/><text x="12" y="15" text-anchor="middle" font-size="7.5" font-weight="800" fill="currentColor" stroke="none">10</text>', 22),
  fwd10: svg('<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1l2.6 2.5"/><path d="M20.5 3.5v5h-5"/><text x="12" y="15" text-anchor="middle" font-size="7.5" font-weight="800" fill="currentColor" stroke="none">10</text>', 22)
};
/* =========================================================
   PARSER MATERI.TXT  (struktur baru: bab → sub-bab → butir)
   "1. JUDUL BAB"     -> bab
   "1.1 Sub-bab"      -> sub-bab (= satu slide)
   "1.2.1 Butir"      -> butir   (= kartu di dalam slide)
   "CATATAN ISTILAH"  -> bab penutup (tanpa nomor di file)
   ========================================================= */

const RE_BAB = /^(\d+)\.\s+(.+)$/;
const RE_SUB = /^(\d+)\.(\d+)\s+(.+)$/;
const RE_BUTIR = /^(\d+)\.(\d+)\.(\d+)\s+(.+)$/;
const RE_CATATAN = /^catatan istilah$/i;

/* "Tokoh ... adalah X." dan "Teks ... adalah Y." ditarik jadi kartu fakta */
const RE_TOKOH = /(^|\.\s+)(Tokoh[^.]*?(?:adalah|antara lain)\s+([^.]+)\.)(\s+|$)/;
const RE_TEKS = /(^|\.\s+)((?:Salah satu )?Teks[^.]*?adalah\s+([^.]+)\.)(\s+|$)/i;

/* paragraf penutup yang menempel di butir terakhir padahal catatan untuk seluruh sub-bab */
const RE_NOTE = /^(ketiga|delapan|kerangka|keenam|purusa dan prakrti)\b/i;

/* "Nyaya berfokus pada ... Istilah pentingnya meliputi A, B, dan C." */
const RE_FOKUS = /^(.+?) berfokus pada (.+?)\.\s*Istilah pentingnya meliputi (.+?)\.?$/;

const SHORT = {
  1: 'Darsana',
  2: 'Sad Darsana',
  9: 'Hubungan Enam Sistem',
  10: 'Penerapan Nilai',
  11: 'Kesimpulan',
  12: 'Rujukan',
  13: 'Catatan Istilah'
};

const toTitle = t =>
  String(t || '')
    .toLowerCase()
    .replace(/(^|\s)(\S)/g, (_, a, b) => a + b.toUpperCase())
    .replace(/\s(Atau|Dalam|Dan|Untuk)\b/g, s => s.toLowerCase());

const splitTerms = s =>
  String(s || '')
    .split(/,\s*|\s+dan\s+/)
    .map(t => t.replace(/^dan\s+/i, '').trim())
    .filter(Boolean);

const sentencesOf = text =>
  (String(text || '').match(/[^.!?]+(?:[.!?]+|$)/g) || []).map(s => s.trim()).filter(Boolean);

/* tarik satu kalimat fakta dari daftar paragraf; sisanya dikembalikan */
function pullFact(paragraphs, re) {
  let value = '';
  const out = [];

  for (const p of paragraphs) {
    const m = value ? null : p.match(re);

    if (!m) {
      out.push(p);
      continue;
    }

    value = m[3].trim();
    const rest = (p.slice(0, m.index + m[1].length) + p.slice(m.index + m[0].length)).trim();
    if (rest) out.push(rest);
  }

  return { value, paragraphs: out };
}

function finishSub(sub) {
  const t = pullFact(sub.paragraphs, RE_TOKOH);
  const k = pullFact(t.paragraphs, RE_TEKS);

  const parts = sub.parts.map(p => {
    const r = pullFact(p.paragraphs, RE_TOKOH);
    return {
      id: p.id,
      no: pad(Number(p.id.split('.')[2])),
      title: p.title,
      paragraphs: r.paragraphs,
      tokoh: r.value
    };
  });

  const notes = [];
  const last = parts[parts.length - 1];

  if (last && last.paragraphs.length > 1 && RE_NOTE.test(last.paragraphs[last.paragraphs.length - 1])) {
    notes.push(last.paragraphs.pop());
  }

  return {
    id: sub.id,
    title: sub.title,
    paragraphs: k.paragraphs,
    tokoh: t.value,
    teks: k.value,
    parts,
    notes
  };
}

function finishChapter(raw) {
  const refs = /^daftar rujukan/i.test(raw.title);
  const title = toTitle(raw.title);
  const key = title.toLowerCase().split(/\s+atau\s+/)[0];

  /* bab rujukan: "Nyaya Sutra, teks klasik ..." -> judul + deskripsi */
  const rawSubs = refs
    ? raw.subs.map(s => {
        const m = s.title.match(/^([^,]+),\s*(.+)$/);
        return m ? { ...s, title: m[1].trim(), paragraphs: [m[2].trim()] } : s;
      })
    : raw.subs;

  const subs = rawSubs.map(finishSub);
  const first = subs[0];
  const isAliran = raw.number >= 3 && raw.number <= 8;
  const app = isAliran ? subs.find(s => /^penerapan/i.test(s.title)) : null;

  return {
    number: raw.number,
    title,
    key,
    short: SHORT[raw.number] || (isAliran ? toTitle(key) : title),
    refs,
    subs,

    /* kompatibel dengan Peta Konsep & Glosarium yang lama */
    paragraphs: first ? first.paragraphs : raw.paragraphs,
    groups: [],
        tokoh: subs.find(s => s.tokoh)?.tokoh || '',
    teks: subs.find(s => s.teks)?.teks || '',
    app: { intro: '', items: [], text: app ? app.paragraphs.join(' ') : '' }
  };
}

function parseMateri(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const chapters = [];

  let chapter = null;
  let sub = null;
  let part = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    let m;

    if ((m = line.match(RE_BUTIR))) {
      if (!sub) continue;
      part = { id: `${m[1]}.${m[2]}.${m[3]}`, title: m[4].trim(), paragraphs: [] };
      sub.parts.push(part);
    } else if ((m = line.match(RE_SUB))) {
      if (!chapter) continue;
      sub = { id: `${m[1]}.${m[2]}`, title: m[3].trim(), paragraphs: [], parts: [] };
      part = null;
      chapter.subs.push(sub);
    } else if ((m = line.match(RE_BAB))) {
      chapter = { number: Number(m[1]), title: m[2].trim(), paragraphs: [], subs: [] };
      sub = part = null;
      chapters.push(chapter);
    } else if (RE_CATATAN.test(line)) {
      const prev = chapters[chapters.length - 1];
      chapter = {
        number: prev ? prev.number + 1 : 1,
        title: 'Catatan Istilah',
        paragraphs: [],
        subs: []
      };
      sub = part = null;
      chapters.push(chapter);
    } else if (chapter) {
      (part || sub || chapter).paragraphs.push(line);
    }
  }

  return chapters.map(finishChapter);
}

/* ---------- bab -> slide ---------- */

function chunkParts(parts) {
  const avg =
    parts.reduce((n, p) => n + p.paragraphs.join(' ').length, 0) / (parts.length || 1);

  /* banyak & pendek (mis. 25 Tattva) -> satu grid kompak */
  if (parts.length >= 8 && avg < 120) return { compact: true, pages: [parts] };

   /* panjang -> tetap SATU slide, kartu banyak di-scroll vertikal */
  return { compact: false, pages: [parts] };
}

const isFokus = sub =>
  sub.paragraphs.length >= 3 && sub.paragraphs.every(p => RE_FOKUS.test(p));

/* sub-bab pendek yang berurutan (bab 3-8) digabung jadi satu slide kartu */
const THIN = 750;

const subLength = s =>
  s.paragraphs.join(' ').length + (s.tokoh || '').length + (s.teks || '').length;

function groupSubs(ch) {
    return ch.subs; /* satu sub-bab = satu slide, tanpa digabung */
}

function buildSlides(list) {
  const out = [];

  list.forEach(ch => {
    const base = { chapter: ch.number, key: ch.key, chapterTitle: ch.title };
    const chapterEyebrow = `Bab ${pad(ch.number)} · ${ch.short}`;

    /* bab rujukan: satu slide, kartu 2 kolom */
    const asCards = ch.refs || /^(hubungan|penerapan nilai)/i.test(ch.title);

    if (asCards) {
      out.push({
        ...base,
        id: String(ch.number),
        title: ch.title,
        eyebrow: chapterEyebrow,
        kind: 'parts',
        cols: ch.refs ? 2 : 3,
        paragraphs: [],
        tokoh: '',
        teks: '',
        notes: [],
        parts: ch.subs.map((s, i) => ({
                    no: pad(i + 1),
          title: s.title.replace(/^penerapan\s+/i, ''), 
          paragraphs: s.paragraphs,
          tokoh: ''
        }))
      });
      return;
    }

    /* bab tanpa sub-bab (Kesimpulan, Catatan Istilah) */
    if (!ch.subs.length) {
      out.push({
        ...base,
        id: String(ch.number),
        title: ch.title,
        eyebrow: chapterEyebrow,
        kind: 'text',
        paragraphs: ch.paragraphs,
        tokoh: '',
        teks: '',
        parts: [],
        notes: []
      });
      return;
    }

    groupSubs(ch).forEach(sub => {
            /* "Penerapan ..." tidak jadi slide sendiri, ditempel di slide sebelumnya */
      const prev = out[out.length - 1];

      if (
        /^penerapan/i.test(sub.title) &&
        !sub.parts.length &&
        prev &&
        prev.chapter === ch.number &&
        prev.apps
      ) {
        prev.apps.push({ id: sub.id, title: sub.title, paragraphs: sub.paragraphs });
        return;
      }
      const { compact, pages } = sub.parts.length
        ? chunkParts(sub.parts)
        : { compact: false, pages: [[]] };

      pages.forEach((page, i) => {
        const first = i === 0;
        const last = i === pages.length - 1;

        let kind = 'text';
        if (page.length) kind = compact ? 'compact' : 'parts';
        else if (isFokus(sub)) kind = 'fokus';
        else if (/^penerapan/i.test(sub.title)) kind = 'app';

        out.push({
          ...base,
          id: sub.id,
          title: sub.title,
          eyebrow: `${chapterEyebrow} · ${sub.id}${pages.length > 1 ? ` · ${i + 1}/${pages.length}` : ''}`,
          kind,
          paragraphs: first ? sub.paragraphs : [],
          tokoh: first ? sub.tokoh : '',
          teks: first ? sub.teks : '',
          parts: page,
          notes: last ? sub.notes : [],
          apps: []
        });
      });
    });
  });

  return out.map((s, i) => ({ ...s, index: i, slideNumber: pad(i + 1) }));
}

/* =========================================================
   DATA
   ========================================================= */

const chapters = parseMateri(materiText);
const slides = buildSlides(chapters);

const firstSlideOf = n => slides.findIndex(s => s.chapter === n);

/* "materi" = daftar bab (dipakai Ringkasan, Peta, Glosarium).
   index = nomor slide pertama bab tsb, jadi tombol "Buka slide" tetap benar */
const materi = chapters.map(ch => ({ ...ch, index: Math.max(firstSlideOf(ch.number), 0) }));

const indexOfNumber = n => materi.findIndex(m => m.number === n);
const titleOfNumber = n => materi[indexOfNumber(n)]?.title || '';

const FOCUS = {
  nyaya: 'Logika & penalaran',
  vaiseshika: 'Hakikat realitas',
  samkhya: 'Purusa & Prakrti',
  yoga: 'Disiplin & pengendalian diri',
  mimamsa: 'Weda & kewajiban',
  vedanta: 'Atman & Brahman'
};

/* istilah penting tiap aliran, dibaca langsung dari slide 2.2 */
const FOKUS_TERMS = {};

chapters
  .filter(c => c.number === 2)
  .forEach(c =>
    c.subs.forEach(s =>
      s.paragraphs.forEach(p => {
        const m = p.match(RE_FOKUS);
        if (m) FOKUS_TERMS[m[1].trim().toLowerCase()] = splitTerms(m[3]);
      })
    )
  );

/* ---------- GLOSARIUM ---------- */

const GLOSSARY_BASE = [
  {
    term: 'Darsana',
    cat: 'Konsep',
    sections: [1],
    def: 'Istilah untuk menyebut sistem pemikiran atau filsafat yang berusaha memahami hakikat kehidupan, pengetahuan, kebenaran, dan tujuan manusia. Kata ini berkaitan dengan makna “melihat” atau “pandangan”, yaitu cara pandang terhadap realitas dan kehidupan.',
    related: ['Sad Darsana', 'Astika']
  },
  {
    term: 'Sad Darsana',
    cat: 'Konsep',
    sections: [2],
    def: 'Enam sistem filsafat dalam tradisi Hindu: Nyaya, Vaiseshika, Samkhya, Yoga, Mimamsa, dan Vedanta. Masing-masing punya fokus berbeda, tetapi sama-sama berkontribusi pada perkembangan pemikiran Hindu.',
    related: ['Darsana', 'Astika', 'Nyaya', 'Vedanta']
  },
  {
    term: 'Astika',
    cat: 'Konsep',
    sections: [2],
    def: 'Kelompok filsafat yang menerima otoritas Weda.',
    related: ['Weda', 'Sad Darsana']
  },
  {
    term: 'Nyaya',
    cat: 'Aliran',
    sections: [3],
    def: 'Sistem filsafat yang memberi perhatian besar pada logika, penalaran, dan pengetahuan yang benar. Dikaitkan dengan kemampuan berpikir logis, menganalisis informasi, dan menarik kesimpulan berdasarkan alasan yang tepat.',
    related: ['Rsi Gautama / Aksapada Gautama', 'Sad Darsana']
  },
  {
    term: 'Vaiseshika',
    cat: 'Aliran',
    sections: [4],
    def: 'Sistem filsafat yang memberi perhatian pada hakikat realitas dan berbagai kategori di dalamnya. Membantu manusia memahami bahwa realitas dapat dikaji dan dikategorikan secara sistematis.',
    related: ['Rsi Kanada', 'Sad Darsana']
  },
  {
    term: 'Samkhya',
    cat: 'Aliran',
    sections: [5],
    def: 'Sistem filsafat yang menjelaskan realitas melalui konsep Purusa dan Prakrti. Memahami perbedaan keduanya dipandang sebagai bagian dari jalan menuju pembebasan.',
    related: ['Purusa', 'Prakrti', 'Rsi Kapila', 'Pembebasan (Moksa)']
  },
  {
    term: 'Yoga',
    cat: 'Aliran',
    sections: [6],
    def: 'Sistem filsafat yang menekankan disiplin dan pengendalian diri untuk mencapai keadaan spiritual yang lebih tinggi. Berhubungan erat dengan pengendalian pikiran, konsentrasi, meditasi, dan disiplin diri.',
    related: ['Rsi Patanjali', 'Sad Darsana']
  },
  {
    term: 'Mimamsa',
    cat: 'Aliran',
    sections: [7],
    def: 'Sistem filsafat yang memberi perhatian pada Weda, kewajiban, dan pelaksanaan tindakan keagamaan. Menekankan pentingnya melaksanakan kewajiban berdasarkan prinsip dan ajaran yang menjadi landasannya.',
    related: ['Weda', 'Rsi Jaimini']
  },
  {
    term: 'Vedanta',
    cat: 'Aliran',
    sections: [8],
    def: 'Sistem filsafat yang berhubungan erat dengan bagian akhir Weda, khususnya Upanisad. Membahas realitas tertinggi, Atman, Brahman, dan pembebasan.',
    related: ['Upanisad', 'Atman', 'Brahman', 'Badarayana', 'Pembebasan (Moksa)']
  },
  {
    term: 'Purusa',
    cat: 'Konsep',
    sections: [5],
    def: 'Prinsip kesadaran dalam Samkhya.',
    related: ['Prakrti', 'Samkhya']
  },
  {
    term: 'Prakrti',
    cat: 'Konsep',
    sections: [5],
    def: 'Prinsip materi atau alam dalam Samkhya.',
    related: ['Purusa', 'Samkhya']
  },
  {
    term: 'Atman',
    cat: 'Konsep',
    sections: [8],
    def: 'Hakikat diri; salah satu persoalan pokok yang dibahas Vedanta bersama Brahman dan pembebasan.',
    related: ['Brahman', 'Vedanta']
  },
  {
    term: 'Brahman',
    cat: 'Konsep',
    sections: [8],
    def: 'Realitas tertinggi yang menjadi pokok pembahasan Vedanta. Hubungan manusia dengan realitas tertinggi menjadi bahan refleksi dalam pemikiran Vedanta.',
    related: ['Atman', 'Vedanta']
  },
  {
    term: 'Pembebasan (Moksa)',
    cat: 'Konsep',
    sections: [5, 8],
    def: 'Tujuan kehidupan yang lebih tinggi dalam filsafat Hindu. Dalam Samkhya dicapai lewat pemahaman perbedaan Purusa dan Prakrti; dalam Vedanta menjadi salah satu persoalan pokok bersama Atman dan Brahman.',
    related: ['Samkhya', 'Vedanta']
  },
  {
    term: 'Weda',
    cat: 'Kitab',
    sections: [7, 8],
    def: 'Kitab suci yang menjadi rujukan tradisi Hindu. Menjadi dasar bagi kelompok Astika dan perhatian utama Mimamsa; bagian akhirnya berkaitan erat dengan Vedanta.',
    related: ['Astika', 'Mimamsa', 'Upanisad']
  },
  {
    term: 'Upanisad',
    cat: 'Kitab',
    sections: [8],
    def: 'Bagian akhir Weda yang berhubungan erat dengan Vedanta.',
    related: ['Weda', 'Vedanta']
  },
  {
    term: 'Rsi Gautama / Aksapada Gautama',
    cat: 'Tokoh',
    sections: [3],
    def: 'Tokoh yang dikenal dalam tradisi Nyaya.',
    related: ['Nyaya']
  },
  {
    term: 'Rsi Kanada',
    cat: 'Tokoh',
    sections: [4],
    def: 'Tokoh yang dikenal dalam tradisi Vaiseshika.',
    related: ['Vaiseshika']
  },
  {
    term: 'Rsi Kapila',
    cat: 'Tokoh',
    sections: [5],
    def: 'Tokoh yang secara tradisional dikaitkan dengan Samkhya.',
    related: ['Samkhya']
  },
  {
    term: 'Rsi Patanjali',
    cat: 'Tokoh',
    sections: [6],
    def: 'Tokoh utama yang dikenal dalam sistem Yoga.',
    related: ['Yoga']
  },
  {
    term: 'Rsi Jaimini',
    cat: 'Tokoh',
    sections: [7],
    def: 'Tokoh yang dikenal dalam tradisi Mimamsa.',
    related: ['Mimamsa']
  },
  {
    term: 'Badarayana',
    cat: 'Tokoh',
    sections: [8],
    def: 'Salah satu tokoh penting dalam perkembangan pemikiran Vedanta, bersama para pemikir Vedanta berikutnya.',
    related: ['Vedanta']
  }
];

/* ---------- GLOSARIUM: daftar manual + otomatis dari Materi.txt ---------- */

const splitSent = t =>
  String(t || '')
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map(s => s.trim())
    .filter(Boolean);

const clipSent = (t, n = 2) => splitSent(t).slice(0, n).join(' ');
const capFirst = t => String(t || '').charAt(0).toUpperCase() + String(t || '').slice(1);
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = t => new RegExp('(^|[^a-z])' + escRe(normalize(t)) + '([^a-z]|$)');

/* cari definisi sebuah istilah di dalam teks satu bab */
function defFor(ch, term) {
  const re = wordRe(term);

  /* 1. butir yang judulnya = istilah */
  for (const s of ch.subs) {
    const p = s.parts.find(x => re.test(normalize(x.title)) && x.paragraphs.length);
    if (p) return p.paragraphs.join(' ');
  }

  /* 2. sub-bab yang judulnya memuat istilah */
  for (const s of ch.subs) {
    if (re.test(normalize(s.title)) && s.paragraphs.length) return clipSent(s.paragraphs[0]);
  }

  /* 3. kalimat yang menyebut istilah (+ kalimat sesudahnya) */
  for (const s of ch.subs) {
    for (const p of [...s.paragraphs, ...s.parts.flatMap(x => x.paragraphs)]) {
      const list = splitSent(p);
      const i = list.findIndex(x => re.test(normalize(x)));
      if (i > -1) return list.slice(i, i + 2).join(' ');
    }
  }

  return '';
}

const GLOSSARY = (() => {
  const list = GLOSSARY_BASE.map(g => ({ ...g, sections: [...g.sections] }));
  const byKey = new Map(list.map(g => [normalize(g.term), g]));

  /* istilah yang sudah ada tidak dobel, cukup tambah asal bab-nya */
  const add = g => {
    if (!g.term || !g.def) return;

    const key = normalize(g.term);
    const old = byKey.get(key);

    if (old) {
      g.sections.forEach(n => {
        if (!old.sections.includes(n)) old.sections.push(n);
      });
      old.sections.sort((a, b) => a - b);
      return;
    }

    byKey.set(key, g);
    list.push(g);
  };

  /* A. setiap butir di bab 1 dan bab 3-8 jadi satu istilah */
  chapters
    .filter(c => c.number === 1 || (c.number >= 3 && c.number <= 8))
    .forEach(c =>
      c.subs.forEach(s =>
        s.parts.forEach(p => {
          const term =
            c.number === 4 && normalize(p.title) === 'karma' ? 'Karma (Vaiseshika)' : p.title;

          let cat = c.number === 1 ? 'Konsep' : 'Istilah';
          if (c.number === 5 && s.parts.length >= 8) cat = 'Tattva';
          if (/sutra|gita|upanisad/i.test(p.title)) cat = 'Kitab';

          add({
            term,
            cat,
            sections: [c.number],
            def: p.paragraphs.join(' ') + (p.tokoh ? ` Tokoh utama: ${p.tokoh}.` : ''),
            related: c.number === 1 ? [] : [toTitle(c.key)]
          });
        })
      )
    );

  /* B. istilah penting tiap aliran (slide 2.2) yang belum punya butir sendiri */
  chapters
    .filter(c => c.number >= 3 && c.number <= 8)
    .forEach(c =>
      (FOKUS_TERMS[c.key] || []).forEach(term =>
        add({
          term,
          cat: 'Istilah',
          sections: [c.number],
          def: defFor(c, term) || `Istilah penting dalam ${toTitle(c.key)}.`,
          related: [toTitle(c.key)]
        })
      )
    );

  /* C. daftar rujukan (bab 12) -> Kitab */
  chapters
    .filter(c => c.refs)
    .forEach(c =>
      c.subs.forEach(s => {
        const text = (s.paragraphs[0] || '').trim();
        if (!text) return;

        const m = s.title.match(/\s+(karya|yang dikaitkan dengan)\s+(.+)$/i);
        const suffix = m ? ` ${/karya/i.test(m[1]) ? 'Karya' : 'Dikaitkan dengan'} ${m[2]}.` : '';

        add({
          term: s.title.replace(/\s+(?:karya|yang dikaitkan dengan)\s+.+$/i, ''),
          cat: 'Kitab',
          sections: [c.number],
          def: capFirst(text) + suffix,
          related: []
        });
      })
    );

  /* D. tambahan manual (semua isinya diambil dari Materi.txt) */
  [
    {
      term: 'Kaivalya',
      cat: 'Konsep',
      sections: [5],
      def: 'Pembebasan dalam Samkhya yang dicapai melalui pemahaman benar mengenai perbedaan Purusa dan Prakrti. Kesadaran tidak lagi keliru mengidentifikasi dirinya dengan perubahan alam dan pengalaman mental.',
      related: ['Samkhya', 'Purusa', 'Prakrti', 'Pembebasan (Moksa)']
    },
    {
      term: 'Mahabhuta',
      cat: 'Istilah',
      sections: [5],
      def: 'Unsur-unsur kasar dalam Samkhya: Akasha, Vayu, Tejas atau Agni, Ap atau Jala, dan Prithvi.',
      related: ['Samkhya', 'Tattva']
    },
    {
      term: 'Tanmatra',
      cat: 'Istilah',
      sections: [5],
      def: 'Potensi halus dalam Samkhya yang berkaitan dengan suara, sentuhan, bentuk, rasa, dan bau (Shabda, Sparsha, Rupa, Rasa, dan Gandha Tanmatra).',
      related: ['Samkhya', 'Tattva']
    },
    {
      term: 'Adi Shankaracharya',
      cat: 'Tokoh',
      sections: [8],
      def: 'Tokoh utama Advaita Vedanta. Menekankan bahwa pada tingkat realitas tertinggi, Atman dan Brahman tidak berbeda.',
      related: ['Vedanta', 'Advaita']
    },
    {
      term: 'Ramanujacharya',
      cat: 'Tokoh',
      sections: [8],
      def: 'Tokoh utama Vishishtadvaita Vedanta, aliran yang menjelaskan kesatuan Brahman yang berkualifikasi dan memberi perhatian penting pada pengabdian kepada Tuhan.',
      related: ['Vedanta', 'Vishishtadvaita']
    },
    {
      term: 'Madhvacharya',
      cat: 'Tokoh',
      sections: [8],
      def: 'Tokoh utama Dvaita Vedanta, aliran yang menekankan perbedaan antara Brahman, jiwa individual, dan realitas lainnya.',
      related: ['Vedanta', 'Dvaita']
    },
    {
      term: 'Ishvarakrishna',
      cat: 'Tokoh',
      sections: [5, 12],
      def: 'Pengarang Samkhya Karika, salah satu teks penting dalam tradisi Samkhya.',
      related: ['Samkhya', 'Samkhya Karika']
    }
  ].forEach(add);

  return list;
})();

const GLOSSARY_CATS = ['Semua', 'Konsep', 'Aliran', 'Tokoh', 'Kitab', 'Tattva', 'Istilah'].filter(
  c => c === 'Semua' || GLOSSARY.some(g => g.cat === c)
);

configureMateri({
  slideCount: slides.length,
  sectionStarts: slides
    .filter((s, i) => i === 0 || s.chapter !== slides[i - 1].chapter)
    .map(s => s.index),
  glossaryTotal: GLOSSARY.length
});

const conceptsFor = (number, limit = 12) =>
  GLOSSARY.filter(
    g => g.sections.includes(number) && g.cat !== 'Tokoh' && g.cat !== 'Tattva'
  ).slice(0, limit);

/* ---------- MODE BELAJAR (menu awal) ---------- */

function getModes() {
  return [
    {
      view: 'slides',
      icon: ui.slides,
      label: 'BACA',
      title: 'Slides Materi',
      desc: 'Pelajari seluruh materi secara berurutan, dari pengantar hingga Vedanta, lewat slide interaktif yang mudah diikuti.',
      tags: [`${slides.length} slide`, 'Kontrol keyboard', 'Kartu interaktif'],
      cta: 'Mulai belajar'
    },
    {
      view: 'ringkasan',
      icon: ui.summary,
      label: 'REVIEW CEPAT',
      title: 'Ringkasan Pintar',
      desc: 'Tinjau inti setiap bagian materi lewat mode singkat untuk persiapan kuis atau lengkap untuk dibaca ulang.',
      tags: ['Mode singkat', 'Mode lengkap', 'Bisa disalin'],
      cta: 'Baca ringkasan'
    },
    {
      view: 'peta',
      icon: ui.map,
      label: 'VISUAL',
      title: 'Peta Konsep',
      desc: 'Telusuri hubungan antarkonsep dari Darsana hingga enam aliran, lalu klik simpul untuk membaca penjelasannya.',
      tags: ['Darsana → Astika', 'Enam aliran', 'Simpul interaktif'],
      cta: 'Lihat peta'
    },
    {
      view: 'audio',
      icon: ui.audio,
      label: 'DENGAR',
      title: 'Dengarkan Materi',
      desc: 'Dengarkan seluruh materi dalam satu file audio berisi subtitle berjalan, cocok untuk belajar saat bepergian.',
      tags: ['Subtitle', 'Kecepatan 2×', 'Dapat diunduh'],
      cta: 'Putar audio'
    },
    {
      view: 'video',
      icon: ui.video,
      label: 'TONTON',
      title: 'Tonton Video',
      desc: 'Tonton penjelasan seluruh materi dalam satu video utuh dari pengantar hingga Vedanta, lengkap dengan subtitle.',
      tags: ['Subtitle', 'Layar penuh', 'Dapat diunduh'],      cta: 'Tonton video'
    },
    {
      view: 'glosarium',
      icon: ui.book,
      label: 'REFERENSI',
      title: 'Glosarium',
      desc: 'Temukan istilah penting lewat pencarian cepat dan filter kategori, lalu buka slide terkait untuk konteksnya.',
      tags: [`${GLOSSARY.length} istilah`, 'Pencarian cepat', 'Filter kategori'],
      cta: 'Buka glosarium'
    }
  ];
}

/* =========================================================
   ROUTER + SHELL
   ========================================================= */

let ctx = { onBack: null, name: '', anonymous: false };
let leaving = false;
let goToSlide = () => {};
let currentView = 'menu';
let menuScroll = 0; /* posisi scroll menu Belajar, dipulihkan saat balik */
let noticeTimer = null;

export function renderBelajar(opts = {}) {
  const { onBack, name, anonymous, slide, view } = opts;

  ctx = {
    onBack: onBack ?? ctx.onBack,
    name: name ?? ctx.name,
    anonymous: anonymous ?? ctx.anonymous
  };

  const target = view || (slide !== undefined ? 'slides' : 'menu');
  currentView = target;

  leaving = false;
  document.onkeydown = null;
  closeMaterialModal();

    stopMedia();
  (VIEWS[target] || renderMenu)({ slide });
}

/* halaman memudar keluar dulu, baru pindah */
function leaveThen(fn) {
  if (leaving) return;

  /* ingat posisi scroll menu sebelum halaman dibongkar */
  if (currentView === 'menu') {
    menuScroll = document.querySelector('.bl-scroller')?.scrollTop || 0;
  }

  stopMedia();

  const content = document.querySelector('.learning-page-content, .bl-content');
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  if (!content || reduce) {
    fn();
    return;
  }

  leaving = true;
  content.classList.add('is-leaving');

  setTimeout(() => {
    leaving = false;
    fn();
  }, 240);
}

const openView = (view, extra = {}) =>
  leaveThen(() => renderBelajar({ view, ...extra }));

function exitHost() {
  leaveThen(() => {
    document.onkeydown = null;
    closeMaterialModal();
    document.querySelector('.bl-notice')?.remove();
    menuScroll = 0;
    ctx.onBack?.();
  });
}

function openProfile(returnView, extra = {}) {
  leaveThen(() => {
    document.onkeydown = null;
    closeMaterialModal();

    renderProfile({
      name: ctx.name,
      anonymous: ctx.anonymous,
      onBack: () => renderBelajar({ view: returnView, ...extra })
    });
  });
}

function notice(message) {
  let el = document.querySelector('.bl-notice');

  if (!el) {
    el = document.createElement('div');
    el.className = 'bl-notice';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }

  el.textContent = message;
  requestAnimationFrame(() => el.classList.add('visible'));

  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => el.classList.remove('visible'), 2800);
}

function navMarkup(backLabel = 'Kembali') {
  return `
    <nav class="navbar">
      <button class="nav-login" id="belajarBack" type="button">
        ${icons.chevronLeft}<span>${e(backLabel)}</span>
      </button>

      <div class="belajar-nav-right">
        <button class="brand" id="belajarBrand" type="button">
          <span class="ach-nav-symbol">ॐ</span>
          <span>DharmaLearn</span>
        </button>

        <button class="belajar-account" id="belajarAccount" type="button" aria-label="Akun" title="Akun">
          ${icons.user}
        </button>
      </div>
    </nav>
  `;
}

/* ---------- animasi muncul/hilang saat scroll (dua arah, berulang) ---------- */

/* hanya kartu besar dalam daftar panjang */
const REVEAL_SEL = ['.bl-card', '.rs-card', '.gl-card'].join(',');

let revealIO = null;
let revealMO = null;

function stopReveal() {
  revealIO?.disconnect();
  revealMO?.disconnect();
  revealIO = revealMO = null;
}

function startReveal(root) {
  stopReveal();

  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (!root || reduce || !('IntersectionObserver' in window)) return;

  revealIO = new IntersectionObserver(
    entries => {
      let n = 0;

      entries.forEach(en => {
        const el = en.target;

        if (en.isIntersecting) {
          /* masuk: naik + fade in, beruntun kalau barengan */
          el.style.setProperty('--rd', `${Math.min(n++, 5) * 55}ms`);
          el.classList.remove('rv-up');
          el.classList.add('rv-in');
        } else {
          /* keluar: lewat atas -> naik sambil memudar, lewat bawah -> turun sambil memudar */
          const top = en.rootBounds ? en.rootBounds.top : root.getBoundingClientRect().top;
          el.style.setProperty('--rd', '0ms');
          el.classList.toggle('rv-up', en.boundingClientRect.top < top);
          el.classList.remove('rv-in');
        }
      });
    },
    { root, threshold: 0, rootMargin: '0px 0px -6% 0px' }
  );

  /* elemen baru (hasil filter/cari/ganti mode) otomatis ikut diamati */
  const scan = () =>
    root.querySelectorAll(REVEAL_SEL).forEach(el => {
      if (el.classList.contains('rv')) return;
      el.classList.add('rv');
      revealIO.observe(el);
    });

  scan();
  revealMO = new MutationObserver(scan);
  revealMO.observe(root, { childList: true, subtree: true });
}

function mountPage(inner, { scroll = true } = {}) {
  stopReveal();

  getApp().innerHTML = `
    <main class="page belajar-page ${scroll ? 'bl-scroll' : ''}">
      ${inner}
    </main>
  `;

  if (!scroll) return;

  /* navbar tetap di atas; sisanya masuk wadah scroll sendiri,
     jadi scrollbar mulai dari bawah navbar */
  const page = document.querySelector('.belajar-page');
  const nav = page.querySelector('.navbar');
  const scroller = document.createElement('div');
  scroller.className = 'bl-scroller';

  [...page.children].forEach(child => {
    if (child !== nav) scroller.appendChild(child);
  });

  page.appendChild(scroller);
  startReveal(scroller);
}

function bindNav({ back, returnView, extra }) {
  document.querySelector('#belajarBack')?.addEventListener('click', back);
  document.querySelector('#belajarBrand')?.addEventListener('click', back);
  document
    .querySelector('#belajarAccount')
    ?.addEventListener('click', () => openProfile(returnView, extra));
}

function bindKeys(onEscape) {
  document.onkeydown = event => {
    if (event.key !== 'Escape') return;

    if (document.querySelector('.darsana-modal:not(.is-closing)')) {
      closeMaterialModal(true);
      return;
    }

    onEscape?.();
  };
}

const viewHead = (eyebrow, title, desc) => `
  <header class="bl-heading bl-heading-sm">
    <span class="bl-eyebrow">${e(eyebrow)}</span>
    <h1>${e(title)}</h1>
    <p>${e(desc)}</p>
  </header>
`;

/* =========================================================
   VIEW: MENU AWAL
   ========================================================= */

function renderMenu() {
  const modes = getModes();

  mountPage(`
    ${navMarkup('Kembali')}

    <section class="bl-content">
      <header class="bl-heading">
        <span class="bl-eyebrow">RUANG BELAJAR</span>
        <h1>Belajar Sad Darsana</h1>
                <p>Baca, dengarkan, atau tonton. Pilih cara belajar yang sesuai, semuanya menggunakan materi yang sama.</p>
      </header>

      <div class="bl-grid">
        ${modes
          .map(
            m => `
                            <button class="bl-card" data-view="${m.view}" type="button">
                <span class="bl-card-icon">${m.icon}</span>

                <span class="bl-card-body">
                  <span class="bl-card-label">${e(m.label)}</span>
                  <h2>${e(m.title)}</h2>
                  <p>${e(m.desc)}</p>
                </span>

                <ul class="bl-tags">
                  ${m.tags.slice(0, 3).map(t => `<li>${e(t)}</li>`).join('')}
                </ul>

                <span class="bl-card-cta">
                  <span>${e(m.cta)}</span>${ui.arrow}
                </span>
              </button>
            `
          )
          .join('')}
      </div>
    </section>
  `);

  bindNav({ back: exitHost, returnView: 'menu' });

  /* kembalikan posisi scroll (balik dari mode lain atau dari halaman akun) */
  document
    .querySelector('.bl-scroller')
    ?.scrollTo({ top: menuScroll, behavior: 'instant' });
  bindKeys(exitHost);

  document.querySelectorAll('.bl-card').forEach(card =>
    card.addEventListener('click', () => openView(card.dataset.view))
  );
}

/* =========================================================
   VIEW: RINGKASAN PINTAR
   ========================================================= */

let sumMode = 'singkat';
let sumFilter = 'all';

const stripPrefix = t => String(t || '').replace(/^penerapan\s+/i, '');

const KW_COUNT = 3;

/* selalu tepat 3 kata kunci; kalau kurang, dilengkapi dari glosarium,
   judul sub-bab, dan istilah yang disebut di teks bab */
function keywordsOf(ch) {
  const text = normalize([...ch.paragraphs, ...ch.subs.flatMap(s => s.paragraphs)].join(' '));

  const pool = [
    ...rawKeywordsOf(ch),
    ...conceptsFor(ch.number, 12).map(g => g.term),
    ...ch.subs.map(s => stripPrefix(s.title)),
    ...GLOSSARY.filter(
      g => (g.cat === 'Aliran' || g.cat === 'Konsep') && wordRe(g.term).test(text)
    ).map(g => g.term),
    ch.short,
    'Sad Darsana',
    'Filsafat Hindu',
    'Dharma'
  ];

  const seen = new Set();

  return pool
    .filter(t => {
      const key = normalize(t);
      if (!t || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, KW_COUNT);
}

function rawKeywordsOf(ch) {
  if (FOKUS_TERMS[ch.key]) return FOKUS_TERMS[ch.key];
  if (ch.number === 2) return Object.keys(FOKUS_TERMS).map(toTitle);

  const withParts = ch.subs.find(s => s.parts.length);
  if (withParts) return withParts.parts.map(p => p.title).slice(0, 8);

  if (ch.subs.length) return ch.subs.map(s => stripPrefix(s.title)).slice(0, 6);
  return [];
}

const KEY_PATTERNS = [
  /merupakan (sistem|istilah)/i,
  /berkembang menjadi .*sistem filsafat/i,
  /berarti enam sistem/i
];

function keySentence(ch) {
  if (ch.refs) return `${ch.subs.length} teks rujukan untuk memperdalam Sad Darsana.`;

  const text = (ch.subs.length ? ch.subs[0].paragraphs : ch.paragraphs).join(' ');
  const list = sentencesOf(text);

  for (const re of KEY_PATTERNS) {
    const hit = list.find(s => re.test(s));
    if (hit) return hit;
  }

  return list[0] || '';
}

function subBlock(sub) {
  const facts = [
    sub.tokoh && `<p><b>Tokoh:</b> ${e(sub.tokoh)}</p>`,
    sub.teks && `<p><b>Teks:</b> ${e(sub.teks)}</p>`
  ]
    .filter(Boolean)
    .join('');

  const parts = sub.parts.length
    ? `<ul>${sub.parts
        .map(
          p =>
            `<li><b>${e(p.title)}</b> ${e(p.paragraphs.join(' '))}${
              p.tokoh ? ` <i>(Tokoh: ${e(p.tokoh)})</i>` : ''
            }</li>`
        )
        .join('')}</ul>`
    : '';

  return `
    <section class="rs-sub">
      <h4><span class="rs-id">${e(sub.id)}</span>${e(sub.title)}</h4>
      ${sub.paragraphs.map(p => `<p>${e(p)}</p>`).join('')}
      ${facts}
      ${parts}
      ${sub.notes.map(p => `<p class="rs-note">${e(p)}</p>`).join('')}
    </section>
  `;
}

const rsFact = (label, value, glyph) =>
  value
    ? `<span class="rs-tokoh"><i aria-hidden="true">${glyph}</i><span><small>${e(label)}</small><b>${e(value)}</b></span></span>`
    : '';

const rsOpen = ch =>
  `<button class="rs-open" data-slide="${ch.index}" type="button"><span>Buka slide</span>${ui.arrow}</button>`;

function summaryCard(ch, mode) {
  const head = `
    <header class="rs-head">
      <span class="num">${pad(ch.number)}</span>
      <h3>${e(ch.title)}</h3>
    </header>
  `;

  if (mode === 'singkat') {
    const key = keySentence(ch);
    const shown = keywordsOf(ch).slice(0, KW_COUNT);
    const apply = ch.app && ch.app.text ? firstSentence(ch.app.text) : '';
    const facts = rsFact('Tokoh', ch.tokoh, 'ॐ') + rsFact('Teks Utama', ch.teks, '❖');

    return `
      <article class="rs-card">
        ${head}
        ${key ? `<p class="rs-key">${e(key)}</p>` : ''}
        ${
          shown.length
            ? `<ul class="rs-kw">${shown.map(k => `<li>${e(k)}</li>`).join('')}</ul>`
            : ''
        }
        ${
          apply
            ? `<div class="rs-app"><span class="panel-label">Penerapan</span><p>${e(apply)}</p></div>`
            : ''
        }
        <div class="rs-foot">${facts}${rsOpen(ch)}</div>
      </article>
    `;
  }

  const body = ch.subs.length
    ? ch.subs.map(subBlock).join('')
    : ch.paragraphs.map(p => `<p>${e(p)}</p>`).join('');

  return `
    <article class="rs-card">
      ${head}
      <div class="rs-body">${body}</div>
      <div class="rs-foot">${rsOpen(ch)}</div>
    </article>
  `;
}
function summaryText(list, mode) {
  return list
    .map(ch => {
      const lines = [`${ch.number}. ${ch.title}`];

      if (mode === 'singkat') {
        const key = keySentence(ch);
        const kw = keywordsOf(ch).slice(0, KW_COUNT);
        if (key) lines.push(key);
        if (kw.length) lines.push(`Poin kunci: ${kw.join(', ')}`);
        if (ch.tokoh) lines.push(`Tokoh: ${ch.tokoh}`);
        return lines.join('\n');
      }

      if (!ch.subs.length) lines.push(...ch.paragraphs);

      ch.subs.forEach(s => {
        lines.push('', `${s.id} ${s.title}`);
        lines.push(...s.paragraphs);
        if (s.tokoh) lines.push(`Tokoh: ${s.tokoh}`);
        if (s.teks) lines.push(`Teks: ${s.teks}`);
        s.parts.forEach(p => lines.push(`- ${p.title}: ${p.paragraphs.join(' ')}`));
        lines.push(...s.notes);
      });

      return lines.join('\n');
    })
    .join('\n\n');
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();

    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }

    area.remove();
    return ok;
  }
}

function renderRingkasan() {
  mountPage(`
    ${navMarkup('Menu Belajar')}

    <section class="bl-content">
      ${viewHead(
        'RINGKASAN PINTAR',
        'Ringkasan Materi',
        'Pilih Singkat untuk meninjau cepat sebelum kuis, atau Lengkap untuk membaca ulang seluruh materi.'
      )}

      <div class="bl-toolbar">
        <div class="bl-seg" role="tablist" aria-label="Mode ringkasan">
          <button type="button" role="tab" data-mode="singkat">Singkat</button>
          <button type="button" role="tab" data-mode="lengkap">Lengkap</button>
        </div>

        <button class="bl-ghost" id="sumCopy" type="button">
          ${ui.copy}<span>Salin ringkasan</span>
        </button>
      </div>

      <div class="bl-chips" id="sumChips">
        <button class="bl-chip" data-filter="all" type="button">Semua</button>
        ${materi
          .map(
                        s => `<button class="bl-chip" data-filter="${s.number}" type="button">${e(s.short)}</button>`
          )
          .join('')}
      </div>

      <div class="rs-list" id="sumList"></div>
      <div id="sumEnd" style="height:1px" aria-hidden="true"></div>
    </section>
  `);

  bindNav({ back: () => openView('menu'), returnView: 'ringkasan' });
  bindKeys(() => openView('menu'));
  const list = document.querySelector('#sumList');

  /* achievement: "selesai membaca" = sampai ke dasar daftar (filter Semua) */
  let readIO = null;

  function watchRead() {
    readIO?.disconnect();
    readIO = null;

    const end = document.querySelector('#sumEnd');
    const scroller = document.querySelector('.bl-scroller');

    if (sumFilter !== 'all' || !end || !scroller || !('IntersectionObserver' in window)) return;

    const mode = sumMode;

    readIO = new IntersectionObserver(
      (entries, io) => {
        if (!entries.some(en => en.isIntersecting)) return;
        io.disconnect();
        recordSummaryRead(mode);
      },
      { root: scroller, threshold: 0 }
    );

    readIO.observe(end);
  }

  list.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-slide]');
    if (btn) openView('slides', { slide: Number(btn.dataset.slide) });
  });
  const modeButtons = document.querySelectorAll('[data-mode]');
  const chipButtons = document.querySelectorAll('[data-filter]');

  const visible = () =>
    sumFilter === 'all'
      ? materi
      : materi.filter(s => String(s.number) === String(sumFilter));

  function paint() {
    modeButtons.forEach(b => {
      const active = b.dataset.mode === sumMode;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    });

    chipButtons.forEach(c =>
      c.classList.toggle('is-active', String(c.dataset.filter) === String(sumFilter))
    );

    requestAnimationFrame(watchRead);
    list.className = `rs-list is-${sumMode}`;
    list.innerHTML = visible()
      .map(s => summaryCard(s, sumMode))
      .join('');
  }

  modeButtons.forEach(b =>
    b.addEventListener('click', () => {
      if (sumMode === b.dataset.mode) return;
      sumMode = b.dataset.mode;
      paint();
    })
  );

  chipButtons.forEach(c =>
    c.addEventListener('click', () => {
      sumFilter = c.dataset.filter;
      paint();
    })
  );

  document.querySelector('#sumCopy').addEventListener('click', async () => {
    const ok = await copyText(summaryText(visible(), sumMode));
    notice(
      ok
        ? `Ringkasan ${sumMode} berhasil disalin.`
        : 'Gagal menyalin. Silakan salin teks secara manual.'
    );
  });

  paint();
}

/* =========================================================
   VIEW: PETA KONSEP
   ========================================================= */

let pkSel = 'root';

function pkNodes() {
  const nodes = [
    {
      id: 'root',
      number: 1,
      glyph: 'ॐ',
      title: 'Darsana',
      sub: 'Cara pandang tentang kehidupan'
    },
    {
      id: 'mid',
      number: 2,
      glyph: '✦',
      title: 'Astika · Sad Darsana',
      sub: 'Enam sistem filsafat'
    }
  ];

    materi
    .filter(s => s.number >= 3 && s.number <= 8)
    .forEach(s =>
      nodes.push({
        id: `n${s.number}`,
        number: s.number,
        glyph: pad(s.number - 2),
        title: s.short,
        sub: FOCUS[s.key] || '',
        leaf: true
      })
    );

  return nodes;
}

function pkDetail(id) {
  const all = pkNodes();
  const node = all.find(n => n.id === id) || all[0];
  const section = materi[indexOfNumber(node.number)];
  if (!section) return '';

  const termChips = (title, list) =>
    list.length
      ? `<div class="pk-block">
           <span class="panel-label">${e(title)}</span>
           <div class="pk-chips">
             ${list
               .map(
                 g => `<button class="pk-chip" data-term="${e(g.term)}" type="button">${e(g.term)}</button>`
               )
               .join('')}
           </div>
         </div>`
      : '';

  const fact = (label, value, glyph) =>
    value
      ? `<div class="tokoh-card">
           <span class="tokoh-glyph" aria-hidden="true">${glyph}</span>
           <div><span class="panel-label">${e(label)}</span><strong>${e(value)}</strong></div>
         </div>`
      : '';

  let label = 'Akar konsep';
  let desc = section.paragraphs.slice(0, 2).join(' ');
  let extra = '';

  if (id === 'root') {
    const core = GLOSSARY.filter(g => ['Darsana', 'Sad Darsana', 'Astika'].includes(g.term));
    const more = conceptsFor(1, 8).filter(g => !core.includes(g));
    extra = termChips('Istilah kunci', [...core, ...more]);
  } else if (id === 'mid') {
    label = 'Kelompok';
    desc = `${GLOSSARY.find(g => g.term === 'Astika')?.def || ''} ${section.paragraphs[0] || ''}`.trim();
    extra = `
      <div class="pk-block">
        <span class="panel-label">Enam aliran</span>
        <div class="pk-chips">
          ${all
            .filter(n => n.leaf)
            .map(n => `<button class="pk-chip" data-node="${n.id}" type="button">${e(n.title)}</button>`)
            .join('')}
        </div>
      </div>
      ${termChips('Konsep terkait', GLOSSARY.filter(g => ['Astika', 'Weda'].includes(g.term)))}
    `;
  } else {
    label = `Aliran ${pad(node.number - 2)} dari 06`;

    const apply = section.app.text ? clipSent(section.app.text, 3) : '';
    const facts = fact('Tokoh', section.tokoh, 'ॐ') + fact('Teks Utama', section.teks, '❖');

    extra = `
      ${facts ? `<div class="facts">${facts}</div>` : ''}
      ${termChips('Konsep terkait', conceptsFor(node.number))}
      ${
        apply
          ? `<div class="pk-block">
               <span class="panel-label">Penerapan</span>
               <p class="pk-note">${e(apply)}</p>
             </div>`
          : ''
      }
    `;
  }

  return `
    <span class="panel-label">${e(label)}</span>
    <h2>${e(node.title)}</h2>
    ${node.sub ? `<p class="pk-focus">${e(node.sub)}</p>` : ''}
    <div class="darsana-modal-divider"></div>
    <p class="pk-desc">${e(desc)}</p>
    ${extra}
    <button class="primary-button pk-go" data-go="${section.index}" type="button">
      Buka slide ${e(section.title)} →
    </button>
  `;
}

function pkNodeBtn(n, i) {
  return `
    <button class="pk-node ${n.leaf ? 'is-leaf' : 'is-top'}" data-node="${n.id}" type="button" style="--i:${i}">
      <span class="pk-glyph">${e(n.glyph)}</span>
      <span class="pk-text">
        <strong>${e(n.title)}</strong>
        ${n.sub ? `<small>${e(n.sub)}</small>` : ''}
      </span>
    </button>
  `;
}

function renderPeta() {
  recordConceptMapOpened();
  const nodes = pkNodes();

  mountPage(`
    ${navMarkup('Menu Belajar')}

    <section class="bl-content">
      ${viewHead(
        'PETA KONSEP',
        'Peta Konsep Darsana',
        'Dari Darsana hingga enam aliran Sad Darsana. Klik simpul untuk membaca penjelasannya.'
      )}

      <div class="pk">
                <div class="pk-map" role="group" aria-label="Peta konsep">
          ${pkNodeBtn(nodes[0], 0)}
          <span class="pk-link" aria-hidden="true"></span>
          ${pkNodeBtn(nodes[1], 1)}
          <span class="pk-link" aria-hidden="true"></span>

          <div class="pk-leaves">
            ${nodes
              .slice(2)
              .map((n, i) => pkNodeBtn(n, i + 2))
              .join('')}
          </div>
        </div>

        <aside class="pk-detail" id="pkDetail" aria-live="polite"></aside>
      </div>
    </section>
  `);

  bindNav({ back: () => openView('menu'), returnView: 'peta' });
  bindKeys(() => openView('menu'));

  const detail = document.querySelector('#pkDetail');
  const nodeButtons = document.querySelectorAll('.pk-node');

  function bindDetail() {
    detail.querySelectorAll('[data-term]').forEach(b =>
      b.addEventListener('click', () => openGlossaryModal(b.dataset.term))
    );
    detail.querySelectorAll('[data-node]').forEach(b =>
      b.addEventListener('click', () => select(b.dataset.node, true))
    );
    detail.querySelector('[data-go]')?.addEventListener('click', ev =>
      openView('slides', { slide: Number(ev.currentTarget.dataset.go) })
    );
  }

  function select(id, scroll = false) {
    pkSel = id;

    if (scroll) {
      const picked = nodes.find(n => n.id === id);
      const key = picked?.leaf ? materi[indexOfNumber(picked.number)]?.key : '';
      if (key) recordConceptBranch(key);
    }

    nodeButtons.forEach(b => {
      const active = b.dataset.node === id;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    });

    detail.classList.remove('is-swap');
    void detail.offsetWidth;
    detail.innerHTML = pkDetail(id);
    detail.classList.add('is-swap');
    bindDetail();

    if (scroll && window.matchMedia?.('(max-width: 960px)').matches) {
      detail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  nodeButtons.forEach(b =>
    b.addEventListener('click', () => select(b.dataset.node, true))
  );

  select(pkSel);
}
/* =========================================================
   MEDIA: audio & video (player custom + subtitle .vtt)
   Taruh file di folder public/ :
     public/audio/audio.m4a     public/subtitle/audio.vtt
     public/video/video.mp4     public/subtitle/video.vtt
   ========================================================= */

const MEDIA_BASE = import.meta.env.BASE_URL;
const AUDIO_SRC = `${MEDIA_BASE}audio/audio.m4a`;
const VIDEO_SRC = `${MEDIA_BASE}video/video.mp4`;
const AUDIO_SUBS = `${MEDIA_BASE}subtitle/audio.vtt`;
const VIDEO_SUBS = `${MEDIA_BASE}subtitle/video.vtt`;
const VIDEO_POSTER = ''; /* opsional, mis. `${MEDIA_BASE}video/poster.jpg` */

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
let auSpeed = 1;
let vdSpeed = 1;
let ccPref = true; /* pilihan subtitle on/off diingat antar halaman */

/* isi slider (bagian kiri thumb) digambar langsung di elemennya, bukan lewat variabel CSS */
/* isian slider digambar langsung di elemennya (kiri thumb = amber) */
function paintFill(el, pct) {
  const p = Math.min(Math.max(Number(pct) || 0, 0), 100);
  el.style.background =
    `linear-gradient(to right, #d99a55 ${p}%, rgba(255,255,255,0.22) ${p}%)`;
}

function fmtTime(s) {
  if (!Number.isFinite(s) || s < 0) return '--:--';

  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);

  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/* dipanggil saat pindah view / keluar, supaya suara tidak jalan terus */
function stopMedia() {
  document
    .querySelectorAll('.belajar-page audio, .belajar-page video')
    .forEach(m => m.pause());
}

/* ---------- ikon kontrol ---------- */

const mpi = {
  vol: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>', 20),
  mute: svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/>', 20),
  cc: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10.5 10.2a2.3 2.3 0 1 0 0 3.6M17.5 10.2a2.3 2.3 0 1 0 0 3.6"/>', 20),
  pip: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor"/>', 20),
  full: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', 20),
  exitFull: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>', 20),
  download: svg('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>', 20)
};

/* ---------- subtitle: baca & parse file .vtt ---------- */

const cueCache = new Map();

function parseVTT(text) {
  const toSec = s => {
    const p = s.trim().replace(',', '.').split(':').map(Number);
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
  };

  return String(text || '')
    .replace(/\r/g, '')
    .split(/\n\n+/)
    .map(block => {
      const lines = block.split('\n');
      const i = lines.findIndex(l => l.includes('-->'));
      if (i < 0) return null;

      const [a, b] = lines[i].split('-->');
      return {
        start: toSec(a),
        end: toSec(b.trim().split(/\s+/)[0]),
        text: lines.slice(i + 1).join(' ').trim()
      };
    })
    .filter(c => c && c.text);
}

async function loadCues(url) {
  if (cueCache.has(url)) return cueCache.get(url);

  const res = await fetch(url);
  if (!res.ok) throw new Error('subtitle tidak ditemukan');

  const cues = parseVTT(await res.text());
  cueCache.set(url, cues);
  return cues;
}

/* indeks cue terakhir yang start-nya <= t (binary search), -1 kalau belum ada */
function cueIndex(cues, t) {
  let lo = 0;
  let hi = cues.length - 1;
  let ans = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return ans;
}

/* listener di document yang melepas dirinya sendiri kalau halaman sudah diganti */
function onDocument(root, type, fn) {
  const handler = ev => {
    if (!root.isConnected) {
      document.removeEventListener(type, handler);
      return;
    }
    fn(ev);
  };

  document.addEventListener(type, handler);
}

/* ---------- markup kontrol (dipakai audio & video) ---------- */

function playerBar({ kind, src, name }) {
  const video = kind === 'video';

  return `
    <div class="mp-controls">
      <div class="mp-seekrow">
        <span class="mp-time" data-p="cur">0:00</span>
        <input class="mp-seek" data-p="seek" type="range" min="0" max="100" step="0.1" value="0" aria-label="Posisi" />
        <span class="mp-time" data-p="total">--:--</span>
      </div>

      <div class="mp-row">
        <div class="mp-group">
          <button class="mp-btn" data-p="back" type="button" aria-label="Mundur 10 detik" title="Mundur 10 detik (←)">${ui.back10}</button>
          <button class="mp-btn mp-btn-main" data-p="play" type="button" aria-label="Putar" title="Putar / jeda (Spasi)">${ui.play}</button>
          <button class="mp-btn" data-p="fwd" type="button" aria-label="Maju 10 detik" title="Maju 10 detik (→)">${ui.fwd10}</button>

          <div class="mp-vol">
            <button class="mp-btn" data-p="mute" type="button" aria-label="Bisukan" title="Bisukan (M)">${mpi.vol}</button>
            <input class="mp-volrange" data-p="vol" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume" />
          </div>
        </div>

        <div class="mp-group">
          <button class="mp-btn mp-toggle" data-p="cc" type="button" aria-pressed="true" aria-label="Subtitle" disabled>${mpi.cc}</button>

          <div class="mp-speed">
            <button class="mp-btn mp-pill" data-p="speedBtn" type="button" aria-haspopup="menu" aria-expanded="false" title="Kecepatan">
              <span data-p="speedLabel">1×</span>
            </button>
            <ul class="mp-menu" data-p="speedMenu" role="menu" hidden>
              ${SPEEDS.map(
                s =>
                  `<li><button type="button" role="menuitemradio" data-speed="${s}"><span>${s}×</span></button></li>`
              ).join('')}
            </ul>
          </div>

          ${
            video
              ? `<button class="mp-btn" data-p="pip" type="button" aria-label="Picture-in-Picture" title="Picture-in-Picture">${mpi.pip}</button>
                 <button class="mp-btn" data-p="full" type="button" aria-label="Layar penuh" title="Layar penuh (F)">${mpi.full}</button>`
              : ''
          }

          <a class="mp-btn" data-p="download" href="${src}" download="${name}" aria-label="Unduh" title="Unduh">${mpi.download}</a>
        </div>
      </div>
    </div>
  `;
}

/* ---------- logika player (satu fungsi untuk audio & video) ---------- */

function bindPlayer(root, { kind, subsUrl, getSpeed, setSpeed, onExit }) {
  const q = k => root.querySelector(`[data-p="${k}"]`);

  const media = q('media');
  const stage = q('stage');
  const caption = q('caption');
  const big = q('big');
  const flash = q('flash');
  const failBox = q('error') || q('note');
  const meta = q('meta');

  const seek = q('seek');
  const cur = q('cur');
  const total = q('total');
  const playBtn = q('play');
  const backBtn = q('back');
  const fwdBtn = q('fwd');
  const muteBtn = q('mute');
  const vol = q('vol');
  const ccBtn = q('cc');
  const speedBtn = q('speedBtn');
  const speedLabel = q('speedLabel');
  const speedMenu = q('speedMenu');
  const speedItems = speedMenu.querySelectorAll('[data-speed]');
  const pipBtn = q('pip');
  const fullBtn = q('full');

  /* track bawaan hanya dipakai supaya subtitle ikut tampil di jendela PiP */
  const track = media.textTracks && media.textTracks[0];
  if (track) track.mode = 'hidden';

  const locked = [seek, playBtn, backBtn, fwdBtn];
  const setReady = on => locked.forEach(c => (c.disabled = !on));

  let seeking = false;
  let cues = [];
  let capState = 'loading'; /* loading | ok | missing */
  let capKey = null;
  let ccOn = ccPref;
  let wake = () => {};
  let lines = []; /* baris subtitle audio */
  let lastLine = -2;

  setReady(false);

  /* ----- waktu & play ----- */

  function paintTime() {
    const d = media.duration;
    const pct = Number.isFinite(d) && d > 0 ? (media.currentTime / d) * 100 : 0;

    seek.value = pct;
    paintFill(seek, pct);
    cur.textContent = fmtTime(media.currentTime);
  }

  function paintPlay() {
    const playing = !media.paused && !media.ended;

    playBtn.innerHTML = playing ? ui.pause : ui.play;
    playBtn.setAttribute('aria-label', playing ? 'Jeda' : 'Putar');
    big?.setAttribute('aria-label', playing ? 'Jeda' : 'Putar');

    /* icon tengah: play sebelum/saat mulai, pause setelah dijeda */
    /* icon tengah: pause (||) saat main, play saat dijeda */
    if (big) {
      big.innerHTML = playing ? ui.pause : ui.play;
      big.classList.toggle('is-pause', playing);
    }
    stage.classList.toggle('is-playing', playing);
  }

  function toggle() {
    if (playBtn.disabled) return;
    if (media.paused) media.play().catch(() => {});
    else media.pause();
  }

  function skip(seconds) {
    const d = media.duration;
    if (!Number.isFinite(d)) return;

    media.currentTime = Math.min(Math.max(media.currentTime + seconds, 0), d);
    paintTime();
  }

  /* ----- subtitle ----- */

  function paintCaption(force = false) {
    if (!caption) return;

    const t = media.currentTime;
    let i = capState === 'ok' && ccOn ? cueIndex(cues, t) : -1;
    if (kind === 'video' && i > -1 && t >= cues[i].end) i = -1;

    const key = `${capState}|${ccOn}|${i}`;
    if (key === capKey && !force) return;
    capKey = key;

    caption.hidden = !ccOn;

    if (kind === 'video') {
      caption.innerHTML = i > -1 ? `<span>${e(cues[i].text)}</span>` : '';
      return;
    }

    if (capState !== 'ok') {
      lines = [];
      caption.innerHTML = `<p class="au-hint">${
        capState === 'loading' ? 'Memuat subtitle…' : 'File subtitle tidak ditemukan.'
      }</p>`;
      return;
    }

    if (!lines.length) buildLines();
    paintLines(i, force);
  }

  /* audio: semua baris dirender SEKALI, lalu cukup digeser (tanpa render ulang) */
  function buildLines() {
    caption.innerHTML = `<div class="au-track">${cues
      .map(c => `<p class="au-line">${e(c.text)}</p>`)
      .join('')}</div>`;

    lines = [...caption.querySelectorAll('.au-line')];
    lastLine = -2;
  }

  function paintLines(i, force) {
    if (i === lastLine && !force) return;
    lastLine = i;

    lines.forEach((l, k) => {
      l.classList.toggle('is-now', k === i);
      l.classList.toggle('is-near', Math.abs(k - i) === 1);
    });

    const target = lines[Math.max(i, 0)];
    const track = caption.firstElementChild;
    if (!target || !track) return;

    const y = target.offsetTop + target.offsetHeight / 2 - caption.clientHeight / 2;
    track.style.transform = `translateY(${-y}px)`;
  }

  function paintCC() {
    ccBtn.classList.toggle('is-on', ccOn);
    ccBtn.setAttribute('aria-pressed', String(ccOn));
    if (capState === 'ok') ccBtn.title = ccOn ? 'Sembunyikan subtitle (C)' : 'Tampilkan subtitle (C)';

    if (track) {
      track.mode = document.pictureInPictureElement === media && ccOn ? 'showing' : 'hidden';
    }
  }

  function toggleCC() {
    if (ccBtn.disabled) return;
    ccOn = !ccOn;
    ccPref = ccOn;
    paintCC();
    paintCaption(true);
  }

  paintCC();
  paintCaption(true);

  loadCues(subsUrl)
    .then(list => {
      cues = list;
      capState = 'ok';
      ccBtn.disabled = false;
      paintCC();
      paintCaption(true);
    })
    .catch(() => {
      capState = 'missing';
      ccBtn.disabled = true;
      ccBtn.title = 'File subtitle tidak ditemukan';
      paintCaption(true);
    });

  /* ----- volume ----- */

  function paintVol() {
    const v = media.muted ? 0 : media.volume;

    vol.value = v;
    paintFill(vol, v * 100);
    muteBtn.innerHTML = v === 0 ? mpi.mute : mpi.vol;
    muteBtn.setAttribute('aria-label', v === 0 ? 'Aktifkan suara' : 'Bisukan');
  }

  function toggleMute() {
    media.muted = !media.muted;
    if (!media.muted && media.volume === 0) media.volume = 0.6;
  }

  /* ----- kecepatan ----- */

  function applySpeed() {
    const s = getSpeed();

    media.defaultPlaybackRate = s;
    media.playbackRate = s;
    speedLabel.textContent = `${s}×`;

    speedItems.forEach(b => {
      const on = Number(b.dataset.speed) === s;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', String(on));
    });
  }

  function setMenu(open) {
    speedMenu.hidden = !open;
    speedBtn.setAttribute('aria-expanded', String(open));
    speedBtn.parentElement.classList.toggle('is-open', open);
  }

  /* ----- layar penuh & PiP (video) ----- */

  function toggleFull() {
    if (!fullBtn) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (stage.requestFullscreen) {
      stage.requestFullscreen().catch(() => {});
    } else if (media.webkitEnterFullscreen) {
      media.webkitEnterFullscreen(); /* iPhone: layar penuh bawaan */
    }
  }

  if (fullBtn) {
    fullBtn.addEventListener('click', toggleFull);

    onDocument(root, 'fullscreenchange', () => {
      const on = document.fullscreenElement === stage;

      stage.classList.toggle('is-full', on);
      fullBtn.innerHTML = on ? mpi.exitFull : mpi.full;
      fullBtn.setAttribute('aria-label', on ? 'Keluar layar penuh' : 'Layar penuh');
    });
  }

  if (pipBtn) {
    if (!document.pictureInPictureEnabled || media.disablePictureInPicture) {
      pipBtn.hidden = true;
    } else {
      pipBtn.addEventListener('click', async () => {
        try {
          if (document.pictureInPictureElement) await document.exitPictureInPicture();
          else await media.requestPictureInPicture();
        } catch {
          /* PiP ditolak browser, abaikan */
        }
      });

      media.addEventListener('enterpictureinpicture', paintCC);
      media.addEventListener('leavepictureinpicture', paintCC);
    }
  }

  /* ----- kontrol tampil/sembunyi otomatis (video) ----- */

  if (kind === 'video') {
    let idle;

    wake = () => {
      stage.classList.remove('is-idle');
      clearTimeout(idle);

      if (!media.paused) {
        idle = setTimeout(() => {
          if (speedMenu.hidden) stage.classList.add('is-idle');
        }, 2600);
      }
    };

    ['mousemove', 'pointerdown', 'touchstart'].forEach(type =>
      stage.addEventListener(type, wake, { passive: true })
    );

    ['play', 'pause', 'ended'].forEach(type => media.addEventListener(type, wake));

    media.addEventListener('click', toggle);
  }

  big?.addEventListener('click', toggle);

  /* ----- event media ----- */

  function onMeta() {
    total.textContent = fmtTime(media.duration);
    if (meta) meta.textContent = `${materi.length} bagian · ${fmtTime(media.duration)}`;
    setReady(true);
    applySpeed();
    paintTime();
  }

  media.addEventListener('loadedmetadata', onMeta);
  if (media.readyState >= 1) onMeta();

  media.addEventListener('timeupdate', () => {
    if (!seeking) paintTime();
    paintCaption();
  });

  media.addEventListener('seeked', () => paintCaption());
  ['play', 'pause', 'ended'].forEach(type => media.addEventListener(type, paintPlay));
  media.addEventListener('volumechange', paintVol);

  /* achievement audio / video */
  const recPlayed = kind === 'video' ? recordVideoPlayed : recordAudioPlayed;
  const recDone = kind === 'video' ? recordVideoFinished : recordAudioFinished;

  let heard = 0;
  let lastT = 0;
  let reported = false;

  media.addEventListener('play', () => {
    if (reported) return;
    reported = true;
    recPlayed('main');
  });

  media.addEventListener('timeupdate', () => {
    const t = media.currentTime;
    const d = t - lastT;

    /* loncatan (seek) tidak dihitung sebagai "didengarkan" */
    if (!media.paused && !media.seeking && d > 0 && d < 2.5) heard += d;
    lastT = t;
  });

  media.addEventListener('seeked', () => {
    lastT = media.currentTime;
  });

  media.addEventListener('ended', () => {
    if (Number.isFinite(media.duration) && heard >= media.duration * 0.85) recDone('main');
    heard = 0;
    lastT = 0;
  });

  media.addEventListener('error', () => {
    setReady(false);
    total.textContent = '--:--';
    if (failBox) failBox.hidden = false;
  });

  /* ----- kontrol ----- */

  seek.addEventListener('pointerdown', () => {
    seeking = true;
  });

  ['pointerup', 'pointercancel', 'change'].forEach(type =>
    seek.addEventListener(type, () => {
      seeking = false;
    })
  );

  seek.addEventListener('input', () => {
    const d = media.duration;
    if (!Number.isFinite(d)) return;

    media.currentTime = (Number(seek.value) / 100) * d;
    paintFill(seek, seek.value);
    cur.textContent = fmtTime(media.currentTime);
    paintCaption();
  });

  playBtn.addEventListener('click', toggle);
  backBtn.addEventListener('click', () => skip(-10));
  fwdBtn.addEventListener('click', () => skip(10));
  muteBtn.addEventListener('click', toggleMute);

  vol.addEventListener('input', () => {
    media.volume = Number(vol.value);
    media.muted = media.volume === 0;
  });

  ccBtn.addEventListener('click', toggleCC);

  speedBtn.addEventListener('click', () => setMenu(speedMenu.hidden));

  speedMenu.addEventListener('click', ev => {
    const item = ev.target.closest('[data-speed]');
    if (!item) return;

    setSpeed(Number(item.dataset.speed));
    applySpeed();
    setMenu(false);
  });

  onDocument(root, 'click', ev => {
    if (!speedBtn.parentElement.contains(ev.target)) setMenu(false);
  });

  /* ----- keyboard ----- */

  document.onkeydown = ev => {
    const t = ev.target;
    const tag = t instanceof HTMLElement ? t.tagName : '';

    if (ev.key === 'Escape') {
      if (!speedMenu.hidden) setMenu(false);
      else if (!document.fullscreenElement) onExit?.();
      return;
    }

    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if ((ev.key === ' ' || ev.key === 'Enter') && (tag === 'BUTTON' || tag === 'A')) return;
    if (tag === 'INPUT' && ev.key.startsWith('Arrow')) return;

    switch (ev.key.toLowerCase()) {
      case ' ':
      case 'k':
        ev.preventDefault();
        toggle();
        break;
      case 'arrowleft':
      case 'j':
        skip(-10);
        break;
      case 'arrowright':
      case 'l':
        skip(10);
        break;
      case 'm':
        toggleMute();
        break;
      case 'c':
        toggleCC();
        break;
      case 'f':
        toggleFull();
        break;
      default:
        return;
    }

    wake();
  };

  paintVol();
  paintPlay();
  applySpeed();
}

/* =========================================================
   VIEW: DENGARKAN MATERI
   ========================================================= */

function renderAudio() {
  mountPage(`
    ${navMarkup('Menu Belajar')}

    <section class="bl-content">
      ${viewHead(
        'DENGARKAN',
        'Dengarkan Materi',
        'Satu file audio berisi seluruh materi, dilengkapi subtitle yang berjalan mengikuti suara.'
      )}

      <div class="au-solo">
        <section class="au-player" data-p="stage" aria-label="Pemutar audio">
          <audio data-p="media" preload="metadata" src="${AUDIO_SRC}"></audio>

          <div class="au-art" aria-hidden="true">
            <span class="au-om">ॐ</span>
            <span class="au-eq"><i></i><i></i><i></i><i></i><i></i></span>
          </div>

          <div class="au-now">
            <span class="panel-label">Audio</span>
            <strong>Sad Darsana: Materi Lengkap</strong>
            <span class="au-meta" data-p="meta">${materi.length} bagian</span>
          </div>

          <div class="au-caption" data-p="caption" aria-live="off"></div>

          ${playerBar({ kind: 'audio', src: AUDIO_SRC, name: 'Sad-Darsana-Audio.m4a' })}

          <p class="au-note" data-p="note" hidden>
            File audio tidak ditemukan. Pastikan file tersedia di <b>public/audio/audio.m4a</b>.
          </p>
        </section>
      </div>
    </section>
  `);

  bindNav({ back: () => openView('menu'), returnView: 'audio' });

  bindPlayer(document.querySelector('.au-solo'), {
    kind: 'audio',
    subsUrl: AUDIO_SUBS,
    getSpeed: () => auSpeed,
    setSpeed: s => {
      auSpeed = s;
    },
    onExit: () => openView('menu')
  });
}

/* =========================================================
   VIEW: TONTON VIDEO
   ========================================================= */

function renderVideo() {
  mountPage(`
    ${navMarkup('Menu Belajar')}

    <section class="bl-content">
      ${viewHead(
        'TONTON',
        'Video Pembelajaran',
        'Satu video berisi seluruh materi Sad Darsana dari awal hingga akhir, dilengkapi subtitle.'
      )}

      <div class="vd-solo">
        <div class="vd-frame" data-p="stage">
          <video
            class="vd-el"
            data-p="media"
            playsinline
            preload="metadata"
            ${VIDEO_POSTER ? `poster="${e(VIDEO_POSTER)}"` : ''}
            src="${VIDEO_SRC}"
          >
            <track kind="subtitles" srclang="id" label="Indonesia" src="${VIDEO_SUBS}">
          </video>

          <button class="vd-bigplay" data-p="big" type="button" aria-label="Putar">${ui.play}</button>
          <span class="vd-flash" data-p="flash" aria-hidden="true"></span>
          <div class="vd-cap" data-p="caption" aria-live="off"></div>

          ${playerBar({ kind: 'video', src: VIDEO_SRC, name: 'Sad-Darsana-Video.mp4' })}

          <div class="vd-error" data-p="error" hidden>
            <p>Video tidak dapat dimuat.<br />Pastikan file tersedia di <code>public/video/video.mp4</code>.</p>
          </div>
        </div>

        <div class="vd-bar">
          <div class="vd-info">
            <b>Sad Darsana: Materi Lengkap</b>
            <small data-p="meta">${materi.length} bagian · satu video utuh</small>
          </div>

          <p class="vd-hint">
            <kbd>Spasi</kbd> putar/jeda · <kbd>←</kbd> <kbd>→</kbd> 10 dtk · <kbd>C</kbd> subtitle · <kbd>F</kbd> layar penuh
          </p>
        </div>
      </div>
    </section>
  `);

  bindNav({ back: () => openView('menu'), returnView: 'video' });

  bindPlayer(document.querySelector('.vd-solo'), {
    kind: 'video',
    subsUrl: VIDEO_SUBS,
    getSpeed: () => vdSpeed,
    setSpeed: s => {
      vdSpeed = s;
    },
    onExit: () => openView('menu')
  });
}
/* =========================================================
   VIEW: GLOSARIUM
   ========================================================= */

let glQuery = '';
let glCat = 'Semua';

const letterOf = t => normalize(t).charAt(0).toUpperCase();

const highlight = (text, query) => {
  if (!query) return e(text);

  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');

  return String(text)
    .split(re)
    .map((part, i) => (i % 2 ? `<mark>${e(part)}</mark>` : e(part)))
    .join('');
};

function renderGlosarium() {
  recordGlossaryOpened();
  mountPage(`
    ${navMarkup('Menu Belajar')}

    <section class="bl-content">
      ${viewHead(
        'GLOSARIUM',
        'Istilah Penting',
        'Seluruh istilah dari materi dikumpulkan di sini. Klik kartu untuk melihat detail dan istilah terkait.'
      )}

      <div class="bl-toolbar">
        <label class="bl-search">
          ${ui.search}
          <input id="glSearch" type="search" placeholder="Cari istilah atau artinya…" autocomplete="off" value="${e(glQuery)}" />
          <button class="bl-search-clear" id="glClear" type="button" aria-label="Hapus pencarian" hidden>${ui.close}</button>
        </label>
      </div>

      <div class="bl-chips" id="glChips">
                ${GLOSSARY_CATS.map(
          c =>
            `<button class="bl-chip" data-cat="${c}" type="button">${c}<span class="bl-chip-n">${
              c === 'Semua' ? GLOSSARY.length : GLOSSARY.filter(g => g.cat === c).length
            }</span></button>`
        ).join('')}
      </div>

            <div class="gl-letters" id="glLetters" aria-label="Loncat ke huruf"></div>
      <p class="gl-count" id="glCount"></p>
      <div class="gl-grid is-intro" id="glGrid"></div>
    </section>
  `);

  bindNav({ back: () => openView('menu'), returnView: 'glosarium' });
  bindKeys(() => openView('menu'));

  const input = document.querySelector('#glSearch');
  const clear = document.querySelector('#glClear');
  const grid = document.querySelector('#glGrid');
    const count = document.querySelector('#glCount');
  const letters = document.querySelector('#glLetters');
  const chips = document.querySelectorAll('[data-cat]');

  function paint() {
    const q = glQuery.trim();
    const nq = normalize(q);

    const result = GLOSSARY.filter(g => {
      if (glCat !== 'Semua' && g.cat !== glCat) return false;
      if (!nq) return true;

      const hay = normalize(
        `${g.term} ${g.def} ${g.cat} ${g.sections.map(titleOfNumber).join(' ')}`
      );
      return hay.includes(nq);
    }).sort((a, b) => a.term.localeCompare(b.term, 'id'));

    chips.forEach(c => c.classList.toggle('is-active', c.dataset.cat === glCat));
    clear.hidden = !glQuery;
        count.textContent = `${result.length} dari ${GLOSSARY.length} istilah`;

    grid.classList.toggle('is-filtered', Boolean(nq) || glCat !== 'Semua');

    const present = [...new Set(result.map(g => letterOf(g.term)))];
    letters.innerHTML = present
      .map(l => `<button type="button" data-letter="${l}">${l}</button>`)
      .join('');
    letters.hidden = !present.length;

    if (!result.length) {
      grid.innerHTML = `
        <div class="gl-empty">
          <b>Istilah tidak ditemukan</b>
          <span>Coba kata kunci lain atau ganti kategori.</span>
        </div>
      `;
      return;
    }

    grid.innerHTML = result
      .map(
        g => `
                    <button class="gl-card" data-term="${e(g.term)}" data-letter="${letterOf(g.term)}" type="button">
            <span class="gl-top">
              <span class="gl-cat">${e(g.cat)}</span>
              <span class="gl-arrow" aria-hidden="true">↗</span>
            </span>
            <h3 class="gl-term">${highlight(g.term, q)}</h3>
            <p class="gl-def">${highlight(g.def, q)}</p>
            <span class="gl-from">${
              g.sections.length
                ? `Dari: ${e(g.sections.map(titleOfNumber).join(' · '))}`
                : ''
            }</span>
          </button>
        `
      )
      .join('');
  }

  input.addEventListener('input', () => {
    glQuery = input.value;
    grid.classList.remove('is-intro');
    paint();
  });

  input.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && input.value) {
      ev.stopPropagation();
      input.value = '';
      glQuery = '';
      paint();
    }
  });

  clear.addEventListener('click', () => {
    input.value = '';
    glQuery = '';
    paint();
    input.focus();
  });

  chips.forEach(c =>
    c.addEventListener('click', () => {
      glCat = c.dataset.cat;
      grid.classList.remove('is-intro');
      paint();
    })
  );

  grid.addEventListener('click', ev => {
    const card = ev.target.closest('[data-term]');
    if (card) openGlossaryModal(card.dataset.term);
  });

  paint();
    letters.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-letter]');
    if (!btn) return;

    grid
      .querySelector(`.gl-card[data-letter="${btn.dataset.letter}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  setTimeout(() => grid.classList.remove('is-intro'), 1100);
}

/* modal detail istilah (dipakai Glosarium & Peta Konsep) */
function openGlossaryModal(term) {
  const g = GLOSSARY.find(x => x.term === term);
  if (g) recordGlossaryTerm(g.term);
  if (!g) return;

  closeMaterialModal();

  const modal = document.createElement('div');
  modal.className = 'darsana-modal show';

  const related = g.related.filter(r => GLOSSARY.some(x => x.term === r));

  modal.innerHTML = `
    <div class="darsana-modal-backdrop" data-modal-close></div>

    <div class="darsana-modal-panel" role="dialog" aria-modal="true" aria-label="${e(g.term)}">
      <button class="darsana-modal-close" data-modal-close aria-label="Tutup" type="button">×</button>

      <div class="darsana-modal-number">${e(g.term.charAt(0).toUpperCase())}</div>
      <span class="darsana-modal-label">${e(g.cat.toUpperCase())}</span>

      <h2>${e(g.term)}</h2>

      ${
        g.sections.length
          ? `<p class="darsana-modal-short">Dari: ${e(g.sections.map(titleOfNumber).join(' · '))}</p>`
          : ''
      }

      <div class="darsana-modal-divider"></div>

      <p class="darsana-modal-description">${e(g.def)}</p>

      ${
        related.length
          ? `<div class="darsana-modal-tokoh">
               <span class="panel-label">Istilah terkait</span>
               <div class="pk-chips">
                 ${related
                   .map(r => `<button class="pk-chip" data-related="${e(r)}" type="button">${e(r)}</button>`)
                   .join('')}
               </div>
             </div>`
          : ''
      }

      ${g.sections
        .map(n => {
                    const idx = firstSlideOf(n);
          return idx > -1
            ? `<button class="primary-button darsana-modal-go" data-go="${idx}" type="button">Buka slide ${e(titleOfNumber(n))} →</button>`
            : '';
        })
        .join('')}
    </div>
  `;

  document.body.appendChild(modal);
  document.body.classList.add('modal-open');

  modal
    .querySelectorAll('[data-modal-close]')
    .forEach(el => el.addEventListener('click', () => closeMaterialModal(true)));

  modal.querySelectorAll('[data-related]').forEach(b =>
    b.addEventListener('click', () => openGlossaryModal(b.dataset.related))
  );

  modal.querySelectorAll('[data-go]').forEach(b =>
    b.addEventListener('click', ev => {
      const target = Number(ev.currentTarget.dataset.go);
      closeMaterialModal(true);
      openView('slides', { slide: target });
    })
  );
}

/* =========================================================
   VIEW: SLIDES MATERI
   ========================================================= */

/* aliran (bab 3-8) dianggap selesai saat slide terakhir babnya dilewati */
function markSlideDone(slide) {
  if (!slide) return;

  recordSlideDone(slide.index);

  const lastOfChapter = slides[slide.index + 1]?.chapter !== slide.chapter;

  if (lastOfChapter && slide.chapter >= 3 && slide.chapter <= 8) {
    recordMateriDone(slide.key);
  }
}

function renderSlides({ slide: startSlide = 0 } = {}) {
  mountPage(
    `
      ${navMarkup('Menu Belajar')}

      <section class="learning-page-content">

        <div class="learning-meta">
          <span class="learning-counter">
            <b id="slideCurrent">01</b>
            <span class="learning-counter-divider">/</span>
            <span>${pad(slides.length)}</span>
          </span>

                    <div class="learning-jump" id="chapterJump">
            <button class="jump-btn" id="jumpBtn" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Loncat ke bab">
              <span id="jumpLabel"></span>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
            </button>

            <ul class="jump-menu" id="jumpMenu" role="listbox" hidden>
              ${materi
                .map(
                  c => `
                    <li>
                      <button class="jump-item" role="option" data-jump="${c.number}" type="button">
                        <span class="jump-no">${pad(c.number)}</span>
                        <span class="jump-name">${e(c.short)}</span>
                      </button>
                    </li>
                  `
                )
                .join('')}
            </ul>
          </div>
        </div>

        <div class="learning-progress">
          <span class="learning-progress-bar" id="learningProgress"></span>
        </div>

        <div class="learning-stage" id="learningStage"></div>

        <div class="learning-controls">
          <button class="secondary-button" id="previousSlide" type="button">
            ← Sebelumnya
          </button>

          <div class="learning-dots" id="learningDots"></div>

          <button class="primary-button" id="nextSlide" type="button">
            Berikutnya →
          </button>
        </div>

      </section>
    `,
    { scroll: false }
  );

  const stage = document.querySelector('#learningStage');
  const current = document.querySelector('#slideCurrent');
    const jump = document.querySelector('#chapterJump');
  const jumpBtn = document.querySelector('#jumpBtn');
  const jumpLabel = document.querySelector('#jumpLabel');
  const jumpMenu = document.querySelector('#jumpMenu');
  const progress = document.querySelector('#learningProgress');
  const previous = document.querySelector('#previousSlide');
  const next = document.querySelector('#nextSlide');
  const dots = document.querySelector('#learningDots');

  let index = Math.min(Math.max(Number(startSlide) || 0, 0), slides.length - 1);
    let dotsBuilt = false;

  recordMateriOpened();

  const exit = () => openView('menu');

  bindNav({
    back: exit,
    returnView: 'slides',
    extra: { slide: undefined }
  });

  /* akun: balik ke slide yang sedang dibuka */
  document
    .querySelector('#belajarAccount')
    ?.replaceWith(document.querySelector('#belajarAccount').cloneNode(true));

  document.querySelector('#belajarAccount')?.addEventListener('click', () =>
    leaveThen(() => {
      document.onkeydown = null;
      closeMaterialModal();

      renderProfile({
        name: ctx.name,
        anonymous: ctx.anonymous,
        onBack: () => renderBelajar({ view: 'slides', slide: index })
      });
    })
  );

  /* DOTS: hanya slide di bab yang sedang dibuka */

    function paintDots() {
    /* dibuat sekali: satu titik per slide (slides.length) */
    if (!dotsBuilt) {
      dotsBuilt = true;

      dots.innerHTML = slides
        .map(
          s => `<button class="learning-dot" data-index="${s.index}" aria-label="Slide ${s.index + 1}: ${e(s.title)}" title="${e(s.title)}" type="button"></button>`
        )
        .join('');
    }

    dots.querySelectorAll('.learning-dot').forEach(dot =>
      dot.classList.toggle('active', Number(dot.dataset.index) === index)
    );
  }

  /* RENDER SLIDE */

  function renderSlide(direction = 'next') {
    const slide = slides[index];
    if (!slide) return;

    closeMaterialModal();

recordSlideOpened(index);
    current.textContent = pad(index + 1);
        paintJump(slide.chapter);
    progress.style.width = `${((index + 1) / slides.length) * 100}%`;
    previous.disabled = index === 0;
    next.textContent = index === slides.length - 1 ? 'Selesai ✓' : 'Berikutnya →';

    paintDots();

    /* slide lama memudar keluar sementara yang baru masuk */
    const old = stage.querySelector('.materi-slide:not(.is-leaving)');

    stage.insertAdjacentHTML('beforeend', getSlideMarkup(slide));
    const layout = stage.lastElementChild;

    layout.classList.add(direction === 'prev' ? 'slide-prev' : 'slide-next', 'slide-in');

    if (old) {
      old.classList.add('is-leaving', direction === 'prev' ? 'out-prev' : 'out-next');
      setTimeout(() => old.remove(), 360);
    }

    current.classList.remove('is-tick');
    void current.offsetWidth;
    current.classList.add('is-tick');

    bindSlideInteractions(slide, layout);
  }

  /* NAVIGATION */

  function goTo(target) {
    if (Number.isNaN(target) || target === index || !slides[target]) return;

    if (target > index) markSlideDone(slides[index]);

    const direction = target > index ? 'next' : 'prev';
    index = target;
    renderSlide(direction);
  }

  goToSlide = goTo;

  function goNext() {
    if (index < slides.length - 1) {
      goTo(index + 1);
      return;
    }
    markSlideDone(slides[index]);
    exit();
  }

  function goPrevious() {
    if (index > 0) goTo(index - 1);
  }

  previous.addEventListener('click', goPrevious);
  next.addEventListener('click', goNext);

  dots.addEventListener('click', ev => {
    const dot = ev.target.closest('[data-index]');
    if (dot) goTo(Number(dot.dataset.index));
  });

    /* DROPDOWN BAB */

  function paintJump(number) {
    const ch = materi.find(c => c.number === number);
    if (ch) jumpLabel.textContent = `${pad(ch.number)} · ${ch.short}`;

    jumpMenu.querySelectorAll('.jump-item').forEach(b => {
      const active = Number(b.dataset.jump) === number;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    });
  }

  function setJumpOpen(open) {
    jumpMenu.hidden = !open;
    jumpBtn.setAttribute('aria-expanded', String(open));
    jump.classList.toggle('is-open', open);

    if (open) {
      jumpMenu.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
    }
  }

  jumpBtn.addEventListener('click', () => setJumpOpen(jumpMenu.hidden));

  jumpMenu.addEventListener('click', ev => {
    const item = ev.target.closest('[data-jump]');
    if (!item) return;

    setJumpOpen(false);
    goTo(firstSlideOf(Number(item.dataset.jump)));
  });

  /* klik di luar menu = tutup (listener lepas sendiri kalau halaman sudah diganti) */
  const onDocClick = ev => {
    if (!document.body.contains(jump)) {
      document.removeEventListener('click', onDocClick);
      return;
    }

    if (!jump.contains(ev.target)) setJumpOpen(false);
  };

  document.addEventListener('click', onDocClick);
  /* KEYBOARD */

  document.onkeydown = event => {
    const target = event.target;

    if (
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return;
    }

    if (event.key === 'ArrowRight') goNext();
    if (event.key === 'ArrowLeft') goPrevious();

        if (event.key === 'Escape') {
      if (!jumpMenu.hidden) setJumpOpen(false);
      else if (document.querySelector('.darsana-modal:not(.is-closing)')) closeMaterialModal(true);
      else exit();
    }
  };

  renderSlide('next');
}

/* =========================================================
   REUSABLE BLOCKS (slides)
   ========================================================= */

function slideHeader(slide) {
  return `
    <header class="sl-head">
      <div class="sl-title">
        <span class="mini-label">${e(slide.eyebrow)}</span>
        <h1>${e(slide.title)}</h1>
      </div>
    </header>
  `;
}

function panel(label, text, className = '') {
  if (!text) return '';

  return `
    <section class="panel ${className}">
      <span class="panel-label">${e(label)}</span>
      <p>${e(text)}</p>
    </section>
  `;
}

function factCard(label, value, glyph) {
  if (!value) return '';

  return `
    <aside class="tokoh-card">
      <span class="tokoh-glyph" aria-hidden="true">${glyph}</span>
      <div>
        <span class="panel-label">${e(label)}</span>
        <strong>${e(value)}</strong>
      </div>
    </aside>
  `;
}

function facts(slide) {
  const html = factCard('Tokoh', slide.tokoh, 'ॐ') + factCard('Teks Utama', slide.teks, '❖');
  return html ? `<div class="facts">${html}</div>` : '';
}

function banner(label, text, icon = '✦') {
  if (!text) return '';

  return `
    <section class="app-banner">
      <span class="app-icon" aria-hidden="true">${icon}</span>
      <div>
        <span class="mini-label">${e(label)}</span>
        <p>${e(text)}</p>
      </div>
    </section>
  `;
}

const LEAD_LABELS = [
  [/^pengertian/i, 'Definisi'],
  [/^penerapan/i, 'Penerapan'],
  [/^kesimpulan/i, 'Kesimpulan'],
  [/^catatan/i, 'Catatan']
];

const leadLabel = slide =>
  (LEAD_LABELS.find(([re]) => re.test(slide.title)) || [null, 'Penjelasan'])[1];

const partCols = n => (n <= 3 ? Math.max(n, 1) : n === 4 ? 2 : 3);

function partCard(p, compact = false) {
  return `
    <article class="item-card part-card${compact ? ' is-compact' : ''}">
      <span class="num">${e(p.no)}</span>
      <h3 class="part-title">${e(p.title)}</h3>
      ${p.paragraphs.map(t => `<p>${e(t)}</p>`).join('')}
      ${
        p.tokoh
          ? `<span class="part-tokoh"><i aria-hidden="true">ॐ</i>${e(p.tokoh)}</span>`
          : ''
      }
    </article>
  `;
}

/* =========================================================
   SLIDE LAYOUTS (dipilih otomatis dari bentuk isi: slide.kind)
   ========================================================= */

/* paragraf biasa */
function kindText(slide) {
  const [lead, ...rest] = slide.paragraphs;

  return `
    ${panel(leadLabel(slide), lead, 'panel-lead')}
    ${facts(slide)}
    ${rest.map(p => panel('Penjelasan', p)).join('')}
    ${slide.notes.map(n => banner('Catatan', n, '◈')).join('')}
  `;
}

/* sub-bab "Penerapan ..." */
function kindApp(slide) {
  const [lead, ...rest] = slide.paragraphs;

  return `
    ${banner('Penerapan', lead)}
    ${rest.map(p => panel('Catatan', p, 'panel-accent')).join('')}
  `;
}

/* butir-butir panjang -> kartu */
function kindParts(slide) {
  const [lead, ...rest] = slide.paragraphs;
  const cols = slide.cols || partCols(slide.parts.length);

  return `
    ${panel('Pengantar', lead, 'panel-lead')}
    ${facts(slide)}
    ${rest.map(p => panel('Catatan', p)).join('')}

        ${cardRows(slide.parts, cols)}

    ${slide.notes.map(n => banner('Catatan', n, '◈')).join('')}
  `;
}

/* butir banyak & pendek (mis. 25 Tattva) -> grid kompak */
function kindCompact(slide) {
  const [lead, ...rest] = slide.paragraphs;

  return `
    ${panel('Pengantar', lead, 'panel-lead')}
    ${facts(slide)}
    ${rest.map(p => panel('Catatan', p)).join('')}

        ${cardRows(slide.parts, 5, true)}

    ${slide.notes.map(n => banner('Catatan', n, '◈')).join('')}
  `;
}

/* 2.2 Perbedaan Fokus: kartu enam aliran, bisa diklik */
function kindFokus(slide) {
  return `
    <div class="cards cards-index" style="--cols:3">
      ${slide.paragraphs
        .map((p, i) => {
          const [, name, focus, terms] = p.match(RE_FOKUS);
          const target = materi.find(c => c.key === name.trim().toLowerCase())?.number;

          return `
            <button class="index-card" ${target ? `data-chapter="${target}"` : ''} type="button">
              <span class="num">${pad(i + 1)}</span>
              <h3>${e(name)}</h3>
              <span class="index-focus">Berfokus pada ${e(focus)}</span>
              <ul class="rs-kw">${splitTerms(terms).slice(0, 3)
                .map(t => `<li>${e(t)}</li>`)
                .join('')}</ul>
              <span class="index-arrow" aria-hidden="true">↗</span>
            </button>
          `;
        })
        .join('')}
    </div>

        <p class="hint">Klik salah satu kartu untuk melihat penjelasan singkatnya.</p>
  `;
}

/* penerapan yang ditempel di slide ini */
function appsBlock(slide) {
  return (slide.apps || [])
    .map(a => {
      const [lead, ...rest] = a.paragraphs;
      const label = a.title.replace(/\s+dalam kehidupan modern$/i, '');

      return (
        banner(label, lead) +
        rest.map(p => panel('Catatan', p, 'panel-accent')).join('')
      );
    })
    .join('');
}

/* bagi n kartu ke baris-baris seimbang: 5 -> 3+2, 7 -> 3+2+2 (tanpa sisa kosong) */
function balancedRows(n, max) {
  if (!n) return [];

  const rows = Math.ceil(n / max);
  const base = Math.floor(n / rows);
  const extra = n % rows;

  return Array.from({ length: rows }, (_, i) => base + (i < extra ? 1 : 0));
}

function cardRows(parts, max, compact = false) {
  const sizes = balancedRows(parts.length, Math.max(max, 1));
  let at = 0;

  const rows = sizes
    .map(size => {
      const html = parts
        .slice(at, at + size)
        .map(p => partCard(p, compact))
        .join('');

      at += size;
      return `<div class="cards-row" style="--cols:${size}">${html}</div>`;
    })
    .join('');

  return `<div class="cards-rows${compact ? ' is-compact' : ''}${
    parts.length % 2 ? ' is-odd' : ''
  }">${rows}</div>`;
}

const KIND_RENDERERS = {
  text: kindText,
  app: kindApp,
  parts: kindParts,
  compact: kindCompact,
  fokus: kindFokus
};

function getSlideMarkup(slide) {
  const render = KIND_RENDERERS[slide.kind] || kindText;

  return `
    <article class="materi-slide kind-${slide.kind}">
      ${slideHeader(slide)}
      <div class="sl-body">
        ${render(slide)}
        ${appsBlock(slide)}
      </div>
    </article>
  `;
}

/* =========================================================
   INTERAKSI SLIDE
   ========================================================= */

function bindSlideInteractions(slide, root = document) {
    root.querySelectorAll('[data-chapter]').forEach(card =>
    card.addEventListener('click', () => openDarsanaDialog(Number(card.dataset.chapter)))
  );
}


/* dialog penjelasan singkat satu aliran Sad Darsana, ada tombol menuju slide-nya */
function openDarsanaDialog(number) {
  const ch = materi.find(c => c.number === number);
  if (!ch) return;

  const fromGlossary = GLOSSARY.find(g => normalize(g.term) === ch.key)?.def;
  const fromText = clipSent(ch.subs[0]?.paragraphs[0] || ch.paragraphs[0] || '', 2);

  openMaterialModal({
    number: number - 2,
    title: ch.short,
    focus: FOCUS[ch.key] || '',
    description: fromGlossary || fromText,
    tokoh: ch.tokoh,
    targetIndex: firstSlideOf(number)
  });
}

function openMaterialModal({
  number,
  title,
  focus,
  description,
  tokoh,
  targetIndex
}) {
  closeMaterialModal();

  const modal = document.createElement('div');
  modal.className = 'darsana-modal show';

  modal.innerHTML = `
    <div class="darsana-modal-backdrop" data-modal-close></div>

    <div class="darsana-modal-panel" role="dialog" aria-modal="true">
      <button
        class="darsana-modal-close"
        data-modal-close
        aria-label="Tutup"
        type="button"
      >×</button>

      <div class="darsana-modal-number">${pad(number)}</div>
      <span class="darsana-modal-label">SAD DARSANA</span>

      <h2>${e(title)}</h2>

      ${focus ? `<p class="darsana-modal-short">${e(focus)}</p>` : ''}

      <div class="darsana-modal-divider"></div>

      <p class="darsana-modal-description">
        ${e(description || 'Deskripsi untuk bagian ini belum tersedia.')}
      </p>

      ${
        tokoh
          ? `
            <div class="darsana-modal-tokoh">
              <span class="panel-label">Tokoh</span>
              <strong>${e(tokoh)}</strong>
            </div>
          `
          : ''
      }

      ${
        targetIndex > -1
          ? `
            <button class="primary-button darsana-modal-go" data-go="${targetIndex}" type="button">
              Buka slide ${e(title)} →
            </button>
          `
          : ''
      }
    </div>
  `;

  document.body.appendChild(modal);

  modal
    .querySelectorAll('[data-modal-close]')
    .forEach(el => el.addEventListener('click', () => closeMaterialModal(true)));

  modal.querySelector('[data-go]')?.addEventListener('click', event => {
    const target = Number(event.currentTarget.dataset.go);
    closeMaterialModal(true);
    goToSlide(target);
  });

  document.body.classList.add('modal-open');
}

/* animated = true -> modal memudar dulu sebelum dihapus */
function closeMaterialModal(animated = false) {
  document.body.classList.remove('modal-open');

  document.querySelectorAll('.darsana-modal').forEach(m => {
    if (m.classList.contains('is-closing')) return;

    if (!animated) {
      m.remove();
      return;
    }

    m.classList.add('is-closing');
    setTimeout(() => m.remove(), 220);
  });
}

/* =========================================================
   REGISTRASI VIEW
   ========================================================= */

const VIEWS = {
  menu: renderMenu,
  slides: renderSlides,
  ringkasan: renderRingkasan,
  peta: renderPeta,
  audio: renderAudio,
  video: renderVideo,
  glosarium: renderGlosarium
};