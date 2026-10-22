// config.js — the only file you need to edit to connect the AI.
//
// API_URL: the address of your Cloudflare Worker (see README, step 2), ending in /chat.
// Example: 'https://toonlight.your-name.workers.dev/chat'
//
// Leave it empty ('') to run in demo mode: the site works, but characters reply
// with pre-written lines instead of real AI answers.

export const CONFIG = {
  API_URL: 'https://toonlight.suhaanrajani276.workers.dev/chat',

  // Supabase project for sign-in (Agent mode). Both values are public by design: the
  // "publishable"/anon key only allows what your project's settings allow.
  // Find them in Supabase → Project Settings → API. Leave empty to hide sign-in.
  SUPABASE_URL: 'https://uxanvmamhscakggttzvr.supabase.co',
  SUPABASE_KEY: 'sb_publishable_2v14fZCPaBFKG0itNmZdkQ_4IBPX7DE',

  // Google Calendar: the "Toonlight web" OAuth client in Google Cloud (project toonlight).
  // A client ID is public by design (it's in every Google sign-in link); there's no secret here.
  // Its "Authorized JavaScript origins" must list the site's address. Leave empty to hide the feature.
  GOOGLE_CLIENT_ID: '755076516361-hshkjt6e98pfjgu4jk4gj9pv6rc4hfj7.apps.googleusercontent.com',

  // How many past messages to send with each question (more = better memory, slower).
  HISTORY_TURNS: 12,

  // Kokoro HD voice model (downloaded once, then cached by the browser).
  KOKORO_MODEL: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  KOKORO_LIB: 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js',
};
