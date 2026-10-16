// main.js — wires everything together: cast, 3D stage, practice modes, chat, memory,
// the Notebook drawer, voice in/out, and your own 3D models.

import { ROSTER, byId } from './roster.js';
import { Stage, portrait } from './stage.js';
import { Voice } from './voice.js';
import { Listener } from './listen.js';
import { ask, isDemo, loadHistory, saveHistory, clearHistory } from './chat.js';
import { MODES, LANGS, modeById, langCode } from './modes.js';
import { loadMemory, saveMemory, remember, memoryPayload } from './memory.js';
import { saveModel, getModel, removeModel } from './models.js';

const $ = (id) => document.getElementById(id);
const els = {
  cast: $('cast'), name: $('name'), kind: $('kind'), tagline: $('tagline'), thought: $('thought'),
  title: $('chat-title'), chatMode: $('chat-mode'), windowTitle: $('window-title'),
  messages: $('messages'), suggest: $('suggest'), notice: $('notice'),
  form: $('composer'), input: $('input'), send: $('send'), mic: $('mic'),
  modes: $('modes'), setup: $('mode-setup'), setupLabel: $('mode-field-label'), setupField: $('mode-field'), setupLang: $('mode-lang'),
  score: $('score'), scoreNum: $('score-num'), stage: $('stage'),
  voiceToggle: $('voice-toggle'), hdToggle: $('hd-toggle'), clear: $('clear'),
  notebook: $('notebook'), scrim: $('scrim'), help: $('help'),
  memName: $('mem-name'), memGoals: $('mem-goals'), facts: $('facts'), factsEmpty: $('facts-empty'),
  modelFile: $('model-file'), modelReset: $('model-reset'), modelStatus: $('model-status'), modelWho: $('model-who'),
};

const stage = new Stage($('scene'));
const voice = new Voice();
stage.mouthLevel = voice.level;
stage.onFrame = (rig) => { rig.speaking = voice.speaking; };

const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

let current = null;                       // character on stage
let log = [];                             // current conversation
let busy = false;
const rigs = new Map();
const memory = loadMemory();
const practice = {                        // what we're practicing (shared across characters)
  mode: read('toonlight:mode', 'chat'),
  topic: '',
  lang: read('toonlight:lang', 'Spanish'),
};
if (!MODES.some((m) => m.id === practice.mode)) practice.mode = 'chat';
practice.topic = read(`toonlight:topic:${practice.mode}`, '');

// ---------- characters & models ----------

async function makeRig(c) {
  const own = await getModel(c.id);                 // your model saved in this browser
  const file = own ? URL.createObjectURL(own.blob) : c.model || c.vrm;
  if (file) {
    try {
      const { loadModel } = await import('./vrm.js');
      return await loadModel(file);
    } catch (e) {
      console.warn(`Could not load the model for ${c.short}; using the built-in one.`, e);
      if (own) notice(`Your model for ${c.short} couldn't be loaded, so the built-in look is shown.`);
    }
  }
  return c.build();
}

function rigFor(c) {
  if (!rigs.has(c.id)) rigs.set(c.id, makeRig(c));
  return rigs.get(c.id);
}

function buildCast() {
  let kind = null;
  for (const c of ROSTER) {
    if (c.kind !== kind) {
      kind = c.kind;
      const g = document.createElement('p');
      g.className = 'cast-group';
      g.textContent = `${kind} crew`;
      els.cast.append(g);
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'card';
    b.dataset.id = c.id;
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', `${c.name}, ${c.kind}`);
    b.innerHTML = '<span class="face"></span><span class="txt"><span class="who"></span><span class="what"></span></span>';
    b.querySelector('.who').textContent = c.short;
    b.querySelector('.what').textContent = c.tagline.split('.')[0];
    b.title = c.tagline;
    b.addEventListener('click', () => select(c.id));
    els.cast.append(b);
  }
  setTimeout(drawPortraits, 250);
}

async function drawPortraits(only) {
  for (const c of ROSTER) {
    if (only && c.id !== only) continue;
    const face = els.cast.querySelector(`[data-id="${c.id}"] .face`);
    face.style.backgroundImage = `url(${portrait(await makeRig(c))})`;
    await new Promise((r) => setTimeout(r, 30));
  }
}

async function select(id) {
  const c = byId(id);
  if (current?.id === c.id) return;
  voice.stop();
  current = c;

  document.documentElement.style.setProperty('--tint', c.theme.tint);
  stage.setTheme(c.theme.tint);
  els.name.textContent = c.name;
  els.kind.textContent = `${c.kind} character`;
  els.tagline.textContent = c.tagline;
  els.title.textContent = c.short;
  els.modelWho.textContent = c.short;
  els.cast.querySelectorAll('.card').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === c.id)));
  history.replaceState(null, '', `#${c.id}`);
  updateTitles();
  loadConversation();
  refreshModelStatus();

  const rig = await rigFor(c);
  if (current !== c) return;
  stage.show(rig);
  rig.setMood('happy');
  setTimeout(() => current === c && !busy && rig.setMood('neutral'), 2500);
}

function updateTitles() {
  const m = modeById(practice.mode);
  const detail = practice.mode === 'language' ? `${m.label} (${practice.lang})` : practice.mode !== 'chat' && practice.topic ? `${m.label}: ${practice.topic}` : m.label;
  els.chatMode.textContent = detail;
  els.windowTitle.textContent = `${current.name}, ${detail.charAt(0).toLowerCase()}${detail.slice(1)}`;
  els.input.placeholder = practice.mode === 'language' ? `Write to ${current.short} in ${practice.lang}…` : `Message ${current.short}…`;
  listener.setLang(practice.mode === 'language' ? langCode(practice.lang) : 'en-US');
}

// ---------- practice modes ----------

function buildModes() {
  for (const m of MODES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mode';
    b.role = 'tab';
    b.dataset.mode = m.id;
    b.textContent = m.label;
    b.title = m.note;
    b.addEventListener('click', () => setMode(m.id));
    els.modes.append(b);
  }
  for (const l of LANGS) {
    const o = document.createElement('option');
    o.value = o.textContent = l.name;
    els.setupLang.append(o);
  }
}

function setMode(id, { quiet } = {}) {
  practice.mode = id;
  practice.topic = read(`toonlight:topic:${id}`, '');
  write('toonlight:mode', id);
  const m = modeById(id);
  els.modes.querySelectorAll('.mode').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === id)));
  // the little setup card under the stage
  els.setup.hidden = !m.field;
  if (m.field) {
    els.setupLabel.textContent = m.field.label;
    const isLang = m.field.kind === 'lang';
    els.setupField.hidden = isLang;
    els.setupLang.hidden = !isLang;
    els.setupLabel.htmlFor = isLang ? 'mode-lang' : 'mode-field';
    if (isLang) els.setupLang.value = practice.lang;
    else {
      els.setupField.placeholder = m.field.placeholder;
      els.setupField.value = practice.topic;
    }
  }
  if (current && !quiet) {
    voice.stop();
    updateTitles();
    loadConversation();
  }
}

els.setup.addEventListener('submit', (e) => {
  e.preventDefault();
  const m = modeById(practice.mode);
  if (m.field.kind === 'lang') {
    practice.lang = els.setupLang.value;
    write('toonlight:lang', practice.lang);
  } else {
    practice.topic = els.setupField.value.trim() || m.field.fallback;
    els.setupField.value = practice.topic;
    write(`toonlight:topic:${practice.mode}`, practice.topic);
  }
  updateTitles();
  // a fresh session for the new topic/language
  clearHistory(current.id, practice.mode);
  log = [];
  renderMessages();
  send(m.start(practice));
});

function showScore(score) {
  if (!score || practice.mode !== 'quiz') return;
  // only after you've actually answered something (the AI sometimes tags its first question)
  if (log.filter((m) => m.role === 'user').length < 2 || score.total < 1) return;
  els.score.hidden = false;
  els.scoreNum.textContent = `${score.right}/${score.total}`;
  els.score.classList.remove('bump');
  void els.score.offsetWidth;
  els.score.classList.add('bump');
}

// ---------- chat ----------

function loadConversation() {
  log = loadHistory(current.id, practice.mode);
  els.score.hidden = true;
  const last = [...log].reverse().find((m) => m.score);
  if (last) showScore(last.score);
  renderMessages();
}

function greeting() {
  const m = modeById(practice.mode);
  if (practice.mode !== 'chat') {
    return practice.mode === 'language'
      ? `${current.greeting} Pick a language below and press Start, and I'll chat with you in it.`
      : `${current.greeting} ${m.note} Set it up below and press Start.`;
  }
  return memory.name ? `${current.greeting} Good to see you, ${memory.name}!` : current.greeting;
}

function bubble(role, text, { sources = [], who, fresh, memo } = {}) {
  const li = document.createElement('li');
  li.className = `msg ${role === 'user' ? 'user' : role === 'system' ? 'system' : 'bot'}${fresh ? ' new' : ''}`;
  if (role === 'assistant' && who) {
    const w = document.createElement('div');
    w.className = 'who';
    w.textContent = who;
    li.append(w);
  }
  const b = document.createElement('div');
  b.className = 'bubble';
  const p = document.createElement('p');
  p.textContent = text; // textContent: replies can never inject HTML
  b.append(p);
  li.append(b);
  for (const f of memo || []) {
    const n = document.createElement('p');
    n.className = 'memo';
    n.textContent = `Noted in your notebook: ${f}`;
    li.append(n);
  }
  const links = sources.filter((s) => typeof s?.uri === 'string' && s.uri.startsWith('https://'));
  if (links.length) {
    const ul = document.createElement('ul');
    ul.className = 'sources';
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
  bubble('assistant', greeting(), { who: current.short });
  for (const m of log) bubble(m.role, m.text, { sources: m.sources, who: current.short, memo: m.memo });
  renderSuggestions();
}

function renderSuggestions() {
  els.suggest.replaceChildren();
  if (log.length || practice.mode !== 'chat') return;
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
  0: "Couldn't reach the AI server. Check your internet connection and try again.",
  429: 'The free AI is busy or out of messages for today. Wait a minute and try again.',
  403: "The AI server didn't accept this website.",
};

// In language practice, only the foreign-language part is spoken (not the English correction).
function spokenPart(text) {
  if (practice.mode !== 'language') return { say: text, lang: 'en-US' };
  return { say: text.split(/\n?\s*(Correction|Meaning)\s*:/i)[0].trim(), lang: langCode(practice.lang) };
}

async function send(text) {
  text = text.trim();
  if (!text || busy) return;
  busy = true;
  els.send.disabled = true;
  voice.stop();
  if (voice.hd) voice.audioContext().resume();

  const c = current, mode = practice.mode;
  const rig = await rigFor(c);
  log.push({ role: 'user', text });
  saveHistory(c.id, mode, log);
  bubble('user', text, { fresh: true });
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
    const reply = await ask(c, log, { mode, topic: practice.topic, lang: practice.lang, memory: memoryPayload(memory) });
    const memo = [];
    for (const f of reply.remember || []) if (remember(memory, f)) memo.push(f);
    if (memo.length) { saveMemory(memory); renderMemory(); }
    const entry = { role: 'assistant', text: reply.text || '…', sources: reply.sources, memo, score: reply.score || undefined };
    const target = current === c && practice.mode === mode ? log : loadHistory(c.id, mode);
    target.push(entry);
    saveHistory(c.id, mode, target);
    typing.remove();
    if (current !== c || practice.mode !== mode) return;
    bubble('assistant', entry.text, { sources: entry.sources, who: c.short, fresh: true, memo });
    showScore(reply.score);
    rig.setMood(reply.mood);
    rig.thinking = false;
    els.thought.hidden = true;
    busy = false;
    els.send.disabled = false;
    const { say, lang } = spokenPart(entry.text);
    await voice.speak(say, c.voice, lang);
  } catch (e) {
    typing.remove();
    log.pop();
    saveHistory(c.id, mode, log);
    bubble('system', ERRORS[e.status] || `The AI server had a hiccup (${e.message}). Try again in a moment.`);
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

function autoGrow() {
  els.input.style.height = 'auto';
  els.input.style.height = `${Math.min(els.input.scrollHeight + 4, 150)}px`;
}
els.form.addEventListener('submit', (e) => { e.preventDefault(); send(els.input.value); });
els.input.addEventListener('input', autoGrow);
els.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(els.input.value); }
});

// ---------- notebook: memory, voice, models ----------

function renderMemory() {
  els.memName.value = memory.name;
  els.memGoals.value = memory.goals;
  els.facts.replaceChildren();
  memory.facts.forEach((f, i) => {
    const li = document.createElement('li');
    const s = document.createElement('span');
    s.textContent = f;
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.setAttribute('aria-label', `Forget: ${f}`);
    x.addEventListener('click', () => { memory.facts.splice(i, 1); saveMemory(memory); renderMemory(); });
    li.append(s, x);
    els.facts.append(li);
  });
  els.factsEmpty.hidden = memory.facts.length > 0;
}
els.memName.addEventListener('change', () => { memory.name = els.memName.value.trim(); saveMemory(memory); });
els.memGoals.addEventListener('change', () => { memory.goals = els.memGoals.value.trim(); saveMemory(memory); });
$('forget-all').addEventListener('click', () => {
  memory.name = ''; memory.goals = ''; memory.facts = [];
  saveMemory(memory);
  renderMemory();
});

let lastFocus = null;
function openNotebook() {
  lastFocus = document.activeElement;
  els.notebook.inert = false;
  els.notebook.setAttribute('aria-hidden', 'false');
  els.notebook.classList.add('open');
  els.scrim.hidden = false;
  renderMemory();
  setTimeout(() => els.memName.focus(), 50);
}
function closeNotebook() {
  els.notebook.classList.remove('open');
  els.notebook.inert = true;
  els.notebook.setAttribute('aria-hidden', 'true');
  els.scrim.hidden = true;
  lastFocus?.focus?.();
}
$('open-notebook').addEventListener('click', openNotebook);
$('close-notebook').addEventListener('click', closeNotebook);
els.scrim.addEventListener('click', () => { closeNotebook(); els.help.hidden = true; });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (els.notebook.classList.contains('open')) closeNotebook();
  els.help.hidden = true;
});

async function refreshModelStatus() {
  const own = await getModel(current.id);
  els.modelReset.hidden = !own;
  els.modelStatus.textContent = own ? `${current.short} is using your model: ${own.name}` : `${current.short} is using the built-in model.`;
}
els.modelFile.addEventListener('change', async () => {
  const f = els.modelFile.files[0];
  els.modelFile.value = '';
  if (!f) return;
  if (!/\.(vrm|glb)$/i.test(f.name)) { els.modelStatus.textContent = 'Please choose a .vrm or .glb file.'; return; }
  await useModel(current, f);
});
els.modelReset.addEventListener('click', async () => {
  await removeModel(current.id);
  await reloadRig(current);
  els.modelStatus.textContent = `${current.short} is back to the built-in model.`;
});

async function useModel(c, file) {
  els.modelStatus.textContent = `Loading ${file.name}…`;
  try {
    const { loadModel } = await import('./vrm.js');
    const url = URL.createObjectURL(file);
    await loadModel(url); // check it actually loads before saving it
    URL.revokeObjectURL(url);
    await saveModel(c.id, file);
    await reloadRig(c);
    els.modelStatus.textContent = `${c.short} is now using ${file.name}. It's saved in this browser.`;
    els.modelReset.hidden = false;
  } catch (e) {
    console.warn(e);
    els.modelStatus.textContent = `${file.name} couldn't be loaded. Make sure it's a valid .vrm or .glb file.`;
  }
}

async function reloadRig(c) {
  rigs.delete(c.id);
  const rig = await rigFor(c);
  if (current === c) stage.show(rig);
  drawPortraits(c.id);
}

// drag a model onto the stage = same as choosing it in the Notebook
['dragenter', 'dragover'].forEach((ev) => els.stage.addEventListener(ev, (e) => { e.preventDefault(); els.stage.classList.add('dropping'); }));
['dragleave', 'drop'].forEach((ev) => els.stage.addEventListener(ev, () => els.stage.classList.remove('dropping')));
els.stage.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = [...e.dataTransfer.files].find((x) => /\.(vrm|glb)$/i.test(x.name));
  if (f) useModel(current, f);
  else notice('Drop a .vrm or .glb file to give this character a new look.');
});

// voice
function setVoiceUI() {
  els.voiceToggle.setAttribute('aria-pressed', String(voice.enabled));
  els.voiceToggle.setAttribute('aria-label', voice.enabled ? 'Voice on' : 'Voice off');
  els.voiceToggle.title = voice.enabled ? 'Voice on' : 'Voice off';
  els.voiceToggle.querySelector('use').setAttribute('href', voice.enabled ? '#i-sound' : '#i-muted');
}
els.voiceToggle.addEventListener('click', () => {
  voice.enabled = !voice.enabled;
  if (!voice.enabled) voice.stop();
  write('toonlight:voice', voice.enabled ? 'on' : 'off');
  setVoiceUI();
});
els.hdToggle.addEventListener('click', async () => {
  voice.hd = !voice.hd;
  els.hdToggle.setAttribute('aria-pressed', String(voice.hd));
  write('toonlight:hd', voice.hd ? 'on' : 'off');
  if (!voice.hd) return;
  voice.audioContext().resume();
  els.hdToggle.textContent = 'Downloading…';
  try {
    await voice.loadHD((pct) => (els.hdToggle.textContent = `Downloading ${pct}%`));
    els.hdToggle.textContent = 'HD voices on';
  } catch (e) {
    console.warn(e);
    voice.hd = false;
    els.hdToggle.setAttribute('aria-pressed', 'false');
    els.hdToggle.textContent = 'HD voices';
    notice("HD voices couldn't download. The standard voices still work.");
  }
});
voice.onStatus = notice;

els.clear.addEventListener('click', () => {
  voice.stop();
  clearHistory(current.id, practice.mode);
  log = [];
  els.score.hidden = true;
  renderMessages();
  closeNotebook();
});

// microphone
const listener = new Listener({
  onInterim: (t) => { els.input.value = t; autoGrow(); },
  onFinal: (t) => send(t),
  onState: (on, err) => {
    els.mic.setAttribute('aria-pressed', String(on));
    if (on) voice.stop();
    if (err === 'not-allowed') bubble('system', 'Microphone access is blocked. Allow it in your browser’s site settings to talk out loud.');
  },
});
if (listener.supported) els.mic.addEventListener('click', () => listener.toggle());
else els.mic.hidden = true;

// menu bar
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
  const go = b.dataset.go;
  if (go === 'notebook') openNotebook();
  if (go === 'help') { els.help.hidden = false; $('close-help').focus(); }
  if (go === 'cast') els.cast.querySelector('[aria-pressed="true"]')?.focus();
  if (go === 'modes') els.modes.querySelector('[aria-selected="true"]')?.focus();
}));
$('close-help').addEventListener('click', () => (els.help.hidden = true));

const clock = $('clock');
const tick = () => (clock.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
tick();
setInterval(tick, 20000);

// ---------- start ----------

if (isDemo()) notice('Demo mode: the AI server isn’t connected, so characters can’t really answer yet.');
voice.enabled = read('toonlight:voice', 'on') !== 'off';
setVoiceUI();
if (read('toonlight:hd', 'off') === 'on') els.hdToggle.click();

buildCast();
buildModes();
setMode(practice.mode, { quiet: true });
select(location.hash.slice(1) || ROSTER[0].id);
window.addEventListener('hashchange', () => select(location.hash.slice(1)));
window.__toonlight = { stage, voice, memory, practice, get current() { return current; } };
