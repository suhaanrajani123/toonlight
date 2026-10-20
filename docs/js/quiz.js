// quiz.js — makes quizzes fair and fresh.
//
// The AI writes each question as a tag: [quiz: {"q": …, "options": [4], "answer": 0-3, "explain": …}].
// The site then shuffles the options (so the right answer isn't always A), shows them as
// buttons, and checks your answer itself, so grading is exact and the score can't drift.
// Every question asked on a topic is remembered and sent back as "don't ask these again",
// and each question gets a different style, so quizzes don't repeat.

export const DIFFICULTIES = [
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

// Kept in sync with the worker's list.
export const STYLES = ['definition', 'application', 'scenario', 'cause and effect', 'compare two ideas', 'spot the mistake', 'worked example', 'which statement is true', 'fill in the blank', 'order or sequence'];

const LETTERS = ['A', 'B', 'C', 'D'];
export const letter = (i) => LETTERS[i];

// Read a [quiz: {...}] tag. Returns { text (without the tag), quiz } — quiz is null when absent/invalid.
export function extractQuiz(raw) {
  const m = /\[\s*quiz\s*:\s*/i.exec(raw);
  if (!m) return { text: raw, quiz: null };
  const start = raw.indexOf('{', m.index);
  let end = -1, depth = 0, inStr = false, esc = false;
  for (let i = start; start !== -1 && i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) { end = i; break; }
  }
  if (end === -1) return { text: raw.slice(0, m.index).trim(), quiz: null };
  const close = raw.indexOf(']', end);
  const text = (raw.slice(0, m.index) + raw.slice(close === -1 ? end + 1 : close + 1)).trim();
  try {
    const j = JSON.parse(raw.slice(start, end + 1));
    const options = (Array.isArray(j.options) ? j.options : []).map((o) => String(o).replace(/^\s*[A-Da-d][.)]\s+/, '').trim().slice(0, 300)).filter(Boolean);
    const answer = Number(j.answer);
    if (typeof j.q !== 'string' || options.length < 2 || options.length > 6 || !Number.isInteger(answer) || answer < 0 || answer >= options.length) return { text, quiz: null };
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { text, quiz: null };
    return { text, quiz: shuffle({ q: j.q.trim().slice(0, 600), options, answer, explain: String(j.explain || '').trim().slice(0, 600) }) };
  } catch {
    return { text, quiz: null };
  }
}

// Fisher–Yates shuffle of the options, keeping track of where the right one lands.
// "All of the above"-style options stay last.
export function shuffle(quiz) {
  const order = quiz.options.map((_, i) => i);
  const pinned = order.filter((i) => /\b(all|none|both|neither) of (the|these) (above|options)\b/i.test(quiz.options[i]));
  const free = order.filter((i) => !pinned.includes(i));
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [free[i], free[j]] = [free[j], free[i]];
  }
  const final = [...free, ...pinned];
  return { ...quiz, options: final.map((i) => quiz.options[i]), answer: final.indexOf(quiz.answer) };
}

// "B", "b)", "option b", "the second one" → 1 ; or the option's own text
export function parseAnswer(text, quiz) {
  const t = text.trim().toLowerCase();
  const m = /^(?:option\s*|answer\s*(?:is\s*)?)?\(?([a-f])\)?[.)!]?$/.exec(t);
  if (m) { const i = 'abcdef'.indexOf(m[1]); return i < quiz.options.length ? i : null; }
  const ord = ['first', 'second', 'third', 'fourth'].findIndex((w) => t.includes(w));
  if (ord !== -1 && ord < quiz.options.length && t.split(/\s+/).length <= 4) return ord;
  const exact = quiz.options.findIndex((o) => o.toLowerCase() === t);
  return exact === -1 ? null : exact;
}

// ---------- never the same question twice ----------

const AKEY = (topic) => `toonlight:asked:${topic.toLowerCase().replace(/\s+/g, ' ').slice(0, 80)}`;
export function askedBefore(topic) {
  try { const a = JSON.parse(localStorage.getItem(AKEY(topic))); return Array.isArray(a) ? a : []; } catch { return []; }
}
export function rememberAsked(topic, q) {
  const list = askedBefore(topic).filter((x) => x !== q);
  list.push(q.slice(0, 180));
  try { localStorage.setItem(AKEY(topic), JSON.stringify(list.slice(-80))); } catch {}
}
// Is this (almost) the same as a question already asked? Compares word sets.
export function isRepeat(topic, q) {
  const w = (s) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) || []);
  const a = w(q);
  return askedBefore(topic).some((prev) => {
    const b = w(prev);
    let same = 0;
    for (const x of a) if (b.has(x)) same++;
    return same / Math.max(1, Math.min(a.size, b.size)) > 0.85;
  });
}

export function pickStyle(last) {
  const pool = STYLES.filter((s) => s !== last);
  return pool[Math.floor(Math.random() * pool.length)];
}
