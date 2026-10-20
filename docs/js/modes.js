// modes.js — what you can DO with a character. This is the site's purpose:
// every character can be your practice partner in one of these modes.

export const LANGS = [
  { name: 'Spanish', code: 'es-ES' }, { name: 'French', code: 'fr-FR' }, { name: 'German', code: 'de-DE' },
  { name: 'Italian', code: 'it-IT' }, { name: 'Portuguese', code: 'pt-BR' }, { name: 'Japanese', code: 'ja-JP' },
  { name: 'Korean', code: 'ko-KR' }, { name: 'Chinese', code: 'zh-CN' }, { name: 'Hindi', code: 'hi-IN' },
  { name: 'Arabic', code: 'ar-SA' },
];
export const langCode = (name) => LANGS.find((l) => l.name === name)?.code || 'en-US';

export const MODES = [
  {
    id: 'chat', label: 'Just chat', note: 'Ask anything, get advice, or upload a document and ask about it.',
    field: null, start: null,
  },
  {
    id: 'agent', label: 'Agent', note: 'Sign in, then give them a goal: research, live info, math, pictures, files, reminders, messages and more.',
    field: null, start: null, auth: true,
  },
  {
    id: 'quiz', label: 'Quiz me', note: 'Exam practice: one question at a time, graded, with a running score.',
    field: { kind: 'topic', label: 'Quiz topic', placeholder: 'e.g. CS114 linked lists', fallback: '', quiz: true },
    start: (o) => `Quiz me on ${o.useDoc && o.docName ? `my document "${o.docName}"${o.topic ? ` (focus: ${o.topic})` : ''}` : o.topic || 'something fun'}, ${o.difficulty} level! Start with the first question.`,
  },
  {
    id: 'interview', label: 'Mock interview', note: 'Practice answering real interview questions and get a score on each.',
    field: { kind: 'topic', label: 'Role', placeholder: 'e.g. Software engineering intern', fallback: 'Software engineering internship' },
    start: (o) => `I'm ready for my mock interview for ${o.topic || 'a software engineering internship'}. Please start.`,
  },
  {
    id: 'language', label: 'Language practice', note: 'Chat in a new language. They reply simply and correct your mistakes.',
    field: { kind: 'lang', label: 'Language' },
    start: () => 'Hi! I want to practice. Can you start a simple conversation with me?',
  },
];
export const modeById = (id) => MODES.find((m) => m.id === id) || MODES[0];

// Suggestions shown in Agent mode (same for every character).
export const AGENT_PROMPTS = [
  "What's the weather in Newark this week, and should I bring an umbrella tomorrow?",
  'Read the latest news about AI and give me the 3 biggest stories',
  'Make me a 2-week study plan for my data structures final as a spreadsheet',
  'Draw a cozy study desk at night in anime style',
  'Convert 500 US dollars to Indian rupees and remind me in an hour to pay rent',
];
