// roster.js — the cast. Everything the *browser* needs to know about each character:
// how they look (builder), their stage colours, and how they sound.
//
// Their personalities (the AI instructions) live on the server in worker/worker.js,
// so nobody can rewrite them from the browser.
//
// model → optional: a .vrm / .glb file in docs/models/ that replaces the built-in look,
//   e.g. model: 'models/seraphine.vrm' (see README → Use your own 3D models).
//
// voice.web → the browser's built-in voices (instant, free, quality depends on your OS)
//   pitch 0–2, rate 0.1–10, gender is a hint for picking a voice.
// voice.hd  → Kokoro, an open-source voice model that runs inside the browser (free,
//   ~90 MB one-time download). `voice` is a Kokoro voice name, `speed` is talking speed,
//   `pitch` shifts the playback (1 = normal, 1.3 = squeaky, 0.85 = deep).

import * as seraphine from './characters/seraphine.js';
import * as kaito from './characters/kaito.js';
import * as yuzu from './characters/yuzu.js';
import * as pip from './characters/pip.js';
import * as bloop from './characters/bloop.js';
import * as marlowe from './characters/marlowe.js';

export const ROSTER = [
  {
    id: 'seraphine', name: 'Seraphine Valcrest', short: 'Seraphine', kind: 'Anime',
    tagline: 'Regal strategist. Ask her for advice, history, or a plan.',
    greeting: 'Welcome to my court. Speak freely: what counsel do you seek today?',
    build: seraphine.build,
    theme: { top: '#2f2869', bottom: '#c3b2f4', accent: '#6d47cf' },
    voice: { web: { pitch: 1.0, rate: 0.92, gender: 'female' }, hd: { voice: 'bf_emma', speed: 0.92, pitch: 1.0 } },
    prompts: ['Help me plan my study week', 'Why did the Roman Empire fall?', 'How do I negotiate a raise?'],
    demo: ['A fine question. Allow me to consider it as I would any matter of state.', 'Patience. Every great plan begins with a single, deliberate move.'],
  },
  {
    id: 'kaito', name: 'Kaito Hayabusa', short: 'Kaito', kind: 'Anime',
    tagline: 'Never gives up. Your hype-man for workouts, sports and goals.',
    greeting: "Yo! I'm Kaito! Whatever you're working on, we're gonna crush it together!",
    build: kaito.build,
    theme: { top: '#ff7d3a', bottom: '#ffe28c', accent: '#d4501a' },
    voice: { web: { pitch: 1.35, rate: 1.15, gender: 'male' }, hd: { voice: 'am_puck', speed: 1.15, pitch: 1.08 } },
    prompts: ['Give me a 10-minute workout', 'Who won the last World Cup?', "I'm losing motivation, help!"],
    demo: ["Let's GO! That's the spirit I like to hear!", "Hey, every champion started as a beginner. Believe it!"],
  },
  {
    id: 'yuzu', name: 'Yuzu Amano', short: 'Yuzu', kind: 'Anime',
    tagline: 'Shy genius. Science, math and code, explained gently.',
    greeting: "Oh! H-hi... I'm Yuzu. If you have a science or coding question, I'd really love to help.",
    build: yuzu.build,
    theme: { top: '#5fc9b3', bottom: '#f1f9e6', accent: '#23865a' },
    voice: { web: { pitch: 1.5, rate: 1.0, gender: 'female' }, hd: { voice: 'af_nicole', speed: 1.0, pitch: 1.1 } },
    prompts: ['Explain recursion simply', 'How do black holes form?', 'What is a hash map?'],
    demo: ["Um, okay! So... sorry, I get excited about this stuff.", "That's actually a really good question! Let me think..."],
  },
  {
    id: 'pip', name: 'Professor Pip', short: 'Pip', kind: 'Cartoon',
    tagline: 'Grumpy inventor owl. Knows how everything works.',
    greeting: "Hmph. Another visitor. Fine, fine. Ask the Professor how something works, and make it quick.",
    build: pip.build,
    theme: { top: '#2e3a60', bottom: '#eab874', accent: '#b8701a' },
    voice: { web: { pitch: 0.65, rate: 0.85, gender: 'male' }, hd: { voice: 'bm_lewis', speed: 0.88, pitch: 0.92 } },
    prompts: ['How does a fridge keep things cold?', 'Who invented the light bulb?', 'How do airplanes stay up?'],
    demo: ['Hmph. Kids these days and their questions. Very well.', 'Back in my day, we read the manual. Listen closely.'],
  },
  {
    id: 'bloop', name: 'Bloop', short: 'Bloop', kind: 'Cartoon',
    tagline: 'A jelly blob of jokes, puns and very fun facts.',
    greeting: "Bloop bloop! Hiii! I'm Bloop! Wanna hear a joke? Or a fact? Or a joke about a fact?",
    build: bloop.build,
    theme: { top: '#3cc9b9', bottom: '#d9fff2', accent: '#0f8c6c' },
    voice: { web: { pitch: 1.9, rate: 1.2, gender: 'female' }, hd: { voice: 'af_heart', speed: 1.15, pitch: 1.35 } },
    prompts: ['Tell me a science pun', 'Give me a weird animal fact', "What's something fun to do today?"],
    demo: ['Hehe, that tickles my jelly!', "Ooh ooh! Did you know octopuses have three hearts? I have zero! I'm jelly!"],
  },
  {
    id: 'marlowe', name: 'Marlowe', short: 'Marlowe', kind: 'Cartoon',
    tagline: 'Noir detective cat. Investigates the news and current events.',
    greeting: "The name's Marlowe. Every question's a case, and I always crack the case. What's the mystery?",
    build: marlowe.build,
    theme: { top: '#1f1c33', bottom: '#6e5b7b', accent: '#9a3550' },
    voice: { web: { pitch: 0.5, rate: 0.9, gender: 'male' }, hd: { voice: 'am_fenrir', speed: 0.92, pitch: 0.88 } },
    prompts: ["What's in the news today?", 'Investigate: who runs NASA right now?', 'Any big tech stories this week?'],
    demo: ['The city was quiet tonight. Too quiet. Then you walked in with a question.', "I've seen cases like this before. Let me dig."],
  },
];

export const byId = (id) => ROSTER.find((c) => c.id === id) || ROSTER[0];
