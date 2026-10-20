// auth.js — sign in with Supabase (free), using its plain web API (no library needed).
//
// Accounts are email + password. The login session is kept in this browser and renewed
// automatically. The AI server checks the session with Supabase before it lets anyone
// use Agent mode, so it can't be unlocked from the browser alone.

import { CONFIG } from './config.js';

const KEY = 'toonlight:session';
const base = () => `${CONFIG.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
export const authConfigured = () => !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY);
const siteUrl = () => location.origin + location.pathname;

let session = null;
const listeners = new Set();
export const onAuthChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn(session));

function save(s) {
  session = s;
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch {}
  emit();
}

async function api(path, { method = 'POST', body, token } = {}) {
  const res = await fetch(base() + path, {
    method,
    headers: { apikey: CONFIG.SUPABASE_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.msg || data.error_description || data.message || data.error || `Error ${res.status}`;
    throw new Error(friendly(msg));
  }
  return data;
}

function friendly(msg) {
  if (/invalid login credentials/i.test(msg)) return 'That email and password don’t match. Try again, or reset your password.';
  if (/email not confirmed/i.test(msg)) return 'Check your inbox and click the confirmation link first.';
  if (/already registered|already been registered/i.test(msg)) return 'There’s already an account with that email. Sign in instead.';
  if (/password should be at least/i.test(msg)) return 'Use a password with at least 6 characters.';
  if (/rate limit|too many/i.test(msg)) return 'Too many tries. Wait a few minutes and try again.';
  return msg;
}

const fromToken = (d) => ({
  access_token: d.access_token, refresh_token: d.refresh_token,
  expires_at: d.expires_at ? d.expires_at * 1000 : Date.now() + (d.expires_in || 3600) * 1000,
  user: d.user ? { id: d.user.id, email: d.user.email } : null,
});

export async function signUp(email, password) {
  const d = await api(`/signup?redirect_to=${encodeURIComponent(siteUrl())}`, { body: { email, password } });
  if (d.access_token) { save(fromToken(d)); return { signedIn: true }; }
  return { signedIn: false, confirm: true }; // confirmation email sent
}

export async function signIn(email, password) {
  save(fromToken(await api('/token?grant_type=password', { body: { email, password } })));
}

export async function resetPassword(email) {
  await api(`/recover?redirect_to=${encodeURIComponent(siteUrl())}`, { body: { email } });
}

export async function setNewPassword(password) {
  const s = await getSession();
  if (!s) throw new Error('Your reset link expired. Ask for a new one.');
  await api('/user', { method: 'PUT', body: { password }, token: s.access_token });
}

export async function signOut() {
  const s = session;
  save(null);
  if (s) api('/logout', { token: s.access_token }).catch(() => {});
}

// A valid session (renewed if it's about to expire), or null.
let refreshing = null;
export async function getSession() {
  if (!authConfigured()) return null;
  if (!session) { try { session = JSON.parse(localStorage.getItem(KEY)); } catch { session = null; } }
  if (!session) return null;
  if (session.expires_at - Date.now() > 60000) return session;
  refreshing ||= api('/token?grant_type=refresh_token', { body: { refresh_token: session.refresh_token } })
    .then((d) => save(fromToken(d)))
    .catch(() => save(null))
    .finally(() => { refreshing = null; });
  await refreshing;
  return session;
}

// After clicking an email link (confirm account / reset password), Supabase sends the
// person back with the session in the address (#access_token=…). Read it and tidy the URL.
// Returns 'signup' | 'recovery' | 'error:<message>' | null.
export async function handleRedirect() {
  const h = location.hash.slice(1);
  if (!/access_token=|error_description=/.test(h)) return null;
  const p = new URLSearchParams(h);
  history.replaceState(null, '', location.pathname + location.search);
  if (p.get('error_description')) return `error:${p.get('error_description').replace(/\+/g, ' ')}`;
  const s = fromToken({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: +p.get('expires_in') || 3600, expires_at: +p.get('expires_at') || 0 });
  try {
    const u = await api('/user', { method: 'GET', token: s.access_token });
    s.user = { id: u.id, email: u.email };
  } catch {}
  save(s);
  return p.get('type') === 'recovery' ? 'recovery' : 'signup';
}

export const currentUser = () => session?.user || null;
