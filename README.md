# Toonlight

**Practice anything with a 3D character coach.** Pick one of six original characters, then choose what to practice. Everything runs in your browser, and the total cost is **$0**.

| Mode | What happens |
|---|---|
| **Quiz me** | Exam practice on any topic: one question at a time, graded, with a running score |
| **Mock interview** | A realistic interviewer for the role you choose; every answer gets a rating out of 10 and a tip |
| **Language practice** | Chat in Spanish, French, Japanese, Hindi and more. They reply simply, correct your mistakes and speak in that language |
| **Just chat** | Advice, explanations, recipes, ideas |

The characters also **remember you**: your name, your goals, and facts you share. They're saved in the **Notebook** (top right), only in your browser, and you can edit or delete anything there.

| Character | Style | Good at |
|---|---|---|
| Kaito Hayabusa, cheerful adventurer | Anime | motivation, fitness, travel, big goals |
| Raven Ashford, night-market rogue | Anime | straight answers, news, street smarts |
| Jun Arata, arcade tech kid | Anime | coding, gadgets, games |
| Elara Quinn, calm city girl | Anime | life advice, studying, food and recipes |
| Fennick, fox explorer | Cartoon | geography, history, nature, trivia |
| Stella Nova, star-powered hype girl | Cartoon | jokes, fun facts, music, creative ideas |

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

## Turn on the real AI (no API key needed)

The AI runs on a free **Cloudflare Worker** using Cloudflare's built-in models (Workers AI). This one is already set up at `https://toonlight.suhaanrajani276.workers.dev`. To set up your own from scratch:

1. Make a free account at dash.cloudflare.com.
2. Go to **Workers & Pages → Create → Start with Hello World**, name it `toonlight`, and click **Deploy**.
3. Open the worker's **Settings → Bindings → Add binding → Workers AI**, set the variable name to `AI`, and click **Add Binding**.
4. Click **Edit code**, replace everything with `worker/worker.js`, and click **Deploy**.
5. Put the worker's address plus `/chat` in `docs/js/config.js` (`API_URL`).

**Optional, for smarter answers with live Google Search:** add a secret named `GEMINI_API_KEY` from aistudio.google.com/apikey. The worker then uses Gemini first and falls back to Workers AI.

## Put it online for free (GitHub Pages)

1. Create a new repository on GitHub, for example `toonlight`, and upload this whole project.
2. In the repo, go to **Settings**, then **Pages**. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder **`/docs`**, then **Save**.
3. After a minute, the site is live at `https://YOUR-USERNAME.github.io/toonlight/`.
4. **Lock your worker to your site** so other websites can't use up your free quota. On the worker, add a plain-text variable `ALLOWED_ORIGINS` with the value `https://YOUR-USERNAME.github.io,http://localhost:8000`.

## Free-tier limits, honestly

- Workers AI's free plan includes 10,000 "neurons" a day (roughly a few hundred short chats). It resets at midnight UTC. When it's used up, characters say so until the reset.
- Workers AI has no live web search, so very recent news may be out of date (adding the optional Gemini key fixes this).
- Don't type anything private: messages go to the AI provider to be answered.
- The worker allows 20 messages per minute per visitor, to slow down abuse.

## Customize

- **Change a personality:** edit `PERSONAS` in `worker/worker.js`, then redeploy the worker.
- **Change a voice:** edit `voice` in `docs/js/roster.js`. Standard voices take `pitch` (0–2) and `rate`. HD voices take a Kokoro voice name, such as `af_heart`, `af_bella`, `af_nicole`, `af_sky`, `am_adam`, `am_puck`, `am_fenrir`, `bf_emma`, `bm_george` or `bm_lewis`, plus `speed` and `pitch`.
- **Change a character's look:** each one is a single file in `docs/js/characters/`. Open `docs/dev/preview.html?c=bloop&mood=happy` to preview one character on its own (try moods `happy`, `sad`, `angry`, `surprised` and `thinking`).

## Use your own 3D models (recommended)

The built-in characters are built from simple shapes. For a polished, professional look, make each one in **VRoid Studio**:

1. Download **VRoid Studio** (free) from vroid.com/en/studio and open it.
2. Click **Create New**, pick a female or male base, and design the character: face, eyes, hair (there are presets you can tweak), body and outfit. Use the reference picture of the character next to you. Plan on about an hour per character.
3. Click **Camera/Exporter** (top right), then **Export as VRM**. Choose VRM 1.0, set a title, and save the `.vrm` file.
4. On the site, select that character, open the **Notebook**, then **Use your own 3D model → Choose a model file**. You can also just drag the file onto the stage. It's saved in your browser and loads every visit.
5. **To show it to everyone who visits:** put the file in `docs/models/`, add `model: 'models/kaito.vrm'` to that character in `docs/js/roster.js`, and push to GitHub. Keep files under about 20 MB (VRoid's export has a texture size option).

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
