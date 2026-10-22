// background.js — read up on a quiz topic before the quiz starts.
//
// When you type a topic in Quiz me (and no document is attached), the site looks it up on
// Wikipedia (free, no key) and sends the most relevant article's text along with each quiz
// request, so the questions are built on checked facts instead of the AI's memory alone.
// If nothing relevant turns up (say "CS114 lab 3"), the quiz just goes ahead without it.

const API = 'https://en.wikipedia.org/w/api.php';
const MAX_CHARS = 3500;
const cache = new Map(); // topic -> Promise<background | null>

const STOP = new Set(('the a an of on in and or to for about with from into by at is are was be my me some '
  + 'quiz test questions question practice study chapter lesson unit class course basics intro introduction').split(' '));

// The words that matter: "CS114 stacks and queues" -> ["stacks", "queues"] (course codes and numbers dropped).
export function keyWords(topic) {
  return (String(topic).toLowerCase().match(/[a-z][a-z'-]+/g) || [])
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^[a-z]{2,4}\d+$/.test(w));
}

const stem = (w) => w.replace(/(ies|es|s)$/, '');
const plain = (html) => String(html).replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'");

// Is a search result about this topic? At least half the key words (and at least one) appear in it.
export function relevant(topic, title, snippet = '') {
  const words = keyWords(topic);
  if (!words.length) return false;
  const hay = new Set((`${title} ${plain(snippet)}`.toLowerCase().match(/[a-z][a-z'-]+/g) || []).map(stem));
  const hits = words.filter((w) => hay.has(stem(w))).length;
  return hits >= Math.max(1, Math.ceil(words.length / 2));
}

async function getJSON(url, ms = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`Wikipedia ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

async function lookUp(topic) {
  const words = keyWords(topic);
  if (!words.length) return null;
  const q = encodeURIComponent(words.join(' '));
  const s = await getJSON(`${API}?action=query&list=search&srsearch=${q}&srlimit=3&format=json&origin=*`);
  const hit = (s?.query?.search || []).find((r) => relevant(topic, r.title, r.snippet));
  if (!hit) return null;
  const d = await getJSON(`${API}?action=query&prop=extracts&explaintext=1&exsectionformat=plain&exchars=${MAX_CHARS}&redirects=1&titles=${encodeURIComponent(hit.title)}&format=json&origin=*`);
  const page = Object.values(d?.query?.pages || {})[0];
  const text = String(page?.extract || '').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < 200) return null;
  return {
    title: page.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    text: text.slice(0, MAX_CHARS),
  };
}

// Background notes for a topic, or null. Never throws; looks each topic up once per visit.
export function backgroundFor(topic) {
  const key = String(topic || '').trim().toLowerCase();
  if (!key) return Promise.resolve(null);
  if (!cache.has(key)) cache.set(key, lookUp(topic).catch(() => { cache.delete(key); return null; }));
  return cache.get(key);
}
