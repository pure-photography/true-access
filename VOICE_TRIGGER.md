# True Access — Hands-Free Voice Trigger

*Worker 3 of 5 (Voice Trigger). Implemented 2026-10-18.*

Say **"describe this"** any time while listening is active, and True Access runs the same describe flow as the "Describe what's playing" button — no tapping needed. Everything is announced to the screen reader: *"Voice trigger listening"*, *"Voice trigger heard you — describing now"*, *"Voice trigger off."*

---

## 1. The approach

The trigger is a **pluggable engine** (`voice-trigger.js`) with three options, picked in the app under **Hands-free voice trigger → Trigger engine**:

| Engine | What it is | Cost | Works today? |
|---|---|---|---|
| **Porcupine wake word** (Picovoice) — **recommended** | True on-device wake-word detection. Hears only the phrase "describe this"; everything else is ignored. Built for always-on listening, hardened against TV/radio false triggers. | **$0** — free tier, no credit card | After a one-time ~5-minute setup (below) |
| **Browser speech recognition** | The Web Speech API in continuous mode, with the transcript matched against the trigger phrase. | **$0** — built into the browser | Yes, right now — no setup |
| **Hold-to-talk** (fallback button) | Press and hold, say "describe this", release. | **$0** | Yes, right now |

**"Auto"** (the default) uses Porcupine once it's set up, otherwise browser speech recognition, otherwise tells you plainly that nothing is available.

### Why Porcupine is the recommendation

- **Accuracy:** a dedicated wake-word model trained on the exact phrase. It is far less likely than full speech recognition to fire on TV dialogue, and it won't fire on similar-sounding words the way a transcript matcher can.
- **Battery:** designed to sit in a hot loop all day on milliwatts. Browser speech recognition keeps the microphone *and* the network radio busy the whole time.
- **Privacy:** 100% on-device. Browser speech recognition streams your audio to Google's (Chrome) or Apple's (Safari) servers.
- **iPhone installed app:** browser speech recognition does **not** exist in a Home-Screen-installed PWA on iOS (Apple limitation — see §4). Porcupine uses the microphone directly, so it is expected to work in the installed app too.

### Free-tier terms (checked 2026-10-18)

Picovoice's free tier: **$0, no credit card**, unlimited voice interactions for **3 monthly active users**, custom wake-word training included via the Picovoice Console. That covers Mary testing plus a couple of helpers. If True Access ever grows past 3 users/month, the next tier is $899/month — which is exactly why the Meta pitch (§6) matters: native wake-word support from Meta removes this ceiling entirely.

### The one-time Porcupine setup (about 5 minutes)

1. Make a free account at **console.picovoice.ai** (email or GitHub, no card). Copy your **AccessKey**.
2. In the console, open **Porcupine** → type the wake phrase **`describe this`** → platform **Web (WASM)** → test it with the microphone button → **Train** → download the **`.ppn`** keyword file.
3. In the app, open **Hands-free voice trigger → Wake-word setup**, paste the AccessKey, choose the `.ppn` file, tap **Save wake-word setup**.
4. Flip the **Voice trigger** switch on. You'll hear *"Voice trigger listening. Say 'describe this' any time."*

⚠️ **Train the phrase `describe this` — NOT "hey meta describe this".** Saying "Hey Meta" near the Ray-Ban Meta glasses wakes the glasses' *own* assistant before this app ever hears it (see §5). Plain "describe this" is the phrase.

The AccessKey and model stay in the phone's `localStorage` — they are never sent anywhere except to Picovoice's engine running on-device.

---

## 2. How the hard parts are handled

### Not triggering on TV dialogue
- **Porcupine:** hardened by design — wake-word models are trained to ignore everything that isn't the phrase.
- **Browser speech recognition:** only *final* transcription results are matched (never half-heard interim guesses), results below 0.35 confidence are rejected (a missing confidence value, which Safari often omits, never blocks a real trigger), and the phrase must appear in full.
- **Both:** after every trigger there is a **15-second cooldown** — one phrase can't fire the flow twice, and dialogue can't chain-trigger descriptions.

### Not fighting the screen reader / never triggering on itself
- While the app speaks a description, the trigger engine is **paused** (not just muted): the SpeechRecognition engine is aborted and rebuilt fresh afterward (required on iOS anyway — WebKit bug 321436 kills a recognizer that survives TTS); the Porcupine engine stops its audio forwarding.
- A synchronous guard flag backs this up: any detection that somehow arrives while the app's own speech is playing is **ignored**.
- Resuming is race-safe: if an interrupted utterance's error arrives after a new speak began, the guard stays up until speech truly ends.
- "Stop everything" and "Stop speaking" resume the trigger immediately.

### Screen-reader accessibility (per ACCESSIBILITY.md contract)
- The toggle is a **real checkbox with `role="switch"`**, a visible label, and a 76×44px target — no custom div-switch.
- Every state change is announced through the polite live region; errors and blocks (mic denied, unsupported browser) go through the **assertive** region.
- The hold-to-talk button: press-and-hold for sighted/mouse users, **hold Space/Enter** for keyboard, and a **single tap = 6-second listen window** for VoiceOver (double-tap can't "hold").
- Nothing about the trigger is color-only: the state line is plain text ("Listening for…", "Off."), and the hold button's text changes while listening.

---

## 3. Battery notes (for Mary)

- **Porcupine wake word:** sips power — this is what it's built for. Leave it on while you watch.
- **Browser speech recognition:** noticeably hungrier — mic + network radio stay active, and on iPhone it can warm the phone. **Turn the trigger off when you're done watching** (the switch is right in the Hands-free card).
- The trigger only runs while main **Listening** is active. Tapping **Stop** (or **Stop everything**) turns the trigger off too — it can never listen behind your back.

---

## 4. Platform support matrix

|  | iPhone Safari (browser tab) | iPhone installed app (Home Screen) | Android Chrome | Desktop Chrome/Edge |
|---|---|---|---|---|
| Porcupine wake word | ✅ expected (needs Mary's live test) | ✅ expected (needs Mary's live test) | ✅ expected | ✅ expected |
| Browser speech recognition | ✅ works | ❌ **not available** — Apple does not expose it to installed web apps | ✅ works (cloud; ~60s auto-restart) | ✅ works |
| Hold-to-talk | ✅ works | ❌ (no speech recognition) | ✅ works | ✅ works |
| "Describe what's playing" button | ✅ | ✅ | ✅ | ✅ |

**Known iOS quirks (Apple's, not ours):**
- Starting browser speech recognition **freezes the mic level meter** on iPhone (WebKit bug 321436 — the mic track goes silent). Describing still works; the meter just stops moving until the trigger is turned off. Porcupine does not cause this.
- After a voice-triggered describe on iPhone, **auto-speak may be silently blocked** (iOS only allows speech near a user gesture, and the trigger isn't one). The description still appears on screen — tap **"Speak description aloud"** to hear it. The `unlockSpeech()` warm-up covers the button-tap path.
- With the screen locked, iOS may suspend the page's audio entirely — the documented $0-PWA ceiling (see ACCESSIBILITY.md §2).

---

## 5. The "Hey Meta" conflict — read this before testing

Mary asked for the trigger phrases *"Hey Meta, describe this"* and *"Hey Meta, audio describe."* There is a real conflict:

> **The Ray-Ban Meta glasses have their own "Hey Meta" listener.** When you say "Hey Meta" near the glasses, *the glasses wake their own Meta AI assistant* — the sound never reaches the phone app as a clean trigger. The glasses will try to answer you themselves (or just get confused) instead of letting True Access describe what's playing.

So the app's trigger phrases are intentionally **"describe this"** and **"audio describe"** — no "Hey Meta" prefix. If you say "Hey Meta, describe this" anyway, the matcher still catches the "describe this" part *if* the glasses don't intercept it first, but don't count on it.

**This is pitch material:** only Meta can make "Hey Meta, describe this" open True Access natively on the glasses. A PWA literally cannot win a race against the glasses' own wake word. See §6.

---

## 6. What would close the remaining gaps (the Meta pitch)

1. **Native wake-word routing.** Let "Hey Meta, describe this" / "Hey Meta, audio describe" launch True Access on the glasses themselves, instead of the glasses' assistant swallowing the phrase. No web app can do this — it needs Meta.
2. **Microphone + speaker access from the glasses to the phone app.** Today the app depends on the glasses pairing as a generic Bluetooth headset and iOS handing the browser *some* microphone. A supported audio path would make the trigger reliable.
3. **Background audio.** iOS suspends web audio when the screen locks or Safari backgrounds. A native path (or glasses-side processing) keeps descriptions playing while the phone is in a pocket.
4. **The Shazam piece.** Real content identification (audio fingerprinting backend) is the other funded milestone — see FINGERPRINTING.md.

---

## 7. Testing checklist for Mary (VoiceOver on iPhone, Safari tab)

1. Open the app in **Safari** (not the installed app, for the speech-recognition engine). Start Listening, allow the mic.
2. In **Hands-free voice trigger**, turn the **Voice trigger** switch on. **You should hear:** *"Voice trigger listening. Say 'describe this' any time."*
3. Say **"describe this"** clearly. **You should hear:** *"Voice trigger heard you — describing now,"* then *"Identifying what's playing…"*
4. While the description is **speaking**, say "describe this" again. **Nothing should happen** — the trigger is paused during speech.
5. Say "describe this" twice quickly. It should fire **once** (15-second cooldown).
6. Turn on a TV/podcast nearby and let it play for a few minutes. The trigger should **not** fire on ordinary dialogue.
7. Tap **Stop everything**. **You should hear** the trigger turn off with it.
8. **Hold-to-talk:** press and hold the button, say "describe this", release. With VoiceOver: double-tap once (6-second window), say the phrase.
9. **Porcupine path:** after the 5-minute setup, set engine to "Porcupine wake word", turn the switch on, and repeat steps 3–6. Note battery warmth vs. the speech engine.

### Files
- `voice-trigger.js` — the trigger module (engines, cooldown, TTS coordination, hold-to-talk)
- `index.html` — "Hands-free voice trigger" card
- `app.js` — pauses/resumes the trigger around `speakText()`, auto-offs it on stop, initializes it on load
- `styles.css` — switch, setup disclosure, hold-button listening state
- `sw.js` — cache bumped to `true-access-v2`, new file added to the offline shell
