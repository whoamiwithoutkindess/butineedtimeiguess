const KEY = 'dharmalearn_profile_v1';

const defaults = {
  profile: { name: '', school: '', grade: '' },
  totals: { minutes: 0, answered: 0, correct: 0 },
  sessions: { quizShort: 0, quizFull: 0, quizTyping: 0, flashcards: 0, tts: 0, darsana: 0 },
  darsanaStars: 0,
  achievementsUnlocked: [], // isi id achievement yang sudah didapat
  history: [],              // log sesi terakhir
};

export function getStats() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY)) || {};
    return {
      ...defaults,
      ...saved,
      profile: { ...defaults.profile, ...saved.profile },
      totals: { ...defaults.totals, ...saved.totals },
      sessions: { ...defaults.sessions, ...saved.sessions },
      achievementsUnlocked: saved.achievementsUnlocked || [],
      history: saved.history || [],
    };
  } catch {
    return structuredClone(defaults);
  }
}

function save(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export function updateProfile(patch) {
  const s = getStats();
  s.profile = { ...s.profile, ...patch };
  save(s);
}

// type: 'quizShort' | 'quizFull' | 'quizTyping' | 'flashcards' | 'tts' | 'darsana'
export function recordSession({ type, answered = 0, correct = 0, minutes = 0 }) {
  const s = getStats();
  s.sessions[type] = (s.sessions[type] || 0) + 1;
  s.totals.answered += answered;
  s.totals.correct += correct;
  s.totals.minutes += minutes;
  s.history.unshift({ type, answered, correct, minutes, at: Date.now() });
  s.history = s.history.slice(0, 50);
  save(s);
}

export function setDarsanaStars(n) {
  const s = getStats();
  s.darsanaStars = n;
  save(s);
}

export function unlockAchievement(id) {
  const s = getStats();
  if (!s.achievementsUnlocked.includes(id)) {
    s.achievementsUnlocked.push(id);
    save(s);
  }
}