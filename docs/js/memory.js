// memory.js — what the characters remember about you between visits.
// Stored ONLY in this browser (localStorage). Nothing is saved on the server: the
// memory is sent along with each message so the character can use it.

const KEY = 'toonlight:memory';
const MAX_FACTS = 20;

export function loadMemory() {
  try {
    const m = JSON.parse(localStorage.getItem(KEY)) || {};
    return { name: m.name || '', goals: m.goals || '', facts: Array.isArray(m.facts) ? m.facts : [] };
  } catch {
    return { name: '', goals: '', facts: [] };
  }
}

export function saveMemory(m) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch {}
}

// Add a fact the AI asked to remember. Skips near-duplicates; keeps the newest MAX_FACTS.
export function remember(m, fact) {
  const clean = fact.replace(/\s+/g, ' ').trim().slice(0, 180);
  if (clean.length < 4) return false;
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  if (m.facts.some((f) => norm(f) === norm(clean))) return false;
  // "The user's name is X" → also fill in the name field
  const name = clean.match(/(?:user'?s name is|user is called|call (?:them|the user))\s+([A-Z][\w-]{1,30})/i);
  if (name && !m.name) m.name = name[1];
  m.facts.push(clean);
  if (m.facts.length > MAX_FACTS) m.facts.splice(0, m.facts.length - MAX_FACTS);
  return true;
}

// What gets sent to the server (trimmed to the server's limits).
export function memoryPayload(m) {
  return {
    name: m.name.slice(0, 40),
    goals: m.goals.slice(0, 300),
    facts: m.facts.slice(-MAX_FACTS).map((f) => f.slice(0, 200)),
  };
}
