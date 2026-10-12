/* VERSI 6 — fix modal (halaman belakang tidak geser, tanpa blur berat), kartu riwayat = langsung main */
import { getApp } from '../main.js';
import { renderKuis, TOPICS, MATERI_BANK } from './kuis.js';
import { ic, icons } from './icons.js';
import { renderProfile } from './profile.js';
import {
  recordChatOpened,
  recordChatMessage,
  recordChatTried,
  recordStudioOpened,
  recordStudioCreated,
  recordStudioCompleted
} from './achievements.js';

/* =========================================================
   PENGATURAN
   Kunci API JANGAN ditaruh di frontend. Isi VITE_AI_ENDPOINT
   dengan alamat backend kecil milikmu.

   Kontrak backend:
     POST { system, messages, max_tokens }  ->  { reply: "teks" }

   Chat tanpa endpoint = MODE OFFLINE (jawaban dari Materi.txt).
   Studio WAJIB punya endpoint, karena soal dibuat AI.
   ========================================================= */

const AI_ENDPOINT = import.meta.env?.VITE_AI_ENDPOINT || '';
const MAX_HISTORY = 12;
const GEN_TIMEOUT = 240000;

const HISTORY_KEY = 'dharmalearn:studio-history';
const HISTORY_LIMIT = 30;

const SUGGESTIONS = [
  { icon: 'book', label: 'Ringkas 8 poin utama Sad Darsana', prompt: 'Ringkas seluruh materi Sad Darsana dari 8 poin utamanya dengan bahasa yang mudah diingat.' },
  { icon: 'compare', label: 'Bandingkan Samkhya dan Vedanta', prompt: 'Jelaskan perbedaan Samkhya dan Vedanta dalam tabel singkat.' },
  { icon: 'activity', label: 'Contoh Yoga dalam keseharian pelajar', prompt: 'Berikan contoh penerapan ajaran Yoga dalam kehidupan sehari-hari seorang pelajar.' },
  { icon: 'bulb', label: 'Trik menghafal enam Darsana', prompt: 'Bantu aku menghafal enam Darsana dan inti ajarannya dengan singkatan atau jembatan keledai.' },
  { icon: 'help', label: 'Tes pemahamanku tentang Nyaya', prompt: 'Ajukan 3 pertanyaan singkat tentang Nyaya satu per satu, lalu koreksi jawabanku.' },
  { icon: 'sun', label: 'Atman dan Brahman dengan analogi', prompt: 'Jelaskan hubungan Atman dan Brahman menurut Vedanta dengan analogi sederhana.' }
];

const TOOLS = [
  { type: 'pilgan',   icon: 'zap',      title: 'Pilihan Ganda',    desc: 'Soal A sampai D yang dibuat baru oleh AI dari materi.', unit: 'soal',     def: 10, min: 3, max: 20 },
  { type: 'ketik',    icon: 'keyboard', title: 'Kuis Ketik',       desc: 'Soal isian singkat. Kamu mengetik jawabannya.', unit: 'soal',     def: 10, min: 3, max: 20 },
  { type: 'bs',       icon: 'compare',  title: 'Benar atau Salah', desc: 'Pernyataan yang harus kamu nilai benar atau salah.', unit: 'soal',     def: 10, min: 3, max: 20 },
  { type: 'lengkapi', icon: 'bulb',     title: 'Lengkapi Kalimat', desc: 'Kalimat dengan bagian kosong yang harus kamu isi.', unit: 'soal',     def: 10, min: 3, max: 20 },
  { type: 'flash',    icon: 'cards',    title: 'Flashcards',       desc: 'Kartu depan-belakang baru dari AI untuk dihafalkan.', unit: 'kartu',    def: 10, min: 3, max: 30 },
  { type: 'jodoh',    icon: 'duo',      title: 'Jodohkan',         desc: 'Pasangkan istilah dengan penjelasannya.', unit: 'pasangan', def: 8,  min: 4, max: 16 },
  { type: 'cocok',    icon: 'search',   title: 'Cocokkan Kartu',   desc: 'Buka dua kartu, temukan pasangan yang cocok (gaya memory game).', unit: 'pasang',   def: 6,  min: 4, max: 10 },
  { type: 'tts',      icon: 'grid',     title: 'Teka-Teki Silang', desc: 'AI membuat petunjuk dan kata, lalu disusun jadi kotak TTS.', unit: 'kata',     def: 8,  min: 4, max: 12 }
];

/* mark: nama ikon (string) ATAU jumlah titik terisi (1-3) */
const LEVELS = [
  { id: 'campuran', name: 'Campuran', mark: 'sparkles', note: 'Semua tingkat bercampur. Paling seimbang.' },
  { id: 'mudah', name: 'Mudah', mark: 1, note: 'Soal dan jawaban singkat, pilihan mudah dibedakan.' },
  { id: 'sedang', name: 'Sedang', mark: 2, note: 'Jawaban lebih panjang dan mulai ada pilihan yang mirip.' },
  { id: 'sulit', name: 'Sulit', mark: 3, note: 'Jawaban panjang dan pilihan yang mirip. Petunjuk dimatikan di Kuis Ketik.' }
];

const TOPIC_ICON = {
  pengertian: 'eye',
  sad: 'layers',
  nyaya: 'search',
  vaiseshika: 'globe',
  samkhya: 'duo',
  yoga: 'activity',
  mimamsa: 'book',
  vedanta: 'sun'
};

const toolOf = type => TOOLS.find(t => t.type === type) || TOOLS[0];

/* Jumlah yang ditampilkan: TTS menyimpan item cadangan, jadi pakai jumlah yang diminta */
const countOf = h =>
  h.type === 'tts' || !h.items?.length ? h.count : h.items.length;

const isPlayable = h => (h.status || 'ready') === 'ready' && Boolean(h.items?.length);

const SORT_KEY = 'dharmalearn:studio-sort';
let histSort = (() => {
  try { return localStorage.getItem(SORT_KEY) || 'created'; } catch { return 'created'; }
})();

const nameOf = h => h.name || toolOf(h.type).title;

const SORTS = {
  played: (a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || b.createdAt - a.createdAt,
  created: (a, b) => b.createdAt - a.createdAt,
  name: (a, b) =>
    nameOf(a).localeCompare(nameOf(b), 'id', { sensitivity: 'base', numeric: true }) ||
    b.createdAt - a.createdAt
};

function sortHistory(list, key) {
  return [...list].sort(
    (a, b) =>
      (b.status === 'generating') - (a.status === 'generating') ||
      (SORTS[key] || SORTS.created)(a, b)
  );
}
const SEND_ICON =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 3 9-3 9 19-9Z"/><path d="M6 12h16"/></svg>';

const PENCIL =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

/* kilatan primary (kiri ke kanan) + percik debu halus untuk kartu "sedang menyusun".
   Posisi tetap (deterministik); delay negatif supaya debu sudah beterbangan sejak awal. */
function magicHtml() {
  let dots = '';

  for (let k = 0; k < 18; k += 1) {
    const y = 6 + ((k * 41) % 88);
    const delay = ((k * 0.37) % 3.6).toFixed(2);
    const dur = (2.6 + ((k * 0.29) % 2)).toFixed(2);
    const size = k % 4 === 0 ? 1.5 : 1;

    dots += `<i style="--y:${y}%;--dl:-${delay}s;--du:${dur}s;--s:${size}px"></i>`;
  }

  return `<span class="tl-gen-fx" aria-hidden="true"><span class="tl-gen-flash"></span>${dots}</span>`;
}

function levelMark(level) {
  if (typeof level.mark === 'string') return ic(level.mark, 14);

  return `<span class="tl-dots" aria-hidden="true">${[1, 2, 3]
    .map(n => `<span class="tl-dot ${n <= level.mark ? 'is-on' : ''}"></span>`)
    .join('')}</span>`;
}

/* Riwayat obrolan disimpan di level modul: tidak hilang saat pindah tab / ke kuis lalu kembali */
let chat = [];
let chatBusy = false;
let refreshChat = null;

/* =========================================================
   CEK KONEKSI AI
   checking | on | limit | off
   Ping memakai { mode: 'ping' } yang dijawab backend tanpa memanggil Gemini,
   jadi tidak memakai kuota. State juga ikut berubah dari hasil request asli
   (lihat callModel).
   ========================================================= */

const PING_TIMEOUT = 6000;
const PING_EVERY = 60000;
const LIMIT_HOLD = 5 * 60000; /* status "Kuota habis" bertahan 5 menit */

const STATUS_LABEL = {
  checking: 'Memeriksa…',
  on: 'Terhubung',
  limit: 'Kuota habis',
  off: AI_ENDPOINT ? 'Tidak terhubung' : 'Mode offline'
};

let aiState = AI_ENDPOINT ? 'checking' : 'off';
let limitAt = 0;
const stateListeners = new Set();

function setAiState(next) {
  if (aiState === next) return;
  aiState = next;
  stateListeners.forEach(fn => fn(next));
}

function markLimit() {
  limitAt = Date.now();
  setAiState('limit');
}

async function pingAI() {
  if (!AI_ENDPOINT) {
    setAiState('off');
    return false;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT);

  try {
    const res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'ping' }),
      signal: ctrl.signal
    });

    const data = res.ok ? await res.json().catch(() => null) : null;
    const up = Boolean(data?.ok) && data.ready !== false;

    if (!up) setAiState('off');
    else if (aiState !== 'limit' || Date.now() - limitAt > LIMIT_HOLD) setAiState('on');

    return up;
  } catch {
    setAiState('off');
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/* Menjaga satu elemen status: melukis state, cek berkala, dan ikut event internet.
   Berhenti sendiri kalau elemennya sudah dibuang (pindah tab / halaman). */
function watchStatus(el) {
  if (!el) return;

  const text = el.querySelector('span');

  const paint = s => {
    el.className = `tl-status is-${s}`;
    text.textContent = STATUS_LABEL[s];
  };

  let timer = null;

  const stop = () => {
    stateListeners.delete(onState);
    window.removeEventListener('online', onNet);
    window.removeEventListener('offline', onNet);
    clearInterval(timer);
  };

  function onState(s) {
    if (!el.isConnected) return stop();
    paint(s);
  }

  function onNet() {
    if (!el.isConnected) return stop();
    if (navigator.onLine) pingAI();
    else setAiState('off');
  }

  stateListeners.add(onState);
  window.addEventListener('online', onNet);
  window.addEventListener('offline', onNet);

  timer = setInterval(() => {
    if (!el.isConnected) return stop();
    if (document.visibilityState === 'visible') pingAI();
  }, PING_EVERY);

  paint(aiState);

  if (AI_ENDPOINT) {
    if (navigator.onLine === false) setAiState('off');
    else pingAI();
  }
}

/* Proses pembuatan soal berjalan di latar belakang (level modul),
   jadi tetap lanjut walau modal ditutup atau pindah tab. */
const jobs = new Map(); // id -> AbortController
let refreshStudio = null;

const TOPIC_KEYS = {
  pengertian: /darsana|darshana|filsafat (hindu|india)|pengertian darsana/,
  sad: /sad ?darsana|astika|nastika|enam (darsana|aliran|sistem)/,
  nyaya: /nyaya|gotama|pramana|logika/,
  vaiseshika: /vai[sś]e[sś]ika|kanada|padartha|paramanu/,
  samkhya: /sa?nkhya|kapila|purusa|prakrti|prakerti|triguna|sattwa|rajas|tamas/,
  yoga: /\byoga\b|patanjali|astangga|ashtanga|pranayama|dhyana|samadhi/,
  mimamsa: /mimamsa|jaimini|yadnya|karma ?kanda/,
  vedanta: /vedanta|atman|brahman|badarayana|moksa|moksha|advaita/
};

const BROAD_RE = /(ringkas|rangkum)\w*.*(darsana|materi|filsafat)|seluruh materi|semua materi|8 poin|delapan poin|enam darsana/;

/* pertanyaan lanjutan baru ikut topik sebelumnya kalau memang terdengar seperti lanjutan */
const FOLLOW_RE = /lebih|detail|lanjut|contoh|maksud|kenapa|mengapa|beda|bedanya|jelaskan|tadi|tersebut|itu\b/;

function topicsFor(history) {
  const users = history.filter(m => m.role === 'user');
  const last = norm(users[users.length - 1]?.content);
  const prev = norm(users[users.length - 2]?.content);

  if (BROAD_RE.test(last)) return TOPICS;

  const hit = text => TOPICS.filter(t => TOPIC_KEYS[t.id]?.test(text));

  let found = hit(last);
  /* pertanyaan lanjutan pendek ("jelaskan lebih detail") ikut topik sebelumnya */
  if (!found.length && last.split(/\s+/).length <= 6 && FOLLOW_RE.test(last)) found = hit(prev);

  return found.slice(0, 3);
}

async function askAI(history) {
  const msgs = history.map(({ role, content }) => ({ role, content }));
  while (msgs[0]?.role === 'assistant') msgs.shift();

  if (!AI_ENDPOINT) {
    await wait(450 + Math.random() * 350);
    return offlineReply(msgs[msgs.length - 1].content);
  }

  /* Materi HANYA dikirim kalau pertanyaannya memang soal Sad Darsana.
     Obrolan biasa = materi kosong = prompt kecil, jawaban cepat, hemat token. */
  const materi = topicsFor(msgs)
    .map(t => `## ${t.name}\n${(MATERI_BANK[t.category] || []).join('\n')}`)
    .join('\n\n');

  return callModel({ messages: msgs, maxTokens: 1000, materi });
}

/* =========================================================
   HELPERS
   ========================================================= */

function esc(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* Markdown mini: heading, **tebal**, `kode`, daftar, tabel */
function md(src) {
  const inline = s =>
    s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`(.+?)`/g, '<code>$1</code>');

  const lines = esc(src).split('\n');
  let html = '';
  let list = '';
  let table = [];

  const closeList = () => {
    if (list) {
      html += `</${list}>`;
      list = '';
    }
  };

  const closeTable = () => {
    if (!table.length) return;

    const rows = table
      .filter(r => !/^[\s|:-]+$/.test(r))
      .map(r => r.replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim())));

    table = [];
    if (!rows.length) return;

    const [head, ...body] = rows;

    html += `<div class="tl-table"><table>
      <thead><tr>${head.map(c => `<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (line.startsWith('|')) {
      closeList();
      table.push(line);
      continue;
    }

    closeTable();

    if (!line) {
      closeList();
      continue;
    }

    let m;

    if ((m = line.match(/^#{1,4}\s+(.+)$/))) {
      closeList();
      html += `<h4>${inline(m[1])}</h4>`;
    } else if ((m = line.match(/^[-*•]\s+(.+)$/))) {
      if (list !== 'ul') {
        closeList();
        html += '<ul>';
        list = 'ul';
      }
      html += `<li>${inline(m[1])}</li>`;
    } else if ((m = line.match(/^\d+[.)]\s+(.+)$/))) {
      if (list !== 'ol') {
        closeList();
        html += '<ol>';
        list = 'ol';
      }
      html += `<li>${inline(m[1])}</li>`;
    } else {
      closeList();
      html += `<p>${inline(line)}</p>`;
    }
  }

  closeList();
  closeTable();

  return html;
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const clip = (s, n = 220) => (s.length > n ? `${s.slice(0, n).trim()}…` : s);

const STOP = new Set([
  'yang', 'dan', 'atau', 'apa', 'itu', 'adalah', 'dari', 'dengan', 'untuk', 'pada',
  'bagaimana', 'jelaskan', 'tolong', 'buat', 'berikan', 'contoh', 'dalam', 'secara'
]);

function formatDate(ts) {
  try {
    return new Date(ts).toLocaleString('id-ID', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

/* =========================================================
   RIWAYAT STUDIO (localStorage)
   Tiap entri menyimpan SET SOAL LENGKAP, jadi bisa dimainkan ulang.
   status: 'generating' | 'ready' | 'error' (entri lama tanpa status = ready)
   ========================================================= */

function loadHistory() {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY));
    if (!Array.isArray(raw)) return [];

    /* 'generating' tanpa proses aktif (mis. halaman di-refresh) dianggap gagal */
    return raw.map(h =>
      h.status === 'generating' && !jobs.has(h.id) ? { ...h, status: 'error', reason: 'fail' } : h
    );
  } catch {
    return [];
  }
}

function saveHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_LIMIT)));
  } catch {
    /* abaikan jika storage tidak tersedia */
  }
}

const addHistory = entry => saveHistory([entry, ...loadHistory()]);
const patchHistory = (id, fn) => saveHistory(loadHistory().map(h => (h.id === id ? fn(h) : h)));
const removeHistory = id => saveHistory(loadHistory().filter(h => h.id !== id));

/* Soal-soal terbaru bertipe sama: dikirim ke AI supaya tidak mengulang */
function recentTexts(type, topics) {
  return loadHistory()
    .filter(h => h.type === type)
    .slice(0, 5)
.flatMap(h => (h.items || []).filter(i => topics.includes(i.category)).map(i => i.text))
    .slice(0, 40);
}

/* =========================================================
   AI
   ========================================================= */

/* Pembungkus: hasil request asli ikut memperbarui lampu status */
async function callModel(opts) {
  try {
    const reply = await rawCall(opts);
    setAiState('on');
    return reply;
  } catch (err) {
    if (err?.code === 'limit') markLimit();
    else if (err instanceof TypeError) setAiState('off'); /* fetch gagal: internet putus / server mati */
    throw err;
  }
}

async function rawCall({ system = '', messages, maxTokens = 1200, signal, mode = 'chat', materi = '' }) {
  const res = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages, max_tokens: maxTokens, mode, materi }),
    signal
  });

  if (!res.ok) {
    let body = null;
    try { body = await res.json(); } catch { /* abaikan */ }

    const err = new Error(typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`);
    err.code = body?.error;
    err.reply = body?.reply || '';
    throw err;
  }

  const data = await res.json();
  if (!data.reply) throw new Error('Balasan kosong');

  return data.reply;
}

/* ---------- chat ---------- */

function offlineReply(
  question,
  noteText = '\n\nCatatan: AI belum terhubung, jawaban ini diambil langsung dari materi.'
) {
  const q = norm(question);
  const sections = TOPICS
    .map(t => ({ topic: t, lines: MATERI_BANK[t.category] || [] }))
    .filter(s => s.lines.length);

  const note = noteText;

  if (/ringkas|rangkum|seluruh|lengkap|semua materi/.test(q)) {
    const body = sections
      .map(s => `**${s.topic.name}**\n${s.lines.slice(0, 3).map(l => `- ${clip(l)}`).join('\n')}`)
      .join('\n\n');

    return `Ini ringkasan 8 poin utama materi:\n\n${body}${note}`;
  }

  const words = q.split(/[^a-z0-9]+/).filter(w => w.length > 3 && !STOP.has(w));

  const best = sections
    .map(s => {
      const hay = norm(s.lines.join(' '));
      let score = q.includes(norm(s.topic.name)) ? 6 : 0;
      words.forEach(w => { if (hay.includes(w)) score += 1; });
      return { ...s, score };
    })
    .sort((a, b) => b.score - a.score)[0];

  if (!best || best.score === 0) {
    return 'Aku belum menemukan bagian materi yang cocok dengan pertanyaan itu. Coba sebut nama topiknya, misalnya Nyaya, Yoga, atau Vedanta.';
  }

  return `**${best.topic.name}**\n${best.lines.slice(0, 6).map(l => `- ${clip(l)}`).join('\n')}${note}`;
}

/* ---------- generator soal (Studio) ---------- */

const LV = ['mudah', 'sedang', 'sulit'];
const BATCH_MAX = 8;   // item per permintaan ke AI (kecil = tidak terpotong)
const MAX_ROUNDS = 6;  // maksimal putaran "isi kekurangan"
const SHORT_MSG = 'Hasil AI kurang lengkap';

const wc = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const lettersOf = s => String(s || '').replace(/\s+/g, '').length;

/* Panduan tingkat: dikirim ke AI DAN dipakai memvalidasi hasilnya */
const LEVEL_GUIDE = {
  pilgan: {
    mudah: 'pertanyaan langsung tentang definisi/istilah/tokoh; jawaban benar 1-4 kata; tiga pilihan salah JELAS berbeda dan mudah disingkirkan.',
    sedang: 'pertanyaan menuntut paham konsep, bukan sekadar nama; jawaban benar 2-8 kata; minimal dua pilihan salah mirip dengan jawaban benar.',
    sulit: 'pertanyaan menuntut penalaran (membedakan dua konsep, sebab-akibat, atau penerapan pada kasus); jawaban benar minimal 4 kata; ketiga pilihan salah sangat mirip dan menjebak.'
  },
  ketik: {
    mudah: 'pertanyaan langsung; jawaban 1-3 kata berupa istilah kunci.',
    sedang: 'pertanyaan butuh pemahaman; jawaban 2-5 kata.',
    sulit: 'pertanyaan butuh penalaran; jawaban 3-8 kata berupa frasa padat yang tidak bisa ditebak dari pertanyaan.'
  },
  flash: {
    mudah: 'depan: satu istilah atau nama; belakang: definisi singkat 1 kalimat.',
    sedang: 'depan: pertanyaan konsep; belakang: penjelasan 1-2 kalimat.',
    sulit: 'depan: pertanyaan perbandingan/penalaran/penerapan; belakang: penjelasan 2 kalimat yang menyebut alasannya.'
  },
  tts: {
    mudah: 'jawaban 3-8 huruf, istilah umum yang sering muncul di materi; petunjuk jelas.',
    sedang: 'jawaban 5-11 huruf; petunjuk berupa definisi, tidak langsung.',
    sulit: 'jawaban 8-14 huruf, istilah yang lebih jarang; petunjuk berupa deskripsi tidak langsung.'
  },
  bs: {
    mudah: 'pernyataan pendek (maks 15 kata) tentang fakta dasar; benar/salahnya jelas.',
    sedang: 'pernyataan 10-25 kata; yang salah hanya berbeda satu detail penting.',
    sulit: 'pernyataan panjang (min 14 kata) yang menggabungkan dua konsep; yang salah terdengar masuk akal.'
  },
  lengkapi: {
    mudah: 'kalimat definisi langsung; bagian kosong 1-3 kata berupa istilah kunci.',
    sedang: 'kalimat yang butuh pemahaman konsep; bagian kosong 2-5 kata.',
    sulit: 'kalimat sebab-akibat/perbandingan; bagian kosong 3-8 kata yang tidak bisa ditebak dari kalimatnya.'
  },
  jodoh: {
    mudah: 'kiri: istilah/nama; kanan: definisi sangat singkat (maks 6 kata).',
    sedang: 'kiri: tokoh/aliran/konsep; kanan: ajaran atau ciri utamanya (3-10 kata).',
    sulit: 'kiri: konsep; kanan: perbedaan/penerapan yang mirip satu sama lain (min 5 kata).'
  },
  cocok: {
    mudah: 'kedua sisi sangat pendek (maks 3 kata), pasangan jelas.',
    sedang: 'kedua sisi maks 5 kata.',
    sulit: 'kedua sisi maks 7 kata, pasangan mirip satu sama lain.'
  },
};

/* Validasi objektif di sisi kode (tidak bergantung pada kejujuran AI) */
const FIT = {
    bs: (lv, it) => {
    const n = wc(it.text);
    return lv === 'mudah' ? n <= 15 : lv === 'sedang' ? n >= 10 && n <= 25 : n >= 14;
  },
  lengkapi: (lv, it) => FIT.ketik(lv, it),
  jodoh: (lv, it) => {
    const n = wc(it.answer);
    return lv === 'mudah' ? n <= 6 : lv === 'sedang' ? n >= 3 && n <= 10 : n >= 5;
  },
  cocok: (lv, it) => {
    const n = Math.max(wc(it.text), wc(it.answer));
    return lv === 'mudah' ? n <= 3 : lv === 'sedang' ? n <= 5 : n <= 7;
  },
  pilgan: (lv, it) => {
    const n = wc(it.options[it.answer]);
    return lv === 'mudah' ? n <= 4 : lv === 'sedang' ? n >= 2 && n <= 8 : n >= 4;
  },
  ketik: (lv, it) => {
    const n = wc(it.answer);
    return lv === 'mudah' ? n <= 3 : lv === 'sedang' ? n >= 2 && n <= 5 : n >= 3 && n <= 8;
  },
  flash: () => true,
  tts: (lv, it) => {
    const n = lettersOf(it.answer);
    return lv === 'mudah' ? n <= 8 : lv === 'sedang' ? n >= 5 && n <= 11 : n >= 8;
  }
};

const SCHEMA = {
    bs:
    '[{"category":"<nama topik persis>","level":"mudah|sedang|sulit","statement":"...","answer":true,"explain":"<1 kalimat alasan>"}]\n' +
    'Aturan: answer bernilai boolean true atau false; kira-kira SEPARUH true dan SEPARUH false, urutannya diacak; pernyataan salah harus salah karena satu fakta diubah halus, bukan konyol.',
  lengkapi:
    '[{"category":"<nama topik persis>","level":"mudah|sedang|sulit","sentence":"kalimat dengan satu bagian kosong ditulis ___","answer":"isi bagian kosong"}]\n' +
    'Aturan: tepat SATU tanda ___ per kalimat; jawabannya pasti dan tidak ambigu.',
  jodoh:
    '[{"category":"<nama topik persis>","level":"mudah|sedang|sulit","left":"...","right":"..."}]\n' +
    'Aturan: setiap "right" harus UNIK dan hanya cocok dengan satu "left".',
  cocok:
    '[{"category":"<nama topik persis>","level":"mudah|sedang|sulit","left":"...","right":"..."}]\n' +
    'Aturan: kedua sisi singkat; setiap "right" harus UNIK dan hanya cocok dengan satu "left".',
  pilgan:
    '[{"category":"<nama topik persis>","level":"mudah|sedang|sulit","question":"...","options":["...","...","...","..."],"answer":<indeks 0-3 jawaban benar>}]\n' +
    'Aturan: tepat 4 pilihan yang berbeda; posisi jawaban benar bervariasi (jangan selalu 0); pilihan salah masuk akal dan berasal dari konsep di materi.',
  ketik:
    '[{"category":"<nama topik persis>","level":"mudah|sedang|sulit","question":"...","answer":"..."}]\n' +
    'Aturan: pertanyaan punya SATU jawaban pasti dan tidak ambigu.',
  flash:
    '[{"category":"<nama topik persis>","level":"mudah|sedang|sulit","front":"...","back":"..."}]',
  tts:
    '[{"category":"<nama topik persis>","level":"mudah|sedang|sulit","clue":"<petunjuk berupa kalimat>","answer":"<jawaban>"}]\n' +
    'Aturan: jawaban 1 kata (maksimal 2 kata), hanya huruf latin tanpa angka, 3-14 huruf total, istilah dari materi; petunjuk tidak boleh menyebut jawabannya.'
};

/* kuota per tingkat: Campuran dibagi rata */
function quotaFor(cfg, total) {
  if (cfg.level !== 'campuran') return { [cfg.level]: total };

  const base = Math.floor(total / 3);
  const extra = total % 3;

  return {
    mudah: base + (extra > 0 ? 1 : 0),
    sedang: base + (extra > 1 ? 1 : 0),
    sulit: base
  };
}

/* rencana satu putaran: berapa item per tingkat (round-robin, +1 cadangan) */
function planFor(st) {
  const need = {};
  Object.keys(st.quota).forEach(l => { need[l] = st.quota[l] - (st.have[l] || 0); });

  const plan = {};
  let left = BATCH_MAX;

  while (left > 0 && Object.values(need).some(n => n > 0)) {
    for (const l of Object.keys(need)) {
      if (need[l] > 0 && left > 0) {
        plan[l] = (plan[l] || 0) + 1;
        need[l] -= 1;
        left -= 1;
      }
    }
  }

  const first = Object.keys(plan)[0];
  if (first) plan[first] += 1;

  return plan;
}

function buildGenSystem(cfg, plan, st) {
const open = cfg.topics.filter(c => (st.topicHave[c] || 0) < st.topicCap);
  const use = open.length ? open : cfg.topics;

  const perTopicNote =
    cfg.topics.length > 1
      ? `Batas per topik: maksimal ${st.topicCap} item untuk seluruh set. Sisa jatah: ${use
          .map(c => `${c}=${st.topicCap - (st.topicHave[c] || 0)}`)
          .join(', ')}. Jangan membuat item untuk topik di luar daftar.`
      : '';

  const materi = use
    .map(c => `## ${c}\n${(MATERI_BANK[c] || []).join('\n')}`)
    .join('\n\n');

  const total = Object.values(plan).reduce((a, b) => a + b, 0);

  const levelLines = Object.entries(plan)
    .map(([l, n]) => `- ${n} item tingkat ${l.toUpperCase()}: ${LEVEL_GUIDE[cfg.type][l]}`)
    .join('\n');

const avoid = [...recentTexts(cfg.type, cfg.topics), ...st.items.map(i => i.text)];

  const perTopic =
    cfg.topics.length > 1 && st.items.length
      ? `Jumlah item per topik sejauh ini: ${cfg.topics
          .map(c => `${c}=${st.items.filter(i => i.category === c).length}`)
          .join(', ')}. Utamakan topik yang paling sedikit.`
      : '';

  return [
    'Kamu penyusun soal untuk pelajaran Agama Hindu, bab Sad Darsana.',
    'Gunakan HANYA MATERI di bawah sebagai sumber fakta. Jangan menambah fakta di luar materi. Bahasa Indonesia.',
    `Buat tepat ${total} item BARU, sebarkan merata di topik berikut: ${use.join(', ')}.`,
    'Nilai "category" harus SAMA PERSIS dengan salah satu nama topik tersebut.',
perTopicNote,
    `TINGKAT KESULITAN WAJIB DIPATUHI. Isi "level" setiap item dengan tingkatnya, dan buat item sesuai panduan:\n${levelLines}`,
    `Balas HANYA array JSON valid, tanpa teks lain dan tanpa blok kode, dengan bentuk:\n${SCHEMA[cfg.type]}`,
    `Kode variasi: ${Math.random().toString(36).slice(2, 8)}. Ubah sudut pandang dan susunan kalimat agar berbeda.`,
    avoid.length ? `JANGAN mengulang atau memparafrase soal-soal ini:\n${avoid.map(t => `- ${t}`).join('\n')}` : '',
    `MATERI:\n${materi}`
  ]
    .filter(Boolean)
    .join('\n\n');
}

/* Rapikan & validasi bentuk. Dedupe dan cek tingkat dilakukan di accept(). */
function normalizeItems(cfg, raw) {
const catMap = new Map(cfg.topics.map(c => [norm(c), c]));

  /* cocok persis dulu; kalau tidak, boleh cocok sebagian asal hanya SATU topik yang mungkin */
  const pickCategory = raw => {
    if (cfg.topics.length === 1) return cfg.topics[0];

    const n = norm(raw);
    if (!n) return '';
    if (catMap.has(n)) return catMap.get(n);

    const near = cfg.topics.filter(c => norm(c).includes(n) || n.includes(norm(c)));
    return near.length === 1 ? near[0] : '';
  };
  const str = v => String(v ?? '').replace(/\s+/g, ' ').trim();
  const out = [];

  for (const r of Array.isArray(raw) ? raw : []) {
    if (!r || typeof r !== 'object') continue;

const category = pickCategory(r.category);
    if (!category) continue;
    const level = LV.includes(norm(r.level)) ? norm(r.level) : '';
    let item = null;

    if (cfg.type === 'pilgan') {
      const options = Array.isArray(r.options) ? r.options.map(str) : [];
      const answer = Number(r.answer);

      if (
        str(r.question) &&
        options.length === 4 &&
        options.every(Boolean) &&
        new Set(options.map(norm)).size === 4 &&
        Number.isInteger(answer) &&
        answer >= 0 &&
        answer < 4
      ) {
        item = { category, level, text: str(r.question), options, answer, _key: norm(r.question) };
      }
    } else if (cfg.type === 'ketik') {
      if (str(r.question) && str(r.answer)) {
        item = { category, level, text: str(r.question), answer: str(r.answer), _key: norm(r.question) };
      }
    } else if (cfg.type === 'flash') {
      if (str(r.front) && str(r.back)) {
        item = { category, level, text: str(r.front), answer: str(r.back), _key: norm(r.front) };
      }
    } else if (cfg.type === 'tts') {
      const answer = str(r.answer);
      const plain = answer.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const letters = plain.replace(/\s+/g, '');

      if (
        str(r.clue) &&
        /^[A-Za-z\s]+$/.test(plain) &&
        plain.trim().split(/\s+/).length <= 2 &&
        letters.length >= 3 &&
        letters.length <= 14
      ) {
        item = { category, level, text: str(r.clue), answer, _key: letters.toLowerCase() };
      }
    } else if (cfg.type === 'bs') {
      const a = String(r.answer).toLowerCase();
      const ans = typeof r.answer === 'boolean' ? r.answer
        : /^(true|benar)$/.test(a) ? true
        : /^(false|salah)$/.test(a) ? false : null;

      if (str(r.statement) && ans !== null) {
        item = { category, level, text: str(r.statement), answer: ans, explain: str(r.explain), _key: norm(r.statement) };
      }
    } else if (cfg.type === 'lengkapi') {
      const s = str(r.sentence);
      if (s && (s.match(/_{3,}/g) || []).length === 1 && str(r.answer)) {
        item = { category, level, text: s, answer: str(r.answer), _key: norm(s) };
      }
    } else if (cfg.type === 'jodoh' || cfg.type === 'cocok') {
      if (str(r.left) && str(r.right) && norm(r.left) !== norm(r.right)) {
        item = { category, level, text: str(r.left), answer: str(r.right), _key: norm(r.left), _ans: norm(r.right) };
      }
    }
    
    if (item) out.push(item);
  }

  return out;
}

/* Masukkan hasil satu putaran ke st dengan aturan tingkat + jatah topik. Return jumlah yang masuk. */
function accept(cfg, fresh, st) {
  const mark = it => {
    st.seen.add(it._key);
    if (it._ans) st.seenAns.add(it._ans);
  };

  const mixed = cfg.level === 'campuran';
  let added = 0;

  for (const it of fresh) {
    /* topik harus salah satu yang dicentang */
    if (!it.category || !cfg.topics.includes(it.category)) continue;

    if (st.seen.has(it._key)) continue;
    if (it._ans && st.seenAns.has(it._ans)) continue;

    /* tingkat yang diizinkan untuk item ini */
    let candidates;
    if (mixed) candidates = it.level ? [it.level] : LV;
    else if (it.level && it.level !== cfg.level) continue;
    else candidates = [cfg.level];

    const fits = candidates.filter(l => FIT[cfg.type](l, it));
    if (!fits.length) continue;

    const slot = fits.find(l => (st.have[l] || 0) < (st.quota[l] || 0));
    const topicFull = (st.topicHave[it.category] || 0) >= st.topicCap;

    /* kuota tingkat atau jatah topik penuh: simpan sebagai cadangan */
    if (!slot || topicFull) {
      mark(it);
      st.spare.push({ ...it, level: slot || fits[0] });
      continue;
    }

    mark(it);
    st.have[slot] = (st.have[slot] || 0) + 1;
    st.topicHave[it.category] = (st.topicHave[it.category] || 0) + 1;
    st.items.push({ ...it, level: slot });
    added += 1;
  }

  return added;
}

function parseJson(text) {
  const s = String(text).replace(/```json|```/g, '');
  const a = s.indexOf('[');
  if (a < 0) throw new Error('JSON tidak ditemukan');

  const b = s.lastIndexOf(']');
  if (b > a) {
    try { return JSON.parse(s.slice(a, b + 1)); } catch { /* lanjut ke penyelamatan */ }
  }

  /* output terpotong: ambil sampai objek lengkap terakhir */
  const c = s.lastIndexOf('}');
  if (c > a) return JSON.parse(s.slice(a, c + 1) + ']');

  throw new Error('JSON tidak valid');
}

async function generateSet(cfg, signal, onProgress) {
  
  /* TTS: minta lebih banyak, karena tidak semua kata muat di kotak */
  const target = cfg.type === 'tts' ? Math.min(cfg.count + 6, 18) : cfg.count;
  const minOk = cfg.type === 'tts' ? 4 : cfg.count;

  
  let idle = 0;
const st = {
    items: [],
    spare: [],
    seen: new Set(),
    seenAns: new Set(),
    have: {},
    quota: quotaFor(cfg, target),
    topicHave: {},
    topicCap: Math.ceil(target / cfg.topics.length)
  };

  for (let round = 0; round < MAX_ROUNDS && st.items.length < target && idle < 2; round++) {
    const plan = planFor(st);
    const total = Object.values(plan).reduce((a, b) => a + b, 0);
    let added = 0;

    try {
      const reply = await callModel({
        system: buildGenSystem(cfg, plan, st),
        messages: [{ role: 'user', content: `Buat ${total} item sekarang.` }],
        maxTokens: Math.min(900 + total * 260, 4096),
        signal,
        mode: 'studio'
      });

      added = accept(cfg, normalizeItems(cfg, parseJson(reply)), st);
    } catch (err) {
      if (err?.name === 'AbortError' || err?.code === 'limit') throw err;
      /* putaran gagal: coba lagi, berhenti kalau 2x berturut-turut tanpa hasil */
    }

    idle = added ? 0 : idle + 1;
    onProgress?.(Math.min(st.items.length, cfg.count));
  }

  /* masih kurang? pakai cadangan (Campuran) */
while (st.items.length < target && st.spare.length) {
    const count = c => st.items.filter(i => i.category === c).length;
    let best = 0;

    st.spare.forEach((s, i) => {
      if (count(s.category) < count(st.spare[best].category)) best = i;
    });

    st.items.push(st.spare.splice(best, 1)[0]);
  }

  if (st.items.length < minOk) throw new Error(SHORT_MSG);

  const final = cfg.type === 'tts' ? st.items : st.items.slice(0, cfg.count);
return final.map(({ _key, _ans, ...rest }) => rest);
}

function startJob(cfg) {
  const id = `st-${Date.now()}`;
  const ctrl = new AbortController();
  jobs.set(id, ctrl);

  addHistory({
    id,
    createdAt: Date.now(),
    ...cfg,
    items: [],
    status: 'generating',
    progress: 0,
    plays: 0,
    lastScore: null
  });

  const timer = setTimeout(() => ctrl.abort(), GEN_TIMEOUT);

  generateSet(cfg, ctrl.signal, n => {
    /* hanya simpan progres; kartu skeleton TIDAK dirender ulang supaya animasinya tidak ke-reset */
    patchHistory(id, h => ({ ...h, progress: n }));
  })
    .then(items => {
      patchHistory(id, h => ({ ...h, items, status: 'ready', progress: items.length }));

      if (loadHistory().some(h => h.id === id)) recordStudioCreated({ type: cfg.type });
    })
    .catch(err =>
      patchHistory(id, h => ({
        ...h,
        status: 'error',
        reason:
          err?.name === 'AbortError'
            ? 'timeout'
            : err?.code === 'limit'
              ? 'limit'
              : err?.message === SHORT_MSG
                ? 'short'
                : 'fail'
      }))
    )
    .finally(() => {
      clearTimeout(timer);
      jobs.delete(id);
      refreshStudio?.();
    });

  return id;
}

/* =========================================================
   BLOK HTML
   ========================================================= */

const TYPING_HTML = `
  <div class="tl-msg is-ai is-new">
    <span class="tl-avatar">${ic('sparkles', 18)}</span>
    <div class="tl-bubble"><span class="tl-typing"><i></i><i></i><i></i></span></div>
  </div>
`;

function messageHtml(m, isNew) {
  const fresh = isNew ? ' is-new' : '';

  if (m.role === 'user') {
    return `
      <div class="tl-msg is-user${fresh}">
        <div class="tl-bubble">${esc(m.content).replace(/\n/g, '<br>')}</div>
      </div>
    `;
  }

  return `
    <div class="tl-msg is-ai${fresh}">
      <span class="tl-avatar">${ic('sparkles', 18)}</span>
      <div class="tl-bubble ${m.error ? 'is-error' : ''}">${md(m.content)}</div>
    </div>
  `;
}

const WELCOME_HTML = `
  <div class="tl-welcome">
    <span class="tl-avatar tl-avatar-lg">${ic('sparkles', 28)}</span>
    <h2>Halo! Mau belajar apa hari ini?</h2>
    <p>Tanya apa saja soal Sad Darsana, minta ringkasan, atau latihan menghafal.</p>

    <div class="tl-suggest-grid">
      ${SUGGESTIONS.slice(0, 4)
        .map(
          (s, i) => `
            <button class="tl-suggest" data-i="${i}" type="button">
              <span class="tl-suggest-icon">${ic(s.icon, 18)}</span>
              <span class="tl-suggest-label">${esc(s.label)}</span>
            </button>
          `
        )
        .join('')}
    </div>
  </div>
`;

/* =========================================================
   RENDER
   ========================================================= */

export function renderAITools({ onBack, tab: startTab = 'chat', name, anonymous } = {}) {
  const app = getApp();

  let tab = startTab;
  let modal = null;
  let tabToken = 0;

  app.innerHTML = `
    <main class="page tl-page">
      <div class="tl-glow tl-glow-a"></div>
      <div class="tl-glow tl-glow-b"></div>

      <nav class="tl-nav">
        <button class="tl-back" id="tlBack" type="button">
          ${icons.chevronLeft}<span>Kembali</span>
        </button>

        <div class="tl-nav-right">
          <button class="tl-brand" id="tlBrand" type="button">
            <span class="tl-brand-symbol">ॐ</span>
            <span>DharmaLearn</span>
          </button>

          <button class="tl-account" id="tlAccount" type="button" aria-label="Akun" title="Akun">
            ${icons.user}
          </button>
        </div>
      </nav>

      <div class="tl-scroller" id="tlScroller">
      <section class="tl-content">
        <header class="tl-heading">
          <span class="tl-eyebrow">ALAT BANTU</span>
          <h1>Alat Belajar</h1>
          <p>Ngobrol dengan asisten belajar, atau buat latihan baru dari AI di Studio.</p>
        </header>

        <div class="tl-tabs" role="tablist" aria-label="Pilih alat">
          <span class="tl-tab-ink" aria-hidden="true"></span>
          <button class="tl-tab" role="tab" data-tab="chat" type="button">${ic('chat', 16)}<span>Chat AI</span></button>
          <button class="tl-tab" role="tab" data-tab="studio" type="button">${ic('sparkles', 16)}<span>Studio</span></button>
        </div>

        <div class="tl-panel" id="tlPanel"></div>
      </section>
      </div>
    </main>
  `;

  const panel = document.querySelector('#tlPanel');
  const tabsEl = document.querySelector('.tl-tabs');
  const ink = document.querySelector('.tl-tab-ink');
  const tabButtons = [...document.querySelectorAll('.tl-tab')];

  /* ---------- umum ---------- */

  /* Modal TIDAK mengubah layout halaman (tanpa overflow:hidden di body,
     tanpa padding kompensasi), jadi halaman belakang tidak bisa bergeser.
     Scroll di belakang modal cukup diblokir lewat event wheel / touchmove. */
    /* Kunci scroll TANPA geser: lebar scrollbar yang hilang diganti padding-right */
  function modalOn() {
    const sbw = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    document.body.style.setProperty('--tl-sbw', `${sbw}px`);
    document.body.classList.add('tl-modal-open');
  }

  function modalOff() {
    document.body.classList.remove('tl-modal-open');
    document.body.style.removeProperty('--tl-sbw');
  }

  const reducedMotion = () =>
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function closeModal(animated = false) {
    const m = modal;
    modal = null;
    document.querySelector('.tl-page')?.classList.remove('is-blurred');

    if (!m) {
      modalOff();
      return;
    }

    if (animated && !reducedMotion()) {
      m.classList.remove('is-open', 'is-settled');
      m.classList.add('is-closing');

      /* scroll baru dibuka setelah modal hilang, supaya halaman tidak loncat */
      setTimeout(() => {
        m.remove();
        if (!modal) modalOff();
      }, 400);
    } else {
      m.remove();
      modalOff();
    }
  }

  function detach() {
    closeModal();
    document.onkeydown = null;
    refreshChat = null;
    refreshStudio = null;
  }

  /* Isi halaman memudar keluar (naik + blur) dulu, baru pindah halaman */
  let exiting = false;

  function leaveThen(fn) {
    if (exiting) return;

    const content = document.querySelector('.tl-content');

    if (!content || reducedMotion()) {
      fn();
      return;
    }

    exiting = true;
    content.classList.add('is-leaving');

    setTimeout(() => {
      exiting = false;

      try {
        fn();
      } catch (err) {
        /* kalau halaman tujuan gagal dibuka, jangan biarkan halaman ini membeku */
        console.error('[Tools] Gagal pindah halaman:', err);
        content.classList.remove('is-leaving');
      }
    }, 240);
  }

  function leave() {
    leaveThen(() => {
      detach();
      onBack?.();
    });
  }

  function openProfile() {
    leaveThen(() => {
      detach();
      renderProfile({
        name,
        anonymous,
        onBack: () => renderAITools({ onBack, tab, name, anonymous })
      });
    });
  }

  document.querySelector('#tlBack').addEventListener('click', leave);
  document.querySelector('#tlBrand').addEventListener('click', leave);
  document.querySelector('#tlAccount').addEventListener('click', openProfile);

  document.onkeydown = event => {
    if (event.key === 'Enter' && modal && !event.isComposing) {
      const a = document.activeElement;
      const inside = modal.contains(a);

      /* tombol/link yang sengaja difokus DI DALAM dialog (mis. Tutup) tetap jalan normal */
      if (inside && (a.tagName === 'BUTTON' || a.tagName === 'A') && a.id !== 'tlStart') return;

      event.preventDefault();
      modal.querySelector('#tlStart')?.click();
      return;
    }

    if (event.key !== 'Escape') return;

    if (modal) closeModal(true);
    else if (document.activeElement?.id === 'tlInput') document.activeElement.blur();
    else leave();
  };

  /* Chat: geser ke bawah, tapi "ALAT BANTU" tetap di atas dan kolom prompt tetap terlihat */
  function focusChat() {
    const sc = document.querySelector('#tlScroller');
    const eyebrow = document.querySelector('.tl-eyebrow');
    if (!sc || !eyebrow) return;

    requestAnimationFrame(() => {
      const top =
        eyebrow.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 14;

      sc.scrollTo({
        top: Math.max(0, top),
        behavior: reducedMotion() ? 'auto' : 'smooth'
      });
    });
  }

  /* penanda tab yang bergeser halus */
  let inkReady = false;

  function moveInk() {
    const active = tabButtons.find(b => b.dataset.tab === tab);
    if (!active || !active.offsetWidth) return;

    ink.style.width = `${active.offsetWidth}px`;
    ink.style.transform = `translateX(${active.offsetLeft}px)`;

    if (!inkReady) {
      void ink.offsetWidth;
      ink.classList.add('is-ready');
      inkReady = true;
    }
  }

  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(moveInk).observe(tabsEl);

  async function showTab(which, animate = true) {
    const token = ++tabToken;

    closeModal();
    refreshChat = null;
    refreshStudio = null;
    tab = which;

    tabButtons.forEach(b => {
      const on = b.dataset.tab === which;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    });

    moveInk();

    if (animate && panel.firstElementChild) {
      panel.classList.add('is-leaving');
      await wait(150);
      if (token !== tabToken) return;
    }

    panel.classList.remove('is-leaving', 'is-entering');
    panel.innerHTML = '';

    if (which === 'chat') mountChat();
    else mountStudio();

    void panel.offsetWidth;
    panel.classList.add('is-entering');

    if (which === 'chat') focusChat();
  }

  tabButtons.forEach(b =>
    b.addEventListener('click', () => {
      if (b.dataset.tab !== tab) showTab(b.dataset.tab);
    })
  );

  /* =======================================================
     TAB CHAT
     ======================================================= */

  function mountChat() {
    panel.innerHTML = `
      <section class="tl-chat" aria-label="Asisten belajar">
        <header class="tl-chat-head">
          <span class="tl-avatar">${ic('sparkles', 18)}</span>

          <div class="tl-chat-title">
            <b>Asisten DharmaLearn</b>
            <span class="tl-status is-checking" id="tlStatus" role="status" aria-live="polite">
              <i></i><span></span>
            </span>
          </div>

          <button class="tl-ghost tl-icon-btn" id="tlNew" type="button" aria-label="Obrolan baru" title="Obrolan baru">
            ${ic('chatPlus', 20)}
          </button>
        </header>

        <div class="tl-feed" id="tlFeed" aria-live="polite"></div>

        <div class="tl-composer">
          <div class="tl-chips" id="tlChips" hidden>
            ${SUGGESTIONS.map(
              (s, i) =>
                `<button class="tl-chip" data-i="${i}" type="button">${ic(s.icon, 15)}<span>${esc(s.label)}</span></button>`
            ).join('')}
          </div>

          <div class="tl-input-row">
            <div class="tl-input-wrap">
              <input
                class="tl-input"
                id="tlInput"
                type="text"
                enterkeyhint="send"
                placeholder="Tanyakan sesuatu tentang materi..."
                autocomplete="off"
              />
            </div>

            <button class="tl-send" id="tlSend" type="button" aria-label="Kirim" disabled>${SEND_ICON}</button>
          </div>

          <p class="tl-note">AI bisa keliru. Cocokkan lagi dengan materi untuk memastikan.</p>
        </div>
      </section>
    `;
    recordChatOpened();
    watchStatus(panel.querySelector('#tlStatus'));

    const feed = panel.querySelector('#tlFeed');
    const chips = panel.querySelector('#tlChips');
    const input = panel.querySelector('#tlInput');
    const sendBtn = panel.querySelector('#tlSend');

    /* jumlah pesan yang sudah tampil: hanya pesan baru yang dianimasikan */
    let shown = chat.length;

    function syncSend() {
      sendBtn.disabled = chatBusy || !input.value.trim();
    }

    function renderFeed(instant = false) {
      if (!feed.isConnected) return;

      if (!chat.length) {
        feed.innerHTML = WELCOME_HTML;

        feed.querySelectorAll('.tl-suggest').forEach(btn => {
          btn.addEventListener('click', () => {
            if (AI_ENDPOINT) recordChatTried();
            send(SUGGESTIONS[Number(btn.dataset.i)].prompt);
          });
        });
      } else {
        feed.innerHTML =
          chat.map((m, i) => messageHtml(m, i >= shown)).join('') + (chatBusy ? TYPING_HTML : '');
      }

      shown = chat.length;
      chips.hidden = !chat.length;
      feed.scrollTo({ top: feed.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
      syncSend();
    }

    refreshChat = () => renderFeed();

    async function send(text) {
      text = String(text || '').trim();
      if (!text || chatBusy) return;

      chat.push({ role: 'user', content: text });

      input.value = '';

      chatBusy = true;
      renderFeed();

      try {
        const reply = await askAI(chat.filter(m => !m.error).slice(-MAX_HISTORY));
        chat.push({ role: 'assistant', content: reply });

        if (AI_ENDPOINT) {
          const found = topicsFor([{ role: 'user', content: text }]);
          recordChatMessage({ topic: found.length === 1 ? found[0].id : '' });
        }
      } catch (err) {
        /* TypeError dari fetch = internet putus / server mati; selain itu backend yang menjawab */
        const down = err instanceof TypeError;

        let content =
          err?.reply ||
          (down
            ? 'Koneksi ke AI terputus. Periksa internetmu lalu coba lagi.'
            : 'Maaf, aku belum bisa menjawab sekarang. Coba lagi sebentar lagi.');

        /* kuota habis / server padat / koneksi putus + pertanyaannya soal Darsana: cadangan dari materi lokal */
        if (
          (down || ['limit', 'busy'].includes(err?.code)) &&
          topicsFor([{ role: 'user', content: text }]).length
        ) {
          content += `\n\nSementara itu, ini yang ada di materi:\n\n${offlineReply(text, '')}`;
        }

        chat.push({ role: 'assistant', error: true, content });
      }

      chatBusy = false;
      refreshChat?.();

      if (input.isConnected) input.focus({ preventScroll: true });
    }

    input.addEventListener('input', syncSend);

    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        send(input.value);
      }
    });

    sendBtn.addEventListener('click', () => send(input.value));

    chips.addEventListener('click', event => {
      const chip = event.target.closest('.tl-chip');
      if (chip) {
        if (AI_ENDPOINT) recordChatTried();
        send(SUGGESTIONS[Number(chip.dataset.i)].prompt);
      }
    });

    panel.querySelector('#tlNew').addEventListener('click', () => {
      if (chatBusy) return;
      chat = [];
      shown = 0;
      renderFeed(true);
    });

    renderFeed(true);
  }

  /* =======================================================
     TAB STUDIO
     ======================================================= */

  function topicsLabel(topics) {
    if (topics.length >= TOPICS.length) return 'Semua topik';

    const names = topics.slice(0, 2).join(', ');
    return topics.length > 2 ? `${names} +${topics.length - 2}` : names;
  }

  /* Klik kartu riwayat = langsung main. Seluruh item AI dikirim ke kuis.js. */
  function playEntry(entry) {
    if (!isPlayable(entry)) return;

    /* hitung langsung saat dimulai, jadi tidak bergantung pada callback kuis.js */
    patchHistory(entry.id, h => ({ ...h, plays: (h.plays || 0) + 1, lastPlayed: Date.now() }));

    detach();

    renderKuis({
      onBack: () => renderAITools({ onBack, tab: 'studio', name, anonymous }),
      name,
      anonymous,
      custom: {
        type: entry.type,
        count: countOf(entry),
        topics: entry.topics,
        level: entry.level,
        /* SET SOAL dari AI: kuis.js memakai ini, bukan bank soal bawaan */
        generated: { items: entry.items },
        /* kuis.js: sembunyikan tombol "Main lagi" karena set ini dibuat AI */
        noRetry: true,
        onResult: r => {
          const c = r?.correct ?? r?.score;
          const t = r?.total ?? r?.count;
          if (typeof c !== 'number' || !t) return;
          recordStudioCompleted();
          patchHistory(entry.id, h => ({ ...h, lastScore: Math.round((c / t) * 100) }));
        }
      }
    });
  }

  function mountStudio() {
    panel.innerHTML = `
      <section class="tl-studio">

        <div class="tl-studio-block">
          <div class="tl-field-head">
            <span class="tl-label">BUAT BARU</span>
          </div>
          <p class="tl-hint">Setiap latihan dibuat baru oleh AI dari materi, jadi soalnya tidak sama dengan set sebelumnya.</p>

          <div class="tl-tool-grid">
            ${TOOLS.map(
              (t, i) => `
                <button class="tl-tool" data-i="${i}" type="button">
                  <span class="tl-tool-icon" aria-hidden="true">${ic(t.icon, 22)}</span>
                  <span class="tl-tool-body">
                    <b>${esc(t.title)}</b>
                    <small>${esc(t.desc)}</small>
                  </span>
                </button>
              `
            ).join('')}
          </div>
        </div>

        <div class="tl-studio-block">
          <div class="tl-field-head">
            <span class="tl-label">RIWAYAT STUDIO</span>
            <button class="tl-link" id="tlClear" type="button">Hapus semua</button>
          </div>

          <p class="tl-hint" id="tlHistHint">Ketuk kartu untuk langsung memainkan latihannya.</p>

          <div class="tl-sortbar" id="tlSort" role="group" aria-label="Urutkan riwayat">
            <span class="tl-sort-label">Urutkan</span>
            ${[
              ['played', 'Terakhir dimainkan'],
              ['created', 'Terakhir dibuat'],
              ['name', 'Nama']
            ]
              .map(
                ([k, t]) =>
                  `<button class="tl-sort" data-sort="${k}" aria-pressed="${histSort === k}" type="button">${t}</button>`
              )
              .join('')}
          </div>

          <div class="tl-history" id="tlHistory"></div>
        </div>

      </section>
    `;

    recordStudioOpened();

    const list = panel.querySelector('#tlHistory');
    const clearBtn = panel.querySelector('#tlClear');
    const sortBar = panel.querySelector('#tlSort');
    const histHint = panel.querySelector('#tlHistHint');

    /* id -> status terakhir yang sudah digambar (untuk animasi baris baru / selesai) */
    const drawn = new Map();
    let firstPaint = true;
        /* id kartu yang sedang animasi keluar: render ditahan sampai animasinya selesai */
    const leaving = new Set();
    const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    
    
    /* FLIP: kartu meluncur dari posisi lama ke posisi baru, dengan blur */
    function flip(prev) {
      if (!prev.size || reduceMotion()) return;

      list.querySelectorAll('.tl-hist').forEach(row => {
        const old = prev.get(row.dataset.id);
        if (!old) return;

        const dy = old.top - row.getBoundingClientRect().top;
        if (Math.abs(dy) < 2) return;

        row.animate(
          [
            { transform: `translateY(${dy}px) scale(0.975)`, filter: 'blur(7px)', opacity: 0.5 },
            { transform: 'none', filter: 'blur(0)', opacity: 1 }
          ],
          { duration: 560, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
        );
      });
    }
        let dirty = false; /* ada render yang tertahan selama animasi hapus */

    /* Hapus kartu: memerah + blur + fade, lalu tingginya menyusut
       sehingga kartu di bawahnya naik mulus mengikuti layout. */
    function removeRow(row, id, delay = 0) {
      leaving.add(id);
      drawn.delete(id);

      const finish = () => {
        row.remove();
        leaving.delete(id);
        if (leaving.size) return;

        if (dirty || !list.querySelector('.tl-hist.is-playable')) {
          dirty = false;
          renderHistory();
        }
      };

      if (reduceMotion() || !row.animate) {
        finish();
        return;
      }

      const cs = getComputedStyle(row);
      const h = row.offsetHeight;
      const gap = parseFloat(getComputedStyle(list).rowGap) || 10;
      const pt = cs.paddingTop;
      const pb = cs.paddingBottom;

      row.classList.add('is-removing');

      const redOut = row.animate(
        [
          {
            opacity: 1,
            filter: 'blur(0px)',
            transform: 'translateX(0) scale(1)',
            borderColor: 'rgba(255, 242, 220, 0.11)',
            backgroundColor: 'rgba(255, 255, 255, 0.025)',
            boxShadow: '0 0 0 0 rgba(224, 134, 120, 0), 0 0 0 rgba(224, 134, 120, 0)',
            offset: 0
          },
          {
            opacity: 1,
            filter: 'blur(0px)',
            transform: 'translateX(0) scale(1)',
            borderColor: 'rgba(224, 134, 120, 0.9)',
            backgroundColor: 'rgba(224, 134, 120, 0.22)',
            boxShadow: '0 0 0 3px rgba(224, 134, 120, 0.18), 0 0 28px rgba(224, 134, 120, 0.4)',
            offset: 0.3
          },
          {
            opacity: 0,
            filter: 'blur(10px)',
            transform: 'translateX(34px) scale(0.96)',
            borderColor: 'rgba(224, 134, 120, 0.5)',
            backgroundColor: 'rgba(224, 134, 120, 0.18)',
            boxShadow: '0 0 0 0 rgba(224, 134, 120, 0), 0 0 12px rgba(224, 134, 120, 0.15)',
            offset: 1
          }
        ],
        { duration: 520, delay, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both' }
      );

      redOut.finished
        .then(() => {
          row.style.overflow = 'hidden';

          return row.animate(
            [
              {
                height: `${h}px`,
                paddingTop: pt,
                paddingBottom: pb,
                borderTopWidth: '1px',
                borderBottomWidth: '1px',
                marginBottom: '0px'
              },
              {
                height: '0px',
                paddingTop: '0px',
                paddingBottom: '0px',
                borderTopWidth: '0px',
                borderBottomWidth: '0px',
                marginBottom: `${-gap}px`
              }
            ],
            { duration: 380, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
          ).finished;
        })
        .then(finish)
        .catch(finish);
    }

    function renderHistory() {
            if (!list.isConnected) return;
            if (leaving.size) { dirty = true; return; } /* sedang animasi hapus */ /* sedang animasi hapus; nanti dirender ulang */

      const prev = new Map();
      list.querySelectorAll('.tl-hist').forEach(r => prev.set(r.dataset.id, r.getBoundingClientRect()));

      const items = sortHistory(loadHistory(), histSort);
      clearBtn.hidden = !items.length;
      sortBar.hidden = !items.length;
      histHint.hidden = !items.some(isPlayable);

      if (!items.length) {
        drawn.clear();
        firstPaint = false;

        list.innerHTML = `
          <div class="tl-empty">
            ${ic('history', 28)}
            <b>Belum ada riwayat</b>
            <span>Latihan yang kamu buat akan tersimpan di sini dan bisa dimainkan lagi.</span>
          </div>
        `;
        return;
      }

      list.innerHTML = items
        .map((h, i) => {
          const tool = toolOf(h.type);
          const status = h.status || 'ready';
          const playable = isPlayable(h);
          const prev = drawn.get(h.id);
          const level = LEVELS.find(l => l.id === h.level)?.name || 'Campuran';
          const count = status === 'ready' ? countOf(h) : h.count;
          const delay = firstPaint ? Math.min(i, 8) * 45 : 0;

          const cls = [
            'tl-hist',
            `is-${status}`,
            playable ? 'is-playable' : '',
            prev === undefined ? 'is-new' : '',
            prev === 'generating' && status === 'ready' ? 'is-done' : ''
          ].filter(Boolean).join(' ');

          const typeTag = h.name ? `${esc(tool.title)} · ` : '';
          const info = `${typeTag}${count} ${esc(tool.unit)} · ${esc(topicsLabel(h.topics))} · ${esc(level)}`;
          const score = typeof h.lastScore === 'number' ? ` · skor terakhir ${h.lastScore}%` : '';
          const lastPlayed = h.lastPlayed ? ` · terakhir ${esc(formatDate(h.lastPlayed))}` : '';

          let icon = `<span class="tl-tool-icon" aria-hidden="true">${ic(tool.icon, 20)}</span>`;
          let body = null; /* isi kartu khusus (skeleton) */
          let meta = `<small class="tl-hist-meta">${esc(formatDate(h.createdAt))} · dimainkan ${h.plays || 0}x${lastPlayed}${score}</small>`;
          let actions = `
            <button class="tl-ghost tl-icon-btn" data-act="rename" type="button" aria-label="Ganti nama" title="Ganti nama">${PENCIL}</button>
            <button class="tl-ghost tl-icon-btn" data-act="again" type="button" aria-label="Buat set baru dengan pengaturan sama" title="Buat set baru dengan pengaturan sama">${ic('redo', 17)}</button>
            <button class="tl-ghost tl-icon-btn" data-act="del" type="button" aria-label="Hapus" title="Hapus">${ic('trash', 17)}</button>
          `;

          if (status === 'generating') {
            icon = `<span class="tl-sk tl-sk-icon" aria-hidden="true"></span>`;
            body = `
              <span class="tl-sr">Membuat ${esc(tool.title)}, mohon tunggu…</span>
              <span class="tl-sk tl-sk-line tl-sk-title" aria-hidden="true"></span>
              <span class="tl-sk tl-sk-line tl-sk-sub" aria-hidden="true"></span>
              <span class="tl-sk tl-sk-line tl-sk-meta" aria-hidden="true"></span>
            `;
            actions = `
              <button class="tl-ghost tl-icon-btn" data-act="del" type="button" aria-label="Batalkan" title="Batalkan">${ic('close', 16)}</button>
            `;
          } else if (status === 'error') {
            const why =
              h.reason === 'timeout'
                ? 'AI terlalu lama merespons'
                : h.reason === 'limit'
                  ? 'Kuota AI sedang habis, coba lagi nanti'
                  : h.reason === 'short'
                    ? 'Soal yang sesuai belum cukup (coba kurangi jumlah atau tambah topik)'
                    : 'AI belum berhasil membuat latihan';
            meta = `<small class="tl-hist-meta is-bad">${why}. Coba buat ulang.</small>`;
            actions = `
              <button class="tl-primary tl-small" data-act="again" type="button">${ic('redo', 14)}<span>Coba lagi</span></button>
              <button class="tl-ghost tl-icon-btn" data-act="del" type="button" aria-label="Hapus" title="Hapus">${ic('trash', 17)}</button>
            `;
          }

          const a11y = playable
            ? `role="button" tabindex="0" aria-label="Mainkan ${esc(nameOf(h))}"`
            : '';

          return `
            <article class="${cls}" data-id="${esc(h.id)}" style="--d:${delay}ms" ${a11y}>
              ${icon}

              ${status === 'generating' ? magicHtml() : ''}

              <div class="tl-hist-body">
                ${body ?? `<b class="tl-hist-title">${esc(nameOf(h))}</b>
                <small>${info}</small>
                ${meta}`}
              </div>

              <div class="tl-hist-actions">${actions}</div>
            </article>
          `;
        })
        .join('');

      items.forEach(h => drawn.set(h.id, h.status || 'ready'));
      firstPaint = false;
      flip(prev);
    }

    refreshStudio = renderHistory;

    function startRename(row, entry) {
      const titleEl = row.querySelector('.tl-hist-title');
      if (!titleEl) return;

      const input = document.createElement('input');
      input.className = 'tl-rename';
      input.type = 'text';
      input.maxLength = 40;
      input.value = nameOf(entry);
      input.setAttribute('aria-label', 'Nama latihan');

      titleEl.replaceWith(input);
      input.focus();
      input.select();

      let done = false;

      const finish = save => {
        if (done) return;
        done = true;

        const v = input.value.trim();

        if (save && v !== nameOf(entry)) {
          /* kosong / sama dengan nama bawaan = kembali ke nama bawaan */
          patchHistory(entry.id, h => ({
            ...h,
            name: v === toolOf(h.type).title ? '' : v
          }));
        }

        renderHistory();
      };

      input.addEventListener('keydown', ev => {
        ev.stopPropagation();

        if (ev.key === 'Enter') {
          ev.preventDefault();
          finish(true);
        } else if (ev.key === 'Escape') {
          finish(false);
        }
      });

      input.addEventListener('blur', () => finish(true));
    }

    sortBar.addEventListener('click', ev => {
      const b = ev.target.closest('[data-sort]');
      if (!b || b.dataset.sort === histSort) return;

      histSort = b.dataset.sort;
      try { localStorage.setItem(SORT_KEY, histSort); } catch { /* abaikan */ }

      sortBar.querySelectorAll('[data-sort]').forEach(x =>
        x.setAttribute('aria-pressed', String(x === b))
      );

      renderHistory();
    });

    list.addEventListener('click', event => {
      const row = event.target.closest('.tl-hist');
      if (!row || row.classList.contains('is-removing')) return;
      if (event.target.closest('.tl-rename')) return;

      const entry = loadHistory().find(h => h.id === row.dataset.id);
      if (!entry) return;

      const btn = event.target.closest('[data-act]');

      /* klik di mana saja pada kartu (bukan tombolnya) = langsung main */
      if (!btn) {
        playEntry(entry);
        return;
      }

      if (btn.dataset.act === 'rename') startRename(row, entry);

      if (btn.dataset.act === 'again') {
        openGenerator(toolOf(entry.type), {
          count: entry.count || entry.items?.length,
          topics: entry.topics,
          level: entry.level
        });
      }

            if (btn.dataset.act === 'del') {
        jobs.get(entry.id)?.abort();
        jobs.delete(entry.id);
        removeHistory(entry.id);

        removeRow(row, entry.id);
      }
    });

    /* keyboard: Enter / Spasi pada kartu yang fokus = main */
    list.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;

      const row = ev.target.closest('.tl-hist.is-playable');
      if (!row || ev.target !== row) return;

      ev.preventDefault();

      const entry = loadHistory().find(h => h.id === row.dataset.id);
      if (entry) playEntry(entry);
    });

            clearBtn.addEventListener('click', () => {
      if (!window.confirm('Hapus semua riwayat Studio?')) return;

      const rows = [...list.querySelectorAll('.tl-hist')];

      jobs.forEach(c => c.abort());
      jobs.clear();
      saveHistory([]);

      /* merah bergantian dari atas ke bawah, lalu menyusut berurutan */
      rows.forEach((r, i) => removeRow(r, r.dataset.id, Math.min(i, 8) * 70));
    });

    panel.querySelectorAll('.tl-tool').forEach(btn => {
      btn.addEventListener('click', () => openGenerator(TOOLS[Number(btn.dataset.i)]));
    });

    renderHistory();
  }

  /* =======================================================
     MODAL GENERATOR
     ======================================================= */

  function openGenerator(tool, preset = null) {
    closeModal();

    const state = {
      count: preset ? Math.min(Math.max(preset.count, tool.min), tool.max) : tool.def,
      topics: new Set(preset ? preset.topics : TOPICS.map(t => t.category)),
      level: preset?.level || 'campuran'
    };

    const el = document.createElement('div');
    modal = el;
    el.className = 'tl-modal';

    el.innerHTML = `
      <div class="tl-modal-backdrop" data-close></div>

      <div class="tl-modal-panel" role="dialog" aria-modal="true" aria-label="${esc(tool.title)}">
        <div class="tl-modal-scroll">
        <button class="tl-modal-close" data-close type="button" aria-label="Tutup">${ic('close', 18)}</button>
        <span class="tl-label">PENGATURAN</span>
        <h2>${esc(tool.title)}</h2>
        <p class="tl-modal-sub">${esc(tool.desc)}</p>

        <div class="tl-field">
          <div class="tl-field-head">
            <span class="tl-label">JUMLAH ${esc(tool.unit.toUpperCase())}</span>
            <span class="tl-count"><b id="tlCount">0</b> ${esc(tool.unit)}</span>
          </div>
          <input class="tl-range" id="tlRange" type="range" step="1" min="${tool.min}" max="${tool.max}" />
          <p class="tl-hint">Semakin banyak, semakin lama AI menyusunnya.</p>
        </div>

        <div class="tl-field">
          <div class="tl-field-head">
            <span class="tl-label">FOKUS TOPIK</span>
            <span class="tl-field-links">
              <button class="tl-link" id="tlAll" type="button">Pilih semua</button>
              <button class="tl-link" id="tlNone" type="button">Kosongkan</button>
            </span>
          </div>

          <div class="tl-topics" id="tlTopics">
            ${TOPICS.map(
              t => `
                <label class="tl-check">
                  <input type="checkbox" value="${esc(t.category)}" ${state.topics.has(t.category) ? 'checked' : ''} />
                  <span class="tl-check-box" aria-hidden="true">${ic('check', 12, 3)}</span>
                  <span class="tl-check-name">${ic(TOPIC_ICON[t.id] || 'book', 15)}<span>${esc(t.name)}</span></span>
                </label>
              `
            ).join('')}
          </div>
          <p class="tl-hint is-warn" id="tlTopicWarn" hidden>Pilih minimal satu topik.</p>
        </div>

        <div class="tl-field">
          <span class="tl-label">TINGKAT KESULITAN</span>

          <div class="tl-levels" id="tlLevels">
            ${LEVELS.map(
              l => `
                <label class="tl-level">
                  <input type="radio" name="tlLevel" value="${l.id}" ${l.id === state.level ? 'checked' : ''} />
                  <span><b>${l.name}</b><i>${levelMark(l)}</i></span>
                </label>
              `
            ).join('')}
          </div>

          <p class="tl-hint" id="tlLevelNote"></p>
        </div>

        <p class="tl-hint is-warn" id="tlGenError" hidden></p>

        <div class="tl-modal-actions">
          <p class="tl-summary" id="tlSummary"></p>
          <button class="tl-primary" id="tlStart" type="button" title="Tekan Enter">${ic('sparkles', 16)}<span>Generate</span></button>
        </div>
        </div>
      </div>
    `;

        modalOn();
    document.querySelector('.tl-page').appendChild(el);

    /* paksa layout awal dihitung dulu */
    void el.offsetWidth;

    /* fokus ke dialog (bukan tombol alat di belakang) supaya Enter = Generate */
    const dlg = el.querySelector('.tl-modal-panel');
    dlg.tabIndex = -1;
    dlg.focus({ preventScroll: true });

    /* 2 frame: biarkan DOM dialog selesai di-paint dulu, baru transisi blur mulai */
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (modal !== el) return;

el.classList.add('is-open');
      document.querySelector('.tl-page')?.classList.add('is-blurred');

        /* animasi selesai: lepas lapisan GPU supaya teks tajam */
        setTimeout(() => {
          if (el.classList.contains('is-open')) el.classList.add('is-settled');
        }, 800);
      })
    );

    const range = el.querySelector('#tlRange');
    const countEl = el.querySelector('#tlCount');
    const noteEl = el.querySelector('#tlLevelNote');
    const summary = el.querySelector('#tlSummary');
    const startBtn = el.querySelector('#tlStart');
    const warnEl = el.querySelector('#tlTopicWarn');
    const errEl = el.querySelector('#tlGenError');
    const boxes = [...el.querySelectorAll('#tlTopics input')];

    function sync() {
      const hasTopics = state.topics.size > 0;

      range.value = state.count;
      range.style.setProperty(
        '--fill',
        `${((state.count - tool.min) / (tool.max - tool.min)) * 100}%`
      );
      countEl.textContent = state.count;
      warnEl.hidden = hasTopics;

      const level = LEVELS.find(l => l.id === state.level);
      noteEl.textContent = level.note;

      summary.textContent = hasTopics
        ? `${state.count} ${tool.unit} · ${state.topics.size} topik · ${level.name}`
        : '';

      if (!AI_ENDPOINT) {
        errEl.hidden = false;
        errEl.textContent = 'AI belum terhubung. Isi VITE_AI_ENDPOINT agar Studio bisa membuat soal.';
      }

      startBtn.disabled = !hasTopics || !AI_ENDPOINT;
    }

    range.addEventListener('input', () => {
      state.count = Number(range.value);
      sync();
    });

    el.querySelector('#tlTopics').addEventListener('change', () => {
      state.topics = new Set(boxes.filter(b => b.checked).map(b => b.value));
      sync();
    });

    el.querySelector('#tlAll').addEventListener('click', () => {
      boxes.forEach(b => { b.checked = true; });
      state.topics = new Set(boxes.map(b => b.value));
      sync();
    });

    el.querySelector('#tlNone').addEventListener('click', () => {
      boxes.forEach(b => { b.checked = false; });
      state.topics = new Set();
      sync();
    });

    el.querySelector('#tlLevels').addEventListener('change', event => {
      state.level = event.target.value;
      sync();
    });

    el.querySelectorAll('[data-close]').forEach(node =>
      node.addEventListener('click', () => closeModal(true))
    );

    /* Klik "Buat": modal langsung menutup, pembuatan jalan di latar belakang,
       dan baris "sedang menyusun" muncul di Riwayat. */
    startBtn.addEventListener('click', () => {
      if (!state.topics.size || !AI_ENDPOINT) return;

      startJob({
        type: tool.type,
        count: state.count,
        topics: [...state.topics],
        level: state.level
      });

      closeModal(true);

      if (refreshStudio) {
        refreshStudio();
        document
          .querySelector('#tlHistory')
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    sync();
  }

  showTab(tab, false);
}
