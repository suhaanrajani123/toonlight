// listen.js — talk to the characters with your microphone.
// Uses the browser's built-in speech recognition (free; works in Chrome and Edge).

export class Listener {
  constructor({ onInterim, onFinal, onState }) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = !!SR;
    this.listening = false;
    if (!SR) return;
    this.rec = new SR();
    this.rec.lang = 'en-US';
    this.rec.interimResults = true;
    this.rec.continuous = false; // stop automatically when you stop talking
    let finalText = '';
    this.rec.onstart = () => { finalText = ''; this.listening = true; onState(true); };
    this.rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      onInterim((finalText + interim).trim());
    };
    this.rec.onerror = (e) => { this.error = e.error; };
    this.rec.onend = () => {
      this.listening = false;
      onState(false, this.error);
      this.error = null;
      if (finalText.trim()) onFinal(finalText.trim());
    };
  }

  toggle() {
    if (!this.supported) return;
    if (this.listening) this.rec.stop();
    else { try { this.rec.start(); } catch {} }
  }
}
