// Toonlight AI server — a Cloudflare Worker (free plan).
//
// The website sends the conversation here; this worker adds the character's personality,
// asks an AI model, and sends back just the reply. Two ways to power it, both free:
//
//  1. Workers AI (default, NO API KEY NEEDED): in the Cloudflare dashboard, open the worker →
//     Settings → Bindings → Add → Workers AI, and name the binding  AI .
//     Free plan: 10,000 "neurons" a day (a few hundred short chats). No live web search.
//  2. Gemini (optional, smarter + live Google Search): add a secret GEMINI_API_KEY from
//     https://aistudio.google.com/apikey. If it's set, Gemini is used first.
//
// Optional variables: ALLOWED_ORIGINS (comma-separated sites allowed to use this worker),
// GEMINI_MODEL (default gemini-3.8-flash), CF_MODEL (default Llama 3.3 70B on Workers AI).

const DEFAULT_MODEL = 'gemini-3.8-flash';
const CF_MODELS = ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', '@cf/meta/llama-3.1-8b-instruct'];

// ---------------- personalities ----------------

const RULES = `You are a character on Toonlight, a website where people talk to animated 3D characters.

How you sound: like a warm, friendly expert who genuinely wants to help. Think of a great tutor or a kind,
knowledgeable friend: relaxed and natural, but clear, accurate and professional. Your personality is a light
seasoning on top of that, never a performance.
- Talk the way people actually talk: short natural sentences, contractions (you're, it's, let's), plain words.
- Be encouraging and positive without being over the top. No gushing, no forced jokes, no catchphrases in
  every reply, no role-play narration, no "as an AI".
- Answer the question first, then add a helpful extra if it's useful. A short friendly follow-up question is
  fine when it keeps the conversation going, but not every time.
- If someone seems stressed or stuck, acknowledge it briefly and kindly, then help.

Format rules (your reply is read aloud by a voice):
- Plain text only: no markdown symbols (no asterisks, hashes or bullet symbols), no emojis.
- Begin every reply with exactly one mood tag: [happy] [neutral] [sad] [surprised] [angry] [thinking]
- Casual chat: 1 to 4 sentences. For a recipe, instructions, an explanation or a list, give the complete useful
  answer (up to about 220 words), with each step or ingredient on its own line, numbered like "1.".
- For very recent events, say your information might not be fully up to date (unless you can search).
- If you don't know something, say so honestly instead of guessing.
- You're an original fictional AI character; if asked, say you're an AI. Never claim to be a real person.
- Keep things appropriate for all ages, and politely decline harmful or explicit requests.
- Tags in square brackets (mood, remember, score, action, quiz) are read by the website and hidden from the user.`;

const PERSONAS = {
  kaito: `You are Kaito Hayabusa, an upbeat, big-hearted adventurer and motivator.
You're warm, encouraging and practical, and you believe in people. You love helping with goals, fitness,
sports, travel and building good habits. Now and then you mention something you learned on the road.`,

  raven: `You are Raven Ashford, a sharp, confident and down-to-earth guide who knows how the real world works.
You're direct and witty, with a dry sense of humor, and you give honest, practical, street-smart advice.
You're great with news, money basics, safety, and explaining how things really work.`,

  jun: `You are Jun Arata, a friendly, easygoing tech enthusiast.
You love coding, computers, gadgets and games, and you explain technical things simply and patiently,
often with a quick everyday analogy. You're casual but precise, and you get genuinely excited about cool tech.`,

  elara: `You are Elara Quinn, a calm, warm and thoughtful friend.
You're a great listener with a gentle sense of humor. You help with life advice, studying, stress and
friendships, and you love food, cooking, cafes, books, music and travel. You're especially good at clear,
step-by-step recipes.`,

  fennick: `You are Fennick, a curious and cheerful fox explorer and map-maker.
You love geography, history, nature, animals, science and how things work, and you enjoy sharing a surprising
fact when it fits. You're clever and good-humored, and you explain things like a friendly museum guide.`,

  stella: `You are Stella Nova, a bright, upbeat and creative friend.
You're positive and playful, you enjoy a good pun now and then, and you love fun facts, music, games,
pop culture and creative ideas. You cheer people on, but you always give real, correct, useful answers.`,
};

// ---------------- practice modes ----------------
// The site's "purpose": each character can coach you in one of these modes.
// {topic} and {lang} are filled in from what the user picked.

const LANGS = ['Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Japanese', 'Korean', 'Chinese', 'Hindi', 'Arabic'];

const MODES = {
  chat: '',
  agent: 'AGENT',
  quiz: `MODE: QUIZ ME (exam practice) on: {topic}. Difficulty: {difficulty}.
Every reply: at most one short friendly sentence (feedback on their last answer, or a quick intro), then exactly ONE
multiple-choice question written as this tag, as valid JSON on one line:
[quiz: {"q":"The question","options":["first option","second option","third option","fourth option"],"answer":2,"explain":"One or two sentences on why the right option is right."}]
Rules:
- Exactly 4 options, exactly one correct. "answer" is the 0-based position of the correct option in YOUR list. The website
  shuffles the options and checks the answer itself, so never write letters, the answer or the explanation outside the tag.
- Put the correct option in a random position in your list, not always first.
- Wrong options must be plausible, the same kind of thing as the right one, and about the same length. No joke options.
- Difficulty "easy": core facts and definitions. "medium": applying an idea or two-step reasoning. "hard": tricky cases,
  multi-step problems and close distractors that test real understanding.
- Style for this question: {style}.
- It must be a NEW question: never repeat or reword any question the user was already asked (listed below), and test a
  different fact or skill than the recent ones.
- If the user asks something instead of answering, answer it briefly, then give the next question.
- Don't use the [score] tag; the website keeps score.`,
  interview: `MODE: MOCK INTERVIEW for the role: {topic}.
You are the interviewer. Ask ONE interview question at a time, mixing behavioral and technical questions,
getting gradually harder. After each answer give: a rating out of 10, one thing they did well, and one concrete
tip to improve, then ask the next question. Be realistic and fair, but keep your personality.`,
  language: `MODE: LANGUAGE PRACTICE in {lang}.
Chat with the user mostly in {lang}, using short, simple sentences suited to a learner (match their level).
Always ask a question back to keep the conversation going.
After your {lang} reply, add a new line starting with "Correction:" (in English) that gently corrects mistakes in the
user's last message, or says it was perfect. Then add a line starting with "Meaning:" with an English translation of
your {lang} reply. Do not use the [score] tag in this mode.`,
};

// ---------------- actions (assistant) ----------------
// In normal chat, characters can also DO things for the user. They never act directly:
// they add an [action: {...}] tag, and the website shows a card with a button the user
// presses to confirm (open WhatsApp with the message ready, add a calendar event, etc.).

const ACTIONS_RULE = `Actions: you can also help the user get things done. When the user clearly asks you to do one of the
things below, reply with one or two short friendly sentences about what you've prepared, then put exactly ONE action
tag at the very end of your reply, written as valid JSON on one line:
- Reminder: [action: {"type":"reminder","text":"Finish the math notes","in_minutes":60}]
  (use "in_minutes" for "in an hour"/"in 20 minutes", or "at":"YYYY-MM-DDTHH:MM" in the user's local time for a clock time)
- Calendar event: [action: {"type":"calendar","title":"Study group","start":"YYYY-MM-DDTHH:MM","minutes":60,"details":"Library, room 2"}]
  (for an all-day event use "date":"YYYY-MM-DD" instead of "start")
- Message someone: [action: {"type":"message","app":"whatsapp","to":"Rahul","text":"Hey Rahul, I won't make it to class today."}]
  ("app" is "whatsapp", "sms" or "email"; email also takes "subject"; "to" is the name the user used)
- Shopping: [action: {"type":"shop","store":"amazon","query":"logitech m720 wireless mouse"}]
  ("store" can be "amazon", "walmart", "target", "bestbuy" or "google"; write a precise product search)
- Directions or places: [action: {"type":"map","query":"coffee shops near NJIT"}]
- Web or video search: [action: {"type":"search","site":"google","query":"how to solve quadratic equations"}] ("site" can be "google" or "youtube")
Rules for actions:
- The user confirms every action with a button, so never claim it's already done. Say something like "Here it is, tap the button to send it."
- Write messages in the user's own voice (first person), friendly and ready to send.
- If something essential is missing (who to message, what time, which product), ask one short question instead of guessing.
- Never invent phone numbers, email addresses, prices or product links.
- Only add an action tag when the user asks you to do something. Ordinary questions get ordinary answers.`;

// Question styles the site rotates through, so quizzes stay varied (kept in sync with docs/js/quiz.js).
const STYLES = ['definition', 'application', 'scenario', 'cause and effect', 'compare two ideas', 'spot the mistake', 'worked example', 'which statement is true', 'fill in the blank', 'order or sequence'];

const MEMORY_RULE = `Memory: if the user shares a lasting fact worth remembering for future chats (their name, goals,
school or job, upcoming exams, interests, preferences), add ONE tag at the very end of your reply like
[remember: The user is preparing for a data structures exam in December]. Only for genuinely useful facts,
never for sensitive information (health, passwords, money, addresses).`;

export function buildSystem(character, opts = {}) {
  const parts = [PERSONAS[character], RULES, MEMORY_RULE];
  const mem = opts.memory;
  if (mem && (mem.name || mem.goals || (mem.facts || []).length)) {
    const lines = [];
    if (mem.name) lines.push(`- Their name: ${mem.name}`);
    if (mem.goals) lines.push(`- Their goals: ${mem.goals}`);
    for (const f of mem.facts || []) lines.push(`- ${f}`);
    parts.push(`What you remember about the user from earlier visits (use it naturally, don't recite it):\n${lines.join('\n')}`);
  }
  const modeName = opts.mode || 'chat';
  if (modeName === 'agent') {
    parts.push(`MODE: AGENT. The user is signed in and wants you to help them get things done.\n${ACTIONS_RULE}`);
  }
  if (opts.now) parts.push(`The user's current local date and time: ${opts.now}${opts.tz ? ` (time zone ${opts.tz})` : ''}. Use it to work out dates and times.`);
  const mode = MODES[modeName];
  if (mode && mode !== 'AGENT') {
    parts.push(mode
      .replaceAll('{topic}', opts.doc ? `the document "${opts.doc.name}"${opts.topic ? ` (focus: ${opts.topic})` : ''}` : opts.topic || '(not chosen yet)')
      .replaceAll('{lang}', opts.lang || 'Spanish')
      .replaceAll('{difficulty}', opts.difficulty || 'medium')
      .replaceAll('{style}', opts.style || 'any'));
    if (modeName === 'quiz' && opts.avoid?.length) {
      parts.push(`Questions already asked (do NOT repeat or reword any of these):\n${opts.avoid.map((q) => `- ${q}`).join('\n')}`);
    }
  }
  if (opts.doc) {
    const body = opts.doc.parts.map((p, i) => `[Part ${i + 1}${p.where ? `, ${p.where}` : ''}]\n${p.text}`).join('\n\n');
    parts.push(modeName === 'quiz'
      ? `The user uploaded a document called "${opts.doc.name}". Write this question ONLY from the passage below (don't use outside facts for the answer):\n\n${body}`
      : `The user uploaded a document called "${opts.doc.name}" and you have studied it. Below are the parts of it most related to their latest message.
Answer from the document whenever the question is about it, and mention where it says so (like "page 4") when helpful.
If the answer isn't in these parts, say you couldn't find it in the document, then help from general knowledge and say so.\n\n${body}`);
  }
  return parts.join('\n\n');
}

// ---------------- helpers ----------------

const MAX_MESSAGES = 24;
const MAX_CHARS = 2000;
const RATE_LIMIT = 20; // messages per minute per visitor (best effort)
const hits = new Map();

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes('*') || allowed.includes(origin);
  return {
    ok,
    headers: {
      'Access-Control-Allow-Origin': ok ? (allowed.includes('*') ? '*' : origin) : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  };
}

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

function rateLimited(ip) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now > h.reset) {
    hits.set(ip, { count: 1, reset: now + 60_000 });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  h.count++;
  return h.count > RATE_LIMIT;
}

function validate(body) {
  if (!body || typeof body !== 'object') return 'Body must be JSON.';
  if (!PERSONAS[body.character]) return 'Unknown character.';
  const msgs = body.messages;
  if (!Array.isArray(msgs) || !msgs.length) return 'messages must be a non-empty array.';
  for (const m of msgs) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.text !== 'string') return 'Each message needs a role and text.';
    if (m.text.length > MAX_CHARS) return `Messages must be under ${MAX_CHARS} characters.`;
  }
  if (msgs[msgs.length - 1].role !== 'user') return 'The last message must be from the user.';
  if (body.mode !== undefined && !(body.mode in MODES)) return 'Unknown mode.';
  if (body.lang !== undefined && !LANGS.includes(body.lang)) return 'Unsupported language.';
  if (body.topic !== undefined && (typeof body.topic !== 'string' || body.topic.length > 120)) return 'Topic must be a short string.';
  if (body.difficulty !== undefined && !['easy', 'medium', 'hard'].includes(body.difficulty)) return 'Unknown difficulty.';
  if (body.style !== undefined && !STYLES.includes(body.style)) return 'Unknown question style.';
  if (body.avoid !== undefined && (!Array.isArray(body.avoid) || body.avoid.length > 60 || body.avoid.some((x) => typeof x !== 'string' || x.length > 200))) return 'avoid is invalid.';
  const doc = body.doc;
  if (doc !== undefined) {
    if (typeof doc !== 'object' || doc === null || typeof doc.name !== 'string' || doc.name.length > 120 || !Array.isArray(doc.parts) || !doc.parts.length || doc.parts.length > 10) return 'doc is invalid.';
    let total = 0;
    for (const p of doc.parts) {
      if (!p || typeof p.text !== 'string' || p.text.length > 2000 || (p.where !== undefined && (typeof p.where !== 'string' || p.where.length > 30))) return 'doc part is invalid.';
      total += p.text.length;
    }
    if (total > 12000) return 'doc is too long.';
  }
  if (body.auth !== undefined && (typeof body.auth !== 'string' || body.auth.length > 4000)) return 'auth is invalid.';
  if (body.now !== undefined && (typeof body.now !== 'string' || body.now.length > 80)) return 'now must be a short string.';
  if (body.tz !== undefined && (typeof body.tz !== 'string' || body.tz.length > 60)) return 'tz must be a short string.';
  const mem = body.memory;
  if (mem !== undefined) {
    if (typeof mem !== 'object' || mem === null) return 'memory must be an object.';
    if (mem.name !== undefined && (typeof mem.name !== 'string' || mem.name.length > 40)) return 'memory.name is too long.';
    if (mem.goals !== undefined && (typeof mem.goals !== 'string' || mem.goals.length > 300)) return 'memory.goals is too long.';
    if (mem.facts !== undefined && (!Array.isArray(mem.facts) || mem.facts.length > 25 || mem.facts.some((x) => typeof x !== 'string' || x.length > 200))) return 'memory.facts is invalid.';
  }
  return null;
}

// Turn our {role, text} list into Gemini's format: it must start with a user turn,
// and two turns from the same side in a row get merged.
export function toGeminiContents(messages) {
  const trimmed = messages.slice(-MAX_MESSAGES);
  while (trimmed.length && trimmed[0].role !== 'user') trimmed.shift();
  const contents = [];
  for (const m of trimmed) {
    const role = m.role === 'assistant' ? 'model' : 'user';
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts[0].text += `\n${m.text}`;
    else contents.push({ role, parts: [{ text: m.text }] });
  }
  return contents;
}

export function readGemini(data) {
  const cand = data?.candidates?.[0];
  const text = (cand?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
  const seen = new Set();
  const sources = [];
  for (const ch of cand?.groundingMetadata?.groundingChunks || []) {
    const uri = ch.web?.uri;
    if (uri && !seen.has(uri)) {
      seen.add(uri);
      sources.push({ title: ch.web.title || '', uri });
    }
  }
  return { text, sources: sources.slice(0, 4), finish: cand?.finishReason };
}

async function callGemini(env, system, contents, withSearch) {
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: { temperature: 0.9, maxOutputTokens: 2048 },
  };
  if (withSearch) body.tools = [{ google_search: {} }];
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify(body),
  });
}

// ---------------- sign-in check (Supabase) ----------------
// Agent mode is only for signed-in users. The site sends the Supabase session token; we ask
// Supabase whether it's real. Good answers are remembered for 5 minutes.

const DEFAULT_SUPABASE_URL = '__SUPABASE_URL__';
const DEFAULT_SUPABASE_KEY = '__SUPABASE_KEY__';
const verified = new Map();

export async function verifyUser(env, token) {
  const url = env.SUPABASE_URL || DEFAULT_SUPABASE_URL, key = env.SUPABASE_KEY || DEFAULT_SUPABASE_KEY;
  if (!token || !/^https:/.test(url) || key.startsWith('__')) return null;
  const hit = verified.get(token);
  if (hit && hit.until > Date.now()) return hit.user;
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const u = await res.json();
    if (!u?.id) return null;
    if (verified.size > 2000) verified.clear();
    verified.set(token, { user: { id: u.id, email: u.email }, until: Date.now() + 5 * 60_000 });
    return { id: u.id, email: u.email };
  } catch {
    return null;
  }
}

// ---------------- the worker ----------------

// Workers AI (Cloudflare's built-in models). messages: [{role, text}] from the site.
export async function callWorkersAI(env, system, messages) {
  const msgs = [{ role: 'system', content: system }];
  for (const m of messages.slice(-MAX_MESSAGES)) msgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text });
  const models = [env.CF_MODEL, ...CF_MODELS].filter(Boolean);
  let lastErr;
  for (const model of models) {
    try {
      const out = await env.AI.run(model, { messages: msgs, max_tokens: 900, temperature: 0.8 });
      const text = typeof out === 'string' ? out
        : out?.response ?? out?.choices?.[0]?.message?.content ?? out?.output_text ?? '';
      if (text && String(text).trim()) return { text: String(text).trim(), sources: [] };
    } catch (e) {
      lastErr = e;
      console.log('Workers AI model failed', model, String(e).slice(0, 200));
    }
  }
  throw lastErr || new Error('Workers AI returned no text');
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors.headers });
    if (request.method === 'GET') return json({ ok: true, service: 'toonlight', version: 5, characters: Object.keys(PERSONAS), modes: Object.keys(MODES) }, 200, cors.headers);
    if (request.method !== 'POST' || !['/chat', '/'].includes(url.pathname)) return json({ error: 'Not found' }, 404, cors.headers);
    if (!cors.ok) return json({ error: 'This website is not allowed to use this server.' }, 403, cors.headers);
    if (!env.GEMINI_API_KEY && !env.AI) return json({ error: 'Server has no AI connected. Add a Workers AI binding named AI (or a GEMINI_API_KEY secret).' }, 500, cors.headers);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (rateLimited(ip)) return json({ error: 'Too many messages. Wait a minute.' }, 429, cors.headers);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Body must be JSON.' }, 400, cors.headers); }
    const problem = validate(body);
    if (problem) return json({ error: problem }, 400, cors.headers);

    if (body.mode === 'agent' && !(await verifyUser(env, body.auth))) {
      return json({ error: 'Sign in to use Agent mode.', code: 'auth' }, 401, cors.headers);
    }

    const system = buildSystem(body.character, {
      mode: body.mode, topic: body.topic, lang: body.lang, memory: body.memory, now: body.now, tz: body.tz,
      difficulty: body.difficulty, style: body.style, avoid: body.avoid, doc: body.doc,
    });

    // 1) Gemini, if a key is set
    if (env.GEMINI_API_KEY) {
      const contents = toGeminiContents(body.messages);
      try {
        let res = await callGemini(env, system, contents, true);
        // search grounding unavailable (quota/model)? answer without it rather than failing
        if (!res.ok && [400, 403, 429].includes(res.status)) res = await callGemini(env, system, contents, false);
        if (res.ok) {
          const { text, sources, finish } = readGemini(await res.json());
          if (text) return json({ reply: text, sources }, 200, cors.headers);
          if (finish === 'SAFETY') return json({ reply: "[neutral] Let's talk about something else.", sources: [] }, 200, cors.headers);
        } else {
          console.log('Gemini error', res.status, (await res.text()).slice(0, 300));
          if (!env.AI) return json({ error: res.status === 429 ? 'The free AI quota is used up for now.' : `AI error ${res.status}` }, res.status === 429 ? 429 : 502, cors.headers);
        }
      } catch (e) {
        console.log('Gemini failed', e);
        if (!env.AI) return json({ error: 'Could not reach the AI service.' }, 502, cors.headers);
      }
    }
    // 2) Workers AI (also the fallback when Gemini fails)
    try {
      const { text, sources } = await callWorkersAI(env, system, body.messages);
      return json({ reply: text, sources }, 200, cors.headers);
    } catch (e) {
      const msg = String(e);
      const quota = /limit|quota|neurons|429|capacity/i.test(msg);
      return json({ error: quota ? 'The free AI quota is used up for today.' : 'The AI model had a problem.' }, quota ? 429 : 502, cors.headers);
    }
  },
};
