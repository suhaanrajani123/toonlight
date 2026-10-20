// history.js — your saved chats (the Chats sidebar).
//
// Every conversation is its own chat: one character, one mode (with its topic or language).
// Chats are kept in this browser. When you're signed in they're also saved to your account
// (Supabase, protected so only you can read them), so they follow you to other devices.
// Signing out removes your account's chats from this browser.

import { CONFIG } from './config.js';

const INDEX = 'toonlight:chats';
const MSGS = (id) => `toonlight:chat:${id}`;
const MAX_CHATS = 150;
const MAX_MESSAGES = 200;

const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export const newId = () => (crypto.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`).replace(/-/g, '').slice(0, 24);

// ---------- local ----------

export function listChats() {
  return read(INDEX, []).sort((a, b) => b.updated - a.updated);
}
export function loadMessages(id) { return read(MSGS(id), []); }

// Strip the screen-only bits before saving.
const clean = (messages) => messages.slice(-MAX_MESSAGES).map(({ role, text, shown, sources, memo, actions, made, quiz, steps, images }) =>
  Object.fromEntries(Object.entries({
    role, text, shown, sources: sources?.length ? sources : undefined, memo: memo?.length ? memo : undefined, actions, made, quiz,
    steps: steps?.length ? steps : undefined, images: images?.length ? images.map(({ id, prompt }) => ({ id, prompt })) : undefined,
  }).filter(([, v]) => v !== undefined)));

export function saveLocal(meta, messages) {
  const list = read(INDEX, []).filter((c) => c.id !== meta.id);
  list.push(meta);
  list.sort((a, b) => b.updated - a.updated);
  for (const old of list.splice(MAX_CHATS)) localStorage.removeItem(MSGS(old.id));
  write(INDEX, list);
  if (!write(MSGS(meta.id), clean(messages))) {
    // storage full: drop the oldest chats until it fits
    for (const old of list.slice().reverse()) {
      if (old.id === meta.id) continue;
      localStorage.removeItem(MSGS(old.id));
      write(INDEX, read(INDEX, []).filter((c) => c.id !== old.id));
      if (write(MSGS(meta.id), clean(messages))) break;
    }
  }
}

export function removeLocal(id) {
  write(INDEX, read(INDEX, []).filter((c) => c.id !== id));
  localStorage.removeItem(MSGS(id));
}

export function renameLocal(id, title) {
  const list = read(INDEX, []);
  const c = list.find((x) => x.id === id);
  if (c) { c.title = title; write(INDEX, list); }
  return c;
}

// Chats saved before the sidebar existed (one running conversation per character and mode).
export function migrateOld() {
  const moved = [];
  for (const k of Object.keys(localStorage)) {
    const m = /^toonlight:history:([a-z]+)(?::([a-z]+))?$/.exec(k);
    if (!m) continue;
    const messages = read(k, []);
    localStorage.removeItem(k);
    if (!messages.length) continue;
    const firstUser = messages.find((x) => x.role === 'user');
    const meta = {
      id: newId(), character: m[1], mode: m[2] || 'chat', title: titleFrom(firstUser?.shown || firstUser?.text || 'Earlier chat', m[2] || 'chat'),
      created: Date.now() - 1000, updated: Date.now() - 1000, owner: null,
    };
    saveLocal(meta, messages);
    moved.push(meta);
  }
  return moved;
}

export function titleFrom(text, mode, extra = {}) {
  if (mode === 'quiz') return `Quiz: ${extra.docName || extra.topic || 'mixed'}`.slice(0, 60);
  if (mode === 'interview') return `Interview: ${extra.topic || 'practice'}`.slice(0, 60);
  if (mode === 'language') return `${extra.lang || 'Language'} practice`;
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 48 ? `${t.slice(0, 46).replace(/\s+\S*$/, '')}…` : t || 'New chat';
}

// Today / Yesterday / Previous 7 days / Previous 30 days / Older
export function groupLabel(ts, now = new Date()) {
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  const diff = (day - new Date(new Date(ts).setHours(0, 0, 0, 0))) / 86400000;
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff <= 7) return 'Previous 7 days';
  if (diff <= 30) return 'Previous 30 days';
  return 'Older';
}

// ---------- your account (Supabase) ----------

const rest = () => `${CONFIG.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/chats`;
async function call(token, path = '', init = {}) {
  const res = await fetch(rest() + path, {
    ...init,
    headers: { apikey: CONFIG.SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`chats ${res.status}`);
  return res.status === 204 || init.method === 'DELETE' ? null : res.json().catch(() => null);
}

export async function pushChat(token, meta, messages) {
  const { id, character, mode, title, created, updated, owner, ...extra } = meta;
  await call(token, '?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id, character, mode, title, meta: extra, messages: clean(messages), created_at: new Date(created).toISOString(), updated_at: new Date(updated).toISOString() }),
  });
}

export const deleteRemote = (token, id) => call(token, `?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
export const renameRemote = (token, id, title) => call(token, `?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ title }) });

// Bring this account's chats into the browser (newer copy wins).
export async function pullChats(token, userId) {
  const rows = await call(token, '?select=id,character,mode,title,meta,created_at,updated_at&order=updated_at.desc&limit=150');
  const local = new Map(read(INDEX, []).map((c) => [c.id, c]));
  const stale = [];
  for (const r of rows || []) {
    const updated = Date.parse(r.updated_at);
    const mine = local.get(r.id);
    if (mine && mine.updated >= updated) continue;
    stale.push({ id: r.id, character: r.character, mode: r.mode, title: r.title, ...(r.meta || {}), created: Date.parse(r.created_at), updated, owner: userId });
  }
  // fetch the messages of new/changed chats in one request
  if (stale.length) {
    const ids = stale.map((s) => `"${s.id}"`).join(',');
    const full = await call(token, `?select=id,messages&id=in.(${ids})`);
    const byId = new Map((full || []).map((f) => [f.id, f.messages]));
    for (const meta of stale) saveLocal(meta, byId.get(meta.id) || []);
  }
  return stale.length;
}

// On sign-out: take this account's chats off this browser.
export function forgetAccount(userId) {
  for (const c of read(INDEX, [])) if (c.owner && c.owner === userId) removeLocal(c.id);
}
