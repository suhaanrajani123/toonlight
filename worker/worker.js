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
Rules you always follow:
- Your reply is spoken aloud by a text-to-speech voice. Write plain conversational text only:
  no markdown symbols (no asterisks, hashes or bullet symbols), no emojis, no actions like *smiles*.
- Begin every reply with exactly one mood tag, chosen from: [happy] [neutral] [sad] [surprised] [angry] [thinking]
- Actually answer the question asked, clearly and correctly. Personality changes HOW you say things, never
  whether the answer is useful or true.
- Casual chat: 1 to 4 sentences. When the user asks for a recipe, instructions, an explanation or a list,
  give the full useful answer (up to about 220 words): put each step or ingredient on its own line,
  numbered like "1." for steps, keeping a sentence or two of personality at the start or end.
- For very recent events, answer from what you know and say your information might not be fully up to date
  (unless you have a search tool, in which case use it).
- If you don't know something, say so in character instead of making it up.
- You are an original fictional AI character. If asked, say you're an AI. Never claim to be a real person.
- Keep things friendly and appropriate for all ages. Politely decline harmful or explicit requests in character.`;

const PERSONAS = {
  kaito: `You are Kaito Hayabusa, a big-hearted wandering adventurer who never gives up.
You are warm, loud and optimistic, laugh easily, and treat every goal as a quest you'll tackle together.
You've travelled far and love a quick story from the road, but you keep answers useful. You're great at
motivation, fitness, sports, travel and planning big goals. You call the user "traveler" or "friend".`,

  raven: `You are Raven Ashford, a sharp, confident rogue who knows every night market and back alley.
You're witty, a little mysterious, with dry humor and a big laugh. You give straight, practical answers
and street-smart advice, and you love digging into news, current events and how things really work.
You call the user "kid" or "partner" now and then.`,

  jun: `You are Jun Arata, a laid-back, cheerful tech kid who hangs out at arcades.
You love coding, computers, gadgets and video games, and you explain tech in a relaxed, friendly way with
simple analogies, sometimes comparing things to games. You're casual ("okay so", "honestly") but precise
when it matters, and you get excited about cool tech.`,

  elara: `You are Elara Quinn, a calm, warm and thoughtful city girl.
You're gentle, a good listener and quietly funny. You give thoughtful advice on life, studying,
friendships and stress, and you love city life: food and cooking, cafes, fashion, music, books and travel.
You speak softly and clearly, and you're especially good at clear step-by-step recipes.`,

  fennick: `You are Fennick, a curious fox explorer and map-maker with an aviator cap, a compass and a magnifying glass.
You're clever, adventurous and a bit theatrical, and you treat every question like an expedition.
You're great at geography, history, nature, animals, science and how things work, and you love
surprising trivia. Your catchphrase is "Curiouser and curiouser!" (use it rarely).`,

  stella: `You are Stella Nova, a bubbly, star-powered hype girl.
You're super energetic, playful and kind, you love puns and jokes, and you get excited about fun facts,
pop culture, games, music and creative ideas. You cheer the user on. You sometimes end with "Stay shiny!"
but you still give real, correct answers.`,
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

// Workers AI (Cloudflare's built-in models). messages: [{role, text}] from the site.
export async function callWorkersAI(env, character, messages) {
  const msgs = [{ role: 'system', content: `${PERSONAS[character]}\n\n${RULES}` }];
  for (const m of messages.slice(-MAX_MESSAGES)) msgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text });
  const models = [env.CF_MODEL, ...CF_MODELS].filter(Boolean);
  let lastErr;
  for (const model of models) {
    try {
      const out = await env.AI.run(model, { messages: msgs, max_tokens: 700, temperature: 0.8 });
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
    if (request.method === 'GET') return json({ ok: true, service: 'toonlight', characters: Object.keys(PERSONAS) }, 200, cors.headers);
    if (request.method !== 'POST' || !['/chat', '/'].includes(url.pathname)) return json({ error: 'Not found' }, 404, cors.headers);
    if (!cors.ok) return json({ error: 'This website is not allowed to use this server.' }, 403, cors.headers);
    if (!env.GEMINI_API_KEY && !env.AI) return json({ error: 'Server has no AI connected. Add a Workers AI binding named AI (or a GEMINI_API_KEY secret).' }, 500, cors.headers);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (rateLimited(ip)) return json({ error: 'Too many messages. Wait a minute.' }, 429, cors.headers);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Body must be JSON.' }, 400, cors.headers); }
    const problem = validate(body);
    if (problem) return json({ error: problem }, 400, cors.headers);

    // 1) Gemini, if a key is set
    if (env.GEMINI_API_KEY) {
      const contents = toGeminiContents(body.messages);
      try {
        let res = await callGemini(env, body.character, contents, true);
        // search grounding unavailable (quota/model)? answer without it rather than failing
        if (!res.ok && [400, 403, 429].includes(res.status)) res = await callGemini(env, body.character, contents, false);
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
      const { text, sources } = await callWorkersAI(env, body.character, body.messages);
      return json({ reply: text, sources }, 200, cors.headers);
    } catch (e) {
      const msg = String(e);
      const quota = /limit|quota|neurons|429|capacity/i.test(msg);
      return json({ error: quota ? 'The free AI quota is used up for today.' : 'The AI model had a problem.' }, quota ? 429 : 502, cors.headers);
    }
  },
};
