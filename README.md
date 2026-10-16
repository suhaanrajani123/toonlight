# Toonlight

Talk to six original 3D characters, 3 anime and 3 cartoon, in your browser. Each one has its own personality, voice, moods and lip-sync, and can look things up on the web for current information. Total cost: **$0**.

| Character | Style | Good at |
|---|---|---|
| Seraphine Valcrest, the regal strategist | Anime | advice, history, planning |
| Kaito Hayabusa, the hyper underdog | Anime | motivation, sports, fitness |
| Yuzu Amano, the shy genius | Anime | science, math, coding |
| Professor Pip, the grumpy inventor owl | Cartoon | how things work, trivia |
| Bloop, the jelly blob | Cartoon | jokes, puns, fun facts |
| Marlowe, the detective cat | Cartoon | news and current events |

## How it works

```
Your browser (GitHub Pages, free)                 Cloudflare Worker (free)          Google Gemini (free tier)
┌───────────────────────────────────┐   POST     ┌─────────────────────────┐        ┌──────────────────────┐
│ Three.js renders the 3D character │  /chat ──► │ adds the personality +  │ ─────► │ writes the reply,    │
│ Mic → speech recognition (free)   │            │ your secret API key,    │        │ searches Google when │
│ Reply → voice + lip-sync          │ ◄── reply  │ rate-limits visitors    │ ◄───── │ it needs fresh info  │
└───────────────────────────────────┘            └─────────────────────────┘        └──────────────────────┘
```

- **The characters** are built in code from simple shapes with realistic studio lighting, reflections and soft shadows (`docs/js/characters/`). They're placeholders: you can swap any of them for a real `.vrm` or `.glb` model (see *Use your own 3D models*). Want the flat anime-drawing look instead? Set `STYLE = 'toon'` in `docs/js/toonkit.js`.
- **"Worldwide information"** comes from Gemini's built-in knowledge plus **Google Search grounding**. When a question needs fresh facts, the model searches, and the site shows the sources under the reply. That's why you don't need RAG here.
- **Voices** come in two free options. The *Standard* voices are built into your browser. The *HD* voices use Kokoro, an open-source voice model that runs inside the browser after a ~90 MB one-time download.
- **Moods:** the AI starts each reply with a tag like `[happy]`, and the character's eyebrows, eyes and mouth change to match.

## Run it on your computer (2 minutes)

You need a local web server, because browsers block modules opened straight from a file.

**Option A, VS Code:** install the **Live Server** extension, open the `docs` folder, right-click `index.html`, then choose **Open with Live Server**.

**Option B, terminal:** in the project folder, run one of these:

```bash
npx serve docs          # needs Node.js
python -m http.server 8000 --directory docs   # needs Python
```

Then open the address it prints. The site starts in **demo mode**, where characters give pre-written replies. Do steps 1 to 3 below to turn on real AI.

## Turn on the real AI

### 1. Get a free Gemini API key
1. Go to <https://aistudio.google.com/apikey> and sign in with a Google account.
2. Click **Create API key** and copy it. **Never put this key in the website code or on GitHub.**

### 2. Create the free AI server (Cloudflare Worker)
1. Make a free account at <https://dash.cloudflare.com/sign-up>.
2. Go to **Compute (Workers)**, then **Workers & Pages**, then **Create**. Choose **Start with Hello World**, name it `toonlight`, and click **Deploy**.
3. Click **Edit code**, delete everything there, paste the whole of `worker/worker.js`, and click **Deploy**.
4. Go to the worker's **Settings**, then **Variables and Secrets**, then **Add**:
   - Type **Secret**, name `GEMINI_API_KEY`, value = your key. Save.
5. Copy your worker's address. It looks like `https://toonlight.YOUR-NAME.workers.dev`.
6. Test it: open that address in your browser. You should see `{"ok":true,...}`.

*(Command-line alternative: `cd worker`, `npx wrangler login`, `npx wrangler secret put GEMINI_API_KEY`, `npx wrangler deploy`.)*

### 3. Connect the website to the server
Open `docs/js/config.js` and set:

```js
API_URL: 'https://toonlight.YOUR-NAME.workers.dev/chat',
```

Reload the page. The demo-mode notice disappears and the characters now really answer.

## Put it online for free (GitHub Pages)

1. Create a new repository on GitHub, for example `toonlight`, and upload this whole project.
2. In the repo, go to **Settings**, then **Pages**. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder **`/docs`**, then **Save**.
3. After a minute, the site is live at `https://YOUR-USERNAME.github.io/toonlight/`.
4. **Lock your worker to your site** so other websites can't use up your free quota. On the worker, add a plain-text variable `ALLOWED_ORIGINS` with the value `https://YOUR-USERNAME.github.io,http://localhost:8000`.

## Free-tier limits, honestly

- Gemini's free tier has daily request limits, and Google Search grounding has its own smaller cap. When search runs out, the worker automatically answers without search instead of failing. When everything runs out, visitors see "Too many messages right now". Check current limits in AI Studio.
- Free-tier Gemini requests may be used by Google to improve their products. Don't type anything private.
- Gemini's free tier isn't available to serve users in the EU, UK or Switzerland.
- The worker allows 20 messages per minute per visitor, to slow down abuse.

## Customize

- **Change a personality:** edit `PERSONAS` in `worker/worker.js`, then redeploy the worker.
- **Change a voice:** edit `voice` in `docs/js/roster.js`. Standard voices take `pitch` (0–2) and `rate`. HD voices take a Kokoro voice name, such as `af_heart`, `af_bella`, `af_nicole`, `af_sky`, `am_adam`, `am_puck`, `am_fenrir`, `bf_emma`, `bm_george` or `bm_lewis`, plus `speed` and `pitch`.
- **Change a character's look:** each one is a single file in `docs/js/characters/`. Open `docs/dev/preview.html?c=bloop&mood=happy` to preview one character on its own (try moods `happy`, `sad`, `angry`, `surprised` and `thinking`).

## Use your own 3D models

The built-in characters are placeholders made from simple shapes. For a professional look, swap in real models. The site supports **.vrm** (VRoid Studio) and **.glb / .gltf** files.

**Try one instantly:** drag a `.vrm` or `.glb` file onto the stage. It replaces the current character until you reload the page.

**Make it permanent:**
1. Put the file in `docs/models/`, for example `docs/models/seraphine.vrm`.
2. In `docs/js/roster.js`, add a `model` line to that character:
   ```js
   id: 'seraphine', name: 'Seraphine Valcrest', ...
   model: 'models/seraphine.vrm',
   ```
3. Reload. If the file can't load, the built-in character appears instead, and the browser console says why.

**What gets animated automatically:**

| Feature | .vrm | .glb / .gltf |
|---|---|---|
| Head follows your cursor | ✅ | ✅ if a bone is named like `Head` (Mixamo rigs work) |
| Mouth moves with the voice | ✅ | ✅ if it has a morph target named `jawOpen`, `mouthOpen`, `viseme_aa` or `A` |
| Blinking | ✅ | ✅ if it has `eyeBlinkLeft`/`eyeBlinkRight` or `blink` morphs |
| Moods (happy, sad…) | ✅ | ✅ if morphs are named `happy`, `sad`, `angry`, `surprised` |
| Idle animation | — | ✅ plays the model's `Idle` animation (or its first one) |

**Where to get models (free):**
- **VRoid Studio** (vroid.com/en/studio): design your own anime character and export it as `.vrm`. This gives the best results, with full facial expressions.
- **Sketchfab / VRoid Hub**: filter for *Downloadable* models with a **CC0** or **CC-BY** license. For CC-BY, credit the creator on your site.
- **Mixamo**: free rigs and animations for humanoid models. Export as FBX, then convert to `.glb` in Blender (File, Import FBX, then Export glTF 2.0).

Only use models you made yourself or whose license allows it, and **never** characters from existing anime, cartoons or games, even when a fan uploaded them as free downloads. That's someone else's copyrighted character.

Large files make the site slow to load. Aim for under 20 MB per model (Blender's glTF export has a *Draco compression* option).

## Project map

```
docs/                  ← the website (GitHub Pages serves this folder)
  index.html
  css/style.css
  js/config.js         ← put your worker address here
  js/main.js           ← wires everything together
  js/roster.js         ← the cast: looks, colours, voices, starter questions
  js/toonkit.js        ← cel-shading, outlines, eyes, mouths, moods, blinking
  js/characters/*.js   ← one file per character
  js/stage.js          ← 3D scene, camera, lights, portraits
  js/voice.js          ← speech output + lip-sync
  js/listen.js         ← microphone input
  js/chat.js           ← talks to the worker, saves chat history
  js/vrm.js            ← loads your own .vrm / .glb models
  models/              ← put your model files here
  dev/                 ← preview.html (one character) and model-test.html (loader self-test)
  vendor/              ← Three.js and three-vrm (MIT licensed), included so nothing breaks
worker/worker.js       ← the AI server (personalities live here)
tests/                 ← automated tests (node tests/worker.test.mjs)
```

## Browser support

Works best in **Chrome** or **Edge**. Voice input uses the browser's speech recognition, which those two support, and the mic button hides itself in browsers that don't. Everything else works in any modern browser.
