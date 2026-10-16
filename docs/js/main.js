// main.js — wires everything together: the cast picker, the 3D stage, the chat panel,
// voice output and microphone input.

import { ROSTER, byId } from './roster.js';
import { Stage, portrait } from './stage.js';
import { Voice } from './voice.js';
import { Listener } from './listen.js';
import { ask, isDemo, loadHistory, saveHistory, clearHistory } from './chat.js';

const $ = (id) => document.getElementById(id);
const els = {
  cast: $('cast'), name: $('name'), kind: $('kind'), tagline: $('tagline'), thought: $('thought'),
  title: $('chat-title'), messages: $('messages'), suggest: $('suggest'), notice: $('notice'),
  form: $('composer'), input: $('input'), send: $('send'), mic: $('mic'),
  voiceToggle: $('voice-toggle'), hdToggle: $('hd-toggle'), clear: $('clear'),
};

const stage = new Stage($('scene'));
const voice = new Voice();
stage.mouthLevel = voice.level;
stage.onFrame = (rig) => { rig.speaking = voice.speaking; };

let current = null;   // the character on stage
let log = [];         // their conversation: [{ role: 'user'|'assistant', text, sources? }]
let busy = false;
const rigs = new Map();

// ---------- characters ----------

async function makeRig(c) {
  const file = c.model || c.vrm;
  if (file) {
    try {
      const { loadModel } = await import('./vrm.js');
      return await loadModel(file);
    } catch (e) {
      console.warn(`Could not load ${file}, using the built-in ${c.short}`, e);
    }
  }
  return c.build();
}

// Try out a model: drag a .vrm / .glb file onto the stage and it replaces the current
// character until you reload. To make it permanent, see "Use your own models" in the README.
function setupDrop() {
  const zone = document.querySelector('.stage');
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('dropping'); }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove('dropping')));
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    const f = [...e.dataTransfer.files].find((x) => /\.(vrm|glb)$/i.test(x.name));
    if (!f) return notice('Drop a .vrm or .glb file to try it on stage. (A .gltf with separate files needs to go in the models folder.)');
    const c = current;
    const url = URL.createObjectURL(f);
    notice(`Loading ${f.name}…`);
    try {
      const { loadModel } = await import('./vrm.js');
      const rig = await loadModel(url);
      rigs.set(c.id, Promise.resolve(rig));
      stage.show(rig);
      notice(`${f.name} is now playing ${c.short} until you reload the page.`);
    } catch (err) {
      console.warn(err);
      notice(`${f.name} couldn't be loaded. Check it's a valid .vrm or .glb file.`);
    }
  });
}

async function rigFor(c) {
  if (!rigs.has(c.id)) rigs.set(c.id, makeRig(c));
  return rigs.get(c.id);
}

function buildCast() {
  let lastKind = null;
  for (const c of ROSTER) {
    if (lastKind && c.kind !== lastKind) {
      const d = document.createElement('span');
      d.className = 'divider';
      els.cast.append(d);
    }
    lastKind = c.kind;
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.id = c.id;
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', `${c.name}, ${c.kind}`);
    b.innerHTML = '<span class="face"></span><span class="label"></span>';
    b.querySelector('.label').textContent = c.short;
    b.addEventListener('click', () => select(c.id));
    els.cast.append(b);
  }
  // draw the little portraits after the main scene is up
  setTimeout(async () => {
    for (const c of ROSTER) {
      const face = els.cast.querySelector(`[data-id="${c.id}"] .face`);
      face.style.backgroundImage = `url(${portrait(await makeRig(c))})`;
      await new Promise((r) => setTimeout(r, 30));
    }
  }, 300);
}

async function select(id) {
  const c = byId(id);
  if (current?.id === c.id) return;
  voice.stop();
  current = c;

  const root = document.documentElement.style;
  root.setProperty('--top', c.theme.top);
  root.setProperty('--bottom', c.theme.bottom);
  root.setProperty('--accent', c.theme.accent);
  document.querySelector('meta[name="theme-color"]').content = c.theme.top;
  stage.setTheme(c.theme.accent);

  els.name.textContent = c.name;
  els.kind.textContent = `${c.kind} character`;
  els.tagline.textContent = c.tagline;
  els.title.textContent = `Talking with ${c.short}`;
  els.input.placeholder = `Ask ${c.short} anything…`;
  els.cast.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === c.id)));
  history.replaceState(null, '', `#${c.id}`);

  log = loadHistory(c.id);
  renderMessages();

  const rig = await rigFor(c);
  if (current !== c) return; // user clicked someone else while loading
  stage.show(rig);
  rig.setMood('happy');
  setTimeout(() => current === c && !busy && rig.setMood('neutral'), 2500);
}

// ---------- chat panel ----------

function bubble(role, text, { sources = [], who } = {}) {
  const li = document.createElement('li');
  li.className = `msg ${role === 'user' ? 'user' : role === 'system' ? 'system' : 'bot'}`;
  if (role === 'assistant' && who) {
    const w = document.createElement('div');
    w.className = 'who';
    w.textContent = who;
    li.append(w);
  }
  const b = document.createElement('div');
  b.className = 'bubble';
  const p = document.createElement('p');
  p.textContent = text; // textContent, never innerHTML: replies can't inject code
  b.append(p);
  li.append(b);
  const links = sources.filter((s) => typeof s?.uri === 'string' && s.uri.startsWith('https://'));
  if (links.length) {
    const ul = document.createElement('ul');
    ul.className = 'sources';
    ul.setAttribute('aria-label', 'Sources');
    for (const s of links.slice(0, 4)) {
      const a = document.createElement('a');
      a.href = s.uri;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = s.title || new URL(s.uri).hostname;
      const item = document.createElement('li');
      item.append(a);
      ul.append(item);
    }
    b.append(ul);
  }
  els.messages.append(li);
  els.messages.scrollTop = els.messages.scrollHeight;
  return li;
}

function renderMessages() {
  els.messages.replaceChildren();
  bubble('assistant', current.greeting, { who: current.short });
  for (const m of log) bubble(m.role, m.text, { sources: m.sources, who: current.short });
  renderSuggestions();
}

function renderSuggestions() {
  els.suggest.replaceChildren();
  if (log.length) return;
  for (const q of current.prompts) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = q;
    b.addEventListener('click', () => send(q));
    els.suggest.append(b);
  }
}

function notice(text) {
  els.notice.hidden = !text;
  els.notice.textContent = text || '';
}

const ERRORS = {
  0: "Couldn't reach the AI server. Check your internet connection and the API_URL in js/config.js.",
  429: 'Too many messages right now. Wait a minute, then try again.',
  403: "The AI server didn't accept this website. Add this site's address to ALLOWED_ORIGINS on the worker.",
};

async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  busy = true;
  els.send.disabled = true;
  voice.stop();
  if (voice.hd) voice.audioContext().resume(); // browsers only allow audio after a click/keypress

  const c = current;
  const rig = await rigFor(c);
  log.push({ role: 'user', text });
  saveHistory(c.id, log);
  bubble('user', text);
  els.input.value = '';
  autoGrow();
  els.suggest.replaceChildren();

  rig.thinking = true;
  rig.setMood('thinking');
  els.thought.hidden = false;
  const typing = bubble('assistant', '', { who: c.short });
  typing.classList.add('typing');
  typing.querySelector('.bubble').innerHTML = '<span></span><span></span><span></span>';

  try {
    const reply = await ask(c, log);
    const entry = { role: 'assistant', text: reply.text || '…', sources: reply.sources };
    const chatLog = current === c ? log : loadHistory(c.id).concat([]);
    chatLog.push(entry);
    saveHistory(c.id, chatLog);
    typing.remove();
    rig.thinking = false;
    els.thought.hidden = true;
    if (current !== c) return; // switched characters while waiting: reply is saved for later
    bubble('assistant', entry.text, { sources: entry.sources, who: c.short });
    rig.setMood(reply.mood);
    busy = false;
    els.send.disabled = false;
    await voice.speak(entry.text, c.voice);
  } catch (e) {
    typing.remove();
    log.pop();
    saveHistory(c.id, log);
    bubble('system', ERRORS[e.status] || `The AI server had a problem (${e.message}). Try again in a moment.`);
    els.input.value = text;
    rig.setMood('sad');
  } finally {
    rig.thinking = false;
    els.thought.hidden = true;
    busy = false;
    els.send.disabled = false;
    setTimeout(() => !busy && !voice.speaking && rig.setMood('neutral'), 3500);
  }
}

// ---------- controls ----------

function autoGrow() {
  els.input.style.height = 'auto';
  els.input.style.height = `${Math.min(els.input.scrollHeight + 4, 140)}px`;
}

els.form.addEventListener('submit', (e) => { e.preventDefault(); send(els.input.value); });
els.input.addEventListener('input', autoGrow);
els.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(els.input.value); }
});

els.voiceToggle.addEventListener('click', () => {
  voice.enabled = !voice.enabled;
  if (!voice.enabled) voice.stop();
  els.voiceToggle.setAttribute('aria-pressed', String(voice.enabled));
  els.voiceToggle.textContent = voice.enabled ? 'Voice on' : 'Voice off';
  try { localStorage.setItem('toonlight:voice', voice.enabled ? 'on' : 'off'); } catch {}
});

els.hdToggle.addEventListener('click', async () => {
  voice.hd = !voice.hd;
  els.hdToggle.setAttribute('aria-pressed', String(voice.hd));
  try { localStorage.setItem('toonlight:hd', voice.hd ? 'on' : 'off'); } catch {}
  if (!voice.hd) return notice(isDemo() ? demoNotice : '');
  voice.audioContext().resume();
  notice('Downloading HD voices (one time, about 90 MB)…');
  try {
    await voice.loadHD((pct) => notice(`Downloading HD voices… ${pct}% (one time, about 90 MB)`));
    notice('HD voices ready.');
    setTimeout(() => notice(isDemo() ? demoNotice : ''), 2500);
  } catch (e) {
    console.warn(e);
    voice.hd = false;
    els.hdToggle.setAttribute('aria-pressed', 'false');
    notice("HD voices couldn't download. Check your connection; the standard voices still work.");
  }
});

els.clear.addEventListener('click', () => {
  voice.stop();
  clearHistory(current.id);
  log = [];
  renderMessages();
});

const listener = new Listener({
  onInterim: (t) => { els.input.value = t; autoGrow(); },
  onFinal: (t) => send(t),
  onState: (on, err) => {
    els.mic.setAttribute('aria-pressed', String(on));
    if (on) voice.stop(); // stop talking when you start talking
    if (err === 'not-allowed') bubble('system', 'Microphone access is blocked. Allow it in your browser’s site settings to talk out loud.');
  },
});
if (listener.supported) els.mic.addEventListener('click', () => listener.toggle());
else els.mic.hidden = true;

// ---------- start ----------

const demoNotice = 'Demo mode: replies are pre-written. Add your AI server address in js/config.js for real answers.';
if (isDemo()) notice(demoNotice);
try {
  if (localStorage.getItem('toonlight:voice') === 'off') els.voiceToggle.click();
  if (localStorage.getItem('toonlight:hd') === 'on') els.hdToggle.click();
} catch {}

buildCast();
setupDrop();
select(location.hash.slice(1) || ROSTER[0].id);
window.addEventListener('hashchange', () => select(location.hash.slice(1)));
window.__toonlight = { stage, voice, get current() { return current; } }; // handy for debugging in the console
