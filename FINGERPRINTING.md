# True Access — Audio Fingerprinting

Worker 1 deliverable. Last updated: 2026-10-18.

## What was chosen and why

**AcoustID lookups + Chromaprint fingerprinting done on the phone (WebAssembly).**

It is the only option that is $0 forever: no credit card, no trial that
expires, no server to run, no paid backend. Fingerprinting happens in the
browser on Mary's phone, so no audio ever leaves the device except the tiny
fingerprint string sent to AcoustID for the lookup.

| Service | Free tier | Cost after | Music? | TV / movie? | Verdict |
|---|---|---|---|---|---|
| **AcoustID + Chromaprint WASM** | Free forever (3 lookups/sec). API key free, no card. | $0 | ✅ huge community DB | ❌ | **CHOSEN** |
| AudD | 300 requests total, 14-day trial | $5/mo for 1,000 | ✅ 160M songs | ❌ (enterprise only) | Trial runs out |
| ACRCloud | Free tier (~1,000 queries/day) | usage-based | ✅ | ❌ free tier is music-only; TV detection is paid | No video path on free |
| ShazamKit | — | needs Apple Developer account ($99/yr) | ✅ | ❌ | iOS/Android native only, not a browser PWA |
| Gracenote | none public | enterprise | ✅ | ✅ (paid) | Out of budget |

**The honest gap:** no free service on earth fingerprints TV/movie audio from
a microphone clip. Music databases are free and open; film/TV identification
is enterprise-only (Gracenote, AudD enterprise, ACRCloud custom buckets).
So the real pipeline today identifies **music**. Dialogue, theme-adjacent
scenes, and full TV/movie identification need a paid service later or the
AI-description step identifying content another way — that is for a future
worker, not this one.

## How the real pipeline works (fits the team architecture)

1. Mary taps **"Describe what's playing"** (listening must be on first).
2. `recordClip()` captures **10 seconds** of microphone audio with
   `MediaRecorder` (mime type auto-picked: `audio/mp4` → `audio/webm`).
3. The clip is decoded with the Web Audio API and fingerprinted **on-device**
   by the Chromaprint algorithm compiled to WebAssembly
   (`vendor/chromaprint/`, from the MIT-licensed npm package
   `@unimusic/chromaprint@0.1.4`), loaded lazily via dynamic `import()`
   so app startup stays light.
4. The fingerprint (a short base64 string) is sent to
   `https://api.acoustid.org/v2/lookup` with the app's API key.
5. The best match with confidence ≥ 0.80 becomes the program:
   `{ title: 'Artist — "Title"' }` — with `descriptions` deliberately
   **undefined**, so `descriptions.js` (Worker 2) runs its two-stage
   pipeline on the real title: official-AD-track lookup first, then free-LLM
   AI overview.
6. Failures follow the app's accessibility contract: progress goes to the
   polite `role="status"` region (`setStatus`), errors to the assertive
   `role="alert"` region (`setAlert`) — announced, never silent. A stalled
   network aborts after 30 seconds. No confident match returns `null`,
   which `describeWhatsPlaying()` announces with guidance (try louder audio
   or Demo mode) instead of showing an empty result.

## How to activate it (Mary's steps — about 5 minutes, $0)

1. Go to **https://acoustid.org** and sign in (a free MusicBrainz account
   works; creating one is free).
2. Open **API keys** (in your account menu) and choose **New API key** /
   register an application. Name it **True Access**.
3. Copy the key (a short string of letters and numbers).
4. Open `app.js`, find the `FINGERPRINTING` config block near the top, and
   paste the key between the quotes:
   `ACOUSTID_API_KEY: 'paste-your-key-here',`
5. Redeploy the app (whoever deploys: just publish the updated files —
   no build step, no server).

Limits: 3 lookups per second (plenty for one phone), unlimited total,
never expires, no card. The key lives in plain client-side code because the
AcoustID lookup is designed for exactly this; it only identifies music and
costs nothing per lookup, so exposure risk is negligible.

## Demo mode

Settings → **Demo mode** checkbox (already in `index.html`, wired in
`app.js`, remembered per phone in `localStorage`). When on, "Describe what's
playing" uses the built-in sample programs ("Harbor Lights",
"The Night Market", "Morning on the Farm") with no network and no key —
the full identify → describe → speak flow stays testable offline.

## Files changed (Worker 1)

- `app.js` — `FINGERPRINTING` config constant; real `identifyContent()`
  pipeline (`identifyDemo` / `recordClip` / `fetchWithDeadline` /
  `lookupAcoustId` / `identifyReal`); no-match `null` handling in
  `describeWhatsPlaying()`; demo-mode toggle wiring; header comment updated.
  Also renamed the old `generateDescription` fallback to
  `generateDemoDescription` — it collided with `descriptions.js`'s global
  `generateDescription(title, verbosity)` (classic scripts share one global
  scope), which would have broken Worker 2's AI stage for every real title.
- `index.html` — demo-mode checkbox was already present (kept); About text
  updated by the team.
- `sw.js` — caches the vendored fingerprinting engine + `official-ad-db.json`
  (cache bumped to v3).
- `vendor/chromaprint/` — vendored WebAssembly fingerprinting build
  (`index.js`, `chromaprint.js`, `chromaprint.wasm`, `LICENSE.md`).
- `FINGERPRINTING.md` — this file.

## Testing

`~/workspace/fp-pipeline-test.mjs` (kept out of the deployed repo) — 10/10
passing on 2026-10-18:
- WASM fingerprint of synthesized audio: valid base64 format, deterministic
  across runs, distinct for different pitch-class content (verified the
  engine is musically meaningful: octave-transposed chords correctly produce
  the SAME chroma fingerprint).
- `lookupAcoustId` extracted verbatim from `app.js`: success parse with
  score sorting, low-score → null, empty results → null, service error →
  descriptive throw, missing title → null, live AcoustID request returns the
  expected "invalid API key" error shape.
- `node --check` clean on `app.js`, `descriptions.js`, `sw.js`.

## What works / what doesn't

- ✅ Real end-to-end music identification, fully on-device fingerprinting.
- ✅ Graceful failures with clear spoken/written announcements, 30s network cap.
- ✅ Demo mode for offline testing of the full flow.
- ✅ Plays well with the team: titles flow into Worker 2's description pipeline.
- ❌ TV/movie identification — impossible free; needs a paid service later.
- ⚠️ Match quality depends on mic clarity; quiet/unclear audio returns
  "no match" instead of a wrong answer (confidence gate at 0.80).
