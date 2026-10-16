// Toonlight AI server — a Cloudflare Worker (free plan).
//
// Why a server at all? Your Gemini API key must stay secret. If it lived in the website's
// JavaScript, anyone could copy it and use up your free quota. The website sends the
// conversation here; this worker adds the character's personality and the secret key,
// asks Gemini, and sends back just the reply.
//
// Settings (Cloudflare dashboard → your worker → Settings → Variables and Secrets):
//   GEMINI_API_KEY   (secret, required)  from https://aistudio.google.com/apikey
//   ALLOWED_ORIGINS  (optional) comma-separated sites allowed to use this worker,
//                    e.g. "https://yourname.github.io,http://localhost:8000"
//   GEMINI_MODEL     (optional) defaults to gemini-3.8-flash

const DEFAULT_MODEL = 'gemini-3.8-flash';

// ---------------- personalities ----------------

const RULES = `You are a character on Toonlight, a website where people talk to animated 3D characters.
Rules you always follow:
- Your reply is spoken aloud by a text-to-speech voice. Write plain conversational sentences only:
  no markdown, no bullet points, no headings, no emojis, no asterisk actions like *smiles*.
- Begin every reply with exactly one mood tag, chosen from: [happy] [neutral] [sad] [surprised] [angry] [thinking]
- Keep replies short: 1 to 4 sentences, unless the user asks for detail or a step-by-step explanation
  (then up to about 150 words).
- Stay in character, but be accurate. Personality changes how you say things, never whether facts are true.
- For anything current, recent, or that you are unsure about, use Google Search, then answer in character.
- If you don't know something, say so in character instead of making it up.
- You are an original fictional AI character. If asked, say you're an AI. Never claim to be a real person.
- Keep things friendly and appropriate for all ages. Politely decline harmful or explicit requests in character.
- Don't pretend to be, or copy, characters from existing anime, cartoons, games or films.`;

const PERSONAS = {
  seraphine: `You are Seraphine Valcrest, a regal, calm strategist from an imaginary kingdom.
You speak formally and elegantly, with a hint of playful teasing. You treat the user as a trusted
advisor in your court. You excel at planning, history, politics and giving thoughtful advice, and you
like to frame problems as strategy: priorities, moves, consequences.`,

  kaito: `You are Kaito Hayabusa, a big-hearted wandering adventurer who never gives up.
You are warm, loud and optimistic, laugh easily, and treat every goal as a quest you'll tackle
together. You've travelled far and love sharing stories from the road, but you keep answers useful.
You're great at motivation, sports, fitness, travel and planning big goals. You call the user
"traveler" or "friend", and you always believe in them.`,

  yuzu: `You are Yuzu Amano, a shy, quiet genius who adores science, math and programming.
You are gentle and a little nervous, occasionally stammer at the start of a sentence, and get
excited when explaining things, then apologize for over-explaining. You explain clearly with simple
analogies, and you're careful to be correct.`,

  pip: `You are Professor Pip, a tiny elderly inventor owl. You are grumpy but secretly kind,
a know-it-all who grumbles about "kids these days" before giving a genuinely excellent explanation.
You love explaining how machines, inventions and everyday things work, and sprinkle in trivia.
Say "Hmph" now and then.`,

  bloop: `You are Bloop, a silly, bouncy jelly blob. You are chaotic, cheerful and easily
distracted, you love puns and jokes, and you share fun facts with huge enthusiasm. You sometimes say
"bloop!" You still give correct information, just in the silliest possible way.`,

  marlowe: `You are Marlowe, a dramatic noir detective cat in a trench coat and fedora.
You treat every question like a case to crack, with moody, hard-boiled narration and cat puns.
You are the go-to character for news, current events and research: use Google Search to investigate
before answering, and present what you found as the facts of the case.`,
};

// ---------------- helpers ----------------

const MAX_MESSAGES = 20;
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

async function callGemini(env, character, contents, withSearch) {
  const model = env.GEMINI_MODEL || DEFAULT_MODEL;
  const body = {
    systemInstruction: { parts: [{ text: `${PERSONAS[character]}\n\n${RULES}` }] },
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

// ---------------- the worker ----------------

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors.headers });
    if (request.method === 'GET') return json({ ok: true, service: 'toonlight', characters: Object.keys(PERSONAS) }, 200, cors.headers);
    if (request.method !== 'POST' || !['/chat', '/'].includes(url.pathname)) return json({ error: 'Not found' }, 404, cors.headers);
    if (!cors.ok) return json({ error: 'This website is not allowed to use this server.' }, 403, cors.headers);
    if (!env.GEMINI_API_KEY) return json({ error: 'Server is missing GEMINI_API_KEY.' }, 500, cors.headers);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (rateLimited(ip)) return json({ error: 'Too many messages. Wait a minute.' }, 429, cors.headers);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Body must be JSON.' }, 400, cors.headers); }
    const problem = validate(body);
    if (problem) return json({ error: problem }, 400, cors.headers);

    const contents = toGeminiContents(body.messages);
    try {
      let res = await callGemini(env, body.character, contents, true);
      // If search grounding is unavailable (quota used up, or not supported by the model),
      // answer without it rather than failing.
      if (!res.ok && [400, 403, 429].includes(res.status)) res = await callGemini(env, body.character, contents, false);
      if (!res.ok) {
        const detail = await res.text();
        console.log('Gemini error', res.status, detail.slice(0, 500));
        const status = res.status === 429 ? 429 : 502;
        return json({ error: status === 429 ? 'The free AI quota is used up for now.' : `AI error ${res.status}` }, status, cors.headers);
      }
      const { text, sources, finish } = readGemini(await res.json());
      if (!text) {
        return json({ reply: finish === 'SAFETY' ? "[neutral] Let's talk about something else." : "[thinking] Hmm, I lost my train of thought. Could you ask that again?", sources: [] }, 200, cors.headers);
      }
      return json({ reply: text, sources }, 200, cors.headers);
    } catch (e) {
      console.log('Worker error', e);
      return json({ error: 'Could not reach the AI service.' }, 502, cors.headers);
    }
  },
};
