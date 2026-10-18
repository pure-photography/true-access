# True Access — Prototype PWA

Real-time audio description that works on whatever you're watching — TV, phone, tablet, or computer. Built by Mary Robinson.

## What's real vs. demo in this prototype

**Real (works today):**
- Microphone capture via `getUserMedia` — including Bluetooth headset mics (e.g. Ray-Ban Meta glasses paired to the phone)
- Microphone picker (choose the glasses' mic specifically)
- Live microphone level meter (with a text alternative for screen readers)
- Text-to-speech via the Web Speech API (voice selection, speech speed, auto-speak toggle)
- The full flow: idle → listening → identifying → describing
- Hands-free voice trigger: say **"describe this"** to describe without tapping (Porcupine on-device wake word when set up, browser speech recognition as the fallback, hold-to-talk button). Full details in `VOICE_TRIGGER.md`.

**Demo (simulated for now):**
- Content identification. A real Shazam-style audio-fingerprint backend needs a paid service. `identifyContent()` in `app.js` waits ~3 seconds and returns one of 3 built-in sample programs. The function is clearly marked with a TODO showing exactly how to plug in a real API later — downstream code already expects the right shape, so only that one function needs to change.
- The descriptions for the built-in demo programs are short **original** sample scripts written for this demo, not descriptions of real movies or shows. For any **real** identified title, `descriptions.js` runs the real two-stage pipeline — official-AD-track lookup first, then AI generation via free LLM APIs (see `AD_GENERATION.md`).

## How Mary can test it on her phone

**Option A — quickest (no install):**
1. These files need to be served over HTTPS (GitHub Pages works great). The parent agent can deploy this folder.
2. On her iPhone, open the URL in Safari.
3. Pair the Ray-Ban Meta glasses to the phone as a Bluetooth headset first (phone Settings → Bluetooth).
4. In the app: tap "Refresh microphone list", pick the glasses' microphone, tap **Start Listening**, allow mic access.
5. Play something nearby (TV, another device), then tap **Describe what's playing**.
6. After ~3 seconds a sample description appears and is spoken aloud through the phone's speakers (or the glasses if they're the active audio output).

**Option B — install as an app:**
1. Open the URL in Safari → Share → **Add to Home Screen**. The manifest + service worker make it launch full-screen like a native app and work offline.

## Notes & limitations (be straight)
- `getUserMedia` needs a secure context: HTTPS, localhost, or `file://` in some browsers. Plain `http://` on a LAN IP will be blocked from mic access.
- iOS Safari supports `getUserMedia` and `speechSynthesis`, but Bluetooth mic routing on iOS goes through the system — whatever mic iOS selects is what the browser gets. The in-app picker works best on Android/Chrome.
- Service workers (offline + install) require HTTPS — they won't register from `file://`, but the app itself still runs.
- Real content identification (the Shazam part) is the piece that needs a backend service and funding — that's the honest gap, and it's the part Meta's help would unlock.

## Files
- `index.html` — accessible UI (skip link, ARIA live status, labeled controls, keyboard navigable)
- `styles.css` — high-contrast theme, large touch targets, visible focus, reduced-motion support
- `app.js` — mic capture, level meter, demo identification, TTS
- `descriptions.js` — real AI description pipeline: official-AD-track lookup → free-LLM generation (see `AD_GENERATION.md`)
- `official-ad-db.json` — curated seed database of titles with official AD tracks
- `AD_GENERATION.md` — how the description pipeline works, service choices, setup
- `manifest.json` / `sw.js` — PWA installability + offline shell
- `icons/` — app icons (192px, 512px)
