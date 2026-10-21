// chat.js — sends your conversation to the AI server and reads back the reply.
// Also keeps chat history in your browser (localStorage), one per character per mode.

import { CONFIG } from './config.js';
import { MOOD_NAMES } from './toonkit.js';
import { extractActions, cardNote } from './actions.js';
import { extractQuiz } from './quiz.js';

export const isDemo = () => !CONFIG.API_URL;

const key = (id, mode = 'chat') => (mode === 'chat' ? `toonlight:history:${id}` : `toonlight:history:${id}:${mode}`);

export function loadHistory(id, mode) {
  try { return JSON.parse(localStorage.getItem(key(id, mode))) || []; } catch { return []; }
}
export function saveHistory(id, mode, history) {
  try { localStorage.setItem(key(id, mode), JSON.stringify(history.slice(-40))); } catch {}
}
export function clearHistory(id, mode) {
  try { localStorage.removeItem(key(id, mode)); } catch {}
}

// Replies can carry little tags for the site:
//   [happy]                      mood at the start (moves the face)
//   [remember: The user is …]   a fact to save in memory
//   [score: 3/4]                 quiz score
//   [action: {"type": …}]        something to do for you (see actions.js)
//   [quiz: {"q": …}]              a quiz question (see quiz.js)
// Pull them all out, and strip markdown symbols (the text is read aloud).
export function parseReply(raw) {
  const m = raw.match(/^\s*\[(\w+)\]\s*/);
  const mood = m && MOOD_NAMES.includes(m[1].toLowerCase()) ? m[1].toLowerCase() : 'neutral';
  const remember = [];
  let score = null;
  const { text: rest0, actions } = extractActions(raw.slice(m ? m[0].length : 0));
  const { text: rest, quiz } = extractQuiz(rest0);
  const text = rest
    .replace(/\[\s*remember\s*:\s*([^\]]{3,240})\]/gi, (_, f) => { remember.push(f.trim()); return ''; })
    .replace(/\[\s*score\s*:\s*(\d{1,3})\s*\/\s*(\d{1,3})\s*\]/gi, (_, a, b) => { score = { right: +a, total: +b }; return ''; })
    .replace(new RegExp(`\\[(${MOOD_NAMES.join('|')})\\]`, 'gi'), '')
    .replace(/^\s*Card shown:.*$/gim, '') // the AI's notes about earlier cards, if it repeats them
    .replace(/\*\*?|__|`+|^#+\s*/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { mood, text, remember, score, actions, quiz };
}

export class ChatError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Demo mode (no AI server connected): be honest instead of pretending to answer.
function demoReply(character, history) {
  const last = history[history.length - 1]?.text || '';
  if (/^(hi|hello|hey|yo|sup|hiya)\b/i.test(last)) return { mood: 'happy', text: character.greeting, sources: [], remember: [], score: null, actions: [] };
  return {
    mood: 'sad',
    text: "I'd love to help with that, but my AI brain isn't connected yet, so I can't really answer. Once this site's AI server is set up, ask me again and I'll give you a proper answer!",
    sources: [], remember: [], score: null, actions: [],
  };
}

// ctx: { mode, topic, lang, memory, difficulty, style, avoid, doc, auth }
export async function ask(character, history, ctx = {}) {
  if (isDemo()) {
    await new Promise((r) => setTimeout(r, 650));
    return demoReply(character, history);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  const body = {
    character: character.id,
    // earlier action cards are described in words, so the AI knows what the user was shown
    messages: history.slice(-CONFIG.HISTORY_TURNS).map(({ role, text, actions, made }) => ({
      role, text: actions?.length ? `${text}\n${actions.map((a) => cardNote(a, made)).join('\n')}`.slice(0, 1900) : text,
    })),
  };
  if (ctx.mode && ctx.mode !== 'chat') body.mode = ctx.mode;
  if (ctx.topic) body.topic = ctx.topic.slice(0, 120);
  if (ctx.mode === 'language' && ctx.lang) body.lang = ctx.lang;
  if (ctx.memory) body.memory = ctx.memory;
  if (ctx.mode === 'quiz') {
    if (ctx.difficulty) body.difficulty = ctx.difficulty;
    if (ctx.style) body.style = ctx.style;
    if (ctx.avoid?.length) body.avoid = ctx.avoid.slice(-40);
  }
  if (ctx.doc) body.doc = ctx.doc;
  if (ctx.auth) body.auth = ctx.auth;
  if (!ctx.mode || ctx.mode === 'chat' || ctx.mode === 'agent') {
    // the current time, so "remind me in an hour" / "Friday at 4" can be worked out
    const now = new Date();
    body.now = now.toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      + ` (ISO ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')})`;
    try { body.tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch {}
  }
  if (ctx.mode === 'agent') { clearTimeout(timer); return askAgent(body, ctx.onEvent || (() => {})); }
  let res;
  try {
    res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new ChatError(0, e.name === 'AbortError' ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new ChatError(res.status, data.error || 'error'); err.code = data.code; throw err; }
  return { ...parseReply(data.reply || ''), sources: Array.isArray(data.sources) ? data.sources : [] };
}

// Agent mode streams its work: one JSON line per step ("Searching…", "Reading…"), then the answer.
async function askAgent(body, onEvent) {
  const ctrl = new AbortController();
  let timer = setTimeout(() => ctrl.abort(), 60000);
  let res;
  try {
    res = await fetch(CONFIG.API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    clearTimeout(timer);
    throw new ChatError(0, e.name === 'AbortError' ? 'timeout' : 'network');
  }
  if (!res.ok) {
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    const err = new ChatError(res.status, data.error || 'error');
    err.code = data.code;
    throw err;
  }
  // an older server answers in one piece instead of streaming steps
  if (!/ndjson/.test(res.headers.get('content-type') || '')) {
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    return { ...parseReply(data.reply || ''), sources: Array.isArray(data.sources) ? data.sources : [], images: [] };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '', final = null;
  const images = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(timer);
      timer = setTimeout(() => ctrl.abort(), 60000); // still working: keep waiting
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'image' && ev.image?.data?.startsWith('data:image/')) images.push(ev.image);
        if (ev.type === 'error') throw new ChatError(ev.status || 502, ev.error || 'error');
        if (ev.type === 'final') final = ev;
        else onEvent(ev);
      }
    }
  } catch (e) {
    if (e instanceof ChatError) throw e;
    throw new ChatError(0, e.name === 'AbortError' ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
  if (!final) throw new ChatError(502, 'The agent stopped before finishing. Try again.');
  return { ...parseReply(final.reply || ''), sources: Array.isArray(final.sources) ? final.sources : [], images };
}
