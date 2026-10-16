// chat.js — sends your conversation to the AI server and reads back the reply.
// Also keeps each character's chat history in your browser (localStorage).

import { CONFIG } from './config.js';
import { MOOD_NAMES } from './toonkit.js';

export const isDemo = () => !CONFIG.API_URL;

const key = (id) => `toonlight:history:${id}`;

export function loadHistory(id) {
  try { return JSON.parse(localStorage.getItem(key(id))) || []; } catch { return []; }
}
export function saveHistory(id, history) {
  try { localStorage.setItem(key(id), JSON.stringify(history.slice(-40))); } catch {}
}
export function clearHistory(id) {
  try { localStorage.removeItem(key(id)); } catch {}
}

// The AI starts each reply with a mood tag like "[happy]". Pull it off, and strip any
// markdown the model slipped in (the text is spoken aloud, so ** and # would be read out).
export function parseReply(raw) {
  const m = raw.match(/^\s*\[(\w+)\]\s*/);
  const mood = m && MOOD_NAMES.includes(m[1].toLowerCase()) ? m[1].toLowerCase() : 'neutral';
  const text = raw
    .slice(m ? m[0].length : 0)
    .replace(new RegExp(`\\[(${MOOD_NAMES.join('|')})\\]`, 'gi'), '')
    .replace(/\*\*?|__|`+|^#+\s*/gm, '')
    .trim();
  return { mood, text };
}

export class ChatError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// Demo mode (no AI server connected): be honest instead of pretending to answer.
function demoReply(character, history) {
  const last = history[history.length - 1]?.text || '';
  if (/^(hi|hello|hey|yo|sup|hiya)\b/i.test(last)) return { mood: 'happy', text: character.greeting, sources: [] };
  return {
    mood: 'sad',
    text: `I'd love to help with that, but my AI brain isn't connected yet, so I can't really answer. Once this site's AI server is set up, ask me again and I'll give you a proper answer!`,
    sources: [],
  };
}

export async function ask(character, history) {
  if (isDemo()) {
    await new Promise((r) => setTimeout(r, 650));
    return demoReply(character, history);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  let res;
  try {
    res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        character: character.id,
        messages: history.slice(-CONFIG.HISTORY_TURNS).map(({ role, text }) => ({ role, text })),
      }),
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
