// gcal.js — put reminders and events straight into your own Google Calendar.
//
// Uses Google's own sign-in popup (Google Identity Services) to ask for ONE permission:
// "see, create, change and delete events" (calendar.events). Google gives this browser a
// short-lived key (about an hour). It stays in this tab: it's never sent to Toonlight's server
// or saved to your account. Toonlight only creates events you ask for, and can undo them.
//
// Google needs a click to show its popup, so when the key runs out the site renews it the next
// time you press Send on a message that sounds like a plan or reminder (a quick popup that
// closes by itself), or when you tap "Add to my Google Calendar" on a card.

import { CONFIG } from './config.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const KEY = 'toonlight:gcal';          // { connected, auto } — your choices, kept in this browser
const TOKEN = 'toonlight:gcal-token';  // the short-lived key, this tab only (sessionStorage)

const read = (store, k) => { try { return JSON.parse(store.getItem(k)); } catch { return null; } };
const write = (store, k, v) => { try { v == null ? store.removeItem(k) : store.setItem(k, JSON.stringify(v)); } catch {} };

export const available = () => !!CONFIG.GOOGLE_CLIENT_ID;
export const settings = () => ({ connected: false, auto: true, ...(read(localStorage, KEY) || {}) });
const save = (patch) => { write(localStorage, KEY, { ...settings(), ...patch }); listeners.forEach((fn) => fn(settings())); };
export const setAuto = (auto) => save({ auto: !!auto });

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

let token = read(sessionStorage, TOKEN);
export const hasToken = () => !!(token && token.expires - Date.now() > 60_000);

// Load Google's sign-in script once.
let gis;
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gis ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (window.google?.accounts?.oauth2 ? resolve() : reject(new Error('Google sign-in did not load.')));
    s.onerror = () => { gis = null; reject(new Error('Couldn’t reach Google. Check your connection.')); };
    document.head.append(s);
  });
  return gis;
}
// Load Google's script ahead of a click, so the click can open the popup straight away
// (browsers only allow popups during the click itself).
export function preload() { if (available()) loadGis().catch(() => {}); }
export function warmUp() { if (settings().connected) preload(); }

// Get a key. Must be called from a click (or Enter key) or the browser blocks Google's popup.
export function getToken() {
  if (hasToken()) return Promise.resolve(token.value);
  if (!available()) return Promise.reject(new Error('Google Calendar isn’t set up on this site.'));
  const first = !settings().connected;
  const ask = () => new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: SCOPE,
      prompt: first ? 'consent' : '',
      callback: (r) => {
        if (r.error || !r.access_token) return reject(new Error(r.error === 'access_denied' ? 'You didn’t allow calendar access.' : 'Google didn’t give calendar access.'));
        if (window.google.accounts.oauth2.hasGrantedAllScopes && !window.google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) {
          return reject(new Error('Please tick the calendar box on Google’s screen to let Toonlight add events.'));
        }
        token = { value: r.access_token, expires: Date.now() + (+r.expires_in || 3600) * 1000 };
        write(sessionStorage, TOKEN, token);
        save({ connected: true });
        resolve(token.value);
      },
      error_callback: (e) => reject(new Error(e?.type === 'popup_closed' ? 'The Google window was closed.' : e?.type === 'popup_failed_to_open' ? 'Your browser blocked Google’s window. Allow pop-ups for this site and try again.' : 'Couldn’t connect to Google.')),
    });
    client.requestAccessToken();
  });
  // the script is usually loaded already (warmUp); if not, the popup may need a second click
  return window.google?.accounts?.oauth2 ? ask() : loadGis().then(ask);
}

export const connect = getToken;

export function disconnect() {
  try { if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token.value, () => {}); } catch {}
  token = null;
  write(sessionStorage, TOKEN, null);
  save({ connected: false });
}

// Renew the key while you're clicking Send, if this message might lead to a calendar event.
const PLAN = /\b(remind|reminder|calendar|schedule|meeting|event|appointment|deadline|exam|class|plan|book|tomorrow|tonight|today at|at \d|\d\s*(am|pm)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
export function renewIfNeeded(text) {
  const s = settings();
  if (!available() || !s.connected || !s.auto || hasToken() || !PLAN.test(text || '')) return;
  getToken().catch(() => {}); // if it fails, the card offers a button instead
}

async function call(method, url, body) {
  if (!hasToken()) throw Object.assign(new Error('Tap to add it to your Google Calendar.'), { needsTap: true });
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token.value}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { token = null; write(sessionStorage, TOKEN, null); throw Object.assign(new Error('Google needs you to confirm again.'), { needsTap: true }); }
  if (res.status === 403) throw new Error('Google refused. Reconnect Google Calendar in the Notebook and allow calendar access.');
  if (!res.ok && res.status !== 410 && !(method === 'DELETE' && res.status === 404)) throw new Error(`Google Calendar error ${res.status}`);
  return res.status === 204 || method === 'DELETE' ? null : res.json();
}

const pad = (n) => String(n).padStart(2, '0');
const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const zone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } };

// ev: { title, start: Date, end: Date, allDay?, details?, alarm?: minutes before (0 = at the time) }
export async function addEvent(ev) {
  const timeZone = zone();
  const body = {
    summary: ev.title,
    description: [ev.details, 'Added by Toonlight'].filter(Boolean).join('\n\n'),
    start: ev.allDay ? { date: day(ev.start) } : { dateTime: ev.start.toISOString(), timeZone },
    end: ev.allDay ? { date: day(new Date(ev.start.getTime() + 86400000)) } : { dateTime: ev.end.toISOString(), timeZone },
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: Math.max(0, ev.alarm ?? 0) }] },
  };
  const r = await call('POST', API, body);
  return { id: r.id, link: r.htmlLink };
}

export const removeEvent = (id) => call('DELETE', `${API}/${encodeURIComponent(id)}`);
