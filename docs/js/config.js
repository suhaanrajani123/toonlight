// config.js — the only file you need to edit to connect the AI.
//
// API_URL: the address of your Cloudflare Worker (see README, step 2), ending in /chat.
// Example: 'https://toonlight.your-name.workers.dev/chat'
//
// Leave it empty ('') to run in demo mode: the site works, but characters reply
// with pre-written lines instead of real AI answers.

export const CONFIG = {
  API_URL: 'https://toonlight.suhaanrajani276.workers.dev/chat',

  // How many past messages to send with each question (more = better memory, slower).
  HISTORY_TURNS: 12,

  // Kokoro HD voice model (downloaded once, then cached by the browser).
  KOKORO_MODEL: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  KOKORO_LIB: 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js',
};
