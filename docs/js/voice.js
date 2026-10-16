// voice.js — makes characters talk, and tells the mouth how open to be.
//
// Two engines, both free:
//  • Standard: the browser's built-in speechSynthesis. Instant, no download. The audio
//    is hidden from us, so the mouth is animated with a talking rhythm.
//  • HD: Kokoro, an open-source voice model that runs inside the browser via WebAssembly.
//    Better voices, ~90 MB one-time download. We play the audio ourselves, so the mouth
//    follows the real loudness of the speech (true lip-sync).

import { CONFIG } from './config.js';

const FEMALE = /female|zira|samantha|victoria|karen|moira|tessa|fiona|susan|hazel|libby|aria|jenny|sonia|emma|ava|allison|serena|kate|natasha|michelle|google us english/i;
const MALE = /\bmale\b|david|mark|daniel|alex|fred|george|ryan|guy|christopher|eric|thomas|james|oliver|arthur|andrew|brian|roger/i;

// Split a reply into short sentences: browsers cut off long utterances, and HD speech
// can start playing the first sentence while the next one is still being generated.
export function splitSentences(text) {
  const raw = text.replace(/\s+/g, ' ').match(/[^.!?…。！？]+[.!?…。！？]*["')\]」]*\s*/g) || [text];
  const out = [];
  for (let s of raw) {
    s = s.trim();
    if (!s) continue;
    if (out.length && out[out.length - 1].length < 30) out[out.length - 1] += ' ' + s;
    else out.push(s);
  }
  // very long sentences: split again on commas
  return out.flatMap((s) => (s.length <= 220 ? [s] : s.split(/(?<=,)\s+/)));
}

export class Voice {
  constructor() {
    this.enabled = true;
    this.hd = false;        // user wants natural voices
    this.hdReady = false;   // natural voice model finished downloading
    this.token = 0;          // bumps on every stop(), so old speech loops know to quit
    this.webActive = false;
    this.lastBoundary = 0;
    this.silentUntil = 0;    // with sound off, the character still "talks" for this long
    this.source = null;
    this.onStatus = () => {};
    this.synth = window.speechSynthesis || null;
    this.voices = [];
    if (this.synth) {
      const load = () => (this.voices = this.synth.getVoices());
      load();
      this.synth.addEventListener?.('voiceschanged', load);
    }
    this.level = this.level.bind(this);
  }

  get speaking() { return this.webActive || !!this.source || performance.now() < this.silentUntil; }

  // 0..1 mouth openness for the current moment
  level(t) {
    if (this.source && this.analyser) {
      const buf = this.buf ||= new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      return Math.min(1, Math.sqrt(sum / buf.length) * 7);
    }
    if (this.webActive || performance.now() < this.silentUntil) {
      const since = (performance.now() - this.lastBoundary) / 1000;
      const pulse = 0.55 + 0.45 * Math.exp(-since * 4); // a little burst on each new word
      return pulse * (0.15 + 0.7 * Math.abs(Math.sin(t * 14)) * (0.55 + 0.45 * Math.abs(Math.sin(t * 3.3))));
    }
    return 0;
  }

  stop() {
    this.token++;
    this.synth?.cancel();
    try { this.source?.stop(); } catch {}
    this.source = null;
    this.webActive = false;
    this.silentUntil = 0;
  }

  // lang: BCP-47 code. English uses the character's own voice (HD or standard);
  // other languages (language-practice mode) use a browser voice for that language.
  async speak(text, profile, lang = 'en-US') {
    this.stop();
    if (!text) return;
    const token = this.token;
    if (!this.enabled) {
      // sound off: just move the mouth for about as long as the reply would take to say
      const ms = Math.min(12000, text.split(/\s+/).length * 260);
      this.silentUntil = performance.now() + ms;
      await new Promise((r) => setTimeout(r, ms));
      return;
    }
    const parts = splitSentences(text);
    const english = /^en/i.test(lang);
    if (this.hd && this.hdReady && english) {
      try {
        await this.speakHD(parts, profile.hd, token);
        return;
      } catch (e) {
        console.warn('Natural voice failed for this reply, using the browser voice', e);
      }
    }
    if (token === this.token) await this.speakWeb(parts, profile.web, token, lang);
  }

  // ---------- standard voices ----------

  pickVoice(prof, lang = 'en-US') {
    if (!this.voices.length && this.synth) this.voices = this.synth.getVoices();
    const base = lang.slice(0, 2).toLowerCase();
    const pool = this.voices.filter((v) => v.lang.toLowerCase().startsWith(base));
    if (base !== 'en') {
      // prefer the exact region, then natural/online voices
      const s = (v) => (v.lang.toLowerCase() === lang.toLowerCase()) * 2 + /natural|neural|online|google/i.test(v.name);
      return pool.sort((a, b) => s(b) - s(a))[0] || null;
    }
    const score = (v) =>
      (prof.gender === 'female' ? FEMALE.test(v.name) : MALE.test(v.name)) * 4 +
      /natural|neural|online|google/i.test(v.name) * 2 +
      /en-(us|gb)/i.test(v.lang) * 1;
    return [...pool].sort((a, b) => score(b) - score(a))[0] || null;
  }

  async speakWeb(parts, prof, token, lang = 'en-US') {
    if (!this.synth) return;
    const english = /^en/i.test(lang);
    const voice = this.pickVoice(prof, lang);
    for (const text of parts) {
      if (token !== this.token) return;
      await new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        if (voice) u.voice = voice;
        u.lang = voice?.lang || lang;
        // character pitch only for English; other languages sound better natural and a bit slower
        u.pitch = english ? prof.pitch : 1;
        u.rate = english ? prof.rate : 0.9;
        let timer;
        const done = () => { clearTimeout(timer); this.webActive = false; resolve(); };
        u.onstart = () => { this.webActive = true; this.lastBoundary = performance.now(); };
        u.onboundary = () => (this.lastBoundary = performance.now());
        u.onend = done;
        u.onerror = done;
        // safety net: some browsers never fire onend
        timer = setTimeout(done, (text.split(/\s+/).length * 0.45 / prof.rate + 3) * 1000);
        this.synth.speak(u);
      });
    }
  }

  // ---------- HD voices (Kokoro) ----------

  loadHD(onProgress = () => {}) {
    if (this.ttsPromise) return this.ttsPromise;
    this.ttsPromise = (async () => {
      const { KokoroTTS } = await import(CONFIG.KOKORO_LIB);
      const files = {};
      return KokoroTTS.from_pretrained(CONFIG.KOKORO_MODEL, {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (p) => {
          if (p.status === 'progress' && p.total) {
            files[p.file] = [p.loaded, p.total];
            const [l, t] = Object.values(files).reduce((a, [x, y]) => [a[0] + x, a[1] + y], [0, 0]);
            onProgress(Math.round((l / t) * 100));
          }
        },
      });
    })();
    // Once loaded, time a short phrase. If this device can't generate speech faster than it
    // plays, natural voices would leave awkward silences, so the browser voice is kept instead.
    this.ttsPromise = this.ttsPromise.then(async (tts) => {
      while (document.hidden) await new Promise((r) => setTimeout(r, 1000)); // hidden tabs run slowly
      const t0 = performance.now();
      const a = await tts.generate('Hello there, it is nice to meet you.', { voice: 'af_heart' });
      const secs = (performance.now() - t0) / 1000;
      this.rtf = secs / (a.audio.length / a.sampling_rate);
      this.hdSlow = this.rtf > 0.85;
      this.hdReady = !this.hdSlow;
      return tts;
    });
    this.ttsPromise.catch(() => (this.ttsPromise = null));
    return this.ttsPromise;
  }

  audioContext() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  async speakHD(parts, prof, token) {
    const tts = await this.loadHD();
    const ctx = this.audioContext();
    await ctx.resume();
    const gen = (text) => tts.generate(text, { voice: prof.voice, speed: prof.speed });
    let next = gen(parts[0]);
    for (let i = 0; i < parts.length; i++) {
      // if the very first sentence takes too long, give up on natural voice for this reply
      const audio = i === 0
        ? await Promise.race([next, new Promise((_, rej) => setTimeout(() => rej(new Error('natural voice too slow')), 5000))])
        : await next;
      if (token !== this.token) return;
      if (i + 1 < parts.length) next = gen(parts[i + 1]); // make the next sentence while this one plays
      await new Promise((resolve) => {
        const buf = ctx.createBuffer(1, audio.audio.length, audio.sampling_rate);
        buf.copyToChannel(audio.audio, 0);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = prof.pitch; // pitch shift: >1 squeakier, <1 deeper
        src.connect(this.analyser);
        src.onended = () => { if (this.source === src) this.source = null; setTimeout(resolve, 120); };
        this.source = src;
        src.start();
      });
      if (token !== this.token) return;
    }
  }
}
