// agent.js — Agent mode: the character works toward your goal step by step, using tools.
//
// How it works: the AI gets a list of tools. Instead of answering straight away it can reply
// with tool tags like [tool: {"name":"weather","args":{"place":"Newark"}}]. We run those tools
// here, hand back the results, and let it continue: more tools, or the final answer. Each step
// is streamed to the website as it happens, so you can watch it work.
//
// Everything here is free: Wikipedia, Google News RSS, Open-Meteo (weather, places, time zones),
// Frankfurter (exchange rates), OpenStreetMap (places), Workers AI (images). Whole-web search
// needs a free Tavily key (secret TAVILY_API_KEY); without it, search uses Wikipedia + news.

const MAX_STEPS = 5;          // rounds of tool use before the agent must answer
const MAX_CALLS = 3;          // tools per round
const RESULT_CHARS = 3500;    // how much of each tool result the AI sees
const UA = 'Toonlight/1.0 (+https://github.com/suhaanrajani123/toonlight)';

// ---------------- tools ----------------

const TOOLS = {
  web_search: {
    args: '{"query":"..."}',
    about: 'search the web for current information, facts, prices, reviews, how-tos',
    label: (a) => `Searching the web for "${a.query}"`,
    run: webSearch,
  },
  read_page: {
    args: '{"url":"https://..."}',
    about: 'open a web page and read its text (articles, docs, product pages, any link the user gives)',
    label: (a) => `Reading ${host(a.url)}`,
    run: readPage,
  },
  wikipedia: {
    args: '{"query":"..."}',
    about: 'look up a topic, person, place or event on Wikipedia',
    label: (a) => `Looking up "${a.query}" on Wikipedia`,
    run: wikipedia,
  },
  news: {
    args: '{"query":"..."}',
    about: 'latest news headlines on a topic (leave query empty for top stories)',
    label: (a) => (a.query ? `Checking the news on "${a.query}"` : 'Checking the top news'),
    run: news,
  },
  weather: {
    args: '{"place":"city, region"}',
    about: 'current weather and 5-day forecast for a place',
    label: (a) => `Checking the weather in ${a.place}`,
    run: weather,
  },
  local_time: {
    args: '{"place":"city"}',
    about: 'the current local date and time in a city',
    label: (a) => `Checking the time in ${a.place}`,
    run: localTime,
  },
  places: {
    args: '{"query":"what and where, e.g. libraries near Newark NJ"}',
    about: 'find places, addresses and businesses on the map',
    label: (a) => `Finding "${a.query}" on the map`,
    run: places,
  },
  currency: {
    args: '{"amount":100,"from":"USD","to":"EUR"}',
    about: 'convert money between currencies at today\'s exchange rate',
    label: (a) => `Converting ${a.amount ?? 1} ${String(a.from || '').toUpperCase()} to ${String(a.to || '').toUpperCase()}`,
    run: currency,
  },
  calculate: {
    args: '{"expression":"(1200*0.07)/12"}',
    about: 'exact math: + - * / ^ %, parentheses, sqrt, sin, cos, tan, log, ln, abs, round, floor, ceil, pi, e',
    label: (a) => `Calculating ${String(a.expression).slice(0, 40)}`,
    run: async (a) => {
      const v = calc(String(a.expression || ''));
      return { text: `${a.expression} = ${fmtNum(v)}` };
    },
  },
  make_image: {
    args: '{"prompt":"a detailed description of the picture"}',
    about: 'create an image from a description (illustrations, posters, ideas)',
    label: () => 'Drawing an image',
    run: makeImage,
  },
};

export const TOOL_NAMES = Object.keys(TOOLS);

export function agentPrompt(env) {
  const list = Object.entries(TOOLS).map(([n, t]) => `- ${n} ${t.args}: ${t.about}`).join('\n');
  return `TOOLS. You can use tools to get real, current information and to make things before you answer.
To use tools, reply with ONLY tool tags (one per line, up to ${MAX_CALLS}), nothing else:
[tool: {"name":"weather","args":{"place":"Newark, NJ"}}]
You'll get the results in the next message. Then use more tools, or give your final answer.
Tools:
${list}
How to work:
- Think about what the user wants and plan the steps. Use tools whenever the answer depends on current facts,
  numbers, prices, news, weather, a web page or anything you aren't sure of. Never invent facts a tool could check.
- Use calculate for any arithmetic beyond the trivial. For a link the user gives, use read_page.
${env.TAVILY_API_KEY ? '' : '- web_search currently only covers Wikipedia and news. If a task needs other websites, say so honestly.\n'}- Multi-step tasks are fine: e.g. search, then read the best page, then calculate, then answer.
- Your final answer: start with your mood tag, answer clearly and completely, and mention where facts came from.
  Add [action: ...] tags for things the user should confirm (reminders, calendar, messages, shopping, files).
  Never put tool tags in the final answer.`;
}

// ---------------- the loop ----------------

// complete(system, messages) → text. emit(event) sends a progress line to the website.
export async function runAgent({ env, system, messages, complete, emit }) {
  const convo = messages.map((m) => ({ ...m }));
  const sources = [];
  const images = [];
  for (let step = 0; step <= MAX_STEPS; step++) {
    const last = step === MAX_STEPS;
    const text = await complete(last ? `${system}\n\nYou have used all your tool steps. Give your final answer now with what you have, without tool tags.` : system, convo);
    const calls = last ? [] : extractCalls(text);
    if (!calls.length) {
      return { reply: stripCalls(text) || "[neutral] I couldn't finish that one. Could you try asking in a different way?", sources: dedupe(sources).slice(0, 6), images };
    }
    convo.push({ role: 'assistant', text: calls.map((c) => `[tool: ${JSON.stringify(c)}]`).join('\n') });
    const results = [];
    for (const call of calls.slice(0, MAX_CALLS)) {
      const tool = TOOLS[call.name];
      const label = tool ? tool.label(call.args || {}) : `Unknown tool ${call.name}`;
      emit({ type: 'step', tool: call.name, label });
      let out;
      try {
        if (!tool) throw new Error(`there is no tool called ${call.name}`);
        out = await withTimeout(tool.run(call.args || {}, env), 15000);
      } catch (e) {
        out = { text: `ERROR: ${String(e.message || e).slice(0, 200)}`, failed: true };
      }
      if (out.sources) sources.push(...out.sources);
      if (out.image) { images.push(out.image); emit({ type: 'image', image: out.image }); }
      emit({ type: 'step-done', tool: call.name, ok: !out.failed, note: out.note || '' });
      results.push(`### ${call.name} ${JSON.stringify(call.args || {})}\n${String(out.text).slice(0, RESULT_CHARS)}`);
    }
    convo.push({ role: 'user', text: `[tool results]\n${results.join('\n\n')}\n\nContinue: use more tools if needed, otherwise give the final answer.` });
  }
  return { reply: '[neutral] I ran out of steps on that one.', sources: dedupe(sources), images };
}

export function extractCalls(text) {
  const calls = [];
  const re = /\[\s*tool\s*:\s*/gi;
  let m;
  while ((m = re.exec(text)) && calls.length < MAX_CALLS) {
    const start = text.indexOf('{', m.index);
    if (start === -1) break;
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) { end = i; break; }
    }
    if (end === -1) break;
    try {
      const j = JSON.parse(text.slice(start, end + 1));
      if (typeof j.name === 'string') calls.push({ name: j.name.trim(), args: j.args && typeof j.args === 'object' ? j.args : {} });
    } catch {}
    re.lastIndex = end;
  }
  return calls;
}
const stripCalls = (t) => t.replace(/\[\s*tool\s*:[^\]]*\]/gi, '').trim();

// ---------------- tool code ----------------

const enc = encodeURIComponent;
function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'the page'; } }
const dedupe = (list) => { const seen = new Set(); return list.filter((s) => s?.uri && !seen.has(s.uri) && seen.add(s.uri)); };
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('took too long')), ms))]);
async function getJSON(url, init = {}) {
  const r = await fetch(url, { ...init, headers: { 'User-Agent': UA, Accept: 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${host(url)} answered ${r.status}`);
  return r.json();
}
function fmtNum(v) {
  if (!Number.isFinite(v)) return String(v);
  return Math.abs(v) >= 1e15 || (Math.abs(v) < 1e-6 && v !== 0) ? v.toExponential(6) : String(+v.toPrecision(12));
}

async function webSearch(a, env) {
  const q = String(a.query || '').slice(0, 300);
  if (!q) throw new Error('empty query');
  if (env.TAVILY_API_KEY) {
    const d = await getJSON('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.TAVILY_API_KEY}` },
      body: JSON.stringify({ query: q, max_results: 5, search_depth: 'basic' }),
    });
    const res = d.results || [];
    return {
      text: res.map((r, i) => `${i + 1}. ${r.title}\n${r.url}\n${(r.content || '').slice(0, 600)}`).join('\n\n') || 'No results.',
      sources: res.map((r) => ({ title: r.title, uri: r.url })),
    };
  }
  // no search key: Wikipedia + news together
  const [w, n] = await Promise.allSettled([wikipedia({ query: q }), news({ query: q })]);
  const parts = [w, n].filter((x) => x.status === 'fulfilled').map((x) => x.value);
  return {
    text: `(Full web search isn't set up; these are Wikipedia and news results.)\n\n${parts.map((p) => p.text).join('\n\n')}`,
    sources: parts.flatMap((p) => p.sources || []),
  };
}

export function htmlToText(html) {
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || '').trim();
  const body = html
    .replace(/<(head|title|script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t\f\r]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return { title, text: body };
}

async function readPage(a) {
  let url;
  try { url = new URL(String(a.url || '')); } catch { throw new Error('that is not a valid link'); }
  if (!/^https?:$/.test(url.protocol)) throw new Error('only http(s) links can be read');
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)|\.local$|\.internal$/i.test(url.hostname) || /^\[/.test(url.hostname)) throw new Error('that address is private');
  const r = await fetch(url.href, { headers: { 'User-Agent': UA, Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' }, redirect: 'follow' });
  if (!r.ok) throw new Error(`the page answered ${r.status}`);
  const type = r.headers.get('content-type') || '';
  if (!/text|html|json|xml/.test(type)) throw new Error(`that link is a ${type.split(';')[0] || 'file'}, not a page I can read`);
  const raw = (await r.text()).slice(0, 400000);
  const { title, text } = /html/.test(type) ? htmlToText(raw) : { title: '', text: raw };
  return { text: `${title ? `Title: ${title}\n` : ''}URL: ${r.url}\n\n${text.slice(0, RESULT_CHARS)}`, sources: [{ title: title || host(r.url), uri: r.url }] };
}

async function wikipedia(a) {
  const q = String(a.query || '').slice(0, 200);
  const s = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${enc(q)}&srlimit=3&format=json&origin=*`);
  const hits = s?.query?.search || [];
  if (!hits.length) return { text: `No Wikipedia article found for "${q}".` };
  const titles = hits.slice(0, 2).map((h) => h.title);
  const d = await getJSON(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&exsentences=12&redirects=1&titles=${enc(titles.join('|'))}&format=json&origin=*`);
  const pages = Object.values(d?.query?.pages || {});
  return {
    text: pages.map((p) => `## ${p.title}\n${(p.extract || '').slice(0, 1600)}`).join('\n\n'),
    sources: pages.map((p) => ({ title: `${p.title} (Wikipedia)`, uri: `https://en.wikipedia.org/wiki/${enc(p.title.replace(/ /g, '_'))}` })),
  };
}

async function news(a) {
  const q = String(a.query || '').slice(0, 200);
  const url = q ? `https://news.google.com/rss/search?q=${enc(q)}&hl=en-US&gl=US&ceid=US:en` : 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en';
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`news answered ${r.status}`);
  const xml = await r.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 8).map((m) => {
    const get = (t) => (new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`).exec(m[1])?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').trim();
    return { title: get('title'), link: get('link'), date: get('pubDate'), source: get('source') };
  });
  if (!items.length) return { text: `No news found${q ? ` for "${q}"` : ''}.` };
  return {
    text: items.map((it, i) => `${i + 1}. ${it.title} (${it.source || 'news'}, ${it.date})`).join('\n'),
    sources: items.slice(0, 4).map((it) => ({ title: it.title.slice(0, 80), uri: it.link })),
  };
}

async function geocode(place) {
  const name = String(place || '').split(',')[0].trim();
  if (!name) throw new Error('no place given');
  const d = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${enc(name)}&count=5&language=en&format=json`);
  const list = d.results || [];
  if (!list.length) throw new Error(`couldn't find "${place}"`);
  // prefer a result whose region/country matches the rest of what was typed
  const rest = String(place).toLowerCase().split(',').slice(1).map((s) => s.trim()).filter(Boolean);
  const best = list.find((r) => rest.every((x) => [r.admin1, r.country, r.country_code].some((v) => v && (v.toLowerCase().includes(x) || x.includes(v.toLowerCase()))))) || list[0];
  return { lat: best.latitude, lon: best.longitude, tz: best.timezone, label: [best.name, best.admin1, best.country].filter(Boolean).join(', ') };
}

const WMO = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'freezing fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'heavy freezing rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains', 80: 'light showers', 81: 'showers', 82: 'heavy showers', 85: 'snow showers', 86: 'heavy snow showers', 95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm with hail' };
const cf = (c) => `${Math.round(c)}°C / ${Math.round(c * 9 / 5 + 32)}°F`;

async function weather(a) {
  const g = await geocode(a.place);
  const d = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=5&timezone=auto`);
  const c = d.current, day = d.daily;
  const lines = [`${g.label} — now: ${WMO[c.weather_code] || 'weather code ' + c.weather_code}, ${cf(c.temperature_2m)} (feels like ${cf(c.apparent_temperature)}), humidity ${c.relative_humidity_2m}%, wind ${Math.round(c.wind_speed_10m)} km/h (${Math.round(c.wind_speed_10m / 1.609)} mph).`];
  day.time.forEach((t, i) => lines.push(`${t}: ${WMO[day.weather_code[i]] || ''}, high ${cf(day.temperature_2m_max[i])}, low ${cf(day.temperature_2m_min[i])}, rain chance ${day.precipitation_probability_max[i] ?? '?'}%`));
  return { text: lines.join('\n'), sources: [{ title: 'Open-Meteo forecast', uri: `https://open-meteo.com/en/docs#latitude=${g.lat}&longitude=${g.lon}` }] };
}

async function localTime(a) {
  const g = await geocode(a.place);
  const now = new Date();
  const s = now.toLocaleString('en-US', { timeZone: g.tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return { text: `${g.label}: ${s} (time zone ${g.tz})` };
}

async function places(a) {
  const q = String(a.query || '').slice(0, 200);
  const d = await getJSON(`https://nominatim.openstreetmap.org/search?q=${enc(q)}&format=jsonv2&limit=6&addressdetails=0`);
  if (!d.length) return { text: `Nothing found on the map for "${q}". Try a more specific place, like "libraries in Newark, NJ".` };
  return {
    text: d.map((p, i) => `${i + 1}. ${p.name || p.display_name.split(',')[0]} — ${p.display_name} (${p.type})`).join('\n'),
    sources: [{ title: 'OpenStreetMap', uri: `https://www.openstreetmap.org/search?query=${enc(q)}` }],
  };
}

async function currency(a) {
  const amount = Number(a.amount ?? 1);
  const from = String(a.from || '').toUpperCase().slice(0, 3), to = String(a.to || '').toUpperCase().slice(0, 3);
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) throw new Error('use 3-letter currency codes like USD, EUR, INR');
  const d = await getJSON(`https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`);
  const v = d.rates?.[to];
  if (v === undefined) throw new Error(`no rate for ${from} to ${to}`);
  return { text: `${amount} ${from} = ${v} ${to} (European Central Bank rate for ${d.date})`, sources: [{ title: 'Frankfurter exchange rates', uri: 'https://www.frankfurter.app/' }] };
}

async function makeImage(a, env) {
  const prompt = String(a.prompt || '').slice(0, 800);
  if (!prompt) throw new Error('no description given');
  if (!env.AI) throw new Error('image making is not available on this server');
  const out = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', { prompt, steps: 4 });
  const b64 = out?.image;
  if (!b64) throw new Error('the image model returned nothing');
  return { text: 'Image created and shown to the user.', image: { data: `data:image/jpeg;base64,${b64}`, prompt } };
}

// ---------------- a small, safe calculator (no eval) ----------------

export function calc(src) {
  const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/,(?=\d{3}\b)/g, '').toLowerCase();
  let i = 0;
  const peek = () => { while (s[i] === ' ') i++; return s[i]; };
  const FN = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log10, ln: Math.log, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, exp: Math.exp };
  const CONST = { pi: Math.PI, e: Math.E };
  function expr() { let v = term(); for (;;) { const c = peek(); if (c === '+') { i++; v += term(); } else if (c === '-') { i++; v -= term(); } else return v; } }
  function term() { let v = power(); for (;;) { const c = peek(); if (c === '*') { i++; v *= power(); } else if (c === '/') { i++; v /= power(); } else if (c === '%') { i++; v %= power(); } else return v; } }
  function power() { const b = unary(); if (peek() === '^' || (s[i] === '*' && s[i + 1] === '*')) { i += s[i] === '^' ? 1 : 2; return b ** power(); } return b; }
  function unary() { const c = peek(); if (c === '-') { i++; return -unary(); } if (c === '+') { i++; return unary(); } return atom(); }
  function atom() {
    const c = peek();
    if (c === '(') { i++; const v = expr(); if (peek() !== ')') throw new Error('missing )'); i++; return pct(v); }
    const num = /^\d*\.?\d+(e[+-]?\d+)?/.exec(s.slice(i));
    if (num) { i += num[0].length; return pct(parseFloat(num[0])); }
    const word = /^[a-z]+/.exec(s.slice(i));
    if (word) {
      i += word[0].length;
      if (word[0] in CONST) return CONST[word[0]];
      if (word[0] in FN) { if (peek() !== '(') throw new Error(`${word[0]} needs ( )`); i++; const v = expr(); if (peek() !== ')') throw new Error('missing )'); i++; return FN[word[0]](v); }
      throw new Error(`unknown word "${word[0]}"`);
    }
    throw new Error(`unexpected "${c ?? 'end'}"`);
  }
  // "15%" on its own means 0.15 (but "a % b" is remainder, handled in term)
  function pct(v) { if (peek() === '%' && !/^\s*[\d(.a-z-]/.test(s.slice(i + 1))) { i++; return v / 100; } return v; }
  const v = expr();
  if (peek() !== undefined) throw new Error(`unexpected "${s[i]}"`);
  return v;
}
