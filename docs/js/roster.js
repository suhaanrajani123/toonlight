// roster.js — the cast. Everything the *browser* needs to know about each character:
// how they look (builder), their stage colours, and how they sound.
//
// Their personalities (the AI instructions) live on the server in worker/worker.js,
// so nobody can rewrite them from the browser.
//
// model → optional: a .vrm / .glb file in docs/models/ that replaces the built-in look,
//   e.g. model: 'models/elara.vrm' (see README → Use your own 3D models).
//
// voice.web → the browser's built-in voices (instant, free, quality depends on your OS)
//   pitch 0–2, rate 0.1–10, gender is a hint for picking a voice.
// voice.hd  → Kokoro, an open-source voice model that runs inside the browser (free,
//   ~90 MB one-time download). `voice` is a Kokoro voice name, `speed` is talking speed,
//   `pitch` shifts the playback (1 = normal, 1.3 = squeaky, 0.85 = deep).

import * as kaito from './characters/kaito.js';
import * as raven from './characters/raven.js';
import * as jun from './characters/jun.js';
import * as elara from './characters/elara.js';
import * as fennick from './characters/fennick.js';
import * as stella from './characters/stella.js';

export const ROSTER = [
  {
    id: 'kaito', name: 'Kaito Hayabusa', short: 'Kaito', kind: 'Anime',
    tagline: 'Cheerful wandering adventurer. Your hype-man for goals, fitness and big plans.',
    greeting: "Hey there, traveler! Name's Kaito. Pull up a seat. Whatever quest you're on, we'll crush it together!",
    build: kaito.build,
    theme: { tint: '#EDB95E', top: '#c96a2e', bottom: '#f6d99b', accent: '#8a4a1c' },
    voice: { web: { pitch: 0.95, rate: 1.08, gender: 'male' }, hd: { voice: 'am_michael', speed: 1.08, pitch: 1.0 } },
    prompts: ['Give me a 10-minute workout', 'Plan a weekend trip for me', "I'm losing motivation, help!"],
  },
  {
    id: 'raven', name: 'Raven Ashford', short: 'Raven', kind: 'Anime',
    tagline: 'Street-smart night-market rogue. Straight answers, news and real-world advice.',
    greeting: "Well, look who wandered into the night market. I'm Raven. Ask me anything, I'll give it to you straight.",
    build: raven.build,
    theme: { tint: '#B6A9E6', top: '#1b1d2e', bottom: '#565b7d', accent: '#6c5fc7' },
    voice: { web: { pitch: 0.9, rate: 1.0, gender: 'female' }, hd: { voice: 'af_nova', speed: 1.0, pitch: 0.97 } },
    prompts: ['How do I spot a scam message?', 'Explain how inflation works', 'Tips for staying safe in a new city'],
  },
  {
    id: 'jun', name: 'Jun Arata', short: 'Jun', kind: 'Anime',
    tagline: 'Laid-back tech kid from the arcade. Coding, gadgets and games.',
    greeting: "Yo! I'm Jun. Coding, computers, games, gadgets, whatever. Hit me with a question!",
    build: jun.build,
    theme: { tint: '#9FC7EA', top: '#2a2f45', bottom: '#9aaccc', accent: '#c93d84' },
    voice: { web: { pitch: 1.15, rate: 1.05, gender: 'male' }, hd: { voice: 'am_puck', speed: 1.05, pitch: 1.04 } },
    prompts: ['Explain recursion simply', 'Which laptop specs matter for coding?', 'What is an API?'],
  },
  {
    id: 'elara', name: 'Elara Quinn', short: 'Elara', kind: 'Anime',
    tagline: 'Calm city girl. Life advice, study help, food and recipes.',
    greeting: "Hi, I'm Elara. Take a breath, get comfy. What's on your mind today?",
    build: elara.build,
    theme: { tint: '#EEB0A8', top: '#7b6f9e', bottom: '#f2d4cf', accent: '#a0505a' },
    voice: { web: { pitch: 1.05, rate: 0.95, gender: 'female' }, hd: { voice: 'bf_isabella', speed: 0.95, pitch: 1.0 } },
    prompts: ['Give me a chicken biryani recipe', 'How do I stop procrastinating?', 'Help me plan a study schedule'],
  },
  {
    id: 'fennick', name: 'Fennick', short: 'Fennick', kind: 'Cartoon',
    tagline: 'Fox explorer and map-maker. Geography, history, nature and trivia.',
    greeting: "Ah, a fellow explorer! Fennick, cartographer extraordinaire. Where shall our curiosity take us today?",
    build: fennick.build,
    theme: { tint: '#A9CDA1', top: '#3f8580', bottom: '#efe1bd', accent: '#b85d1c' },
    voice: { web: { pitch: 1.15, rate: 1.02, gender: 'male' }, hd: { voice: 'bm_george', speed: 1.02, pitch: 1.06 } },
    prompts: ['Why are there time zones?', 'Tell me a weird animal fact', 'How were the pyramids built?'],
  },
  {
    id: 'stella', name: 'Stella Nova', short: 'Stella', kind: 'Cartoon',
    tagline: 'Star-powered hype girl. Jokes, fun facts, music and creative ideas.',
    greeting: "Heyyy! Stella Nova here, your favorite shooting star! Wanna hear a joke, a fun fact, or something totally new?",
    build: stella.build,
    theme: { tint: '#F3A27F', top: '#e2433b', bottom: '#ffd36b', accent: '#b8261d' },
    voice: { web: { pitch: 1.45, rate: 1.12, gender: 'female' }, hd: { voice: 'af_heart', speed: 1.12, pitch: 1.12 } },
    prompts: ['Tell me a science pun', 'Give me a fun fact about space', 'Ideas for a birthday party?'],
  },
];

export const byId = (id) => ROSTER.find((c) => c.id === id) || ROSTER[0];
