// chat.js — sends your conversation to the AI server and reads back the reply.
// Also keeps chat history in your browser (localStorage), one per character per mode.

import { CONFIG } from './config.js';
import { MOOD_NAMES } from './toonkit.js';

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
// Pull them all out, and strip markdown symbols (the text is read aloud).
export function parseReply(raw) {
  const m = raw.match(/^\s*\[(\w+)\]\s*/);
  const mood = m && MOOD_NAMES.includes(m[1].toLowerCase()) ? m[1].toLowerCase() : 'neutral';
  const remember = [];
  let score = null;
  const text = raw
    .slice(m ? m[0].length : 0)
    .replace(/\[\s*remember\s*:\s*([^\]]{3,240})\]/gi, (_, f) => { remember.push(f.trim()); return ''; })
    .replace(/\[\s*score\s*:\s*(\d{1,3})\s*\/\s*(\d{1,3})\s*\]/gi, (_, a, b) => { score = { right: +a, total: +b }; return ''; })
    .replace(new RegExp(`\\[(${MOOD_NAMES.join('|')})\\]`, 'gi'), '')
    .replace(/\*\*?|__|`+|^#+\s*/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { mood, text, remember, score };
}

export class ChatError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Demo mode (no AI server connected): be honest instead of pretending to answer.
function demoReply(character, history) {
  const last = history[history.length - 1]?.text || '';
  if (/^(hi|hello|hey|yo|sup|hiya)\b/i.test(last)) return { mood: 'happy', text: character.greeting, sources: [], remember: [], score: null };
  return {
    mood: 'sad',
    text: "I'd love to help with that, but my AI brain isn't connected yet, so I can't really answer. Once this site's AI server is set up, ask me again and I'll give you a proper answer!",
    sources: [], remember: [], score: null,
  };
}

// ctx: { mode, topic, lang, memory }
export async function ask(character, history, ctx = {}) {
  if (isDemo()) {
    await new Promise((r) => setTimeout(r, 650));
    return demoReply(character, history);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  const body = {
    character: character.id,
    messages: history.slice(-CONFIG.HISTORY_TURNS).map(({ role, text }) => ({ role, text })),
  };
  if (ctx.mode && ctx.mode !== 'chat') body.mode = ctx.mode;
  if (ctx.topic) body.topic = ctx.topic.slice(0, 120);
  if (ctx.mode === 'language' && ctx.lang) body.lang = ctx.lang;
  if (ctx.memory) body.memory = ctx.memory;
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
  if (!res.ok) throw new ChatError(res.status, data.error || 'error');
  return { ...parseReply(data.reply || ''), sources: Array.isArray(data.sources) ? data.sources : [] };
}
