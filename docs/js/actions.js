// actions.js — things a character can do for you.
//
// The AI never acts on its own. When you ask for something ("remind me in an hour",
// "text Rahul I'm late", "find a mouse on Amazon"), it adds an [action: {...}] tag to its
// reply. This file turns that tag into a card with a button, and nothing happens until
// you press it. Every link is built here from fixed templates (never a URL the AI wrote),
// and phone numbers / emails stay in this browser.

const STORES = {
  amazon: (q) => `https://www.amazon.com/s?k=${q}`,
  walmart: (q) => `https://www.walmart.com/search?q=${q}`,
  target: (q) => `https://www.target.com/s?searchTerm=${q}`,
  bestbuy: (q) => `https://www.bestbuy.com/site/searchpage.jsp?st=${q}`,
  google: (q) => `https://www.google.com/search?tbm=shop&q=${q}`,
};
const STORE_NAMES = { amazon: 'Amazon', walmart: 'Walmart', target: 'Target', bestbuy: 'Best Buy', google: 'Google Shopping' };
const SEARCH = {
  google: (q) => `https://www.google.com/search?q=${q}`,
  youtube: (q) => `https://www.youtube.com/results?search_query=${q}`,
};

const enc = encodeURIComponent;
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// ---------- reading the tag ----------

// Pull every [action: {...}] tag out of a reply. JSON is read with a small brace
// scanner so brackets inside the message text don't confuse it.
export function extractActions(raw) {
  const actions = [];
  let text = raw;
  const re = /\[\s*action\s*:\s*/i;
  for (let guard = 0; guard < 5; guard++) {
    const m = re.exec(text);
    if (!m) break;
    const start = text.indexOf('{', m.index);
    let end = -1;
    if (start !== -1) {
      let depth = 0, inStr = false, esc = false;
      for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
        if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}' && --depth === 0) { end = i; break; }
      }
    }
    if (end === -1) { text = text.slice(0, m.index) + text.slice(m.index + m[0].length); continue; }
    try {
      const a = clean(JSON.parse(text.slice(start, end + 1)));
      if (a) actions.push(a);
    } catch {}
    const close = text.indexOf(']', end);
    text = text.slice(0, m.index) + text.slice(close === -1 ? end + 1 : close + 1);
  }
  return { text, actions: actions.slice(0, 2) };
}

// Keep only known action types and fields, with sane lengths.
function clean(a) {
  if (!a || typeof a !== 'object') return null;
  const type = str(a.type, 20).toLowerCase();
  if (type === 'reminder') {
    const min = Number(a.in_minutes);
    const out = { type, text: str(a.text, 200) || 'Reminder' };
    if (Number.isFinite(min) && min > 0 && min <= 60 * 24 * 60) out.in_minutes = Math.round(min);
    else if (str(a.at, 30)) out.at = str(a.at, 30);
    else return null;
    return out;
  }
  if (type === 'calendar') {
    const out = { type, title: str(a.title, 200) || 'Event', details: str(a.details, 500) };
    if (str(a.start, 30)) out.start = str(a.start, 30);
    else if (str(a.date, 12)) out.date = str(a.date, 12);
    else return null;
    const min = Number(a.minutes);
    out.minutes = Number.isFinite(min) && min > 0 && min <= 24 * 60 ? Math.round(min) : 60;
    return out;
  }
  if (type === 'message') {
    const app = ['whatsapp', 'sms', 'email'].includes(str(a.app, 10).toLowerCase()) ? str(a.app, 10).toLowerCase() : 'whatsapp';
    const text = str(a.text, 1500);
    if (!text) return null;
    return { type, app, to: str(a.to, 60), text, subject: str(a.subject, 200) };
  }
  if (type === 'shop') {
    const store = STORES[str(a.store, 12).toLowerCase()] ? str(a.store, 12).toLowerCase() : 'amazon';
    const query = str(a.query, 200);
    return query ? { type, store, query } : null;
  }
  if (type === 'map') { const query = str(a.query, 200); return query ? { type, query } : null; }
  if (type === 'search') {
    const site = SEARCH[str(a.site, 10).toLowerCase()] ? str(a.site, 10).toLowerCase() : 'google';
    const query = str(a.query, 200);
    return query ? { type, site, query } : null;
  }
  return null;
}

// ---------- times ----------

// "2026-10-19T19:50" (local) → Date. Accepts a date alone too.
export function parseLocal(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(s || '');
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 9), +(m[5] || 0));
  return Number.isNaN(d.getTime()) ? null : d;
}

// When a reminder fires. `made` = when the reply arrived (so "in 60 minutes" stays fixed).
export function reminderTime(a, made = Date.now()) {
  if (a.in_minutes) return new Date(made + a.in_minutes * 60000);
  return parseLocal(a.at);
}

export function when(d) {
  if (!d) return '';
  const now = new Date();
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 86400000);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (diff === 0) return `today at ${time}`;
  if (diff === 1) return `tomorrow at ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at ${time}`;
}

const utc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const ymd = (d) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

// Google Calendar "add event" page, already filled in (you press Save there).
export function googleCalendarUrl({ title, start, end, allDay, details }) {
  const dates = allDay ? `${ymd(start)}/${ymd(new Date(start.getTime() + 86400000))}` : `${utc(start)}/${utc(end)}`;
  let url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${enc(title)}&dates=${dates}`;
  if (details) url += `&details=${enc(details)}`;
  return url;
}

// An .ics file works with Apple Calendar, Outlook and others, and carries an alarm.
export function icsFile({ title, start, end, allDay, details, alarm = 0 }) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Toonlight//EN', 'BEGIN:VEVENT',
    `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@toonlight`, `DTSTAMP:${utc(new Date())}`,
    allDay ? `DTSTART;VALUE=DATE:${ymd(start)}` : `DTSTART:${utc(start)}`,
    allDay ? `DTEND;VALUE=DATE:${ymd(new Date(start.getTime() + 86400000))}` : `DTEND:${utc(end)}`,
    `SUMMARY:${esc(title)}`,
  ];
  if (details) lines.push(`DESCRIPTION:${esc(details)}`);
  if (!allDay) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, `TRIGGER:-PT${alarm}M`, 'END:VALARM');
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return new Blob([lines.join('\r\n')], { type: 'text/calendar' });
}

// ---------- contacts (saved only in this browser) ----------

const CKEY = 'toonlight:contacts';
export function loadContacts() {
  try { const c = JSON.parse(localStorage.getItem(CKEY)); return Array.isArray(c) ? c : []; } catch { return []; }
}
export function saveContacts(list) { try { localStorage.setItem(CKEY, JSON.stringify(list.slice(0, 100))); } catch {} }

// "Rahul" matches "Rahul", "rahul sharma", "Rahul (class)"
export function findContact(name, list = loadContacts()) {
  const n = (name || '').toLowerCase().trim();
  if (!n) return null;
  return list.find((c) => c.name.toLowerCase() === n)
    || list.find((c) => c.name.toLowerCase().split(/\s+/)[0] === n.split(/\s+/)[0])
    || null;
}
const phoneOf = (c) => (c?.phone || '').replace(/[^\d+]/g, '');

// ---------- reminders (fire while the site is open) ----------

const RKEY = 'toonlight:reminders';
export function loadReminders() {
  try { const r = JSON.parse(localStorage.getItem(RKEY)); return Array.isArray(r) ? r : []; } catch { return []; }
}
export function saveReminders(list) {
  // keep upcoming ones and anything from the last day
  const keep = list.filter((r) => r.at > Date.now() - 86400000).slice(-50);
  try { localStorage.setItem(RKEY, JSON.stringify(keep)); } catch {}
}

// ---------- the card ----------

// Turn an action into what the card shows: { kind, title, detail, body?, buttons: [{label, href|run, primary}] }.
// helpers: { addReminder(rem) → bool, hasReminder(id) }
export function describe(a, made, helpers) {
  if (a.type === 'reminder') {
    const at = reminderTime(a, made);
    if (!at) return null;
    const id = `r${made}-${a.text.length}`;
    const cal = { title: a.text, start: at, end: new Date(at.getTime() + 15 * 60000) };
    const past = at.getTime() < Date.now() - 60000;
    return {
      kind: 'Reminder', title: a.text, detail: when(at) + (past ? ' (already passed)' : ''),
      note: 'Toonlight reminds you while it\'s open in a tab. To get it on your phone too, add it to your calendar.',
      buttons: [
        past ? null : {
          label: helpers.hasReminder(id) ? 'Reminder set ✓' : 'Set reminder', primary: true, done: helpers.hasReminder(id),
          run: async (btn) => { if (await helpers.addReminder({ id, text: a.text, at: at.getTime() })) { btn.textContent = 'Reminder set ✓'; btn.disabled = true; } },
        },
        { label: 'Add to Google Calendar', href: googleCalendarUrl(cal) },
        { label: 'Other calendar (.ics)', download: icsFile(cal), filename: 'reminder.ics' },
      ].filter(Boolean),
    };
  }
  if (a.type === 'calendar') {
    const allDay = !a.start;
    const start = parseLocal(a.start || a.date);
    if (!start) return null;
    const ev = { title: a.title, start, end: new Date(start.getTime() + a.minutes * 60000), allDay, details: a.details, alarm: 10 };
    const detail = allDay
      ? start.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }) + ', all day'
      : `${when(start)} · ${a.minutes >= 60 && a.minutes % 60 === 0 ? `${a.minutes / 60} hr` : `${a.minutes} min`}`;
    return {
      kind: 'Calendar event', title: a.title, detail: detail + (a.details ? ` · ${a.details}` : ''),
      buttons: [
        { label: 'Add to Google Calendar', href: googleCalendarUrl(ev), primary: true },
        { label: 'Other calendar (.ics)', download: icsFile(ev), filename: 'event.ics' },
      ],
    };
  }
  if (a.type === 'message') {
    const contact = findContact(a.to);
    const appName = { whatsapp: 'WhatsApp', sms: 'Text message', email: 'Email' }[a.app];
    const link = (text) => {
      if (a.app === 'whatsapp') return `https://wa.me/${phoneOf(contact).replace('+', '')}?text=${enc(text)}`;
      if (a.app === 'sms') return `sms:${phoneOf(contact)}?body=${enc(text)}`;
      return `mailto:${enc(contact?.email || '')}?subject=${enc(a.subject || '')}&body=${enc(text)}`;
    };
    const known = a.app === 'email' ? !!contact?.email : !!phoneOf(contact);
    return {
      kind: appName, title: a.to ? `To ${contact?.name || a.to}` : 'New message',
      detail: known ? '' : a.to ? `You'll pick ${a.to} in ${appName === 'Email' ? 'your email app' : appName}. Save their ${a.app === 'email' ? 'email' : 'number'} in the Notebook to skip that.` : '',
      body: a.text,
      buttons: [{ label: `Open in ${a.app === 'email' ? 'email' : appName}`, primary: true, hrefFrom: link }],
    };
  }
  if (a.type === 'shop') {
    return {
      kind: 'Shopping', title: a.query, detail: `Search results on ${STORE_NAMES[a.store]}. Check the price and reviews, then buy it there.`,
      buttons: [{ label: `Open ${STORE_NAMES[a.store]}`, href: STORES[a.store](enc(a.query)), primary: true }],
    };
  }
  if (a.type === 'map') {
    return { kind: 'Map', title: a.query, buttons: [{ label: 'Open Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${enc(a.query)}`, primary: true }] };
  }
  if (a.type === 'search') {
    return { kind: a.site === 'youtube' ? 'YouTube' : 'Search', title: a.query, buttons: [{ label: `Search ${a.site === 'youtube' ? 'YouTube' : 'Google'}`, href: SEARCH[a.site](enc(a.query)), primary: true }] };
  }
  return null;
}
