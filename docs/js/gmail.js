// gmail.js — let the Agent read your inbox and send email you approve.
//
// Works like the calendar (gcal.js): Google's own sign-in popup asks for two permissions,
// "read your email" and "send email for you". The short-lived key stays in this browser tab;
// it is never sent to Toonlight's server. Two rules the site keeps:
//   - reading: only a short list of recent inbox mail (who, subject, first line), and only
//     when your message is about email. It goes to the AI with that one message.
//   - sending: never by itself. A character drafts, you read it, you press Send.

import { CONFIG } from './config.js';

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const KEY = 'toonlight:gmail';          // { connected } — your choice, kept in this browser
const TOKEN = 'toonlight:gmail-token';  // the short-lived key, this tab only (sessionStorage)

const read = (store, k) => { try { return JSON.parse(store.getItem(k)); } catch { return null; } };
const write = (store, k, v) => { try { v == null ? store.removeItem(k) : store.setItem(k, JSON.stringify(v)); } catch {} };

export const available = () => !!CONFIG.GOOGLE_CLIENT_ID;
export const settings = () => ({ connected: false, ...(read(localStorage, KEY) || {}) });
let token = read(sessionStorage, TOKEN);
export const hasToken = () => !!(token && token.expires - Date.now() > 60_000);

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (window.google?.accounts?.oauth2 ? resolve() : reject(new Error('Google sign-in did not load.')));
    s.onerror = () => reject(new Error('Couldn’t reach Google. Check your connection.'));
    document.head.append(s);
  });
}
export function warmUp() { if (available() && settings().connected) loadGis().catch(() => {}); }

// Get a key. Must be called from a click (or Enter key) or the browser blocks Google's popup.
export function getToken() {
  if (hasToken()) return Promise.resolve(token.value);
  if (!available()) return Promise.reject(new Error('Gmail isn’t set up on this site.'));
  const first = !settings().connected;
  const ask = () => new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: SCOPE,
      prompt: first ? 'consent' : '',
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new Error(r.error === 'access_denied' ? 'You didn’t allow Gmail access.' : 'Google didn’t give Gmail access.'));
        const all = SCOPE.split(' ');
        if (window.google.accounts.oauth2.hasGrantedAllScopes && !window.google.accounts.oauth2.hasGrantedAllScopes(r, ...all)) {
          return reject(new Error('Please tick both Gmail boxes on Google’s screen (read and send).'));
        }
        token = { value: r.access_token, expires: Date.now() + (+r.expires_in || 3600) * 1000 };
        write(sessionStorage, TOKEN, token);
        write(localStorage, KEY, { connected: true });
        resolve(token.value);
      },
      error_callback: (e) => reject(new Error(e?.type === 'popup_closed' ? 'The Google window was closed.' : e?.type === 'popup_failed_to_open' ? 'Your browser blocked Google’s window. Allow pop-ups for this site and try again.' : 'Couldn’t connect to Google.')),
    });
    client.requestAccessToken();
  });
  return window.google?.accounts?.oauth2 ? ask() : loadGis().then(ask);
}
export const connect = getToken;

export function disconnect() {
  try { if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token.value, () => {}); } catch {}
  token = null;
  write(sessionStorage, TOKEN, null);
  write(localStorage, KEY, { connected: false });
}

// Is this message about email? Only then is the inbox looked at.
const MAIL = /\b(e-?mails?|inbox|gmail|unread|mail|brief me|my day|morning brief)\b/i;
export const aboutMail = (text) => MAIL.test(text || '');

// Renew the key during the Send click when the message is about email (a quick popup that closes itself).
export function renewIfNeeded(text) {
  if (!available() || !settings().connected || hasToken() || !aboutMail(text)) return;
  getToken().catch(() => {});
}

async function call(path, init) {
  if (!hasToken()) throw Object.assign(new Error('Google needs you to confirm again.'), { needsTap: true });
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token.value}`, ...(init?.headers || {}) } });
  if (res.status === 401) { token = null; write(sessionStorage, TOKEN, null); throw Object.assign(new Error('Google needs you to confirm again.'), { needsTap: true }); }
  if (res.status === 403) throw new Error('Google refused. Reconnect Gmail in the Notebook and allow both permissions.');
  if (!res.ok) throw new Error(`Gmail error ${res.status}`);
  return res.json();
}

const header = (msg, name) => msg.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value || '';
// "Maya Lee <maya@example.com>" → { name: 'Maya Lee', email: 'maya@example.com' }
export function parseFrom(v) {
  const m = String(v).match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || m[2], email: m[2].trim() } : { name: String(v).trim(), email: String(v).trim() };
}

// The newest mail in your inbox: [{ from, email, subject, snippet, date, unread }]
export async function inbox(max = 8) {
  const list = await call(`/messages?maxResults=${max}&q=${encodeURIComponent('in:inbox newer_than:14d')}`);
  const ids = (list.messages || []).map((m) => m.id);
  const out = await Promise.all(ids.map((id) => call(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`).catch(() => null)));
  return out.filter(Boolean).map((m) => {
    const f = parseFrom(header(m, 'from'));
    return { from: f.name, email: f.email, subject: header(m, 'subject') || '(no subject)', snippet: String(m.snippet || '').slice(0, 140), date: new Date(+m.internalDate || Date.now()), unread: (m.labelIds || []).includes('UNREAD') };
  });
}

// Words for the AI: a short list of what's in the inbox.
export function inboxNote(mail) {
  if (!mail.length) return 'Gmail inbox: no mail in the last 14 days.';
  const day = (d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `Gmail inbox, newest first:\n${mail.map((m) => `- ${m.unread ? '[unread] ' : ''}${day(m.date)}, ${m.from} <${m.email}>: "${m.subject}" — ${m.snippet}`).join('\n')}`;
}

const b64url = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encodeWord = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${btoa(String.fromCharCode(...new TextEncoder().encode(s)))}?=`);
export const validEmail = (s) => /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(String(s || '').trim());

// The raw email Gmail expects. Header values can't carry line breaks (that's how extra headers get smuggled in).
export function rawEmail({ to, subject, text }) {
  const clean = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();
  return [`To: ${clean(to)}`, `Subject: ${encodeWord(clean(subject))}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: 8bit', '', String(text || '')].join('\r\n');
}

// Send one email from your account. Only ever called from a click on a card's Send button.
export async function send({ to, subject, text }) {
  if (!validEmail(to)) throw new Error('That email address doesn’t look right.');
  const r = await call('/messages/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: b64url(rawEmail({ to, subject, text })) }) });
  return { id: r.id };
}
