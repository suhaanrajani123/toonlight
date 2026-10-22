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
    // no topic box: you say the topic in the chat, or attach a document (see quizRequest in quiz.js)
    field: { kind: 'level', label: 'Level', quiz: true },
    start: null,
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

