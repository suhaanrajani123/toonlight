// rich.js — small, safe formatting for replies: web links you can click, and **bold**.
//
// Replies are never put on the page as HTML. The text is cut into pieces here, and main.js
// turns each piece into a text node, a link or a <strong>, so a reply can't inject anything.

const PATTERN = /(https?:\/\/[^\s<>"')\]]*[^\s<>"')\].,;:!?])|\*\*([^*\n]+)\*\*/g;

// "See **this**: https://nasa.gov." → [{ text: 'See ' }, { bold: 'this' }, { text: ': ' }, { link: 'https://nasa.gov', label: 'nasa.gov' }, { text: '.' }]
export function pieces(text) {
  const out = [];
  const s = String(text ?? '');
  let last = 0;
  for (const m of s.matchAll(PATTERN)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    if (m[1]) out.push({ link: m[1], label: m[1].replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') });
    else out.push({ bold: m[2] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}
