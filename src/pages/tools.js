import { getApp } from '../main.js';
import materiText from '../materi/Materi.txt?raw';
import { generate, generateJSON, hasGeminiKey } from './gemini.js';

/* =========================================================
   DATA MATERI (dipakai sebagai bahan rujukan untuk Gemini)
   ========================================================= */

const SECTION_TITLES = [
  'Pengertian Darsana',
  'Sad Darsana',
  'Nyaya',
  'Vaiseshika',
  'Samkhya',
  'Yoga',
  'Mimamsa',
  'Vedanta'
];

const DARSANA_TITLES = SECTION_TITLES.slice(2);

const LETTERS = ['A', 'B', 'C', 'D'];

const norm = (text) => String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
const clip = (text, max) => String(text || '').slice(0, max);
const pad = (n) => String(n).padStart(2, '0');

/* Pola yang sama dengan parser di kuis.js */
function parseSections(text) {
  const titles = new Map(SECTION_TITLES.map((t) => [norm(t), t]));
  const sections = {};
  let current = null;

  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;

    const heading = line.match(/^\d+[.)]\s+(.+)$/);

    if (heading && titles.has(norm(heading[1]))) {
      current = titles.get(norm(heading[1]));
      sections[current] = [];
      continue;
    }

    if (/^[A-Z]\.\s+[A-Z][A-Z\s&]+$/.test(line)) {
      current = null;
      continue;
    }

    if (current) sections[current].push(line);
  }

  return Object.fromEntries(
    Object.entries(sections).map(([title, lines]) => [title, lines.join('\n')])
  );
}

const SECTIONS = parseSections(materiText);

const ALL_MATERI = clip(
  SECTION_TITLES.filter((t) => SECTIONS[t])
    .map((t) => `## ${t}\n${SECTIONS[t]}`)
    .join('\n\n'),
  16000
);

function resolveTopic(value, custom) {
  if (value === '__all') {
    return { label: 'Seluruh materi Sad Darsana', context: ALL_MATERI };
  }

  if (value === '__custom') {
    return { label: custom, context: ALL_MATERI };
  }

  return { label: value, context: SECTIONS[value] || '' };
}

/* =========================================================
   PROMPT DASAR
   ========================================================= */

const BASE_RULES = `Kamu adalah Dharma AI, asisten belajar di aplikasi DharmaLearn untuk filsafat Hindu, terutama Sad Darsana (Nyaya, Vaiseshika, Samkhya, Yoga, Mimamsa, Vedanta).
Gunakan bahasa Indonesia yang jelas dan sopan.
Jangan mengarang fakta, nama tokoh, atau kutipan sloka. Kalau tidak yakin, katakan terus terang.
Utamakan isi materi referensi dari aplikasi bila relevan.`;

const CHAT_SYSTEM = `${BASE_RULES}

Kamu sedang mengobrol langsung dengan pelajar.
- Jawab ringkas dulu, tambah detail hanya kalau diminta.
- Boleh pakai Markdown sederhana (daftar, **tebal**).
- Kalau pertanyaan di luar topik filsafat Hindu / pelajaran, jawab singkat lalu arahkan kembali dengan ramah.

MATERI REFERENSI:
${ALL_MATERI}`;

const LEVELS = {
  'Anak SD': 'kalimat sangat pendek, analogi akrab dengan keseharian anak, hindari istilah sulit',
  'Remaja (SMA)': 'bahasa santai tapi tetap benar, istilah baru langsung dijelaskan',
  Mahasiswa: 'lebih runtut dan analitis, boleh memakai istilah Sanskerta dengan artinya',
  Mendalam: 'rinci dan reflektif, hubungkan dengan konsep Darsana lain bila relevan'
};

/* =========================================================
   GENERATOR: FLASHCARD
   ========================================================= */

async function runFlashcards(v, signal) {
  const data = await generateJSON({
    system: BASE_RULES,
    signal,
    temperature: 0.8,
    prompt: `Buat ${Number(v.count)} flashcard belajar tentang "${v.topic.label}".
Aturan:
- "front" = pertanyaan atau istilah singkat. "back" = jawaban jelas 1 sampai 3 kalimat.
- Variasikan isi: definisi, tokoh, ajaran inti, istilah, penerapan.
- Jangan ada kartu yang dobel.
Balas HANYA JSON dengan bentuk: {"cards":[{"front":"...","back":"..."}]}

MATERI REFERENSI:
${v.topic.context}`
  });

  const list = Array.isArray(data?.cards) ? data.cards : Array.isArray(data) ? data : [];

  const cards = list
    .map((c) => ({ front: String(c?.front || '').trim(), back: String(c?.back || '').trim() }))
    .filter((c) => c.front && c.back);

  if (!cards.length) throw new Error('AI belum menghasilkan kartu yang valid. Coba generate lagi.');

  return { topic: v.topic.label, cards };
}

function renderFlashcards(host, data, ctx) {
  let deck = data.cards;
  let index = 0;
  let flipped = false;
  let known = [];

  function draw() {
    const card = deck[index];
    const last = index === deck.length - 1;

    host.innerHTML = `
      <div class="ai-deck-top">
        <span><b>${pad(index + 1)}</b> / ${pad(deck.length)}</span>
        <div class="ai-bar"><span style="width:${((index + 1) / deck.length) * 100}%"></span></div>
      </div>

      <button class="ai-flash ${flipped ? 'is-flipped' : ''}" id="aiFlash" type="button" aria-label="Balik kartu">
        <span class="ai-flash-inner">
          <span class="ai-flash-face">
            <small>PERTANYAAN</small>
            <strong>${e(card.front)}</strong>
            <em>Ketuk kartu untuk melihat jawaban</em>
          </span>
          <span class="ai-flash-face ai-flash-back">
            <small>JAWABAN</small>
            <span class="ai-flash-text">${e(card.back)}</span>
          </span>
        </span>
      </button>

      <div class="ai-deck-actions">
        <button class="ai-ghost" id="aiPrev" type="button" ${index === 0 ? 'disabled' : ''}>← Sebelumnya</button>
        <button class="ai-ghost" id="aiNextCard" type="button" ${last ? 'disabled' : ''}>Berikutnya →</button>
      </div>

      <div class="ai-deck-mark">
        <button class="ai-mark ai-mark-no" id="aiNo" type="button">Belum paham</button>
        <button class="ai-mark ai-mark-yes" id="aiYes" type="button">Sudah paham</button>
      </div>
    `;

    const flash = host.querySelector('#aiFlash');

    flash.addEventListener('click', () => {
      flipped = !flipped;
      flash.classList.toggle('is-flipped', flipped);
    });

    host.querySelector('#aiPrev').addEventListener('click', () => go(-1));
    host.querySelector('#aiNextCard').addEventListener('click', () => go(1));
    host.querySelector('#aiNo').addEventListener('click', () => mark(false));
    host.querySelector('#aiYes').addEventListener('click', () => mark(true));
  }

  function go(step) {
    const target = index + step;
    if (target < 0 || target >= deck.length) return;
    index = target;
    flipped = false;
    draw();
  }

  function mark(value) {
    known[index] = value;

    if (index < deck.length - 1) go(1);
    else summary();
  }

  function summary() {
    ctx.keys.handler = null;

    const yes = known.filter(Boolean).length;
    const no = deck.length - yes;

    host.innerHTML = `
      <div class="ai-summary">
        <div class="ai-big">${yes}<span> / ${deck.length}</span></div>
        <p>${
          no
            ? `${no} kartu masih belum kamu pahami. Mau ulangi yang itu saja?`
            : 'Semua kartu sudah kamu pahami. Mantap!'
        }</p>

        <div class="ai-deck-actions">
          ${no ? '<button class="ai-primary" id="aiRepeat" type="button">Ulangi yang belum paham</button>' : ''}
          <button class="ai-ghost" id="aiRestart" type="button">Ulangi semua kartu</button>
        </div>
      </div>
    `;

    host.querySelector('#aiRepeat')?.addEventListener('click', () => {
      deck = deck.filter((_, i) => !known[i]);
      restart();
    });

    host.querySelector('#aiRestart')?.addEventListener('click', () => {
      deck = data.cards;
      restart();
    });
  }

  function restart() {
    index = 0;
    flipped = false;
    known = [];
    bindKeys();
    draw();
  }

  function bindKeys() {
    ctx.keys.handler = (event) => {
      if (event.key === 'ArrowRight') go(1);
      if (event.key === 'ArrowLeft') go(-1);
    };
  }

  bindKeys();
  draw();

  return `${data.cards.length} kartu · ${data.topic}`;
}

/* =========================================================
   GENERATOR: QUIZ
   ========================================================= */

async function runQuiz(v, signal) {
  const data = await generateJSON({
    system: BASE_RULES,
    signal,
    temperature: 0.8,
    prompt: `Buat ${Number(v.count)} soal pilihan ganda (4 opsi) tentang "${v.topic.label}". Tingkat kesulitan: ${v.level}.
Aturan:
- Hanya satu jawaban yang benar, pengecoh harus masuk akal.
- Teks opsi jangan diawali huruf A/B/C/D.
- Variasikan jenis soal (definisi, tokoh, penerapan, perbandingan).
- "explanation" berisi 1 sampai 2 kalimat alasan jawaban benar.
Balas HANYA JSON dengan bentuk:
{"questions":[{"question":"...","options":["...","...","...","..."],"answer":0,"explanation":"..."}]}
"answer" adalah indeks opsi yang benar (0 sampai 3).

MATERI REFERENSI:
${v.topic.context}`
  });

  const list = Array.isArray(data?.questions) ? data.questions : Array.isArray(data) ? data : [];

  const questions = list
    .map((q) => {
      const options = Array.isArray(q?.options)
        ? q.options.map((o) => String(o).replace(/^[A-D][.)]\s+/i, '').trim())
        : [];

      const answer = Number.isInteger(q?.answer)
        ? q.answer
        : LETTERS.indexOf(String(q?.answer || '').toUpperCase());

      return {
        question: String(q?.question || '').trim(),
        options,
        answer,
        explanation: String(q?.explanation || '').trim()
      };
    })
    .filter((q) => q.question && q.options.length === 4 && q.answer >= 0 && q.answer < 4);

  if (!questions.length) throw new Error('AI belum menghasilkan soal yang valid. Coba generate lagi.');

  return { topic: v.topic.label, level: v.level, questions };
}

function renderQuiz(host, data, ctx) {
  let items = prepare();
  let index = 0;
  let score = 0;
  let results = [];
  let locked = false;

  function prepare() {
    return shuffle(data.questions).map((q) => ({
      question: q.question,
      explanation: q.explanation,
      options: shuffle(q.options.map((text, i) => ({ text, correct: i === q.answer })))
    }));
  }

  function draw() {
    const item = items[index];
    const last = index === items.length - 1;
    locked = false;

    host.innerHTML = `
      <div class="ai-deck-top">
        <span><b>${pad(index + 1)}</b> / ${pad(items.length)}</span>
        <div class="ai-bar"><span id="aiQuizBar" style="width:${(index / items.length) * 100}%"></span></div>
      </div>

      <article class="ai-question">
        <h2>${e(item.question)}</h2>

        <div class="ai-options">
          ${item.options
            .map(
              (o, i) => `
                <button class="ai-option" data-i="${i}" type="button">
                  <span class="ai-option-key">${LETTERS[i]}</span>
                  <span>${e(o.text)}</span>
                </button>
              `
            )
            .join('')}
        </div>

        <div class="ai-feedback" id="aiFeedback" hidden></div>
      </article>

      <div class="ai-deck-actions">
        <button class="ai-primary" id="aiQuizNext" type="button" disabled>${last ? 'Lihat hasil' : 'Lanjut →'}</button>
      </div>
    `;

    host.querySelectorAll('.ai-option').forEach((button) => {
      button.addEventListener('click', () => choose(Number(button.dataset.i)));
    });

    host.querySelector('#aiQuizNext').addEventListener('click', next);
  }

  function choose(i) {
    if (locked || !items[index].options[i]) return;
    locked = true;

    const item = items[index];
    const correctIndex = item.options.findIndex((o) => o.correct);
    const ok = i === correctIndex;

    if (ok) score += 1;

    results.push({
      question: item.question,
      chosen: item.options[i].text,
      correct: item.options[correctIndex].text,
      ok
    });

    host.querySelectorAll('.ai-option').forEach((button, bi) => {
      button.disabled = true;
      if (bi === correctIndex) button.classList.add('is-correct');
      else if (bi === i) button.classList.add('is-wrong');
      else button.classList.add('is-dim');
    });

    const feedback = host.querySelector('#aiFeedback');
    feedback.hidden = false;
    feedback.className = `ai-feedback ${ok ? 'is-correct' : 'is-wrong'}`;
    feedback.innerHTML = `
      <b>${ok ? '✓ Jawaban benar.' : `✕ Kurang tepat. Jawaban benar: ${LETTERS[correctIndex]}.`}</b>
      ${item.explanation ? `<p>${e(item.explanation)}</p>` : ''}
    `;

    host.querySelector('#aiQuizBar').style.width = `${((index + 1) / items.length) * 100}%`;

    const nextButton = host.querySelector('#aiQuizNext');
    nextButton.disabled = false;
    nextButton.focus({ preventScroll: true });
  }

  function next() {
    if (!locked) return;
    index += 1;

    if (index >= items.length) result();
    else draw();
  }

  function result() {
    ctx.keys.handler = null;

    const total = items.length;
    const percent = Math.round((score / total) * 100);
    const wrong = results.filter((r) => !r.ok);

    host.innerHTML = `
      <div class="ai-summary">
        <div class="ai-big">${percent}<span>%</span></div>
        <p>${score} benar dari ${total} soal.</p>

        ${
          wrong.length
            ? `
              <div class="ai-review">
                <h3>Soal yang perlu diulang</h3>
                ${wrong
                  .map(
                    (r) => `
                      <article>
                        <p>${e(r.question)}</p>
                        <small class="is-wrong"><b>Jawabanmu:</b> ${e(r.chosen)}</small>
                        <small class="is-correct"><b>Jawaban benar:</b> ${e(r.correct)}</small>
                      </article>
                    `
                  )
                  .join('')}
              </div>
            `
            : ''
        }

        <div class="ai-deck-actions">
          <button class="ai-primary" id="aiQuizRetry" type="button">Ulangi soal ini (diacak)</button>
        </div>
      </div>
    `;

    host.querySelector('#aiQuizRetry').addEventListener('click', () => {
      items = prepare();
      index = 0;
      score = 0;
      results = [];
      bindKeys();
      draw();
    });
  }

  function bindKeys() {
    ctx.keys.handler = (event) => {
      const key = event.key.toLowerCase();
      const picked =
        LETTERS.map((l) => l.toLowerCase()).indexOf(key) > -1
          ? LETTERS.map((l) => l.toLowerCase()).indexOf(key)
          : ['1', '2', '3', '4'].indexOf(key);

      if (picked > -1) {
        choose(picked);
        return;
      }

      if (locked && (key === 'enter' || key === 'arrowright')) {
        event.preventDefault();
        next();
      }
    };
  }

  bindKeys();
  draw();

  return `${data.questions.length} soal · ${data.level} · ${data.topic}`;
}

/* =========================================================
   GENERATOR: JELASKAN SEDERHANA
   ========================================================= */

async function runExplain(v, signal) {
  const text = await generate({
    system: BASE_RULES,
    signal,
    temperature: 0.6,
    prompt: `Jelaskan "${v.concept}" dalam konteks filsafat Hindu untuk pembaca tingkat: ${v.level}.
Gaya bahasa: ${LEVELS[v.level]}.

Format Markdown dengan bagian ini:
## Intinya
(1 sampai 2 kalimat)
## Penjelasan
## Analogi atau contoh sehari-hari
## Satu kalimat penutup

Kalau istilah ini bukan bagian filsafat Hindu, jelaskan singkat lalu hubungkan dengan Darsana yang relevan jika ada.

MATERI REFERENSI:
${ALL_MATERI}`
  });

  return { title: v.concept, text };
}

/* =========================================================
   GENERATOR: BANDINGKAN DARSANA
   ========================================================= */

async function runCompare(v, signal) {
  const data = await generateJSON({
    system: BASE_RULES,
    signal,
    temperature: 0.5,
    prompt: `Bandingkan ${v.a} dan ${v.b} (dua aliran Sad Darsana).
Balas HANYA JSON dengan bentuk:
{"summary":"...","rows":[{"aspect":"...","a":"...","b":"..."}],"similarities":["..."],"takeaway":"..."}

Aturan:
- "rows" berisi 5 sampai 6 aspek: Fokus kajian, Tokoh, Pokok ajaran, Tujuan, Cara mencapai tujuan, Penerapan dalam kehidupan.
- "a" untuk ${v.a} dan "b" untuk ${v.b}. Setiap sel maksimal 25 kata.
- "similarities" 2 sampai 3 poin kesamaan. "summary" dan "takeaway" masing-masing 1 sampai 2 kalimat.

MATERI ${v.a.toUpperCase()}:
${SECTIONS[v.a] || '(tidak ada di materi)'}

MATERI ${v.b.toUpperCase()}:
${SECTIONS[v.b] || '(tidak ada di materi)'}`
  });

  const rows = (Array.isArray(data?.rows) ? data.rows : [])
    .map((r) => ({
      aspect: String(r?.aspect || '').trim(),
      a: String(r?.a || '').trim(),
      b: String(r?.b || '').trim()
    }))
    .filter((r) => r.aspect && r.a && r.b);

  if (!rows.length) throw new Error('AI belum menghasilkan perbandingan yang valid. Coba lagi.');

  return {
    a: v.a,
    b: v.b,
    rows,
    summary: String(data?.summary || '').trim(),
    similarities: (Array.isArray(data?.similarities) ? data.similarities : []).map(String),
    takeaway: String(data?.takeaway || '').trim()
  };
}

function renderCompare(host, data) {
  host.innerHTML = `
    ${data.summary ? `<p class="ai-lead">${e(data.summary)}</p>` : ''}

    <div class="ai-table-wrap">
      <table class="ai-table">
        <thead>
          <tr><th>Aspek</th><th>${e(data.a)}</th><th>${e(data.b)}</th></tr>
        </thead>
        <tbody>
          ${data.rows
            .map((r) => `<tr><th scope="row">${e(r.aspect)}</th><td>${e(r.a)}</td><td>${e(r.b)}</td></tr>`)
            .join('')}
        </tbody>
      </table>
    </div>

    ${
      data.similarities.length
        ? `
          <section class="ai-note">
            <h3>Kesamaan</h3>
            <ul>${data.similarities.map((s) => `<li>${e(s)}</li>`).join('')}</ul>
          </section>
        `
        : ''
    }

    ${
      data.takeaway
        ? `<section class="ai-note ai-note-accent"><h3>Kesimpulan</h3><p>${e(data.takeaway)}</p></section>`
        : ''
    }
  `;

  return `${data.a} dan ${data.b}`;
}

/* =========================================================
   GENERATOR: RINGKAS TEKS
   ========================================================= */

const SUMMARY_STYLES = {
  'Poin-poin': 'daftar poin singkat (maksimal 8 poin)',
  'Paragraf singkat': 'satu sampai dua paragraf padat',
  'Istilah penting': 'daftar istilah penting beserta arti singkatnya'
};

async function runSummarize(v, signal) {
  const text = await generate({
    system: BASE_RULES,
    signal,
    temperature: 0.3,
    prompt: `Ringkas teks di bawah ini menjadi ${SUMMARY_STYLES[v.style]}.
Hanya gunakan isi teks; jangan menambahkan fakta baru. Tulis dalam Markdown.

TEKS:
${clip(v.text, 8000)}`
  });

  return { title: v.style, text };
}

/* Hasil berupa Markdown (Jelaskan, Ringkas) */
function renderMarkdown(host, data, ctx) {
  host.innerHTML = `
    <article class="ai-md ai-md-card">${mdToHtml(data.text)}</article>

    <div class="ai-deck-actions">
      <button class="ai-ghost" id="aiCopy" type="button">Salin teks</button>
    </div>
  `;

  host.querySelector('#aiCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(data.text);
      ctx.notice('Teks disalin.');
    } catch {
      ctx.notice('Gagal menyalin. Salin manual dari layar.');
    }
  });

  return data.title;
}

/* =========================================================
   DAFTAR TOOLS
   ========================================================= */

const TOPIC = { key: 'topic', type: 'topic', label: 'Topik materi' };

const TOOLS = [
  {
    id: 'chat',
    icon: '💬',
    label: 'TALK TO CHATAI',
    title: 'Dharma AI Chat',
    desc: 'Ngobrol dan tanya apa saja seputar Sad Darsana. Jawabannya berpegang pada materi di aplikasi ini.',
    wide: true
  },
  {
    id: 'flashcard',
    icon: '🗂️',
    label: 'GENERATOR',
    title: 'Flashcard Generator',
    desc: 'Ubah topik apa pun jadi kartu hafalan yang bisa dibalik dan dinilai sendiri.',
    loading: 'flashcard',
    fields: [
      TOPIC,
      { key: 'count', type: 'segment', label: 'Jumlah kartu', options: ['5', '10', '15'], suffix: ' kartu', value: '10' }
    ],
    run: runFlashcards,
    render: renderFlashcards
  },
  {
    id: 'quiz',
    icon: '🧠',
    label: 'GENERATOR',
    title: 'Quiz Generator',
    desc: 'Buat soal pilihan ganda baru dengan penjelasan, dari topik dan tingkat kesulitan pilihanmu.',
    loading: 'soal',
    fields: [
      TOPIC,
      { key: 'count', type: 'segment', label: 'Jumlah soal', options: ['5', '10'], suffix: ' soal', value: '5' },
      { key: 'level', type: 'segment', label: 'Tingkat kesulitan', options: ['Mudah', 'Sedang', 'Sulit'], value: 'Sedang' }
    ],
    run: runQuiz,
    render: renderQuiz
  },
  {
    id: 'explain',
    icon: '💡',
    label: 'PENJELASAN',
    title: 'Jelaskan Sederhana',
    desc: 'Bingung dengan sebuah istilah? Minta dijelaskan sesuai tingkat pemahamanmu, lengkap dengan analogi.',
    loading: 'penjelasan',
    fields: [
      { key: 'concept', type: 'text', label: 'Konsep atau istilah', placeholder: 'Misalnya: Purusa dan Prakrti', required: true },
      { key: 'level', type: 'segment', label: 'Dijelaskan untuk', options: Object.keys(LEVELS), value: 'Remaja (SMA)' }
    ],
    run: runExplain,
    render: renderMarkdown
  },
  {
    id: 'compare',
    icon: '⚖️',
    label: 'PERBANDINGAN',
    title: 'Bandingkan Darsana',
    desc: 'Pilih dua aliran, lalu lihat perbedaan dan kesamaannya dalam satu tabel.',
    loading: 'perbandingan',
    fields: [
      { key: 'a', type: 'select', label: 'Aliran pertama', options: DARSANA_TITLES, value: 'Samkhya' },
      { key: 'b', type: 'select', label: 'Aliran kedua', options: DARSANA_TITLES, value: 'Yoga' }
    ],
    validate: (v) => (v.a === v.b ? 'Pilih dua aliran yang berbeda.' : ''),
    run: runCompare,
    render: renderCompare
  },
  {
    id: 'summarize',
    icon: '📝',
    label: 'RINGKASAN',
    title: 'Ringkas Teks',
    desc: 'Tempel catatan atau bacaan panjang, lalu dapatkan ringkasannya dalam format yang kamu mau.',
    loading: 'ringkasan',
    fields: [
      {
        key: 'text',
        type: 'textarea',
        label: 'Teks yang diringkas',
        placeholder: 'Tempel teks di sini (maksimal 8.000 karakter)...',
        required: true,
        min: 80,
        max: 8000
      },
      { key: 'style', type: 'segment', label: 'Bentuk ringkasan', options: Object.keys(SUMMARY_STYLES), value: 'Poin-poin' }
    ],
    run: runSummarize,
    render: renderMarkdown
  }
];

/* =========================================================
   UTILITAS
   ========================================================= */

function e(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function shuffle(list) {
  const result = [...list];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

/* Markdown sederhana (aman: teks di-escape dulu) untuk jawaban Gemini */
function inlineMd(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function mdToHtml(source) {
  let html = '';
  let list = null;

  const closeList = () => {
    if (list) {
      html += `</${list}>`;
      list = null;
    }
  };

  for (const raw of e(source).split('\n')) {
    const line = raw.trim();

    if (!line) {
      closeList();
      continue;
    }

    let match;

    if ((match = line.match(/^#{1,4}\s+(.+)$/))) {
      closeList();
      html += `<h4>${inlineMd(match[1])}</h4>`;
    } else if ((match = line.match(/^[-*•]\s+(.+)$/))) {
      if (list !== 'ul') {
        closeList();
        html += '<ul>';
        list = 'ul';
      }
      html += `<li>${inlineMd(match[1])}</li>`;
    } else if ((match = line.match(/^\d+[.)]\s+(.+)$/))) {
      if (list !== 'ol') {
        closeList();
        html += '<ol>';
        list = 'ol';
      }
      html += `<li>${inlineMd(match[1])}</li>`;
    } else {
      closeList();
      html += `<p>${inlineMd(line)}</p>`;
    }
  }

  closeList();
  return html;
}

function showNotice(message) {
  document.querySelector('.ai-notice')?.remove();

  const notice = document.createElement('div');
  notice.className = 'ai-notice';
  notice.textContent = message;
  document.body.appendChild(notice);

  requestAnimationFrame(() => notice.classList.add('visible'));

  setTimeout(() => {
    notice.classList.remove('visible');
    setTimeout(() => notice.remove(), 250);
  }, 2200);
}

/* =========================================================
   FORM (dibuat otomatis dari `fields` tiap tool)
   ========================================================= */

function fieldHtml(field, raw) {
  const id = `aiF_${field.key}`;
  const value = raw[field.key] ?? field.value ?? '';

  if (field.type === 'topic') {
    const selected = raw.topic ?? '__all';

    return `
      <div class="ai-field">
        <label for="${id}">${e(field.label)}</label>
        <select class="ai-select" id="${id}">
          <option value="__all" ${selected === '__all' ? 'selected' : ''}>Seluruh materi Sad Darsana</option>
          ${SECTION_TITLES.map(
            (t) => `<option value="${e(t)}" ${selected === t ? 'selected' : ''}>${e(t)}</option>`
          ).join('')}
          <option value="__custom" ${selected === '__custom' ? 'selected' : ''}>Topik lain (ketik sendiri)</option>
        </select>
        <input
          class="ai-input"
          id="${id}_custom"
          type="text"
          maxlength="120"
          placeholder="Misalnya: konsep Moksa"
          value="${e(raw.topic_custom || '')}"
          ${selected === '__custom' ? '' : 'hidden'}
        />
      </div>
    `;
  }

  if (field.type === 'segment') {
    return `
      <div class="ai-field">
        <span class="ai-label">${e(field.label)}</span>
        <div class="ai-seg" role="radiogroup" aria-label="${e(field.label)}">
          ${field.options
            .map(
              (o) => `
                <label class="ai-seg-opt">
                  <input type="radio" name="${id}" value="${e(o)}" ${String(value) === String(o) ? 'checked' : ''} />
                  <span>${e(o)}${e(field.suffix || '')}</span>
                </label>
              `
            )
            .join('')}
        </div>
      </div>
    `;
  }

  if (field.type === 'select') {
    return `
      <div class="ai-field">
        <label for="${id}">${e(field.label)}</label>
        <select class="ai-select" id="${id}">
          ${field.options
            .map((o) => `<option value="${e(o)}" ${value === o ? 'selected' : ''}>${e(o)}</option>`)
            .join('')}
        </select>
      </div>
    `;
  }

  if (field.type === 'textarea') {
    return `
      <div class="ai-field">
        <label for="${id}">${e(field.label)}</label>
        <textarea class="ai-textarea" id="${id}" rows="8" maxlength="${field.max || 4000}" placeholder="${e(field.placeholder || '')}">${e(value)}</textarea>
      </div>
    `;
  }

  return `
    <div class="ai-field">
      <label for="${id}">${e(field.label)}</label>
      <input class="ai-input" id="${id}" type="text" maxlength="120" placeholder="${e(field.placeholder || '')}" value="${e(value)}" />
    </div>
  `;
}

function readRaw(tool) {
  const raw = {};

  for (const field of tool.fields) {
    const id = `aiF_${field.key}`;

    if (field.type === 'topic') {
      raw.topic = document.querySelector(`#${id}`).value;
      raw.topic_custom = document.querySelector(`#${id}_custom`).value.trim();
    } else if (field.type === 'segment') {
      raw[field.key] = document.querySelector(`input[name="${id}"]:checked`)?.value || field.value;
    } else {
      raw[field.key] = document.querySelector(`#${id}`).value.trim();
    }
  }

  return raw;
}

function resolveValues(tool, raw) {
  const values = {};

  for (const field of tool.fields) {
    if (field.type === 'topic') values.topic = resolveTopic(raw.topic, raw.topic_custom);
    else values[field.key] = raw[field.key];
  }

  return values;
}

function validateForm(tool, raw, values) {
  for (const field of tool.fields) {
    if (field.type === 'topic' && raw.topic === '__custom' && !raw.topic_custom) {
      return 'Ketik topiknya dulu ya.';
    }

    if (field.required && !raw[field.key]) return `Isi "${field.label}" dulu ya.`;

    if (field.min && raw[field.key].length < field.min) {
      return `${field.label} terlalu pendek (minimal ${field.min} karakter).`;
    }
  }

  return tool.validate?.(values) || '';
}

/* =========================================================
   RENDER HALAMAN TOOLS
   ========================================================= */

export function renderAITools({ onBack } = {}) {
  const app = getApp();

  let controller = null;
  let chatHistory = []; // { role: 'user' | 'model', text, error? }
  const saved = {}; // pengaturan terakhir tiap tool

  function cancel() {
    controller?.abort();
    controller = null;
  }

  function exit() {
    cancel();
    document.onkeydown = null;
    onBack?.();
  }

  function shell(inner, back) {
    cancel();
    document.onkeydown = null;

    app.innerHTML = `
      <main class="page dashboard-page ai-page">
        <div class="ambient ambient-a"></div>
        <div class="ambient ambient-b"></div>

        <nav class="navbar dashboard-navbar">
          <button class="brand" id="aiBrand" type="button">
            <span class="brand-symbol">ॐ</span>
            <span>DharmaLearn</span>
          </button>

          <div class="dashboard-nav-actions">
            <button class="nav-login" id="aiBack" type="button">${e(back.label)}</button>
          </div>
        </nav>

        <section class="dashboard-content">
          ${inner}
        </section>
      </main>
    `;

    document.querySelector('#aiBack').addEventListener('click', back.fn);
    document.querySelector('#aiBrand').addEventListener('click', exit);

    window.scrollTo(0, 0);
  }

  const toDashboard = { label: '← Dashboard', fn: exit };
  const toHub = { label: '← Menu Tools', fn: showHub };

  /* ---------------------------------------------------------
     MENU UTAMA
     --------------------------------------------------------- */

  function showHub() {
    shell(
      `
        <div class="dashboard-heading">
          <span class="eyebrow">ALAT PEMBELAJARAN</span>
          <h1>Tools <span>AI.</span></h1>
          <p>Ditenagai Gemini. Pilih alat yang kamu butuhkan untuk belajar Sad Darsana.</p>
        </div>

        ${
          hasGeminiKey()
            ? ''
            : `
              <div class="ai-banner" role="alert">
                <b>API key Gemini belum diatur.</b>
                Tambahkan <code>VITE_GEMINI_API_KEY</code> di file <code>.env</code>, lalu restart dev server.
              </div>
            `
        }

        <div class="dashboard-grid ai-tools-grid">
          ${TOOLS.map(
            (tool) => `
              <button class="dashboard-card ai-card ${tool.wide ? 'ai-card-wide' : ''}" data-tool="${tool.id}" type="button">
                <div class="dashboard-card-icon">${tool.icon}</div>

                <div class="dashboard-card-content">
                  <span class="dashboard-card-label">${e(tool.label)}</span>
                  <h2>${e(tool.title)}</h2>
                  <p>${e(tool.desc)}</p>
                </div>

                <span class="dashboard-card-arrow">→</span>
              </button>
            `
          ).join('')}
        </div>
      `,
      toDashboard
    );

    document.querySelectorAll('[data-tool]').forEach((card) => {
      card.addEventListener('click', () => openTool(card.dataset.tool));
    });

    document.onkeydown = (event) => {
      if (event.key === 'Escape') exit();
    };
  }

  function openTool(id) {
    const tool = TOOLS.find((t) => t.id === id);
    if (!tool) return;

    if (id === 'chat') showChat();
    else showForm(tool);
  }

  /* ---------------------------------------------------------
     FORM PENGATURAN
     --------------------------------------------------------- */

  function showForm(tool) {
    const raw = saved[tool.id] || {};

    shell(
      `
        <section class="ai-view">
          <header class="ai-heading">
            <span class="ai-eyebrow">${e(tool.label)}</span>
            <h1>${e(tool.title)}</h1>
            <p>${e(tool.desc)}</p>
          </header>

          <div class="ai-form">
            ${tool.fields.map((f) => fieldHtml(f, raw)).join('')}
            <p class="ai-error" id="aiFormError" role="alert" hidden></p>
            <button class="ai-primary ai-generate" id="aiGenerate" type="button">✦ Generate</button>
          </div>
        </section>
      `,
      toHub
    );

    const topicSelect = document.querySelector('#aiF_topic');
    const topicCustom = document.querySelector('#aiF_topic_custom');

    topicSelect?.addEventListener('change', () => {
      topicCustom.hidden = topicSelect.value !== '__custom';
      if (!topicCustom.hidden) topicCustom.focus();
    });

    const errorBox = document.querySelector('#aiFormError');

    const submit = () => {
      const formRaw = readRaw(tool);
      const message = validateForm(tool, formRaw, resolveValues(tool, formRaw));

      if (message) {
        errorBox.hidden = false;
        errorBox.textContent = message;
        return;
      }

      runTool(tool, formRaw);
    };

    document.querySelector('#aiGenerate').addEventListener('click', submit);

    document.querySelectorAll('.ai-input').forEach((input) => {
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit();
        }
      });
    });

    document.onkeydown = (event) => {
      if (event.key === 'Escape') showHub();
    };
  }

  /* ---------------------------------------------------------
     PROSES GENERATE
     --------------------------------------------------------- */

  async function runTool(tool, raw) {
    saved[tool.id] = raw;

    showLoading(tool);

    controller = new AbortController();
    const { signal } = controller;

    try {
      const data = await tool.run(resolveValues(tool, raw), signal);
      if (signal.aborted) return;

      showResult(tool, data, raw);
    } catch (error) {
      if (error?.name === 'AbortError' || signal.aborted) return;

      showError(tool, raw, error?.message || 'Terjadi kesalahan. Coba lagi.');
    }
  }

  function showLoading(tool) {
    shell(
      `
        <section class="ai-view ai-loading">
          <div class="ai-spinner" aria-hidden="true"></div>
          <h2>Gemini sedang menyusun ${e(tool.loading)}…</h2>
          <p>Biasanya butuh beberapa detik.</p>
          <button class="ai-ghost" id="aiCancel" type="button">Batal</button>
        </section>
      `,
      toHub
    );

    document.querySelector('#aiCancel').addEventListener('click', () => showForm(tool));

    document.onkeydown = (event) => {
      if (event.key === 'Escape') showForm(tool);
    };
  }

  function showError(tool, raw, message) {
    shell(
      `
        <section class="ai-view ai-loading">
          <div class="ai-error-icon" aria-hidden="true">!</div>
          <h2>Belum berhasil</h2>
          <p>${e(message)}</p>

          <div class="ai-deck-actions">
            <button class="ai-ghost" id="aiEdit" type="button">Ubah pengaturan</button>
            <button class="ai-primary" id="aiRetry" type="button">Coba lagi</button>
          </div>
        </section>
      `,
      toHub
    );

    document.querySelector('#aiEdit').addEventListener('click', () => showForm(tool));
    document.querySelector('#aiRetry').addEventListener('click', () => runTool(tool, raw));

    document.onkeydown = (event) => {
      if (event.key === 'Escape') showForm(tool);
    };
  }

  function showResult(tool, data, raw) {
    shell(
      `
        <section class="ai-view">
          <header class="ai-heading">
            <span class="ai-eyebrow">${e(tool.label)}</span>
            <h1>${e(tool.title)}</h1>
            <p id="aiSub"></p>
          </header>

          <div id="aiHost"></div>

          <div class="ai-result-actions">
            <button class="ai-ghost" id="aiEdit" type="button">Ubah pengaturan</button>
            <button class="ai-ghost" id="aiRegen" type="button">Generate ulang</button>
          </div>
        </section>
      `,
      toHub
    );

    const ctx = { keys: { handler: null }, notice: showNotice };
    const sub = tool.render(document.querySelector('#aiHost'), data, ctx);

    document.querySelector('#aiSub').textContent = sub || '';

    document.querySelector('#aiEdit').addEventListener('click', () => showForm(tool));
    document.querySelector('#aiRegen').addEventListener('click', () => runTool(tool, raw));

    document.onkeydown = (event) => {
      if (event.key === 'Escape') {
        showForm(tool);
        return;
      }

      ctx.keys.handler?.(event);
    };
  }

  /* ---------------------------------------------------------
     CHAT
     --------------------------------------------------------- */

  const WELCOME =
    'Om Swastyastu 🙏 Aku Dharma AI. Tanyakan apa saja seputar Sad Darsana: Nyaya, Vaiseshika, Samkhya, Yoga, Mimamsa, dan Vedanta.';

  const SUGGESTIONS = [
    'Apa bedanya Samkhya dan Yoga?',
    'Jelaskan Nyaya dengan contoh sehari-hari',
    'Apa itu Atman dan Brahman?',
    'Bagaimana Mimamsa memandang Weda?'
  ];

  function bubble(role, text, isError) {
    if (role === 'user') {
      return `<div class="ai-msg ai-msg-user"><div class="ai-bubble">${e(text)}</div></div>`;
    }

    return `
      <div class="ai-msg ai-msg-ai">
        <span class="ai-avatar" aria-hidden="true">ॐ</span>
        <div class="ai-bubble ai-md ${isError ? 'is-error' : ''}">
          ${mdToHtml(text)}
          ${isError ? '<button class="ai-linkbtn" data-retry type="button">Kirim ulang</button>' : ''}
        </div>
      </div>
    `;
  }

  function showChat() {
    let busy = false;

    shell(
      `
        <section class="ai-view ai-chat">
          <header class="ai-chat-head">
            <div>
              <span class="ai-eyebrow">TALK TO CHATAI</span>
              <h1>Dharma AI</h1>
            </div>
            <button class="ai-ghost" id="aiChatReset" type="button">Percakapan baru</button>
          </header>

          <div class="ai-chat-log" id="aiLog" aria-live="polite"></div>
          <div class="ai-suggest" id="aiSuggest"></div>

          <div class="ai-chat-bar">
            <textarea
              class="ai-chat-input"
              id="aiChatInput"
              rows="1"
              maxlength="1500"
              placeholder="Tulis pertanyaanmu..."
            ></textarea>
            <button class="ai-primary ai-chat-send" id="aiChatSend" type="button" aria-label="Kirim">➤</button>
          </div>

          <p class="ai-chat-foot">Jawaban AI bisa keliru. Cocokkan dengan materi dan gurumu.</p>
        </section>
      `,
      toHub
    );

    const log = document.querySelector('#aiLog');
    const suggest = document.querySelector('#aiSuggest');
    const input = document.querySelector('#aiChatInput');
    const sendButton = document.querySelector('#aiChatSend');

    function draw() {
      log.innerHTML =
        bubble('model', WELCOME, false) +
        chatHistory.map((m) => bubble(m.role, m.text, m.error)).join('') +
        (busy
          ? '<div class="ai-msg ai-msg-ai"><span class="ai-avatar" aria-hidden="true">ॐ</span><div class="ai-bubble ai-typing"><i></i><i></i><i></i></div></div>'
          : '');

      log.scrollTop = log.scrollHeight;

      suggest.hidden = chatHistory.length > 0;
      sendButton.disabled = busy;
    }

    async function send(text) {
      const message = text.trim();
      if (!message || busy) return;

      busy = true;
      chatHistory.push({ role: 'user', text: message });
      input.value = '';
      autosize();
      draw();

      controller = new AbortController();
      const { signal } = controller;

      try {
        const reply = await generate({
          system: CHAT_SYSTEM,
          signal,
          temperature: 0.7,
          messages: chatHistory
            .filter((m) => !m.error)
            .slice(-20)
            .map(({ role, text: t }) => ({ role, text: t }))
        });

        chatHistory.push({ role: 'model', text: reply });
      } catch (error) {
        if (error?.name === 'AbortError') return;
        chatHistory.push({ role: 'model', text: error?.message || 'Terjadi kesalahan.', error: true });
      } finally {
        busy = false;
        if (document.body.contains(log)) {
          draw();
          input.focus({ preventScroll: true });
        }
      }
    }

    function autosize() {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    }

    suggest.innerHTML = SUGGESTIONS.map(
      (s) => `<button class="ai-chip" type="button">${e(s)}</button>`
    ).join('');

    suggest.querySelectorAll('.ai-chip').forEach((chip) => {
      chip.addEventListener('click', () => send(chip.textContent));
    });

    log.addEventListener('click', (event) => {
      if (!event.target.closest('[data-retry]') || busy) return;

      /* buang pesan error + pertanyaan terakhir, lalu kirim ulang */
      chatHistory.pop();
      const last = chatHistory.pop();
      if (last) send(last.text);
    });

    document.querySelector('#aiChatReset').addEventListener('click', () => {
      cancel();
      busy = false;
      chatHistory = [];
      draw();
    });

    sendButton.addEventListener('click', () => send(input.value));
    input.addEventListener('input', autosize);

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        send(input.value);
      }
    });

    document.onkeydown = (event) => {
      if (event.key === 'Escape') showHub();
    };

    draw();
    input.focus({ preventScroll: true });
  }

  showHub();
}