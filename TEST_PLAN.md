# True Access — Test Plan (Milestone 1)

*Written for Mary Robinson. This whole document is designed to be read aloud clearly — by a screen reader or by Hannah. Steps are short and numbered. Nothing here depends on seeing the screen.*

---

## PART 1 — Before you start: what you need

1. Your iPhone, with Safari.
2. Your Ray-Ban Meta glasses, charged, paired to your iPhone by Bluetooth.
3. A Wi-Fi or cell connection (the app page has to load).
4. Something to play audio from: your TV, a YouTube video on another device, or your TV's Netflix — anything with sound. Sit close enough that the glasses' microphones can hear it.
5. About 30 minutes, and a quiet room for the first round of tests.

**The most important thing to know before you test:**

> **The "identify what is playing" part is a demo in this build.** When you tap "Describe what's playing," the app does NOT actually identify your show or video. It waits about 3 seconds and reads out one of three short sample descriptions it has built in: "Harbor Lights" (a fishing boat), "The Night Market" (a street market), or "Morning on the Farm." It picks one at random.
>
> **So for Milestone 1, you are testing the plumbing, not the brain.** You are checking: does the app get sound from the glasses' microphone? Can you pick the right mic? Does the app speak the description out loud? Are all the buttons easy to use with your screen reader? The real Shazam-style identification is the piece that still needs to be built.

---

## PART 2 — The test script

Read these steps in order. After each group of steps there is a line that says **"You should hear/feel:"** — that is the check. If you don't get that result, write it down in the feedback notes at the end (Part 4).

### Test 1 — Install the app on your home screen

1. Open Safari on your iPhone.
2. Go to the True Access page: **pure-photography.github.io/true-access** — your parent agent will give you the exact link.
3. Once the page loads, open the **Share** menu (the square with the arrow pointing up, at the bottom of Safari).
4. Scroll the Share menu and choose **Add to Home Screen**.
5. Leave the name as "True Access" and confirm.
6. Go back to your home screen and find the True Access icon. Open it.

**You should hear/feel:** The app opens full-screen, like its own app, not like a web page inside Safari. The first thing announced is the heading "True Access."

### Test 2 — Pair your glasses

1. Put your Ray-Ban Meta glasses on and make sure they are powered on.
2. On your iPhone, open **Settings**, then **Bluetooth**.
3. Check that your glasses appear as connected. If not, connect them now.
4. Go back to the True Access app.

**You should hear/feel:** Nothing changes in the app yet — this is just setup. Move on.

### Test 3 — Give the app microphone permission

1. In the True Access app, find the **Controls** section.
2. Activate the button labeled **"Start Listening."**
3. Your iPhone will pop up a permission request: True Access wants to use your microphone. Choose **OK** or **Allow**.

**You should hear/feel:** The app's status message changes to: "Listening. Play something nearby, then tap Describe what's playing." The **Stop** button becomes available, and so does **Describe what's playing.**

**If instead you hear:** "Microphone access was blocked or failed," — stop here and note it. The test cannot continue without mic permission. (Fix: iPhone Settings → Privacy → Microphone → turn on True Access.)

### Test 4 — Pick the glasses' microphone

1. In the **Controls** section, find the dropdown labeled **"Microphone (pick your glasses' headset mic)."**
2. Open it and look through the list. Before you granted permission (Test 3), the microphones had generic names like "Microphone 1." After permission, their real names should appear.
3. Choose the entry that names your glasses — it may say something with "Meta," "Ray-Ban," or the glasses' model name.
4. If you are not sure which one it is, activate **"Refresh microphone list"** and look again.
5. Leave **"Start Listening"** running while you do this. If listening already started with the wrong mic, tap **Stop**, pick the mic, then tap **Start Listening** again.

**You should hear/feel:** You pick a mic and listening keeps going with no error message.

**Honest note:** On iPhone, the Bluetooth microphone is routed by the phone's system, not fully by the app. The picker may or may not actually switch the mic on iOS — the phone may keep using whichever mic it chose. If switching mics seems to do nothing, that is an iOS limitation, not a bug in your testing. Note what happens.

### Test 5 — Check the mic is hearing something

1. With the app listening, play something with sound nearby — TV, a video on another device.
2. Turn the volume up to a normal TV level.
3. Listen to the app's status area. The microphone level meter is visual, but the status text will tell you if the mic hears nothing (it stays "Listening" — if the mic picked up nothing at all, you may see the status report an error).

**You should hear/feel:** The app keeps listening happily while sound plays. No error message.

### Test 6 — Trigger a description (the button)

This is the core test. The voice trigger ("Hey Meta, describe this") is **not built yet** — for Milestone 1, the button IS the trigger.

1. With the app listening and something playing nearby, activate **"Describe what's playing."**
2. Wait.

**You should hear/feel:** Within about 3 seconds, the app announces **"Description ready."** Then, because "Speak new descriptions automatically" is on by default, the app **speaks a description out loud** — one of the three sample ones (the fishing boat, the night market, or the farm).

**Pass =** you hear a spoken description within about 15 seconds of tapping the button.
**Also a pass =** you hear a clear spoken or announced error message instead (for example "Microphone access was blocked"). Silence with no announcement is a fail — note it.

### Test 7 — The voice trigger (not built yet — read this, don't test it)

"Hey Meta, describe this" is the long-term voice trigger, but **it does not exist in Milestone 1**. Two things to know:

- There is no wake-word listening in this build. Saying "Hey Meta" to the app right now does nothing.
- Careful: "Hey Meta" already belongs to your glasses' own Meta AI. If you say it during testing, the *glasses* may answer, not the app. That is expected and not a bug.

**Decision needed for later:** because "Hey Meta" wakes the glasses themselves, the real app may need a different trigger phrase (something that doesn't wake Meta's assistant). Note any ideas you have.

### Test 8 — Repeat the description

1. After a description finishes speaking, activate **"Speak description aloud"** in the "Now describing" section.

**You should hear/feel:** The same description plays again from the start.

### Test 9 — Change the detail level (verbosity)

1. Find the **Settings** section.
2. Open the dropdown labeled **"Description detail."** It has three choices: Brief, Standard, Detailed. It starts on Standard.
3. Change it to **Detailed**.
4. Go back and activate **"Describe what's playing"** again.

**You should hear/feel:** The new description is longer and more detailed than the Standard one. (Brief = one sentence. Standard = a few sentences. Detailed = a full little scene.)

### Test 10 — Change the voice and the speech speed

1. In **Settings**, open the dropdown labeled **"Description voice."** Pick any voice you like — try a different one from the default.
2. Find the slider labeled **"Speech speed."** It starts at 1.0. Move it up to about 1.5 (faster) or down to 0.7 (slower). Your screen reader will announce the number.
3. Activate **"Speak description aloud"** again.

**You should hear/feel:** The description is read in the new voice, at the new speed.

### Test 11 — Stop speaking mid-description

1. Start a description speaking (any verbosity).
2. While it is talking, activate **"Stop speaking."**

**You should hear/feel:** The voice stops immediately.

### Test 12 — Stop listening

1. Activate the **Stop** button in the Controls section.

**You should hear/feel:** The status announces "Stopped. Tap Start Listening to begin again." The **Describe what's playing** button becomes unavailable (greyed out).

### Test 13 — The "start over" loop

1. Tap **Start Listening** again.
2. Tap **Describe what's playing** again.

**You should hear/feel:** The whole loop works a second time with no need to reload the page or re-grant permission.

### Test 14 — Error path: describe without listening

1. Make sure the app is stopped (Test 12).
2. Try to activate **"Describe what's playing."** (It should be greyed out — if you can still activate it, do.)

**You should hear/feel:** A clear message like "Start listening first, so the app can hear what is playing." No silence, no crash.

---

## PART 3 — Acceptance criteria for Milestone 1

Milestone 1 is **DONE** when every line below is true. Each one is written in observable terms — you can check it with your ears alone.

| # | Flow | "Working" means… |
|---|------|-------------------|
| 1 | Install | Mary opens the app from her home screen icon and it launches full-screen; the "True Access" heading is announced. |
| 2 | Mic permission | Tapping "Start Listening" produces the iOS mic permission prompt; after allowing, the status announces "Listening." |
| 3 | Mic selection | The microphone list shows named devices after permission is granted; picking an entry does not produce an error. |
| 4 | Listening | While audio plays nearby, the app stays in the Listening state with no error for at least 2 minutes. |
| 5 | Trigger (button) | After tapping "Describe what's playing," Mary hears a spoken description **within 15 seconds**, OR hears a clear spoken/announced error message. |
| 6 | Repeat | "Speak description aloud" replays the current description from the start. |
| 7 | Verbosity | Switching Brief → Standard → Detailed produces audibly shorter → longer descriptions on the next "Describe." |
| 8 | Voice & rate | Changing the voice picker and the speech-speed slider changes the spoken voice and speed on the next playback. |
| 9 | Stop speaking | "Stop speaking" cuts off speech immediately. |
| 10 | Stop listening | "Stop" announces the stopped state and disables "Describe what's playing." |
| 11 | Repeat loop | Start → Describe → Stop → Start → Describe works twice in a row without reloading. |
| 12 | Screen-reader access | Every button, dropdown, and slider is reachable and labeled with VoiceOver; the status area announces state changes; no step requires seeing the screen. |

**Milestone 1 is NOT required to:** identify real content (demo samples are expected), respond to a voice trigger, work when the phone screen is locked, or describe music (see limitations).

---

## PART 4 — Device and content test matrix

Run the core loop (Tests 5–6) under each combination you can. Check off what you tried and what happened. You do not have to do all of these in one sitting.

### Content types

| Content | What to play | What to expect in Milestone 1 | Worth noting |
|---------|--------------|-------------------------------|--------------|
| TV show / movie dialogue | Any show on your TV, normal volume | Demo sample description (NOT your show) — you're testing that the mic hears and the app speaks | Does the glasses mic pick up the TV clearly from your seat? |
| YouTube video | A talking-head video on another device | Same as above | Any difference vs. the TV? |
| Music | A song playing nearby | **Music is the graceful-failure test.** The app cannot describe music in Milestone 1 — it will still return a demo sample. Note: it should never crash, freeze, or stay silent. In the real app, music should get a spoken "I can't describe music yet" message — flag whether you want that | Does loud music distort or break the mic capture? |
| Quiet speech | A podcast or audiobook at low volume | Same demo behavior | How quiet can the source be before the app seems to hear nothing? |
| No content at all | Silence — tap Describe with nothing playing | Still returns a demo sample in Milestone 1 (honest demo behavior). In the real app this should say "I didn't hear anything playing" | |

### Environments

| Environment | Notes |
|-------------|-------|
| Quiet room | Baseline — do this first |
| Noisy room | TV on + background noise (fan, people talking, kitchen sounds). Does the app stay stable? |
| TV loud vs. TV quiet | Does volume change anything about whether the app keeps listening? |

### Microphone sources

| Mic | How | Notes |
|-----|-----|-------|
| Glasses mic | Pick the glasses in the mic dropdown (Test 4) | The real target — this is the one that matters most |
| Phone mic | Leave the dropdown on "Default microphone" | Baseline comparison — is the glasses mic noticeably better/worse at hearing the TV? |
| Phone speaker as source | Play the video ON the test iPhone itself while the app listens | Edge case: the phone plays and listens at once — note if it echoes or behaves oddly |

### Priority order (if time is short)

1. Quiet room + TV show + glasses mic — the headline test.
2. Quiet room + YouTube video + glasses mic.
3. Quiet room + TV show + phone mic (comparison).
4. Music playing — check for graceful behavior, no crash.
5. Noisy room — stability check.

---

## PART 5 — Feedback capture

Mary, after each test session, dictate your answers to these questions. Short answers are fine — a sentence or two each. Hannah (or your parent agent) will collect them.

**Session info**
- Date and time of test:
- Which tests did you run? (Test numbers, e.g. "Tests 1–6, then 9"):
- Content you played (TV show? YouTube? music? nothing?):
- Room: quiet or noisy?
- Microphone used: glasses or phone?

**What worked**
- What went smoothly? What felt easy?

**What didn't work**
- What broke, confused you, or stayed silent when it should have spoken?
- Exact words of any error message you heard:

**The voice**
- Was the description voice clear and pleasant?
- Was the speed right? Too fast? Too slow?
- If you changed voices, which one did you like best?

**What you wish it did**
- Anything you expected that didn't happen?
- Ideas for the trigger phrase (remember "Hey Meta" wakes the glasses, not the app):
- Anything else:

**One-line verdict**
- In one sentence: would you use this again tomorrow? Why or why not?

---

## PART 6 — Known limitations (read before testing so nothing surprises you)

1. **Identification is demo-only.** The app does not know what you are watching. It returns one of three built-in sample descriptions at random. Real fingerprinting needs a paid backend service — that is the honest gap, and the part the Meta pitch is about.
2. **No voice trigger yet.** "Hey Meta, describe this" is the vision, not the build. The button is the trigger for now. Also note: "Hey Meta" already wakes your glasses' own Meta AI, so the real trigger phrase will probably need to be something else.
3. **iPhone Bluetooth mic routing is the phone's decision.** iOS decides which microphone the browser gets. The in-app mic picker may not actually switch mics on iPhone — if picking the glasses seems to change nothing, that is an iOS limitation.
4. **Bluetooth headset mics are low-fidelity by design.** When a Bluetooth mic is active, audio drops to phone-call quality (mono, narrow band). That is fine for identifying content later, but don't judge the mic on richness — judge it on whether it hears the TV.
5. **Spoken output goes wherever the phone sends audio.** The description may come out of the glasses' speakers, the phone speaker, or your hearing route depending on your iOS audio settings — if you hear it from the phone instead of the glasses, that's routing, not a bug. Check your iPhone's audio output (Control Center) if it surprises you.
6. **Fingerprinting will need the internet.** When the real identification backend is built, it needs a network connection to match audio. Offline mode will not be able to identify content (settings and past descriptions could still work offline).
7. **The app must stay open and on-screen.** iPhones stop giving apps microphone access when the screen locks or you switch apps. Don't lock the phone mid-test.
8. **HTTPS only.** The app page must load over HTTPS (the GitHub Pages link is HTTPS, so you're fine). Microphone access is blocked on insecure pages.
9. **Music and silence are not handled specially yet.** Playing music, or tapping Describe with nothing playing, still returns a demo sample. The real app should say "I can't describe music" or "I didn't hear anything" — that behavior is on the roadmap, not in this build.
10. **Battery.** Continuous mic + speech will drain both the phone and the glasses faster than normal. Keep chargers nearby for long sessions.

---

*End of test plan. Good luck, Mary — you're the expert this app is built for. If anything in this plan is confusing or hard to do with your screen reader, say so: that's feedback too.*
