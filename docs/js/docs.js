// docs.js — "study my document": read a file in the browser, keep it, and find the parts
// that matter for each question.
//
// Files never go to a server whole. They're read right here (PDF with pdf.js, Word and
// PowerPoint by unzipping them, plain text as is), cut into short passages and saved in this
// browser (IndexedDB). For each message, only the few passages most related to it are sent
// to the AI, so even a long textbook chapter works on the free plan.

const DB = 'toonlight-docs', STORE = 'docs';
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_CHARS = 600000;
export const ACCEPT = '.pdf,.docx,.pptx,.txt,.md,.csv,.json,.html,.htm,.rtf';

// ---------- storage ----------

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
  });
}
export const listDocs = async () => {
  try { return (await tx('readonly', (s) => s.getAll())).sort((a, b) => b.added - a.added); } catch { return []; }
};
export const getDoc = async (id) => { try { return (await tx('readonly', (s) => s.get(id))) || null; } catch { return null; } };
export const removeDoc = (id) => tx('readwrite', (s) => s.delete(id));
const putDoc = (doc) => tx('readwrite', (s) => s.put(doc));

// ---------- reading files ----------

// Unzip one file from a .docx/.pptx (zip) using the browser's built-in decompressor.
async function unzip(buf, wanted) {
  const v = new DataView(buf), out = {};
  // find the end-of-central-directory record
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file');
  let p = v.getUint32(eocd + 16, true);
  const count = v.getUint16(eocd + 10, true);
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!wanted(name)) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = new Uint8Array(buf, start, size);
    if (method === 0) out[name] = dec.decode(data);
    else if (method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      out[name] = await new Response(stream).text();
    }
  }
  return out;
}

const xmlText = (xml, paraTag) => xml
  .replace(new RegExp(`</${paraTag}>`, 'g'), '\n')
  .replace(/<w:tab\/>|<a:tab\/>/g, ' ')
  .replace(/<w:br\/>|<a:br\/>/g, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

async function readPdf(buf, onProgress) {
  const pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    let text = '';
    for (const it of tc.items) text += it.str + (it.hasEOL ? '\n' : ' ');
    pages.push({ page: i, text });
    onProgress?.(Math.round((i / pdf.numPages) * 100));
  }
  return pages;
}

async function readFile(file, onProgress) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const buf = await file.arrayBuffer();
  if (ext === 'pdf') return readPdf(buf, onProgress);
  if (ext === 'docx') {
    const f = await unzip(buf, (n) => n === 'word/document.xml');
    return [{ text: xmlText(f['word/document.xml'] || '', 'w:p') }];
  }
  if (ext === 'pptx') {
    const f = await unzip(buf, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    return Object.keys(f)
      .sort((a, b) => +a.match(/(\d+)\.xml/)[1] - +b.match(/(\d+)\.xml/)[1])
      .map((k) => ({ page: +k.match(/(\d+)\.xml/)[1], text: xmlText(f[k], 'a:p'), slide: true }));
  }
  let text = new TextDecoder().decode(buf);
  if (ext === 'html' || ext === 'htm') text = new DOMParser().parseFromString(text, 'text/html').body.innerText;
  if (ext === 'rtf') text = text.replace(/\\par[d]?/g, '\n').replace(/\{\*?\\[^{}]+}|[{}]|\\\S+\s?/g, '');
  return [{ text }];
}

// Cut pages into passages of about 900 characters, on paragraph or sentence boundaries.
function chunk(pages) {
  const chunks = [];
  for (const pg of pages) {
    const paras = pg.text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').split(/\n\s*\n|\n(?=[A-Z0-9•\-–])/).map((s) => s.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
    let buf = '';
    const flush = () => { if (buf.trim().length > 20) chunks.push({ text: buf.trim(), page: pg.page, slide: pg.slide }); buf = ''; };
    for (let para of paras) {
      while (para.length > 1300) {
        const cut = para.lastIndexOf('. ', 900) > 300 ? para.lastIndexOf('. ', 900) + 1 : 900;
        if (buf) flush();
        buf = para.slice(0, cut);
        flush();
        para = para.slice(cut).trim();
      }
      if (buf.length + para.length > 950) flush();
      buf += (buf ? '\n' : '') + para;
    }
    flush();
  }
  return chunks;
}

export async function addDoc(file, onProgress) {
  if (file.size > MAX_BYTES) throw new Error('That file is over 25 MB. Try a smaller one, or split it.');
  const pages = await readFile(file, onProgress);
  let total = 0;
  const kept = [];
  for (const p of pages) { if (total > MAX_CHARS) break; kept.push(p); total += p.text.length; }
  const chunks = chunk(kept);
  if (!chunks.length) throw new Error(/\.pdf$/i.test(file.name)
    ? "I couldn't find any text in that PDF. If it's a scan or photos, it needs to be a PDF with real text."
    : "I couldn't find any text in that file.");
  const doc = { id: `d${Date.now().toString(36)}`, name: file.name.slice(0, 120), size: file.size, chars: total, pages: pages.length, chunks, added: Date.now() };
  await putDoc(doc);
  return doc;
}

// ---------- finding the right passages (BM25 keyword search) ----------

const STOP = new Set('a an and are as at be but by can do does for from has have how i if in into is it its me my of on or our so than that the their them then there these they this to was we what when where which who why will with you your about explain tell please give show'.split(' '));
const words = (s) => (s.toLowerCase().match(/[a-z0-9À-ɏЀ-ӿऀ-ॿ]+/g) || []).filter((w) => w.length > 1 && !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, '') || w);

function index(doc) {
  if (doc._idx) return doc._idx;
  const tf = doc.chunks.map((c) => { const m = new Map(); for (const w of words(c.text)) m.set(w, (m.get(w) || 0) + 1); return m; });
  const df = new Map();
  for (const m of tf) for (const w of m.keys()) df.set(w, (df.get(w) || 0) + 1);
  const len = tf.map((m) => [...m.values()].reduce((a, b) => a + b, 0));
  const avg = len.reduce((a, b) => a + b, 0) / Math.max(1, len.length);
  return (doc._idx = { tf, df, len, avg });
}

function search(doc, query, k) {
  const { tf, df, len, avg } = index(doc);
  const q = [...new Set(words(query))];
  const N = doc.chunks.length;
  const scores = tf.map((m, i) => {
    let s = 0;
    for (const w of q) {
      const f = m.get(w);
      if (!f) continue;
      const idf = Math.log(1 + (N - df.get(w) + 0.5) / (df.get(w) + 0.5));
      s += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * len[i] / avg));
    }
    return [s, i];
  });
  return scores.filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, k).map(([, i]) => i);
}

const label = (doc, c) => (c.page ? `${c.slide ? 'slide' : 'page'} ${c.page}` : '');
const part = (doc, i) => ({ text: doc.chunks[i].text.slice(0, 1800), where: label(doc, doc.chunks[i]) });

// Evenly spread passages: for "summarize this" style questions.
function spread(doc, k) {
  const n = doc.chunks.length;
  if (n <= k) return doc.chunks.map((_, i) => i);
  return Array.from({ length: k }, (_, j) => Math.floor((j * (n - 1)) / (k - 1)));
}

// The passages to send with a chat message (about 9,000 characters at most).
export function passagesFor(doc, message, recent = '') {
  const overview = /\b(summar|overview|main (idea|point)|key (point|idea|takeaway)|what is (this|the) (doc|document|file|pdf)|about\b.*\b(doc|document|file)|outline|tl;?dr)/i.test(message);
  let ids = overview ? spread(doc, 8) : search(doc, `${message} ${message} ${recent}`, 7);
  if (!ids.length) ids = spread(doc, 5);
  ids = [...new Set(ids)].sort((a, b) => a - b);
  const parts = [];
  let total = 0;
  for (const i of ids) {
    const p = part(doc, i);
    if (total + p.text.length > 9000) break;
    total += p.text.length;
    parts.push(p);
  }
  return parts;
}

// A fresh passage to write a quiz question from: never one used in the last few questions,
// so each question comes from a different part of the document.
export function quizPassage(doc, used = [], focus = '') {
  const n = doc.chunks.length;
  const recent = new Set(used.slice(-Math.min(n - 1, 40)));
  let pool = [];
  if (focus) pool = search(doc, focus, 12).filter((i) => !recent.has(i));
  const fresh = doc.chunks.map((_, i) => i).filter((i) => !recent.has(i));
  if (!pool.length) pool = fresh.filter((i) => doc.chunks[i].text.length > 200); // prefer meaty passages
  if (!pool.length) pool = fresh;
  if (!pool.length) pool = doc.chunks.map((_, i) => i);
  const i = pool[Math.floor(Math.random() * pool.length)];
  const parts = [part(doc, i)];
  if (doc.chunks[i + 1] && doc.chunks[i].text.length < 600) parts.push(part(doc, i + 1));
  return { index: i, parts };
}
