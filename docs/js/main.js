// main.js — wires everything together: cast, 3D stage, practice modes, chat, memory,
// the Notebook drawer, voice in/out, and your own 3D models.

import { ROSTER, byId } from './roster.js';
import { Stage, portrait } from './stage.js';
import { Voice } from './voice.js';
import { Listener } from './listen.js';
import { ask, isDemo } from './chat.js';
import { newId, listChats, loadMessages, saveLocal, removeLocal, renameLocal, migrateOld, titleFrom, groupLabel, pushChat, pullChats, deleteRemote, renameRemote, forgetAccount } from './history.js';
import { MODES, LANGS, modeById, langCode, AGENT_PROMPTS } from './modes.js';
import { loadMemory, saveMemory, remember, memoryPayload } from './memory.js';
import { saveModel, getModel, removeModel } from './models.js';
import { describe, loadContacts, saveContacts, loadReminders, saveReminders, when } from './actions.js';
import { ACCEPT, addDoc, getDoc, listDocs, removeDoc, passagesFor, quizPassage } from './docs.js';
import { letter, parseAnswer, askedBefore, rememberAsked, isRepeat, pickStyle } from './quiz.js';
import { saveImage, getImage } from './media.js';
import { oauthProviders, signInWith } from './auth.js';
import { authConfigured, getSession, signIn, signUp, signOut, resetPassword, setNewPassword, handleRedirect, onAuthChange } from './auth.js';

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
let chat = { meta: null, messages: [] };  // the open chat (meta is set once the first message is sent)
let log = chat.messages;                  // its messages
let busy = false;
const rigs = new Map();
const memory = loadMemory();
const practice = {                        // what we're practicing (shared across characters)
  mode: read('toonlight:mode', 'chat'),
  topic: '',
  lang: read('toonlight:lang', 'Spanish'),
  difficulty: read('toonlight:difficulty', 'medium'),
  useDoc: read('toonlight:usedoc', 'on') === 'on',
};
let activeDoc = null;                     // the document being studied (docs.js)
let signedIn = false;                     // Supabase session present (auth.js)
let sessionUser = null;                   // { id, email } of the signed-in account
let lastStyle = null;                     // last quiz question style, so the next one differs
const quizCards = new WeakMap();          // quiz entry → its card on screen
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
    // start downloading the model as soon as you point at (or touch) a character
    b.addEventListener('pointerenter', () => rigFor(c), { once: true });
    b.addEventListener('pointerdown', () => rigFor(c), { once: true });
    els.cast.append(b);
  }
  setTimeout(drawPortraits, 250);
}

async function drawPortraits(only) {
  for (const c of ROSTER) {
    if (only && c.id !== only) continue;
    const face = els.cast.querySelector(`[data-id="${c.id}"] .face`);
    // a ready-made picture, unless you've given this character your own model
    const pic = c.portrait && !(await getModel(c.id)) ? c.portrait : portrait(await makeRig(c));
    face.style.backgroundImage = `url(${pic})`;
    await new Promise((r) => setTimeout(r, 30));
  }
  renderChatList(); // the chat list shows these faces too
}

async function select(id, { keepChat = false } = {}) {
  const c = byId(id);
  if (current?.id === c.id) return;
  voice.stop();
  current = c;

  document.documentElement.style.setProperty('--tint', c.theme.tint);
  stage.setTheme(c.theme.tint, document.documentElement.dataset.theme !== 'light', document.documentElement.dataset.theme);
  els.name.textContent = c.name;
  els.kind.textContent = `${c.kind} character`;
  els.tagline.textContent = c.tagline;
  els.title.textContent = c.short;
  els.modelWho.textContent = c.short;
  els.cast.querySelectorAll('.card').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === c.id)));
  history.replaceState(null, '', `#${c.id}`);
  updateTitles();
  if (keepChat) renderMessages();
  else startNewChat();               // a different character = a new chat
  refreshModelStatus();

  const loading = setTimeout(() => current === c && els.stage.classList.add('loading'), 250);
  els.stage.dataset.loading = `Loading ${c.short}…`;
  const rig = await rigFor(c);
  clearTimeout(loading);
  if (current !== c) return;
  els.stage.classList.remove('loading');
  stage.show(rig);
  rig.setMood('happy');
  setTimeout(() => current === c && rig.gesture?.('wave'), 350);
  setTimeout(() => current === c && !busy && rig.setMood('neutral'), 2500);
}

function updateTitles() {
  const m = modeById(practice.mode);
  const quizDoc = practice.mode === 'quiz' && practice.useDoc && activeDoc;
  const detail = practice.mode === 'language' ? `${m.label} (${practice.lang})`
    : quizDoc ? `${m.label}: ${activeDoc.name} (${practice.difficulty})`
    : practice.mode === 'quiz' && practice.topic ? `${m.label}: ${practice.topic} (${practice.difficulty})`
    : practice.mode !== 'chat' && practice.topic ? `${m.label}: ${practice.topic}` : m.label;
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

function setMode(id, { quiet, keepChat } = {}) {
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
  const isQuiz = !!m.field?.quiz;
  $('mode-diff').hidden = !isQuiz;
  $('mode-diff').value = practice.difficulty;
  $('mode-usedoc-wrap').hidden = !(isQuiz && activeDoc);
  $('mode-usedoc').checked = practice.useDoc;
  if (isQuiz && activeDoc && practice.useDoc) els.setupField.placeholder = 'Optional: a part to focus on';
  renderDocBar();
  if (current && !quiet) {
    voice.stop();
    updateTitles();
    if (keepChat) renderMessages();
    else startNewChat();             // a different mode = a new chat
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
  if (m.field.quiz) {
    practice.difficulty = $('mode-diff').value;
    practice.useDoc = $('mode-usedoc').checked;
    write('toonlight:difficulty', practice.difficulty);
    write('toonlight:usedoc', practice.useDoc ? 'on' : 'off');
  }
  updateTitles();
  // a fresh chat for the new topic/language
  startNewChat();
  send(m.start({ ...practice, useDoc: practice.useDoc && !!activeDoc, docName: activeDoc?.name }));
});

// The site keeps the quiz score itself, from the answers you picked.
function quizScore(list = log) {
  let right = 0, total = 0;
  for (const m of list) if (m.quiz && m.quiz.picked != null) { total++; if (m.quiz.picked === m.quiz.answer) right++; }
  return { right, total };
}
function showScore() {
  const score = quizScore();
  if (practice.mode !== 'quiz' || !score.total) { els.score.hidden = true; return; }
  els.score.hidden = false;
  els.scoreNum.textContent = `${score.right}/${score.total}`;
  els.score.classList.remove('bump');
  void els.score.offsetWidth;
  els.score.classList.add('bump');
}

// ---------- chat ----------

// ---------- saved chats (the Chats sidebar) ----------

function startNewChat() {
  voice.stop();
  chat = { meta: null, messages: [] };
  log = chat.messages;
  els.score.hidden = true;
  if (current) { updateTitles(); renderMessages(); }
  renderChatList();
}

function makeMeta(firstText) {
  const extra = { topic: practice.topic, lang: practice.lang, docName: practice.mode === 'quiz' && practice.useDoc && activeDoc ? activeDoc.name : '' };
  return {
    id: newId(), character: current.id, mode: practice.mode,
    topic: practice.topic || '', lang: practice.mode === 'language' ? practice.lang : undefined,
    difficulty: practice.mode === 'quiz' ? practice.difficulty : undefined,
    useDoc: practice.mode === 'quiz' && practice.useDoc && !!activeDoc ? true : undefined,
    title: titleFrom(firstText, practice.mode, extra),
    created: Date.now(), updated: Date.now(), owner: sessionUser?.id || null,
  };
}

const pushTimers = new Map();
function persist(ch = chat) {
  if (!ch.meta) return;
  if (!ch.messages.length) { deleteChat(ch.meta.id, { keepOpen: true }); ch.meta = null; return; }
  ch.meta.updated = Date.now();
  saveLocal(ch.meta, ch.messages);
  renderChatList();
  // signed in: also save to your account (a moment later, so quick changes go in one save)
  if (ch.meta.owner && sessionUser?.id === ch.meta.owner) {
    clearTimeout(pushTimers.get(ch.meta.id));
    pushTimers.set(ch.meta.id, setTimeout(async () => {
      const s = await getSession();
      if (s && ch.meta && s.user?.id === ch.meta.owner) pushChat(s.access_token, ch.meta, ch.messages).catch((e) => console.warn('Chat not synced yet', e));
    }, 800));
  }
}

async function openChat(id) {
  const meta = listChats().find((c) => c.id === id);
  if (!meta || chat.meta?.id === id) { closeHistoryOverlay(); return; }
  voice.stop();
  chat = { meta, messages: loadMessages(id) };
  log = chat.messages;
  // put the stage back the way that chat was: its mode, topic, language, level
  setMode(meta.mode, { quiet: true });
  practice.topic = meta.topic || '';
  if (meta.lang) practice.lang = meta.lang;
  if (meta.difficulty) practice.difficulty = meta.difficulty;
  practice.useDoc = !!meta.useDoc;
  els.setupField.value = practice.topic;
  els.setupLang.value = practice.lang;
  $('mode-diff').value = practice.difficulty;
  $('mode-usedoc').checked = practice.useDoc;
  if (current?.id !== meta.character) await select(meta.character, { keepChat: true });
  updateTitles();
  showScore();
  renderMessages();
  renderChatList();
  closeHistoryOverlay();
}

async function deleteChat(id, { keepOpen = false } = {}) {
  const meta = listChats().find((c) => c.id === id);
  removeLocal(id);
  if (meta?.owner && sessionUser?.id === meta.owner) {
    const s = await getSession();
    if (s) deleteRemote(s.access_token, id).catch(() => {});
  }
  if (!keepOpen && chat.meta?.id === id) startNewChat();
  else renderChatList();
}

async function renameChat(id, title) {
  title = title.trim().slice(0, 80);
  if (!title) return renderChatList();
  const meta = renameLocal(id, title);
  if (chat.meta?.id === id) chat.meta.title = title;
  if (meta?.owner && sessionUser?.id === meta.owner) {
    const s = await getSession();
    if (s) renameRemote(s.access_token, id, title).catch(() => {});
  }
  renderChatList();
}

const MODE_LABEL = Object.fromEntries(MODES.map((m) => [m.id, m.label]));
function renderChatList() {
  const list = $('chat-list');
  if (!list) return;
  const q = $('chat-search').value.trim().toLowerCase();
  const chats = listChats().filter((c) => !q || c.title.toLowerCase().includes(q) || byId(c.character).short.toLowerCase().includes(q));
  list.replaceChildren();
  let group = null;
  for (const c of chats) {
    const g = groupLabel(c.updated);
    if (g !== group) {
      group = g;
      const h = document.createElement('p');
      h.className = 'chat-group';
      h.textContent = g;
      list.append(h);
    }
    list.append(chatItem(c));
  }
  if (!chats.length) {
    const p = document.createElement('p');
    p.className = 'chat-empty';
    p.textContent = q ? 'No chats match that.' : 'Your chats will show up here.';
    list.append(p);
  }
  $('history-note').textContent = sessionUser
    ? `Saved to your account, so they're on every device you sign in on.`
    : 'Saved in this browser. Sign in to keep them on all your devices.';
}

function chatItem(c) {
  const item = document.createElement('div');
  item.className = 'chat-item';
  item.setAttribute('role', 'button');
  item.tabIndex = 0;
  item.setAttribute('aria-current', String(chat.meta?.id === c.id));
  const face = document.createElement('span');
  face.className = 'chat-face';
  face.style.backgroundImage = els.cast.querySelector(`[data-id="${c.character}"] .face`)?.style.backgroundImage || '';
  const text = document.createElement('span');
  text.className = 'chat-text';
  const t = document.createElement('span');
  t.className = 'chat-title';
  t.textContent = c.title;
  const sub = document.createElement('span');
  sub.className = 'chat-sub';
  sub.textContent = `${byId(c.character).short} · ${MODE_LABEL[c.mode] || 'Chat'}`;
  text.append(t, sub);
  const tools = document.createElement('span');
  tools.className = 'chat-tools';
  const tool = (icon, label, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `${label}: ${c.title}`);
    b.title = label;
    b.innerHTML = `<svg class="ico"><use href="#${icon}"/></svg>`;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    tools.append(b);
  };
  tool('i-pencil', 'Rename', () => {
    const input = document.createElement('input');
    input.className = 'chat-rename';
    input.value = c.title;
    input.maxLength = 80;
    input.setAttribute('aria-label', 'Chat name');
    let done = false;
    const finish = (save) => { if (done) return; done = true; save ? renameChat(c.id, input.value) : renderChatList(); };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (e) => e.stopPropagation());
    text.replaceWith(input);
    tools.remove();
    input.focus();
    input.select();
  });
  tool('i-trash', 'Delete', () => {
    const ask = document.createElement('span');
    ask.className = 'chat-confirm';
    ask.textContent = 'Delete?';
    const yes = document.createElement('button');
    yes.type = 'button';
    yes.className = 'yes';
    yes.textContent = 'Delete';
    yes.addEventListener('click', (e) => { e.stopPropagation(); deleteChat(c.id); });
    const no = document.createElement('button');
    no.type = 'button';
    no.textContent = 'Keep';
    no.addEventListener('click', (e) => { e.stopPropagation(); renderChatList(); });
    ask.append(yes, no);
    tools.replaceWith(ask);
    no.focus();
  });
  item.append(face, text, tools);
  item.addEventListener('click', () => openChat(c.id));
  item.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === item) { e.preventDefault(); openChat(c.id); } });
  return item;
}

// show / hide the Chats column (on narrow screens it slides over the window)
const narrow = () => matchMedia('(max-width: 1280px)').matches;
function setHistoryOpen(open, { save = true } = {}) {
  $('panes').classList.toggle('with-history', open);
  $('history-toggle').setAttribute('aria-expanded', String(open));
  $('history-toggle').setAttribute('aria-label', open ? 'Hide chats' : 'Show chats');
  if (save && !narrow()) write('toonlight:history-open', open ? 'on' : 'off');
  stage.resize?.();
}
function closeHistoryOverlay() { if (narrow()) setHistoryOpen(false, { save: false }); }
$('history-toggle').addEventListener('click', () => setHistoryOpen(!$('panes').classList.contains('with-history')));
$('history-scrim').addEventListener('click', () => setHistoryOpen(false, { save: false }));
$('new-chat').addEventListener('click', () => { startNewChat(); closeHistoryOverlay(); els.input.focus(); });
$('new-chat-2').addEventListener('click', () => { startNewChat(); els.input.focus(); });
$('chat-search').addEventListener('input', renderChatList);

function greeting() {
  const m = modeById(practice.mode);
  if (practice.mode === 'agent') {
    return signedIn
      ? `${current.greeting} Agent mode is on: I can set reminders, add calendar events, write messages for WhatsApp, text or email, and find things to buy. You confirm everything with a button.`
      : `${current.greeting} Agent mode lets me do things for you, like reminders, calendar events and messages. Sign in first to unlock it.`;
  }
  if (practice.mode !== 'chat') {
    return practice.mode === 'language'
      ? `${current.greeting} Pick a language below and press Start, and I'll chat with you in it.`
      : `${current.greeting} ${m.note} Set it up below and press Start.`;
  }
  return memory.name ? `${current.greeting} Good to see you, ${memory.name}!` : current.greeting;
}

function bubble(role, text, { sources = [], who, fresh, memo, actions, made, entry } = {}) {
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
  if (role === 'assistant' && text) {
    const l = document.createElement('button');
    l.type = 'button';
    l.className = 'listen';
    l.setAttribute('aria-pressed', 'false');
    l.setAttribute('aria-label', 'Listen to this reply');
    l.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-play"/></svg><span>Listen</span>';
    l.addEventListener('click', () => listen(l, text));
    li.append(l);
  }
  if (entry?.steps?.length) li.insertBefore(stepsBox(entry.steps, true), b);
  for (const img of entry?.images || []) li.append(imageCard(img));
  if (entry?.quiz) li.append(quizCard(entry));
  for (const a of actions || []) {
    const card = actionCard(a, made);
    if (card) li.append(card);
  }
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
  for (const m of log) bubble(m.role, m.shown || m.text, { sources: m.sources, who: current.short, memo: m.memo, actions: m.actions, made: m.made, entry: m });
  if (practice.mode === 'agent' && !signedIn) els.messages.append(gateCard());
  renderSuggestions();
  updateComposer();
}

function renderSuggestions() {
  els.suggest.replaceChildren();
  const list = practice.mode === 'chat' ? current.prompts : practice.mode === 'agent' && signedIn ? AGENT_PROMPTS : [];
  if (log.length) return;
  for (const q of list) {
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

async function send(text, { shown, quizAnswer = false } = {}) {
  text = text.trim();
  if (!text || busy) return;
  // a typed "B" (or the option's words) while a quiz question is waiting = picking that option
  if (practice.mode === 'quiz' && !quizAnswer) {
    const open = [...log].reverse().find((m) => m.role === 'assistant' && m.quiz);
    if (open && open.quiz.picked == null) {
      const i = parseAnswer(text, open.quiz);
      if (i !== null) { els.input.value = ''; autoGrow(); answerQuiz(open, i); return; }
    }
  }
  if (practice.mode === 'agent' && !signedIn) { openAuth(); return; }
  busy = true;
  els.send.disabled = true;
  voice.stop();
  if (voice.hd) voice.audioContext().resume();

  const c = current, mode = practice.mode, ch = chat;
  const rig = await rigFor(c);
  if (!ch.meta) ch.meta = makeMeta(shown || text);
  ch.messages.push(shown ? { role: 'user', text, shown } : { role: 'user', text });
  persist(ch);
  bubble('user', shown || text, { fresh: true });
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
    const ctx = { mode, topic: practice.topic, lang: practice.lang, memory: memoryPayload(memory) };
    const quizDoc = mode === 'quiz' && practice.useDoc && activeDoc;
    const qKey = quizDoc ? `doc:${activeDoc.id}` : `topic:${practice.topic || 'general'}`;
    let used = null;
    let steps = null, liveImages = null;
    if (mode === 'agent') {
      ctx.auth = (await getSession())?.access_token;
      if (!ctx.auth) throw Object.assign(new Error('auth'), { status: 401, code: 'auth' });
      if (activeDoc) {
        const prev = [...log].reverse().find((m) => m.role === 'assistant')?.text || '';
        ctx.doc = { name: activeDoc.name, parts: passagesFor(activeDoc, text, prev.slice(0, 300)) };
      }
      // show each step as the agent works
      steps = [];
      liveImages = document.createElement('div');
      const box = stepsBox(steps, false);
      typing.querySelector('.bubble').replaceWith(box);
      typing.classList.remove('typing');
      typing.append(liveImages);
      ctx.onEvent = (ev) => {
        if (ev.type === 'step') steps.push({ tool: ev.tool, label: String(ev.label || ev.tool).slice(0, 120), state: 'run' });
        if (ev.type === 'step-done') { const st = steps.find((x) => x.tool === ev.tool && x.state === 'run'); if (st) st.state = ev.ok ? 'ok' : 'fail'; }
        if (ev.type === 'image' && ev.image?.data) liveImages.append(imageCard({ data: ev.image.data, prompt: ev.image.prompt }));
        box.refresh();
        els.messages.scrollTop = els.messages.scrollHeight;
        rig.gesture?.(ev.type === 'step' ? 'explain' : null);
      };
    }
    if (mode === 'chat' && activeDoc) {
      const prev = [...log].reverse().find((m) => m.role === 'assistant')?.text || '';
      ctx.doc = { name: activeDoc.name, parts: passagesFor(activeDoc, text, prev.slice(0, 300)) };
    }
    if (mode === 'quiz') {
      ctx.difficulty = practice.difficulty;
      ctx.avoid = askedBefore(qKey);
      if (quizDoc) {
        used = JSON.parse(read(`toonlight:docused:${activeDoc.id}`, '[]'));
        const pick = quizPassage(activeDoc, used, practice.topic);
        used.push(pick.index);
        ctx.doc = { name: activeDoc.name, parts: pick.parts };
      }
    }
    let reply;
    // in quizzes, if the AI repeats an old question anyway, ask once more in a different style
    for (let attempt = 0; attempt < 2; attempt++) {
      if (mode === 'quiz') ctx.style = lastStyle = pickStyle(lastStyle);
      reply = await ask(c, log, ctx);
      if (!(mode === 'quiz' && reply.quiz && isRepeat(qKey, reply.quiz.q))) break;
    }
    if (mode === 'quiz' && reply.quiz) {
      rememberAsked(qKey, reply.quiz.q);
      reply.quiz.level = practice.difficulty;
      if (used) write(`toonlight:docused:${activeDoc.id}`, JSON.stringify(used.slice(-60)));
    }
    const memo = [];
    for (const f of reply.remember || []) if (remember(memory, f)) memo.push(f);
    if (memo.length) { saveMemory(memory); renderMemory(); }
    const actions = reply.actions?.length ? reply.actions : undefined;
    const entry = { role: 'assistant', text: reply.text || (actions ? 'Here you go:' : reply.quiz ? (quizAnswer ? 'Next one:' : 'Here’s your question:') : '…'), sources: reply.sources, memo, actions, made: actions ? Date.now() : undefined };
    if (reply.quiz) entry.quiz = reply.quiz;
    if (steps?.length) entry.steps = steps.map(({ label, state }) => ({ label, ok: state !== 'fail' }));
    if (reply.images?.length) {
      entry.images = [];
      for (const img of reply.images) {
        const id = newId();
        await saveImage(id, img.data);
        entry.images.push({ id, prompt: String(img.prompt || '').slice(0, 300), data: img.data });
      }
    }
    ch.messages.push(entry);
    persist(ch);
    typing.remove();
    if (chat !== ch) return;   // you switched to another chat while this one was answering
    bubble('assistant', entry.text, { sources: entry.sources, who: c.short, fresh: true, memo, actions: entry.actions, made: entry.made, entry });
    showScore();
    rig.setMood(reply.mood);
    rig.thinking = false;
    const g = gestureFor(reply, entry.text);
    if (g) setTimeout(() => rig.gesture?.(g), 120);
    els.thought.hidden = true;
    busy = false;
    els.send.disabled = false;
    const { say, lang } = spokenPart(entry.quiz ? `${entry.text} ${entry.quiz.q}` : entry.text);
    await voice.speak(say, c.voice, lang);
  } catch (e) {
    typing.remove();
    ch.messages.pop();
    persist(ch);
    if (e.code === 'auth') {
      if (e.status === 401) await signOut(); // the sign-in expired or was rejected
      bubble('system', 'Please sign in again to use Agent mode.');
      openAuth();
    } else bubble('system', ERRORS[e.status] || `The AI server had a hiccup (${e.message}). Try again in a moment.`);
    if (!quizAnswer) els.input.value = text;
    rig.setMood('sad');
  } finally {
    rig.thinking = false;
    els.thought.hidden = true;
    busy = false;
    els.send.disabled = false;
    setTimeout(() => !busy && !voice.speaking && rig.setMood('neutral'), 3500);
  }
}

// ---------- agent steps and pictures ----------

// The list of what the agent did ("Searching the web for…" ✓). Live while it works, folded up afterwards.
function stepsBox(steps, done) {
  const box = document.createElement(done ? 'details' : 'div');
  box.className = `steps${done ? '' : ' live'}`;
  const head = document.createElement(done ? 'summary' : 'p');
  head.className = 'steps-head';
  const ol = document.createElement('ol');
  box.append(head, ol);
  box.refresh = () => {
    head.textContent = done ? `Worked through ${steps.length} step${steps.length === 1 ? '' : 's'}` : steps.length ? 'Working on it…' : 'Thinking about how to do this…';
    ol.replaceChildren(...steps.map((st) => {
      const li = document.createElement('li');
      const state = done ? (st.ok ? 'ok' : 'fail') : st.state;
      li.className = `step ${state}`;
      li.textContent = st.label;
      return li;
    }));
  };
  box.refresh();
  return box;
}

function imageCard(img) {
  const fig = document.createElement('figure');
  fig.className = 'gen-image';
  const pic = document.createElement('img');
  pic.alt = img.prompt ? `Picture: ${img.prompt}` : 'Picture made by the agent';
  pic.loading = 'lazy';
  const cap = document.createElement('figcaption');
  const save = document.createElement('a');
  save.className = 'btn btn-small';
  save.textContent = 'Save image';
  save.download = 'toonlight-image.jpg';
  const show = (src) => { pic.src = src; save.href = src; };
  if (img.data) show(img.data);
  else if (img.id) getImage(img.id).then((src) => (src ? show(src) : (cap.textContent = 'This picture was made on another device.')));
  if (!cap.textContent) cap.append(save);
  fig.append(pic, cap);
  return fig;
}

// ---------- quiz cards ----------

function quizCard(entry) {
  const q = entry.quiz;
  const card = document.createElement('div');
  card.className = 'quiz';
  const h = document.createElement('p');
  h.className = 'quiz-q';
  h.textContent = q.q;
  const ul = document.createElement('ul');
  ul.className = 'quiz-opts';
  const buttons = q.options.map((o, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'quiz-opt';
    b.innerHTML = '<b></b><span></span>';
    b.firstChild.textContent = letter(i);
    b.lastChild.textContent = o;
    b.addEventListener('click', () => answerQuiz(entry, i));
    li.append(b);
    ul.append(li);
    return b;
  });
  const result = document.createElement('div');
  result.className = 'quiz-result';
  result.setAttribute('aria-live', 'polite');
  card.append(h, ul, result);
  if (q.level) {
    const meta = document.createElement('p');
    meta.className = 'quiz-meta';
    meta.textContent = `${q.level[0].toUpperCase()}${q.level.slice(1)} · type a letter or tap an answer`;
    card.append(meta);
  }
  const paint = () => {
    if (q.picked == null) return;
    buttons.forEach((b, i) => {
      b.disabled = true;
      if (i === q.answer) b.classList.add('right');
      else if (i === q.picked) b.classList.add('wrong');
    });
    const ok = q.picked === q.answer;
    result.replaceChildren();
    const s = document.createElement('strong');
    s.textContent = ok ? 'Correct!' : `Not quite. The answer is ${letter(q.answer)}.`;
    const ex = document.createElement('span');
    ex.textContent = q.explain || '';
    result.append(s, ex);
  };
  paint();
  quizCards.set(entry, paint);
  return card;
}

// You picked option i: the site checks it, updates the score, then asks for the next question.
async function answerQuiz(entry, i) {
  const q = entry.quiz;
  if (busy || q.picked != null) return;
  q.picked = i;
  persist();
  quizCards.get(entry)?.();
  showScore();
  const ok = i === q.answer;
  const rig = await rigFor(current);
  rig.setMood(ok ? 'happy' : 'sad');
  rig.gesture?.(ok ? 'tada' : 'shrug');
  const verdict = ok ? 'correct' : `wrong; the right answer was ${letter(q.answer)}. ${q.options[q.answer]}`;
  send(`My answer: ${letter(i)}. ${q.options[i]} (${verdict}). Next question, please.`, { shown: `${letter(i)}. ${q.options[i]}`, quizAnswer: true });
}

// ---------- documents ----------

function renderDocBar() {
  const show = !!activeDoc && (practice.mode === 'chat' || (practice.mode === 'quiz' && practice.useDoc));
  $('doc-bar').hidden = !show;
  if (activeDoc) $('doc-name').textContent = `Studying: ${activeDoc.name}`;
}

async function useDoc(doc) {
  activeDoc = doc;
  write('toonlight:doc', doc ? doc.id : '');
  renderDocBar();
  if (current) { setMode(practice.mode, { quiet: true }); updateTitles(); }
}

$('doc-file').accept = ACCEPT;
$('doc-file').addEventListener('change', async () => {
  const f = $('doc-file').files[0];
  $('doc-file').value = '';
  if (!f) return;
  $('attach').classList.add('busy');
  notice(`Reading ${f.name}…`);
  try {
    const doc = await addDoc(f, (pct) => notice(`Reading ${f.name}… ${pct}%`));
    notice('');
    if (practice.mode !== 'chat' && practice.mode !== 'quiz') setMode('chat');
    await useDoc(doc);
    const where = doc.pages > 1 ? ` (${doc.pages} ${/\.pptx$/i.test(doc.name) ? 'slides' : 'pages'})` : '';
    bubble('assistant', `I've studied "${doc.name}"${where}. Ask me anything about it, or go to Quiz me and tick "From my document" to get quizzed on it.`, { who: current.short, fresh: true });
    const rig = await rigFor(current);
    rig.setMood('happy');
    rig.gesture?.('tada');
    renderDocs();
  } catch (e) {
    console.warn(e);
    notice(e.message || `Couldn't read ${f.name}.`);
  } finally {
    $('attach').classList.remove('busy');
  }
});
$('doc-off').addEventListener('click', () => useDoc(null));

async function renderDocs() {
  const list = $('docs-list'), docs = await listDocs();
  list.replaceChildren();
  for (const d of docs) {
    const li = document.createElement('li');
    const s = document.createElement('span');
    s.textContent = `${d.name} · ${d.size > 1048576 ? `${(d.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(d.size / 1024))} KB`}`;
    const use = document.createElement('button');
    use.type = 'button';
    use.className = 'use';
    const on = activeDoc?.id === d.id;
    use.textContent = on ? 'In use' : 'Use';
    use.disabled = on;
    use.addEventListener('click', async () => { await useDoc(await getDoc(d.id)); renderDocs(); });
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.setAttribute('aria-label', `Delete ${d.name}`);
    x.addEventListener('click', async () => {
      await removeDoc(d.id);
      if (activeDoc?.id === d.id) await useDoc(null);
      renderDocs();
    });
    li.append(s, use, x);
    list.append(li);
  }
  $('docs-empty').hidden = docs.length > 0;
}

// ---------- sign in (Supabase) & Agent mode ----------

function gateCard() {
  const li = document.createElement('li');
  li.className = 'msg system';
  const g = document.createElement('div');
  g.className = 'gate';
  const h = document.createElement('h3');
  h.textContent = 'Sign in to use Agent mode';
  const p = document.createElement('p');
  p.textContent = authConfigured()
    ? 'Agent mode can set reminders, add calendar events, write messages and find things to buy. It needs a free account so only you can use it.'
    : 'Sign-in isn’t set up on this site yet.';
  g.append(h, p);
  if (authConfigured()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-small btn-accent';
    b.textContent = 'Sign in or create an account';
    b.addEventListener('click', () => openAuth());
    g.append(b);
  }
  li.append(g);
  return li;
}

function updateComposer() {
  const locked = practice.mode === 'agent' && !signedIn;
  els.input.disabled = locked;
  els.send.disabled = locked || busy;
  els.input.placeholder = locked ? 'Sign in to use Agent mode' : els.input.placeholder.replace('Sign in to use Agent mode', `Message ${current?.short || ''}…`);
}

let authState = 'signin';
function setAuthState(st, msg = '', err = false) {
  authState = st;
  const t = { signin: 'Sign in', signup: 'Create your account', forgot: 'Reset your password', reset: 'Choose a new password' }[st];
  $('auth-title').textContent = t;
  $('auth-submit').textContent = { signin: 'Sign in', signup: 'Create account', forgot: 'Send reset link', reset: 'Save password' }[st];
  $('auth-sub').textContent = st === 'forgot' ? 'We’ll email you a link to choose a new password.'
    : st === 'reset' ? 'Type a new password for your account.'
    : 'Sign in to unlock Agent mode: reminders, calendar events, messages and shopping.';
  $('auth-email').closest('.field').hidden = st === 'reset';
  $('auth-email').required = st !== 'reset';
  $('auth-pass-wrap').hidden = st === 'forgot';
  $('oauth').classList.toggle('off', st === 'forgot' || st === 'reset');
  $('auth-pass').required = st !== 'forgot';
  $('auth-pass').autocomplete = st === 'signin' ? 'current-password' : 'new-password';
  $('auth-switch').textContent = st === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in';
  $('auth-forgot').hidden = st !== 'signin';
  const m = $('auth-msg');
  m.textContent = msg;
  m.classList.toggle('err', err);
}

function openAuth(state) {
  els.help.hidden = true;
  $('auth').hidden = false;
  $('auth-out').hidden = signedIn && state !== 'reset';
  $('auth-in').hidden = !signedIn || state === 'reset';
  if (!signedIn || state === 'reset') setAuthState(state || 'signin');
  setTimeout(() => (signedIn && state !== 'reset' ? $('auth-agent') : $(state === 'reset' ? 'auth-pass' : 'auth-email')).focus(), 30);
}
const closeAuth = () => { $('auth').hidden = true; };
$('account-btn').addEventListener('click', () => openAuth());
// Google / GitHub / Facebook buttons: only the ones switched on in Supabase are shown
oauthProviders().then((list) => {
  for (const b of document.querySelectorAll('.oauth-btn')) {
    b.hidden = !list.includes(b.dataset.provider);
    b.addEventListener('click', () => {
      write('toonlight:return', JSON.stringify({ character: current?.id, mode: practice.mode }));
      b.disabled = true;
      signInWith(b.dataset.provider);
    });
  }
  $('oauth').hidden = !list.length;
});
$('auth-close').addEventListener('click', closeAuth);
$('auth-switch').addEventListener('click', () => setAuthState(authState === 'signin' ? 'signup' : 'signin'));
$('auth-forgot').addEventListener('click', () => setAuthState('forgot'));
$('auth-signout').addEventListener('click', async () => { await signOut(); closeAuth(); });
$('auth-agent').addEventListener('click', () => { closeAuth(); setMode('agent'); });
$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!authConfigured()) { setAuthState(authState, 'Sign-in isn’t set up on this site yet.', true); return; }
  const email = $('auth-email').value.trim(), pass = $('auth-pass').value;
  const btn = $('auth-submit');
  btn.disabled = true;
  try {
    if (authState === 'signin') { await signIn(email, pass); closeAuth(); }
    else if (authState === 'signup') {
      const r = await signUp(email, pass);
      if (r.signedIn) closeAuth();
      else setAuthState('signin', `Almost done! We sent a confirmation link to ${email}. Click it, and you'll come back here signed in.`);
    } else if (authState === 'forgot') {
      await resetPassword(email);
      setAuthState('signin', `If ${email} has an account, a reset link is on its way.`);
    } else if (authState === 'reset') {
      await setNewPassword(pass);
      closeAuth();
      notice('Your new password is saved.');
    }
    $('auth-pass').value = '';
  } catch (err) {
    setAuthState(authState, err.message, true);
  } finally {
    btn.disabled = false;
  }
});

onAuthChange(async (s) => {
  const before = sessionUser;
  signedIn = !!s;
  sessionUser = s?.user || null;
  $('account-label').textContent = s ? s.user?.email || 'Account' : 'Sign in';
  $('account-btn').classList.toggle('in', signedIn);
  $('auth-who').textContent = s?.user?.email || '';
  if (before && !sessionUser) {
    // signed out: this account's chats leave this browser
    forgetAccount(before.id);
    if (chat.meta?.owner === before.id) startNewChat();
  }
  if (sessionUser && sessionUser.id !== before?.id) syncChats();
  renderChatList();
  if (current && practice.mode === 'agent') renderMessages();
});

// Bring your account's chats into this browser.
async function syncChats() {
  const s = await getSession();
  if (!s?.user) return;
  try { if (await pullChats(s.access_token, s.user.id)) renderChatList(); } catch (e) { console.warn('Could not load your saved chats', e); }
}

// Body language to go with a reply (talking with the hands happens on its own while speaking).
function gestureFor(reply, text) {
  if (reply.actions?.length) return 'explain';
  if (/^(hi|hey|hello|hiya|howdy|good (morning|afternoon|evening))\b/i.test(text)) return 'wave';
  switch (reply.mood) {
    case 'happy': return Math.random() < 0.5 ? 'tada' : 'both';
    case 'surprised': return 'surprised';
    case 'angry': return 'hips';
    case 'sad': return /not sure|don.t know|no idea|can.t|unfortunately/i.test(text) ? 'shrug' : null;
    default: return voice.enabled ? null : (Math.random() < 0.5 ? 'explain' : null);
  }
}

// ---------- actions: the card under a reply ----------

function actionCard(a, made) {
  const d = describe(a, made || Date.now(), { addReminder, hasReminder: (id) => reminders.some((r) => r.id === id) });
  if (!d) return null;
  const card = document.createElement('div');
  card.className = 'action';
  const k = document.createElement('p');
  k.className = 'action-kind';
  k.textContent = d.kind;
  const t = document.createElement('p');
  t.className = 'action-title';
  t.textContent = d.title;
  card.append(k, t);
  if (d.detail) {
    const p = document.createElement('p');
    p.className = 'action-detail';
    p.textContent = d.detail;
    card.append(p);
  }
  if (d.preview) {
    const pre = document.createElement('pre');
    pre.className = 'action-preview';
    pre.textContent = d.preview;
    card.append(pre);
  }
  let body = null;
  if (d.body !== undefined) {
    // the message is editable before you send it
    body = document.createElement('textarea');
    body.className = 'action-body';
    body.value = d.body;
    body.rows = Math.min(6, Math.max(2, Math.ceil(d.body.length / 42)));
    body.setAttribute('aria-label', 'Message (you can edit it)');
    card.append(body);
  }
  const row = document.createElement('div');
  row.className = 'action-buttons';
  for (const b of d.buttons) {
    const el = b.run ? document.createElement('button') : document.createElement('a');
    el.className = `btn btn-small${b.primary ? ' btn-accent' : ''}`;
    el.textContent = b.label;
    if (b.run) {
      el.type = 'button';
      el.disabled = !!b.done;
      el.addEventListener('click', () => b.run(el));
    } else if (b.download) {
      el.href = '#';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const url = URL.createObjectURL(b.download);
        const tmp = Object.assign(document.createElement('a'), { href: url, download: b.filename });
        tmp.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      });
    } else {
      el.href = b.href || '#';
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
      if (b.hrefFrom) {
        const update = () => (el.href = b.hrefFrom(body ? body.value : d.body || ''));
        update();
        body?.addEventListener('input', update);
        // mailto/sms open an app; don't leave an empty tab behind
        if (!el.href.startsWith('https:')) el.removeAttribute('target');
      }
    }
    row.append(el);
  }
  card.append(row);
  if (d.note) {
    const n = document.createElement('p');
    n.className = 'action-note';
    n.textContent = d.note;
    card.append(n);
  }
  return card;
}

// ---------- reminders (work while this site is open in a tab) ----------

let reminders = loadReminders();
const timers = new Map();

async function addReminder(r) {
  if (!reminders.some((x) => x.id === r.id)) reminders.push({ ...r, done: false });
  saveReminders(reminders);
  if ('Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch {}
  }
  scheduleReminders();
  renderReminders();
  return true;
}

function scheduleReminders() {
  for (const r of reminders) {
    if (r.done || timers.has(r.id)) continue;
    const ms = r.at - Date.now();
    if (ms > 2 ** 31 - 1) continue; // more than 24 days away: checked again on the next visit
    timers.set(r.id, setTimeout(() => fireReminder(r), Math.max(0, ms)));
  }
}

function chime() {
  try {
    const ctx = voice.audioContext();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.22);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.22 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.22 + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.22);
      o.stop(ctx.currentTime + i * 0.22 + 0.55);
    });
  } catch {}
}

async function fireReminder(r, { late = false } = {}) {
  timers.delete(r.id);
  if (r.done) return;
  r.done = true;
  saveReminders(reminders);
  renderReminders();
  const msg = late ? `Reminder (was due ${when(new Date(r.at))}): ${r.text}` : `⏰ Reminder: ${r.text}`;
  bubble('system', msg, { fresh: true });
  chime();
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification('Toonlight reminder', { body: r.text, tag: r.id }); } catch {}
  }
  const rig = current && (await rigFor(current));
  rig?.gesture?.('wave');
  if (!late && voice.enabled) voice.speak(`Hey, just a reminder: ${r.text}`, current.voice);
}

function renderReminders() {
  const list = $('reminders'), empty = $('reminders-empty');
  if (!list) return;
  list.replaceChildren();
  const upcoming = reminders.filter((r) => !r.done).sort((a, b) => a.at - b.at);
  for (const r of upcoming) {
    const li = document.createElement('li');
    const s = document.createElement('span');
    s.textContent = `${r.text} · ${when(new Date(r.at))}`;
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.setAttribute('aria-label', `Cancel reminder: ${r.text}`);
    x.addEventListener('click', () => {
      clearTimeout(timers.get(r.id));
      timers.delete(r.id);
      reminders = reminders.filter((y) => y.id !== r.id);
      saveReminders(reminders);
      renderReminders();
    });
    li.append(s, x);
    list.append(li);
  }
  empty.hidden = upcoming.length > 0;
}

// ---------- contacts (only in this browser; used to fill in WhatsApp / text / email) ----------

let contacts = loadContacts();
function renderContacts() {
  const list = $('contacts'), empty = $('contacts-empty');
  list.replaceChildren();
  contacts.forEach((c, i) => {
    const li = document.createElement('li');
    const s = document.createElement('span');
    s.textContent = [c.name, c.phone, c.email].filter(Boolean).join(' · ');
    const x = document.createElement('button');
    x.type = 'button';
    x.textContent = '×';
    x.setAttribute('aria-label', `Remove ${c.name}`);
    x.addEventListener('click', () => { contacts.splice(i, 1); saveContacts(contacts); renderContacts(); });
    li.append(s, x);
    list.append(li);
  });
  empty.hidden = contacts.length > 0;
}
$('contact-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('contact-name').value.trim(), how = $('contact-how').value.trim();
  if (!name || !how) return;
  const entry = { name };
  if (how.includes('@')) entry.email = how; else entry.phone = how;
  contacts = contacts.filter((c) => c.name.toLowerCase() !== name.toLowerCase());
  contacts.push(entry);
  saveContacts(contacts);
  $('contact-name').value = '';
  $('contact-how').value = '';
  renderContacts();
});

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
  renderReminders();
  renderContacts();
  renderDocs();
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
  if (!$('auth').hidden) closeAuth();
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
// Chat only (quiet, press Listen on a reply to hear it) vs Voice (every reply read aloud)
function setSpeak(on, { save = true } = {}) {
  voice.enabled = on;
  if (!on) voice.stop();
  if (save) write('toonlight:speak', on ? 'on' : 'off');
  $('mode-voice').setAttribute('aria-pressed', String(on));
  $('mode-text').setAttribute('aria-pressed', String(!on));
  els.voiceToggle.setAttribute('aria-pressed', String(on));
  els.voiceToggle.setAttribute('aria-label', on ? 'Voice replies on' : 'Chat only (voice off)');
  els.voiceToggle.title = on ? 'Voice replies on' : 'Chat only';
  els.voiceToggle.querySelector('use').setAttribute('href', on ? '#i-sound' : '#i-muted');
}
els.voiceToggle.addEventListener('click', () => setSpeak(!voice.enabled));
$('mode-voice').addEventListener('click', () => { unlockAudio(); setSpeak(true); });
$('mode-text').addEventListener('click', () => setSpeak(false));

// Listen button on a reply: plays just that reply, even in chat-only mode
let playing = null;
async function listen(btn, text) {
  if (playing === btn) { voice.stop(); return; }
  if (playing) playing.setAttribute('aria-pressed', 'false');
  playing = btn;
  btn.setAttribute('aria-pressed', 'true');
  btn.lastChild.textContent = 'Stop';
  unlockAudio();
  const { say, lang } = spokenPart(text);
  try { await voice.speak(say, current.voice, lang, { force: true }); } finally {
    btn.setAttribute('aria-pressed', 'false');
    btn.lastChild.textContent = 'Listen';
    if (playing === btn) playing = null;
  }
}

// Themes: light (paper), dark (charcoal), black (true black), glass (frosted panels)
const THEMES = { light: '#E9DFCC', dark: '#0F0F11', black: '#000000', glass: '#0d1020' };
function setTheme(theme, { save = true } = {}) {
  if (!THEMES[theme]) theme = 'light';
  document.documentElement.dataset.theme = theme;
  if (save) write('toonlight:theme', theme);
  document.querySelector('meta[name="theme-color"]').content = THEMES[theme];
  document.querySelectorAll('[data-theme-pick]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themePick === theme)));
  if (current) stage.setTheme(current.theme.tint, theme !== 'light', theme);
}
const themeMenu = $('theme-menu');
function toggleThemeMenu(open = themeMenu.hidden) {
  themeMenu.hidden = !open;
  $('theme-toggle').setAttribute('aria-expanded', String(open));
  if (open) themeMenu.querySelector('[aria-checked="true"]')?.focus();
}
$('theme-toggle').addEventListener('click', (e) => { e.stopPropagation(); toggleThemeMenu(); });
themeMenu.addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme-pick]');
  if (!b) return;
  setTheme(b.dataset.themePick);
  toggleThemeMenu(false);
  $('theme-toggle').focus();
});
document.addEventListener('click', (e) => { if (!themeMenu.hidden && !e.target.closest('.theme-wrap')) toggleThemeMenu(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !themeMenu.hidden) toggleThemeMenu(false); });
// Natural voices: on by default on computers. The model (~90 MB, downloaded once, then cached)
// loads quietly in the background; until it's ready, the browser's own voice is used.
async function setNatural(on, { auto } = {}) {
  voice.hd = on;
  els.hdToggle.setAttribute('aria-pressed', String(on));
  if (!auto) write('toonlight:hd', on ? 'on' : 'off');
  if (!on) { els.hdToggle.textContent = 'Natural voices: off'; return; }
  els.hdToggle.textContent = 'Natural voices: loading…';
  try {
    await voice.loadHD((pct) => { if (voice.hd) els.hdToggle.textContent = `Natural voices: ${pct}%`; });
    if (voice.hdSlow) {
      els.hdToggle.textContent = 'Natural voices: too slow here';
      els.hdToggle.title = 'This device generates the natural voice slower than real time, so the browser voice is used. Microsoft Edge has natural-sounding built-in voices.';
    } else if (voice.hd) els.hdToggle.textContent = 'Natural voices: on';
  } catch (e) {
    console.warn(e);
    voice.hd = false;
    els.hdToggle.setAttribute('aria-pressed', 'false');
    els.hdToggle.textContent = 'Natural voices: off';
    if (!auto) notice("Natural voices couldn't download. The standard voices still work.");
  }
}
els.hdToggle.addEventListener('click', () => {
  if (voice.hd) voice.audioContext?.().resume?.();
  setNatural(!voice.hd);
});
voice.onStatus = notice;

els.clear.addEventListener('click', () => {
  voice.stop();
  if (chat.meta) deleteChat(chat.meta.id);
  else startNewChat();
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

// browsers only allow sound after the first click or key press
function unlockAudio() { try { voice.audioContext().resume(); } catch {} }
addEventListener('pointerdown', unlockAudio, { once: true });
addEventListener('keydown', unlockAudio, { once: true });

// ---------- start ----------

if (isDemo()) notice('Demo mode: the AI server isn’t connected, so characters can’t really answer yet.');
setSpeak(read('toonlight:speak', 'off') === 'on', { save: false });   // default: chat only
setTheme(document.documentElement.dataset.theme || 'light', { save: false });
{
  // default: on for computers, off for phones/data saver (the download is ~90 MB)
  const pref = read('toonlight:hd', 'auto');
  const lowData = navigator.connection?.saveData || matchMedia('(pointer: coarse)').matches;
  if (pref === 'on' || (pref === 'auto' && !lowData)) setNatural(true, { auto: pref === 'auto' });
  else els.hdToggle.textContent = 'Natural voices: off';
}

// reminders that came due while the site was closed
for (const r of reminders) if (!r.done && r.at < Date.now()) setTimeout(() => fireReminder(r, { late: true }), 1500);
scheduleReminders();
setInterval(scheduleReminders, 6 * 3600 * 1000);

{
  const back = await handleRedirect();
  const s = await getSession();
  signedIn = !!s;
  sessionUser = s?.user || null;
  $('account-label').textContent = s ? s.user?.email || 'Account' : 'Sign in';
  $('account-btn').classList.toggle('in', signedIn);
  $('auth-who').textContent = s?.user?.email || '';
  if (!authConfigured()) $('account-btn').hidden = true;
  if (back === 'recovery') setTimeout(() => openAuth('reset'), 400);
  else if (back === 'signup') setTimeout(() => notice(`You're signed in${s?.user?.email ? ` as ${s.user.email}` : ''}. Agent mode is unlocked.`), 400);
  else if (back?.startsWith('error:')) setTimeout(() => notice(`Sign-in link problem: ${back.slice(6)}. Try again.`), 400);
  // coming back from Google/GitHub/Facebook: return to where you were
  try {
    const ret = JSON.parse(read('toonlight:return', 'null'));
    localStorage.removeItem('toonlight:return');
    if (ret && back) {
      if (ret.character && !location.hash) history.replaceState(null, '', `#${ret.character}`);
      if (ret.mode && MODES.some((m) => m.id === ret.mode)) practice.mode = ret.mode;
    }
  } catch {}
  const docId = read('toonlight:doc', '');
  if (docId) activeDoc = await getDoc(docId);
}

// chats saved before the sidebar existed move into it; every visit then starts a new chat
migrateOld();
setHistoryOpen(!narrow() && read('toonlight:history-open', 'on') === 'on', { save: false });
buildCast();
buildModes();
setMode(practice.mode, { quiet: true });
select(location.hash.slice(1) || ROSTER[0].id);
renderChatList();
if (sessionUser) syncChats();
window.addEventListener('hashchange', () => select(location.hash.slice(1)));
matchMedia('(max-width: 1280px)').addEventListener('change', (e) => setHistoryOpen(!e.matches && read('toonlight:history-open', 'on') === 'on', { save: false }));
window.__toonlight = { stage, voice, memory, practice, get current() { return current; }, get chat() { return chat; } };
