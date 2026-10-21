// roster.js — the cast. Everything the *browser* needs to know about each character:
// how they look (builder), their stage colours, and how they sound.
//
// Their personalities (the AI instructions) live on the server in worker/worker.js,
// so nobody can rewrite them from the browser.
//
// model → a .vrm / .glb file in docs/models/ (VRoid Studio sample characters, slimmed with
//   tools/slim-vrm.py). If it can't load, the built-in look from `build` is shown instead.
// portrait → a still picture of the model for the cast bar, so the site doesn't have to
//   download every model just to draw the buttons (make them with tools/portraits.py).
//
// voice.web → the browser's built-in voices (instant, free, quality depends on your OS)
//   pitch 0–2, rate 0.1–10, gender is a hint for picking a voice.
// voice.hd  → Kokoro, an open-source voice model that runs inside the browser (free,
//   ~90 MB one-time download). `voice` is a Kokoro voice name, `speed` is talking speed,
//   `pitch` shifts the playback (keep it at 1 for a natural sound).

import * as kaito from './characters/kaito.js';
import * as raven from './characters/raven.js';
import * as jun from './characters/jun.js';
import * as elara from './characters/elara.js';
import * as stella from './characters/stella.js';

export const ROSTER = [
  {
    id: 'kaito', name: 'Kaito Hayabusa', short: 'Kaito', kind: 'Anime',
    tagline: 'Cheerful wandering adventurer. Your hype-man for goals, fitness and big plans.',
    greeting: "Hey, I'm Kaito! Whatever you're working toward, I'm happy to help you get there. What's on your mind?",
    build: kaito.build, // used only if the model can't load
    model: 'models/kaito.vrm', portrait: 'models/portraits/kaito.png',
    theme: { tint: '#EDB95E', top: '#c96a2e', bottom: '#f6d99b', accent: '#8a4a1c' },
    voice: { web: { pitch: 1.0, rate: 1.02, gender: 'male' }, hd: { voice: 'am_michael', speed: 1.0, pitch: 1.0 } },
    prompts: ['Give me a 10-minute workout', 'Plan a weekend trip for me', "I'm losing motivation, help!"],
  },
  {
    id: 'raven', name: 'Raven Ashford', short: 'Raven', kind: 'Anime',
    tagline: 'Street-smart night-market rogue. Straight answers, news and real-world advice.',
    greeting: "Hi, I'm Raven. Ask me anything and I'll give you a straight, honest answer.",
    build: raven.build, // used only if the model can't load
    model: 'models/raven.vrm', portrait: 'models/portraits/raven.png',
    theme: { tint: '#B6A9E6', top: '#1b1d2e', bottom: '#565b7d', accent: '#6c5fc7' },
    voice: { web: { pitch: 1.0, rate: 1.0, gender: 'female' }, hd: { voice: 'af_bella', speed: 1.0, pitch: 1.0 } },
    prompts: ['How do I spot a scam message?', 'Explain how inflation works', 'Tips for staying safe in a new city'],
  },
  {
    id: 'jun', name: 'Jun Arata', short: 'Jun', kind: 'Anime',
    tagline: 'Laid-back tech kid from the arcade. Coding, gadgets and games.',
    greeting: "Hey! I'm Jun. Coding, computers, gadgets, games, ask away and I'll keep it simple.",
    build: jun.build, // used only if the model can't load
    model: 'models/jun.vrm', portrait: 'models/portraits/jun.png',
    theme: { tint: '#9FC7EA', top: '#2a2f45', bottom: '#9aaccc', accent: '#c93d84' },
    voice: { web: { pitch: 1.0, rate: 1.03, gender: 'male' }, hd: { voice: 'am_puck', speed: 1.02, pitch: 1.0 } },
    prompts: ['Explain recursion simply', 'Which laptop specs matter for coding?', 'What is an API?'],
  },
  {
    id: 'elara', name: 'Elara Quinn', short: 'Elara', kind: 'Anime',
    tagline: 'Calm city girl. Life advice, study help, food and recipes.',
    greeting: "Hi, I'm Elara. Take a breath and get comfy. What's on your mind today?",
    build: elara.build, // used only if the model can't load
    model: 'models/elara.vrm', portrait: 'models/portraits/elara.png',
    theme: { tint: '#EEB0A8', top: '#7b6f9e', bottom: '#f2d4cf', accent: '#a0505a' },
    voice: { web: { pitch: 1.0, rate: 0.97, gender: 'female' }, hd: { voice: 'af_heart', speed: 0.97, pitch: 1.0 } },
    prompts: ['Give me a chicken biryani recipe', 'How do I stop procrastinating?', 'Help me plan a study schedule'],
  },
  {
    id: 'stella', name: 'Stella Nova', short: 'Stella', kind: 'Anime',
    tagline: 'Star-powered hype girl. Jokes, fun facts, music and creative ideas.',
    greeting: "Hi! I'm Stella. Want a fun fact, a creative idea, or help with something? I'm all ears.",
    build: stella.build, // used only if the model can't load
    model: 'models/stella.vrm', portrait: 'models/portraits/stella.png',
    theme: { tint: '#F3A27F', top: '#e2433b', bottom: '#ffd36b', accent: '#b8261d' },
    voice: { web: { pitch: 1.05, rate: 1.05, gender: 'female' }, hd: { voice: 'af_sarah', speed: 1.05, pitch: 1.0 } },
    prompts: ['Tell me a science pun', 'Give me a fun fact about space', 'Ideas for a birthday party?'],
  },
];

export const byId = (id) => ROSTER.find((c) => c.id === id) || ROSTER[0];
