// Tests Agent mode: the tool loop, streaming, each tool (with fake web services) and the calculator.
// Run: node tests/agent.test.mjs
import assert from 'node:assert/strict';
import worker from '../worker/worker.js';
import { calc, extractCalls, htmlToText } from '../worker/agent.js';

// 1. calculator
assert.equal(calc('2+3*4'), 14);
assert.equal(calc('(1200*0.07)/12'), 7.000000000000001);
assert.equal(calc('2^10'), 1024);
assert.equal(calc('sqrt(144) + abs(-3)'), 15);
assert.equal(calc('15% * 200'), 30);
assert.equal(calc('10 % 4'), 2);
assert.equal(calc('-(3 - 5)'), 2);
assert.equal(Math.round(calc('2*pi')*1000), 6283);
assert.equal(calc('1,000 + 1'), 1001);
assert.throws(() => calc('alert(1)'), /unknown word/);
assert.throws(() => calc('2 +'), /unexpected/);
console.log('ok  calculator');

// 2. reading tool tags and web pages
assert.deepEqual(extractCalls('[tool: {"name":"weather","args":{"place":"Newark"}}]\n[tool: {"name":"calculate","args":{"expression":"[1]"}}]'), [
  { name: 'weather', args: { place: 'Newark' } }, { name: 'calculate', args: { expression: '[1]' } }]);
assert.deepEqual(extractCalls('no tools here'), []);
const page = htmlToText('<html><title>Hi there</title><script>evil()</script><nav>menu</nav><p>First &amp; best.</p><p>Second</p></html>');
assert.equal(page.title, 'Hi there');
assert.match(page.text, /First & best\.\nSecond/);
assert.doesNotMatch(page.text, /evil|menu/);
console.log('ok  tool tags + page reading');

// 3. the loop, end to end, with fake AI + fake web services
const aiCalls = [];
let script = [];
const AI = { run: async (model, input) => {
  aiCalls.push({ model, input });
  if (model.includes('flux')) return { image: 'AAAA' };
  return { response: script.shift() ?? '[neutral] done' };
} };
const fetched = [];
globalThis.fetch = async (url, init) => {
  url = String(url);
  fetched.push(url);
  if (url.startsWith('https://proj.supabase.co/auth/v1/user')) return Response.json({ id: 'u1', email: 'me@x.com' });
  if (url.includes('geocoding-api.open-meteo.com')) return Response.json({ results: [{ name: 'Newark', admin1: 'New Jersey', country: 'United States', country_code: 'US', latitude: 40.7, longitude: -74.2, timezone: 'America/New_York' }, { name: 'Newark', admin1: 'Delaware', country: 'United States', latitude: 39.7, longitude: -75.7, timezone: 'America/New_York' }] });
  if (url.includes('api.open-meteo.com')) return Response.json({ current: { temperature_2m: 20, apparent_temperature: 19, relative_humidity_2m: 50, wind_speed_10m: 16.09, weather_code: 2 }, daily: { time: ['2026-10-20'], weather_code: [61], temperature_2m_max: [22], temperature_2m_min: [10], precipitation_probability_max: [70] } });
  if (url.includes('wikipedia.org') && url.includes('list=search')) return Response.json({ query: { search: [{ title: 'Ada Lovelace' }] } });
  if (url.includes('wikipedia.org')) return Response.json({ query: { pages: { 1: { title: 'Ada Lovelace', extract: 'Ada Lovelace was an English mathematician.' } } } });
  if (url.includes('news.google.com')) return new Response('<rss><item><title>Big news</title><link>https://news.example/1</link><pubDate>Mon</pubDate><source>Example</source></item></rss>');
  if (url.includes('frankfurter')) return Response.json({ date: '2026-10-20', rates: { EUR: 92.5 } });
  if (url.includes('nominatim')) return Response.json([{ name: 'Newark Public Library', display_name: 'Newark Public Library, 5 Washington St, Newark, NJ', type: 'library' }]);
  if (url.startsWith('https://example.org/article')) return new Response('<html><title>Article</title><p>The answer is 42.</p></html>', { headers: { 'content-type': 'text/html' } });
  if (url.includes('api.tavily.com')) return Response.json({ results: [{ title: 'Result', url: 'https://r.example', content: 'Searched content' }] });
  return new Response('nope', { status: 404 });
};
const env = { AI, ALLOWED_ORIGINS: '*', SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_KEY: 'k' };
const req = (body) => new Request('https://w.example/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://me.github.io', 'CF-Connecting-IP': Math.random().toString() }, body: JSON.stringify(body) });
const agent = (text, extra = {}) => ({ character: 'jun', mode: 'agent', auth: 'tok', messages: [{ role: 'user', text }], ...extra });
async function events(res) {
  const text = await res.text();
  return text.trim().split('\n').map((l) => JSON.parse(l));
}

script = [
  '[tool: {"name":"weather","args":{"place":"Newark, New Jersey"}}]\n[tool: {"name":"calculate","args":{"expression":"20*9/5+32"}}]',
  '[tool: {"name":"wikipedia","args":{"query":"Ada Lovelace"}}]',
  '[happy] It is 20°C (68°F) in Newark with a 70% chance of rain. Ada Lovelace was a mathematician.',
];
let res = await worker.fetch(req(agent('weather in newark and who was ada lovelace?', { now: 'Tuesday', tz: 'America/New_York' })), env);
assert.equal(res.headers.get('content-type'), 'application/x-ndjson; charset=utf-8');
let ev = await events(res);
const steps = ev.filter((e) => e.type === 'step').map((e) => e.tool);
assert.deepEqual(steps, ['weather', 'calculate', 'wikipedia'], 'tools run in order');
assert.ok(ev.filter((e) => e.type === 'step-done').every((e) => e.ok), 'all tools succeeded');
const final = ev.at(-1);
assert.equal(final.type, 'final');
assert.match(final.reply, /Newark/);
assert.ok(final.sources.some((s) => s.uri.includes('wikipedia.org/wiki/Ada_Lovelace')), 'sources collected');
const secondTurn = aiCalls.filter((c) => !c.model.includes('flux'))[1].input.messages.at(-1).content;
assert.match(secondTurn, /\[tool results\][\s\S]*New Jersey[\s\S]*68 = 68|68/, 'results fed back to the AI');
assert.match(secondTurn, /20°C \/ 68°F/);
assert.match(aiCalls[0].input.messages[0].content, /TOOLS\.[\s\S]*web_search[\s\S]*MODE: AGENT|MODE: AGENT[\s\S]*TOOLS\./);
assert.ok(fetched.some((u) => u.includes('latitude=40.7')), 'picked Newark, New Jersey (not Delaware)');
console.log('ok  agent loop: weather → calculate → wikipedia → answer, streamed');

// 4. every other tool
script = [
  '[tool: {"name":"news","args":{"query":"NJIT"}}]\n[tool: {"name":"currency","args":{"amount":100,"from":"usd","to":"eur"}}]\n[tool: {"name":"places","args":{"query":"library Newark"}}]',
  '[tool: {"name":"read_page","args":{"url":"https://example.org/article"}}]\n[tool: {"name":"local_time","args":{"place":"Newark"}}]\n[tool: {"name":"make_image","args":{"prompt":"a fox"}}]',
  '[tool: {"name":"read_page","args":{"url":"http://localhost/admin"}}]\n[tool: {"name":"nope","args":{}}]',
  '[happy] Here you go.',
];
res = await worker.fetch(req(agent('do many things')), env);
ev = await events(res);
const done = Object.fromEntries(ev.filter((e) => e.type === 'step-done').map((e, i) => [`${i}:${e.tool}`, e.ok]));
assert.deepEqual(Object.values(done), [true, true, true, true, true, true, false, false], JSON.stringify(done));
assert.equal(ev.find((e) => e.type === 'image').image.data, 'data:image/jpeg;base64,AAAA', 'image streamed');
const results = aiCalls.filter((c) => !c.model.includes('flux')).at(-1).input.messages.slice(-2).map((m) => m.content).join('\n');
assert.match(results, /that address is private[\s\S]*no tool called nope/);
const r2 = aiCalls.filter((c) => !c.model.includes('flux')).at(-2).input.messages.at(-1).content;
assert.match(r2, /The answer is 42/);
assert.match(r2, /time zone America\/New_York/);
const r1 = aiCalls.filter((c) => !c.model.includes('flux')).at(-3).input.messages.at(-1).content;
assert.match(r1, /Big news[\s\S]*100 USD = 92\.5 EUR[\s\S]*Newark Public Library/);
console.log('ok  news, currency, places, read page, time, images; private links and unknown tools refused');

// 5. web search: Tavily when a key is set, else Wikipedia + news
script = ['[tool: {"name":"web_search","args":{"query":"best laptops 2026"}}]', '[happy] ok'];
res = await worker.fetch(req(agent('search')), { ...env, TAVILY_API_KEY: 'tvly-x' });
await events(res);
assert.ok(fetched.some((u) => u.includes('api.tavily.com')));
script = ['[tool: {"name":"web_search","args":{"query":"Ada Lovelace"}}]', '[happy] ok'];
res = await worker.fetch(req(agent('search')), env);
await events(res);
assert.match(aiCalls.filter((c) => !c.model.includes('flux')).at(-1).input.messages.at(-1).content, /isn't set up[\s\S]*Ada Lovelace[\s\S]*Big news/);
console.log('ok  web search (Tavily or Wikipedia + news)');

// 6. step limit: an agent that never stops is made to answer
script = Array(5).fill('[tool: {"name":"calculate","args":{"expression":"1+1"}}]').concat(['[neutral] Final.']);
res = await worker.fetch(req(agent('loop forever')), env);
ev = await events(res);
assert.equal(ev.filter((e) => e.type === 'step').length, 5);
assert.equal(ev.at(-1).reply, '[neutral] Final.');
console.log('ok  step limit\nall agent tests passed');
