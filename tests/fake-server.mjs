// Runs the real worker locally on :8787 with a fake Gemini behind it (for browser tests).
import http from 'node:http';
import worker from '../worker/worker.js';
const realFetch = globalThis.fetch;
let qn = 0;
globalThis.fetch = async (url, init) => {
  // fake Supabase: only "good-token" is a real sign-in
  if (String(url).startsWith('https://fake.supabase.co/auth/v1/user')) {
    return init.headers.Authorization === 'Bearer good-token' ? Response.json({ id: 'u1', email: 'me@example.com' }) : Response.json({ msg: 'bad' }, { status: 401 });
  }
  if (String(url).includes('geocoding-api.open-meteo.com')) return Response.json({ results: [{ name: 'Newark', admin1: 'New Jersey', country: 'United States', latitude: 40.7, longitude: -74.2, timezone: 'America/New_York' }] });
  if (String(url).includes('api.open-meteo.com')) return Response.json({ current: { temperature_2m: 18, apparent_temperature: 17, relative_humidity_2m: 60, wind_speed_10m: 10, weather_code: 61 }, daily: { time: ['2026-10-21'], weather_code: [61], temperature_2m_max: [20], temperature_2m_min: [11], precipitation_probability_max: [80] } });
  const body = JSON.parse(init.body);
  const last = body.contents.at(-1).parts[0].text;
  const who = body.systemInstruction.parts[0].text.match(/You are ([A-Z][\w ]+?)[,.]/)[1];
  const sys = body.systemInstruction.parts[0].text;
  let text = `[surprised] **${who}** here. You asked: "${last}". That's a sharp question, and here's a second sentence so the voice has something to say.`;
  if (/QUIZ ME/.test(sys)) {
    qn++;
    const fromDoc = /ONLY from the passage below/.test(sys) ? ' (from your document)' : '';
    text = `[happy] Here we go! [quiz: {"q":"Question ${qn}${fromDoc}: what does LIFO stand for in topic ${qn}?","options":["Last In First Out","Least In Full Out","Last Input Final Output","Long In Fast Out"],"answer":0,"explain":"A stack takes the newest item off first."}]`;
  }
  if (/you have studied it/.test(sys)) text = `[happy] From your document: ${sys.split(/\[Part 1[^\]]*\]\n/)[1].slice(0, 400)}`;
  if (/LANGUAGE PRACTICE in (\w+)/.test(sys)) text = `[happy] ¡Hola! ¿Cómo estás?\nCorrection: Perfect!\nMeaning: Hi! How are you?`;
  if (/my name is (\w+)/i.test(last)) text = `[happy] Nice to meet you, ${last.match(/my name is (\w+)/i)[1]}! [remember: The user's name is ${last.match(/my name is (\w+)/i)[1]}]`;
  if (/MODE: AGENT/.test(sys) && /weather/i.test(last)) text = '[tool: {"name":"weather","args":{"place":"Newark, NJ"}}]';
  if (/MODE: AGENT/.test(sys) && /^\[tool results\]/.test(last)) text = `[happy] Rain is likely tomorrow (${/rain chance (\d+)%/.exec(last)?.[1]}%), so take an umbrella. [action: {"type":"file","name":"packing.csv","content":"Item,Why\\nUmbrella,Rain"}]`;
  if (/MODE: AGENT/.test(sys) && /remind me/i.test(last)) text = `[happy] You got it, tap the button to set it. [action: {"type":"reminder","text":"Finish the math notes","in_minutes":60}]`;
  if (/MODE: AGENT/.test(sys) && /whatsapp/i.test(last)) text = `[neutral] Here's a message ready to go. [action: {"type":"message","app":"whatsapp","to":"Rahul","text":"Hey Rahul, I won't make it to class today."}]`;
  if (/MODE: AGENT/.test(sys) && /amazon/i.test(last)) text = `[happy] Here are some options. [action: {"type":"shop","store":"amazon","query":"logitech wireless mouse"}]`;
  if (/MODE: AGENT/.test(sys) && /calendar/i.test(last)) text = `[happy] Added below, just confirm it. [action: {"type":"calendar","title":"Study session","start":"2026-10-23T16:00","minutes":90}]`;
  return Response.json({ candidates: [{ content: { parts: [{ text }] },
    groundingMetadata: { groundingChunks: [{ web: { uri: 'https://www.nasa.gov/', title: 'nasa.gov' } }] } }] });
};
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const r = await worker.fetch(new Request(`http://localhost:8787${req.url}`, { method: req.method, headers: req.headers, body: ['GET','OPTIONS'].includes(req.method) ? undefined : Buffer.concat(chunks) }),
    { GEMINI_API_KEY: 'fake', ALLOWED_ORIGINS: 'http://localhost:8765', SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_KEY: 'k' });
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8787, () => console.log('fake worker on 8787'));
