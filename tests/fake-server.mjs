// Runs the real worker locally on :8787 with a fake Gemini behind it (for browser tests).
import http from 'node:http';
import worker from '../worker/worker.js';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  const last = body.contents.at(-1).parts[0].text;
  const who = body.systemInstruction.parts[0].text.match(/You are ([A-Z][\w ]+?)[,.]/)[1];
  const sys = body.systemInstruction.parts[0].text;
  let text = `[surprised] **${who}** here. You asked: "${last}". That's a sharp question, and here's a second sentence so the voice has something to say.`;
  if (/QUIZ ME/.test(sys)) text = `[happy] Question 1: What does LIFO stand for?\nA. Last In First Out\nB. Least In Full Out [score: 1/1]`;
  if (/LANGUAGE PRACTICE in (\w+)/.test(sys)) text = `[happy] ¡Hola! ¿Cómo estás?\nCorrection: Perfect!\nMeaning: Hi! How are you?`;
  if (/my name is (\w+)/i.test(last)) text = `[happy] Nice to meet you, ${last.match(/my name is (\w+)/i)[1]}! [remember: The user's name is ${last.match(/my name is (\w+)/i)[1]}]`;
  return Response.json({ candidates: [{ content: { parts: [{ text }] },
    groundingMetadata: { groundingChunks: [{ web: { uri: 'https://www.nasa.gov/', title: 'nasa.gov' } }] } }] });
};
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await worker.fetch(new Request(`http://localhost:8787${req.url}`, { method: req.method, headers: req.headers, body: ['GET','OPTIONS'].includes(req.method) ? undefined : Buffer.concat(chunks) }),
    { GEMINI_API_KEY: 'fake', ALLOWED_ORIGINS: 'http://localhost:8765' });
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8787, () => console.log('fake worker on 8787'));
