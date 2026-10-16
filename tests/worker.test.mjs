// Tests the worker without a real API key: Gemini is replaced with a fake.
// Run: node tests/worker.test.mjs
import assert from 'node:assert/strict';
import worker, { toGeminiContents, readGemini } from '../worker/worker.js';

const calls = [];
let mode = 'ok';
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  calls.push({ url, body, key: init.headers['x-goog-api-key'] });
  if (mode === 'quota-on-search' && body.tools) return new Response('{"error":{"code":429}}', { status: 429 });
  if (mode === 'down') return new Response('boom', { status: 500 });
  return Response.json({
    candidates: [{
      content: { parts: [{ text: 'thinking...', thought: true }, { text: '[happy] Ooh! The sky is blue because of Rayleigh scattering.' }] },
      groundingMetadata: { groundingChunks: [{ web: { uri: 'https://example.org/a', title: 'example.org' } }, { web: { uri: 'https://example.org/a', title: 'dup' } }] },
      finishReason: 'STOP',
    }],
  });
};

const env = { GEMINI_API_KEY: 'test-key', ALLOWED_ORIGINS: 'https://me.github.io,http://localhost:8765' };
const req = (body, origin = 'https://me.github.io', method = 'POST', path = '/chat') =>
  new Request(`https://toonlight.example.workers.dev${path}`, {
    method, headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': Math.random().toString() },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
const good = { character: 'stella', messages: [{ role: 'assistant', text: 'hi!' }, { role: 'user', text: 'Why is the sky blue?' }] };

// 1. happy path
let res = await worker.fetch(req(good), env);
let data = await res.json();
assert.equal(res.status, 200);
assert.equal(data.reply, '[happy] Ooh! The sky is blue because of Rayleigh scattering.', 'thought parts are dropped');
assert.deepEqual(data.sources, [{ title: 'example.org', uri: 'https://example.org/a' }], 'sources de-duplicated');
assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://me.github.io');
const sent = calls.at(-1);
assert.match(sent.url, /models\/gemini-3\.8-flash:generateContent$/);
assert.equal(sent.key, 'test-key');
assert.deepEqual(sent.body.tools, [{ google_search: {} }]);
assert.match(sent.body.systemInstruction.parts[0].text, /You are Stella Nova/);
assert.equal(sent.body.contents[0].role, 'user', 'leading assistant turn removed');
console.log('ok  happy path');

// 2. search quota used up → retries without search
mode = 'quota-on-search';
calls.length = 0;
res = await worker.fetch(req(good), env);
assert.equal(res.status, 200);
assert.equal(calls.length, 2);
assert.equal(calls[1].body.tools, undefined);
console.log('ok  falls back to no-search');

// 3. Gemini down → 502 with a message
mode = 'down';
res = await worker.fetch(req(good), env);
assert.equal(res.status, 502);
mode = 'ok';
console.log('ok  upstream error');

// 4. CORS + validation
res = await worker.fetch(req(good, 'https://evil.example'), env);
assert.equal(res.status, 403);
res = await worker.fetch(req(undefined, 'http://localhost:8765', 'OPTIONS'), env);
assert.equal(res.status, 204);
assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'http://localhost:8765');
for (const bad of [{ character: 'nobody', messages: good.messages }, { character: 'stella', messages: [] },
  { character: 'stella', messages: [{ role: 'user', text: 'x'.repeat(2001) }] },
  { character: 'stella', messages: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'yo' }] }]) {
  res = await worker.fetch(req(bad), env);
  assert.equal(res.status, 400, JSON.stringify(bad).slice(0, 60));
}
res = await worker.fetch(req('not json'), env);
assert.equal(res.status, 400);
res = await worker.fetch(req(good), { GEMINI_API_KEY: '' });
assert.equal(res.status, 500);
res = await worker.fetch(req(undefined, '', 'GET', '/'), env);
assert.equal((await res.json()).characters.length, 6);

console.log('ok  cors + validation');

// 5. rate limit: same visitor, 21 messages in a minute
const fixed = () => new Request('https://x.dev/chat', { method: 'POST', headers: { Origin: 'https://me.github.io', 'CF-Connecting-IP': '1.2.3.4' }, body: JSON.stringify(good) });
let last;
for (let i = 0; i < 21; i++) last = await worker.fetch(fixed(), env);
assert.equal(last.status, 429);
console.log('ok  rate limit');

// 6. helpers
assert.deepEqual(toGeminiContents([{ role: 'user', text: 'a' }, { role: 'user', text: 'b' }, { role: 'assistant', text: 'c' }]).map((c) => c.role), ['user', 'model']);
assert.equal(readGemini({}).text, '');
console.log('ok  helpers');

// 7. Workers AI path (no Gemini key) + Gemini failing over to Workers AI
const aiCalls = [];
const AI = { run: async (model, input) => { aiCalls.push({ model, input }); if (model.includes('70b') && input.messages.at(-1).content === 'fail70') throw new Error('capacity'); return { response: '[happy] Here is a real answer from Workers AI.' }; } };
res = await worker.fetch(req(good), { AI, ALLOWED_ORIGINS: env.ALLOWED_ORIGINS });
data = await res.json();
assert.equal(res.status, 200);
assert.match(data.reply, /Workers AI/);
assert.equal(aiCalls[0].input.messages[0].role, 'system');
assert.match(aiCalls[0].input.messages[0].content, /You are Stella Nova/);
assert.equal(aiCalls[0].input.messages.at(-1).content, 'Why is the sky blue?');
res = await worker.fetch(req({ character: 'kaito', messages: [{ role: 'user', text: 'fail70' }] }), { AI, ALLOWED_ORIGINS: env.ALLOWED_ORIGINS });
assert.equal(res.status, 200, 'falls back to the smaller model');
assert.ok(aiCalls.at(-1).model.includes('8b'));
mode = 'down';
res = await worker.fetch(req(good), { ...env, AI });
assert.equal(res.status, 200, 'Gemini down → Workers AI answers');
mode = 'ok';
res = await worker.fetch(req(good), { ALLOWED_ORIGINS: env.ALLOWED_ORIGINS });
assert.equal(res.status, 500, 'no AI configured');
console.log('ok  workers AI');

// 8. practice modes + memory reach the system prompt; bad values are rejected
aiCalls.length = 0;
res = await worker.fetch(req({ ...good, mode: 'quiz', topic: 'data structures', memory: { name: 'Suhaan', goals: 'Ace CS114', facts: ['Studies at NJIT'] } }), { AI, ALLOWED_ORIGINS: env.ALLOWED_ORIGINS });
assert.equal(res.status, 200);
const sys = aiCalls[0].input.messages[0].content;
assert.match(sys, /QUIZ ME.*data structures/s);
assert.match(sys, /Their name: Suhaan/);
assert.match(sys, /Studies at NJIT/);
assert.match(sys, /\[remember:/);
res = await worker.fetch(req({ ...good, mode: 'language', lang: 'Japanese' }), { AI, ALLOWED_ORIGINS: env.ALLOWED_ORIGINS });
assert.match(aiCalls.at(-1).input.messages[0].content, /LANGUAGE PRACTICE in Japanese/);
for (const bad of [{ mode: 'hack' }, { lang: 'Klingon' }, { topic: 'x'.repeat(200) }, { memory: { facts: ['x'.repeat(300)] } }, { memory: 'nope' }]) {
  res = await worker.fetch(req({ ...good, ...bad }), { AI, ALLOWED_ORIGINS: env.ALLOWED_ORIGINS });
  assert.equal(res.status, 400, JSON.stringify(bad).slice(0, 40));
}
console.log('ok  modes + memory\nall worker tests passed');
