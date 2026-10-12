// Pembuatan 15-20 soal bisa makan 20-40 detik
export const config = { maxDuration: 60 };

// Model paling ringan dulu, satu lagi sebagai cadangan
const MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];

// Google Search (hanya chat; Studio SELALU tanpa search)
const USE_SEARCH = true;

// true  = search dipakai hanya kalau pertanyaan terdengar butuh info terkini
//         (jauh lebih cepat & hemat kuota untuk chat biasa)
// false = chat selalu mencoba search dulu
const SEARCH_ONLY_WHEN_NEEDED = true;

const FRESH_RE =
  /hari ini|sekarang|terbaru|terkini|berita|cuaca|harga|kurs|skor|jadwal|trending|viral|siapa (presiden|menteri|gubernur|ceo)|\b20(2[4-9]|3\d)\b/i;
const STUDIO_MAX_TOKENS = 4096;
const STUDIO_SYSTEM_LIMIT = 40000;
const CHAT_MAX_TOKENS = 2000;
const MATERI_LIMIT = 30000;

/* Sapaan / basa-basi: dijawab AI dengan prompt kecil, tanpa materi dan tanpa search */
const SMALLTALK_MAX_TOKENS = 256;

const SMALLTALK_SYSTEM =
  'Kamu asisten belajar DharmaLearn. Pengguna hanya menyapa atau berbasa-basi. ' +
  'Balas dalam bahasa Indonesia, santai dan ramah, maksimal 1-2 kalimat pendek, boleh satu emoji. ' +
  'Ajak mereka bertanya soal materi Sad Darsana. ' +
  'Jangan menulis catatan, peringatan, atau daftar apa pun.';

const SMALLTALK_RE =
  /^(hi+|h[ae]i+|halo+|hello+|hey+|hy|p|tes|test|ping|woi|oy|assalamu'?alaikum|om swastiastu|om swastyastu|selamat (pagi|siang|sore|malam)|pagi|siang|sore|malam|apa kabar|makasih|terima ?kasih|thanks?|thx|ok|oke|okay|okee|sip|mantap|siapa kamu|kamu siapa)( (kak|ka|bro|sis|ai|bot|min|dong|ya|yaa|nih|semua|guys|banyak))*$/;

function isSmallTalk(text) {
  const t = String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return t.length > 0 && t.length <= 30 && SMALLTALK_RE.test(t);
}

const OUT_OF_MATERI =
  'Jawaban ini di luar materi DharmaLearn, jangan dijadikan bahan belajar ujian. Ayo kembali fokus ke materi.';

/* Pesan yang dikirim ke user kalau AI gagal (frontend tinggal menampilkan) */
const LIMIT_MSG =
  'Kuota AI DharmaLearn lagi habis nih 😅 Coba lagi beberapa menit lagi, atau besok kalau kuota hariannya yang habis.';
const BUSY_MSG =
  'Server AI lagi padat banget. Tunggu sebentar lalu coba kirim ulang ya.';
const FAIL_MSG =
  'Maaf, AI lagi bermasalah dan belum bisa menjawab. Coba lagi sebentar lagi.';
const BLOCKED_MSG =
  'Pertanyaan ini tidak bisa aku jawab. Coba ubah kalimatnya atau tanyakan hal lain ya.';
function chatSystem(materi) {
  // Dihitung per request, supaya selalu waktu terbaru
  const now = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Makassar', // WITA. Ganti 'Asia/Jakarta' kalau user kamu di WIB
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const head =
    'Kamu asisten DharmaLearn: asisten AI serba bisa yang juga jadi pendamping belajar materi Sad Darsana. ' +
    'Jawab dalam bahasa Indonesia, ramah, singkat, dan jelas. ' +
    'Format yang boleh dipakai: **tebal**, daftar, dan tabel markdown sederhana.\n\n' +
    `Waktu sekarang: ${now} (WITA). Pakai ini kalau ditanya hari, tanggal, atau jam.\n\n`;

  const rule1 =
    '1. Jawab setiap pertanyaan dengan usaha terbaik. Jangan menolak atau hanya bilang "tidak tahu" untuk pertanyaan umum. ' +
    'Kalau butuh informasi terkini dan kamu punya akses pencarian, gunakan pencarian dulu lalu jawab berdasarkan hasilnya. ' +
    'Untuk sapaan atau obrolan ringan, balas 1-2 kalimat saja dan jangan menulis baris catatan apa pun.\n';
  if (materi) {
    return (
      head +
      'ATURAN:\n' +
      rule1 +
      '2. MATERI di bawah adalah sumber utama untuk pertanyaan tentang Sad Darsana. Jangan bertentangan dengannya. ' +
      'Kalau detail yang ditanya tidak ada di materi, jelaskan dengan pengetahuan umum dan sebutkan bahwa bagian itu tidak ada di materi.\n' +
      `3. Kalau seluruh jawabanmu di luar materi, tulis di baris terakhir yang terpisah persis: ${OUT_OF_MATERI}\n` +
      '4. Jangan tulis baris itu untuk jawaban yang memang tentang materi.\n\n' +
      '=== MATERI ===\n' +
      materi
    );
  }

  return (
    head +
    'ATURAN:\n' +
    rule1 +
    '2. Pesan ini TIDAK disertai materi pelajaran. Kalau ternyata pertanyaannya menyangkut Sad Darsana atau filsafat Hindu, ' +
    'jawab dengan pengetahuan umum yang akurat, lalu tambahkan di baris terakhir: ' +
    '"Catatan: jawaban ini belum dicocokkan dengan materi DharmaLearn."\n' +
    `3. Kalau pertanyaannya di luar Sad Darsana (obrolan biasa, tugas lain, info umum, hasil pencarian), tulis di baris terakhir yang terpisah persis: ${OUT_OF_MATERI}`
  );
}

export default async function handler(req, res) {
  /* Cek koneksi: tidak memanggil Gemini, jadi tidak memakai kuota */
  if (req.method === 'GET' || req.body?.mode === 'ping') {
    return res.status(200).json({ ok: true, ready: Boolean(process.env.GEMINI_API_KEY) });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const { messages, system: clientSystem, max_tokens, mode, materi: clientMateri } = req.body || {};
  const studio = mode === 'studio';

  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: 'messages kosong' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY belum diisi' });
  }

  const smallTalk = !studio && isSmallTalk(messages[messages.length - 1]?.content);

  let system;

  if (studio) {
    // Studio: instruksi + materi sudah dirakit frontend (buildGenSystem)
    system = String(clientSystem || '').slice(0, STUDIO_SYSTEM_LIMIT);
    if (!system) return res.status(400).json({ error: 'system kosong' });
  } else {
    // Chat: materi hanya ada kalau frontend menganggap pertanyaannya soal Darsana
    system = smallTalk
      ? SMALLTALK_SYSTEM
      : chatSystem(String(clientMateri || '').slice(0, MATERI_LIMIT).trim());
  }

  // Gemini pakai role "model", bukan "assistant"
  const contents = messages.slice(smallTalk ? -4 : -12).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content || '').slice(0, 2000) }]
  }));

  const generationConfig = studio
    ? {
        maxOutputTokens: Math.min(Number(max_tokens) || 2000, STUDIO_MAX_TOKENS),
        temperature: 0.9,
        responseMimeType: 'application/json'
      }
    : {
        maxOutputTokens: smallTalk
          ? SMALLTALK_MAX_TOKENS
          : Math.min(Number(max_tokens) || 1000, CHAT_MAX_TOKENS)
      };

  try {
    const lastUser = String(messages[messages.length - 1]?.content || '');
    const wantsSearch =
      !studio && USE_SEARCH && (!SEARCH_ONLY_WHEN_NEEDED || FRESH_RE.test(lastUser));

    // [true, false] = coba pakai search dulu, kalau gagal/limit lanjut tanpa search
    const searchModes = wantsSearch ? [true, false] : [false];
    let data;
    let ok = false;
    let fatal = false;
    let lastStatus = 0;

    for (const model of MODELS) {
      for (const useSearch of searchModes) {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': process.env.GEMINI_API_KEY
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents,
              ...(useSearch ? { tools: [{ google_search: {} }] } : {}),
              generationConfig
            })
          }
        );

        data = await r.json();
        lastStatus = r.status;
        if (r.ok) { ok = true; break; }

        console.error(`Gemini error (${model}, search=${useSearch}, mode=${mode || 'chat'}):`, JSON.stringify(data));

        if (![429, 500, 503].includes(r.status)) { fatal = true; break; }
      }
      if (ok || fatal) break;
    }

    if (!ok) {
      // Semua model gagal: tetap kirim pesan yang bisa dibaca user
      if (lastStatus === 429) return res.status(429).json({ error: 'limit', reply: LIMIT_MSG });
      if (lastStatus === 500 || lastStatus === 503) return res.status(503).json({ error: 'busy', reply: BUSY_MSG });
      return res.status(502).json({ error: 'fail', reply: FAIL_MSG });
    }

    const cand = data.candidates?.[0];

    const reply = (cand?.content?.parts || [])
      .map(p => p.text || '')
      .join(studio ? '' : '\n')
      .trim();

    if (!reply) {
      // Kosong biasanya karena diblokir safety, atau token habis sebelum ada teks
      const blocked = data.promptFeedback?.blockReason || cand?.finishReason === 'SAFETY';
      return res.status(502).json({ error: blocked ? 'blocked' : 'fail', reply: blocked ? BLOCKED_MSG : FAIL_MSG });
    }

    // Jawaban chat kepotong karena token output habis
    const cut = !studio && cand?.finishReason === 'MAX_TOKENS';
    const finalReply = cut
           ? `${reply}\n\n(Jawaban terpotong karena kepanjangan. Ketik "lanjut" untuk meneruskan.)`
      : reply;

    res.status(200).json({ reply: finalReply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'fail', reply: FAIL_MSG });
  }
}