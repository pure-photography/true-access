# True Access — Integration Points for Meta

**The pitch in one paragraph:** True Access is a working, live, screen-reader-first audio description app that runs on any phone today. It already identifies music, finds official AD tracks, generates AI descriptions, and triggers hands-free. What it cannot do — route "Hey Meta, describe this" past the glasses' own assistant, get a reliable mic path from the glasses, keep audio alive with the screen locked, or identify TV/movie audio — are all things only Meta can unlock. This document lists every integration point: what's live now, what True Access exposes, and exactly what Meta needs to provide.

Live app: https://pure-photography.github.io/true-access/
Machine-readable version of this document: `meta-integration.json` (same folder).

---

## 1. What's already built and live

| Piece | Status | How |
|---|---|---|
| Microphone capture (incl. glasses as Bluetooth headset) | ✅ Live | `getUserMedia`, mic picker, level meter |
| Music identification | ✅ Live | Chromaprint WASM on-device + free AcoustID lookup (no credits, no card) |
| Official AD track lookup (26 flagship titles) | ✅ Live | `official-ad-db.json` — tells the user which service has the track and how to enable it |
| AI description generation | ✅ Live | Free keyless providers (Pollinations, LLM7); optional free Gemini key for quality |
| Spoken output | ✅ Live | Web Speech API, voice/speed picker, auto-speak |
| Hands-free trigger ("describe this" / "audio describe") | ✅ Live | Porcupine on-device wake word (free tier, no credits) + browser speech recognition fallback |
| Siri Shortcut trigger ("Hey Siri, describe this") | ✅ Live | URL actions (`?action=describe&autostart=1`) — see SHORTCUTS.md |
| Deep links | ✅ Live | `web+trueaccess://describe` (installed PWA) |
| postMessage control API | ✅ Live | Embed in a webview, drive with messages — see §3 |
| Screen-reader-first accessibility | ✅ Live | Full audit in ACCESSIBILITY.md |

**No-credits pledge:** every third-party service in True Access is free with no credit system, no pay-as-you-go, no expiring trial. If it needs credits, it isn't used.

---

## 2. What Meta can connect to today (no Meta work required)

### A. URL actions — deep-linkable from anywhere
```
https://pure-photography.github.io/true-access/?action=describe&autostart=1
?action=describe   start listening (if needed) and describe what's playing
?action=repeat     speak the last description again (no mic needed)
?action=start      start listening
?action=stop       stop everything
```
Any Meta surface that can open a URL — the Meta AI app, a glasses companion card, a notification — can trigger True Access with zero integration work.

### B. Custom protocol — `web+trueaccess://`
Registered in `manifest.json` (`protocol_handlers`). `web+trueaccess://describe` opens the installed PWA straight into the describe flow. Works in Chromium-based hosts today.

### C. postMessage API — for embedding in Meta's app
Embed True Access in a webview or iframe and control it programmatically:

```js
// Probe capabilities
frame.postMessage({ type: 'true-access/ping', id: '1' }, '*');
// → { type:'true-access/response', id:'1', ok:true, app:'true-access', version:'0.4.0' }

// Trigger a description
frame.postMessage({ type: 'true-access/describe', id: '2' }, '*');
// → { ok:true }  — or { ok:false, error:'not-listening' } if mic consent is needed

// Other actions: true-access/status, true-access/repeat, true-access/stop
```

Honest limit: browsers grant the microphone only after a user gesture, so a remote `describe` while listening is off queues the flow and reports `not-listening` instead of failing silently. A native host (Meta's app) can pre-grant this.

---

## 3. What only Meta can unlock (the six asks)

### Ask 1 — Wake-word routing: "Hey Meta, describe this"
The glasses' own assistant intercepts anything starting with "Hey Meta" before any phone app hears it. True Access deliberately uses "describe this" (no prefix) to avoid the fight — but Mary's natural phrase is "Hey Meta, describe this." **Only Meta can route that phrase to True Access natively on the glasses.** This is the single highest-value integration: it makes the feature feel built-in instead of bolted on.

### Ask 2 — Supported glasses↔phone audio path
Today the app relies on the glasses pairing as a generic Bluetooth headset and the OS handing the browser *some* microphone. A supported, documented audio path between the glasses' mics/speakers and a phone app would make capture and the wake word reliable instead of best-effort.

### Ask 3 — Background audio
iOS suspends web audio when the screen locks or Safari backgrounds. Descriptions stop the moment the phone goes in a pocket. A native path — or glasses-side processing — keeps True Access describing while the phone is away.

### Ask 4 — Content identification backend (the Shazam piece)
No free service on earth fingerprints TV/movie audio; only music databases are free and open. Enterprise identification (Gracenote/ACRCloud class) is the funded milestone. With it, "describe this" works on everything, not just music.

### Ask 5 — Official AD track access
Streaming AD tracks are DRM-locked inside their apps. Today True Access tells the user *where* the official track is and *how to enable it* — the honest maximum for a web app. With Meta as the host, handoff-to (or playback of) the real track becomes possible.

### Ask 6 — Camera access on the glasses (future)
Third-party apps cannot touch the glasses' camera today, so descriptions are audio-only overviews. True moment-by-moment visual description needs Meta to open the camera or build the description natively.

---

## 4. Why this matters (Mary's words)

> "No theater in my hometown offers blind accessibility, but they DO offer closed-caption devices for deaf people. To me that's discrimination. I'm doing this for every blind person in the world."

True Access is the proof that universal audio description is buildable. Meta building it in natively — starting with Ask 1, the wake-word routing — is what makes it *true* access.

---

## 5. Technical contact

Built by Mary Robinson. The app, this document, and `meta-integration.json` are the complete integration surface — there is no SDK to install and no backend to run. Point a webview at the live URL or read the manifest; everything else is a conversation.
