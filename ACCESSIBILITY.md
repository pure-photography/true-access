# True Access — Accessibility Audit & Hardening

*Worker 4 of 5 (Accessibility + UI Polish). Audited 2026-10-18 against WCAG 2.2 AA with a screen-reader-first lens. Mary is blind and tests everything herself with VoiceOver on iPhone — that is the bar this whole document is written against.*

---

## 1. Audit results

### What was already good (kept)

| Area | Status |
|---|---|
| Skip link ("Skip to main controls") | ✅ Pass |
| ARIA live status region (`role="status"`) | ✅ Pass |
| Every form control labeled (`<label for>`) | ✅ Pass |
| Keyboard-navigable, visible focus indicator | ✅ Pass |
| High-contrast theme, large touch targets (56px+) | ✅ Pass |
| `prefers-reduced-motion` support | ✅ Pass |
| Level meter had `role="meter"` + text alternative | ⚠️ Pass, but hardened (see below) |
| No icon-only buttons anywhere | ✅ Pass (n/a — all buttons are text) |

### What was broken → fixed

**A1. Microphone permission was requested with no warning.**
The old flow called `getUserMedia()` the instant "Start Listening" was tapped — the iOS system dialog appeared with zero explanation. For a blind user, a surprise system dialog is disorienting.
**Fix:** a plain-language consent card now appears first ("Before we start: microphone permission"), explaining *why* the mic is needed, that the glasses' mic should be picked, and that nothing is recorded or saved in this prototype. Focus moves to the consent heading so VoiceOver reads it immediately. Consent is remembered in `localStorage` so it only asks once per browser.

**A2. "Identifying" and "generating" were one silent lump; errors were polite.**
The demo jumped from "Identifying what's playing…" straight to "Description ready." Errors (mic denied, identify failed) went through the polite `role="status"` region and could be missed or talked over.
**Fix:** the pipeline now announces each async state separately — "Identifying what's playing…", then "Identified as X. Generating description…", then "Speaking the description…" / "Finished speaking the description." A second live region with `role="alert"` (assertive) carries all errors, including a plain-language mic-denied message with the exact iOS Settings path to fix it.

**A3. Focus was lost whenever a button disabled itself.**
`startListening()` disabled Start while it had focus; `stopListening()` disabled Stop while it had focus; `describeWhatsPlaying()` disabled Describe while it had focus. In each case focus dropped to `<body>` — VoiceOver users were stranded with no context.
**Fix:** focus now moves to its replacement *before* any control is disabled: Start → Stop, Stop → Start, Describe → the status region. Rule added to the code contract: **focus moves first, disable second.**

**A4. Focus never moved to results.**
The old code only `scrollIntoView()`-ed the result card — screen-reader focus stayed wherever it was.
**Fix:** when a description is ready, focus moves to the "Now describing" heading (`tabindex="-1"`), so VoiceOver starts reading the result immediately. (Focus move also scrolls, so the old `scrollIntoView` call was removed.)

**A5. The level meter could flood the screen reader.**
`aria-valuenow` was rewritten ~60 times per second. Some screen readers announce meter value changes, which would have spammed Mary's speech queue.
**Fix:** the visual bar still animates at 60fps, but `aria-valuenow` + `aria-valuetext` ("quiet" / "low" / "moderate" / "loud") update at most once per second, and only when the word changes. No information is conveyed by color or the bar alone — the word is the alternative.

**A6. Repeated identical announcements were swallowed.**
Tapping "Repeat last description" twice announced "Repeating the last description" only the first time (live regions ignore identical text).
**Fix:** `setStatus()` clears the region and re-sets the text on a short timer, forcing re-announcement every time.

**A7. No "repeat last description" control existed.**
If Mary missed a description (doorbell, someone talking over it), it was gone.
**Fix:** added "Repeat last description" — re-shows the last result card if needed and speaks it again. It stays enabled even when empty (so it's always findable by touch) and politely announces "There is no description to repeat yet" in that case.

**A8. No single "stop everything."**
Listening and speech had separate stops in different sections; nothing halted both at once.
**Fix:** a big red **"Stop everything"** button in a sticky bottom bar halts listening *and* speech immediately, announces "Stopped everything," and returns focus to "Start Listening." The Controls "Stop" button does the same. If nothing is active it says so ("Nothing to stop — the app is already idle") instead of being confusingly disabled.

**A9. Verbosity presets were buried in Settings.**
Brief / Standard / Detailed existed but sat at the bottom of the page.
**Fix:** moved "Description detail — how much should I describe?" up into the Controls card, right above "Describe what's playing." Changing it announces the new setting ("Description detail set to: Brief — key moments only.").

**A10. Speech-rate changes were silent and the value was bare.**
The slider label showed "1.0×" with no words, and adjusting it announced nothing.
**Fix:** the slider now exposes `aria-valuetext` ("1.2 times normal speed") and announces the new speed when the change is committed.

**A11. Skip link target wasn't focusable.**
`href="#main"` scrolled visually but didn't reliably move screen-reader focus.
**Fix:** `<main>` now has `tabindex="-1"`.

**A12. Changing mic / voice / speed gave no feedback.**
**Fix:** picking a microphone announces "Microphone set to: …". The mic list announces its count on refresh ("Found 3 microphones.") or an assertive error if none are found. "Start Listening" is linked to its Bluetooth-pairing hint via `aria-describedby`.

**A13. iOS could silently block speech after the async gap.**
iOS Safari only allows `speechSynthesis.speak()` inside or very near a user gesture. Auto-speak fired ~4 seconds after the "Describe" tap — on iOS it could fail silently, which would break the core screen-off use case.
**Fix:** the tap handler now calls `unlockSpeech()` (a silent warm-up utterance inside the gesture) to keep speech allowed. Documented as a mitigation, not a guarantee — see "Remaining."

### UI polish (thumb-friendly, screen-off-first)

- **Sticky quick-actions bar** (bottom, always visible, safe-area aware): "Repeat last description" + "Stop everything." Big 64px+ targets, reachable by thumb with the phone in one hand, and the two controls Mary needs without looking — or with the screen off entirely.
- **High-contrast theme kept** (dark navy, white text, yellow focus ring). New danger red (`#b3261e` on white text ≈ 5.9:1) passes AA for large text.
- **WCAG 2.2 — 2.4.11 Focus Not Obscured:** body padding + `scroll-margin-bottom` so the sticky bar never covers focused content.
- **Target size (WCAG 2.2 — 2.5.8):** all controls ≥ 56px; quick-bar buttons ≥ 64px. Well above the 24px minimum.
- Installability polish: `mobile-web-app-capable` / `apple-mobile-web-app-capable` meta tags.

---

## 2. What remains (known limitations — be straight)

1. **Speech with the screen locked is platform-limited.** iOS may suspend a web page's audio when Safari is backgrounded or the phone locks. The `unlockSpeech()` mitigation helps while the app is foreground; true background audio needs a native app or the glasses' own processing. This is the honest ceiling of a $0 PWA.
2. **Bluetooth mic routing on iOS is system-controlled.** iOS decides which mic the browser gets; the in-app mic picker works best on Android/Chrome. The hint text says this.
3. **Content identification is still demo mode** — three built-in sample programs. The pipeline announces "identifying/generating" honestly in demo form; the real fingerprint backend is a separate milestone.
4. **Consent is remembered per browser** (`localStorage`). Private browsing re-asks each session — acceptable, arguably preferable.
5. **No haptic feedback** on state changes (e.g., a vibration when "Listening" starts). Nice future addition for the screen-off case; not possible to test meaningfully in this pass.

---

## 3. Screen-reader test procedure — VoiceOver on iPhone

*Written to be followed by touch alone, screen off if you like. Each test says what you should hear.*

**Setup:** Open the True Access page in Safari. Turn VoiceOver on (triple-click side button, or Settings → Accessibility → VoiceOver). Use: **swipe right** = next item, **swipe left** = previous, **double-tap** = activate, **two-finger swipe up** = read from top. The **rotor** (two-finger twist) set to "Headings" lets you jump between sections.

### Test 1 — Landmarks and the skip link
1. Two-finger swipe up (read from top). **You should hear:** the skip link "Skip to main controls" first, then heading "True Access," then the tagline.
2. Double-tap the skip link. **You should hear:** focus jump to "Status" / the main controls — swipe right and you are in the Status section, not stuck at the top.

### Test 2 — Microphone consent (first run)
1. Swipe to "Start Listening" and double-tap. **You should hear:** heading "Before we start: microphone permission," then the explanation of *why* the mic is needed.
2. Swipe right to "Not right now" and double-tap. **You should hear:** "No problem. Tap Start Listening whenever you are ready," and focus returns to "Start Listening."
3. Double-tap "Start Listening" again, then "Yes, allow the microphone." **You should hear:** the iPhone system prompt. Choose Allow. **Then you should hear:** "Listening. Play something nearby…" — and focus is on the "Stop" button, not lost.

### Test 3 — Level meter text alternative
1. While listening, rotor to the "Microphone level" meter. **You should hear:** "Microphone input level, meter, quiet" (or low/moderate/loud — the word, not just a number).
2. Play something loud near the phone, wait a second, swipe away and back to the meter. **You should hear:** the word change (e.g., "moderate"). It must never chatter numbers at you continuously.

### Test 4 — Describe flow and focus
1. Set "Description detail" to Brief (announcement confirms your choice).
2. Double-tap "Describe what's playing." **You should hear, in order:** "Identifying what's playing…", then "Identified as … Generating description…", then "Description ready," — and focus lands on the heading **"Now describing."**
3. Swipe right. **You should hear:** the identified title, then the description text read aloud automatically (auto-speak is on).

### Test 5 — Stop everything (the big red button)
1. While the description is speaking, find the sticky bar at the bottom: "Repeat last description" / "Stop everything." Double-tap **"Stop everything."** **You should hear:** speech halts *immediately*, then "Stopped everything. Listening and speech are off," and focus is back on "Start Listening."
2. Double-tap "Stop everything" again with nothing running. **You should hear:** "Nothing to stop — the app is already idle." (The button is never disabled, so it's always findable by touch.)

### Test 6 — Repeat last description
1. After Test 4's description, double-tap "Repeat last description" in the bottom bar. **You should hear:** "Repeating the last description," then the description spoken again.
2. Double-tap it twice in a row. **You should hear:** the announcement *both* times (repeated messages are not swallowed).
3. Fresh-load the page and double-tap "Repeat last description" before describing anything. **You should hear:** "There is no description to repeat yet."

### Test 7 — Speech speed
1. Find the "Speech speed" slider in Settings. Adjust it. **You should hear:** VoiceOver read values like "1.2 times normal speed" (words, not just "60 percent").
2. Lift your finger. **You should hear:** "Speech speed set to 1.2 times normal speed."

### Test 8 — Screen-off (the real use case)
1. Start listening, tap "Describe what's playing," then **lock the phone** (side button).
2. **You should hear:** the description spoken aloud even with the screen off. *(If iOS suspends it, that's the platform limit in §2.1 — note it in feedback; the unlock mitigation covers the foreground case.)*

### Test 9 — Error path (mic denied)
1. iPhone Settings → find Safari → turn Microphone **off**. Return to the app, tap "Start Listening" → "Yes, allow the microphone."
2. **You should hear (assertive, interrupting):** "Microphone permission was denied…" with the exact Settings path to fix it. Then turn the permission back on and confirm Test 2 passes again.

### Test 10 — Focus is never stranded
1. With VoiceOver on, activate every button that disables itself mid-flow (Start, Stop, Describe). After each one, swipe right once. **You should hear:** a sensible next item (Stop button, Start button, status text) — never silence, never a jump back to the top of the page.

---

## 4. WCAG 2.2 AA checklist (screen-reader-first lens)

| Criterion | Verdict |
|---|---|
| 1.1.1 Non-text Content (meter has name + valuetext; no icon-only controls) | ✅ |
| 1.3.1 Info and Relationships (landmarks, headings, labels, list-free but structured) | ✅ |
| 1.4.1 Use of Color (level also has word; status never color-only) | ✅ |
| 1.4.3 Contrast (text ≥ 7:1 on bg; muted #c9c9e6 ≈ 12:1) | ✅ |
| 1.4.11 Non-text Contrast (focus ring, meter border, button borders ≥ 3:1) | ✅ |
| 2.1.1 Keyboard (all actions are native buttons/inputs) | ✅ |
| 2.4.1 Bypass Blocks (skip link → focusable main) | ✅ |
| 2.4.3 Focus Order (managed: consent → stop → status → results heading) | ✅ |
| 2.4.7 Focus Visible (3px yellow outline) | ✅ |
| 2.4.11 Focus Not Obscured (scroll-margin + bottom padding vs sticky bar) | ✅ |
| 2.5.8 Target Size (all ≥ 56px; quick bar ≥ 64px) | ✅ |
| 3.2.2 On Input (verbosity/rate/mic changes announce; nothing auto-submits) | ✅ |
| 3.3.1 Error Identification (assertive alerts, plain language, recovery steps) | ✅ |
| 4.1.2 Name, Role, Value (meter, slider valuetext, describedby hint) | ✅ |
| 4.1.3 Status Messages (polite status + assertive alerts; no focus theft) | ✅ |

---

## 5. Cross-worker integration: hands-free voice trigger

A teammate added a **"Hands-free voice trigger"** section (`voice-trigger.js` + a new card in `index.html`) while this audit was in progress. As the `app.js` owner I wired it into the accessibility contract rather than leaving it dangling:

- `VoiceTrigger.init({ onTrigger: describeWhatsPlaying, announce: setStatus, isListening })` runs on page load (the script loads after `app.js`, so wiring is deferred to `window.load`). The trigger reuses the same announced flow — "Voice trigger heard you — describing now" → identifying → generating → speaking, with focus moving to the results heading exactly as in the button flow.
- **Self-trigger protection:** `pauseForSpeech()` is called before every `speechSynthesis.speak()` and `resumeAfterSpeech()` on end/error/cancel, so the trigger can never fire on the app's own spoken output. `stopEverything()` also calls `handleMainListeningStopped()` so the trigger stands down when listening stops.
- Verified: no top-level name collisions between `app.js` and `voice-trigger.js` (the trigger keeps its state inside an IIFE and exposes only `window.VoiceTrigger`); the switch control is a native checkbox with `role="switch"`, labeled, with `aria-describedby` pointing at its state text and help text.
- **Flag for the team:** `sw.js` (cache `true-access-v2`) does not yet list `voice-trigger.js` or `descriptions.js` — the installed app will fetch them from network only. Fine online; offline-after-install they 404. Whoever owns the service worker should add them.

### VoiceOver spot-check for the trigger (add to the test procedure)
1. Start listening, then turn the **Voice trigger** switch on. **You should hear:** "Voice trigger listening. Say 'describe this' any time." The state text under the switch reads the same.
2. Say **"describe this"** clearly. **You should hear:** "Voice trigger heard you — describing now," then the normal identify → generate → speak flow.
3. While a description is speaking, say "describe this" again. **Nothing should happen** — the trigger is paused during speech (no self-triggering).
4. Tap **"Stop everything."** **You should hear:** "Voice trigger off — listening stopped," and the switch returns to off.

- `index.html` — consent card, sticky quick-actions bar, assertive alert region, verbosity moved to Controls, focusable main/results heading, `aria-valuetext` on rate slider, `aria-describedby` on Start.
- `app.js` — consent flow, `stopEverything()`, `repeatLastDescription()`, split identify/generate announcements, focus-first-then-disable everywhere, throttled meter ARIA, `unlockSpeech()` for iOS, settings-change announcements, voice-trigger integration hooks.
- `styles.css` — `.sr-only`, `.quick-bar`, `.btn-danger`, `.consent-card`, scroll-margin for 2.4.11, safe-area padding.
