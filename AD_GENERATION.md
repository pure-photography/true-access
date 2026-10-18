# True Access — AI Description Generation (Worker 2)

How the app turns an identified title into a spoken audio description.
Built October 2026. Lives in `descriptions.js` (+ `official-ad-db.json`),
wired into `app.js` → `describeWhatsPlaying()`.

**No-credits rule (Mary's standing rule):** nothing with credits — no
credit-based services, no pay-as-you-go, no "free tier with credits."
The default chain below is keyless and credit-free (Pollinations, LLM7).
Gemini is optional-only (quota-based free tier, no credits) and the app
never requires it.

## The two-stage flow

```
Identified title
      │
      ▼
┌─────────────────────────────┐
│ STAGE 1: Official AD lookup │  checkOfficialAD(title)
│ official-ad-db.json         │  (local, works offline once cached)
└──────────────┬──────────────┘
               │
      found? ──┤── YES ──► Speak: which service has the official track
               │           + how to turn it on. (We can't stream the
               │           track itself — it's DRM-protected.)
               │
               ▼ NO
┌─────────────────────────────┐
│ STAGE 2: AI generation      │  generateDescription(title, verbosity)
│ Provider chain:             │
│   1. Gemini API (free key)  │
│   2. Pollinations (no key)  │
│   3. LLM7 (no key)          │
│ First success wins.         │
└──────────────┬──────────────┘
               │
    all fail? ─┤── YES ──► Speak: "I couldn't generate a description
               │           for this right now."  (Never silence.)
               ▼ NO
        Speak the AI-generated visual overview.
```

The three verbosity levels from the prototype are preserved:

| Level | Target length | `maxTokens` |
|---|---|---|
| brief | ~40 words | 120 |
| standard | ~120 words | 350 |
| detailed | ~250 words | 700 |

The result card shows a **source line** under the title so Mary always
knows what she's hearing: official track / AI overview (with provider) /
demo script / unavailable.

## Stage 1 — official AD track lookup

**Is there a public API of existing AD tracks?** No. The best public
resource is the **ACB Audio Description Project (ADP) Master List** —
thousands of described titles across streaming, DVD, and broadcast — but
it is published as web pages, not a JSON API, and scraping it from the
PWA would be fragile. So Stage 1 uses a **curated local database**,
`official-ad-db.json`:

- **Seed list (26 titles):** flagship originals that are certain to carry
  professional AD on their home service — e.g. *Stranger Things*,
  *Wednesday* (Netflix); *Frozen*, *The Mandalorian* (Disney+);
  *The Last of Us* (Max); *The Bear* (Hulu); *Ted Lasso* (Apple TV+);
  *The Boys* (Prime Video). The full list is in the file.
- Each entry maps to services with **how-to-enable instructions**
  (e.g. Netflix: *Audio and Subtitles → English [Audio Description]*).
- Title matching is normalized (lowercase, year tags and punctuation
  stripped) with guarded partial matching.

**Why "lookup" and not "play the track":** streaming AD tracks are
DRM-protected inside Netflix/Disney+/Max apps. A browser PWA cannot pull
or play them. The honest design is to tell Mary *where* the real track
lives and *how to turn it on* — that message is what gets spoken.

**Growing the DB:** edit `official-ad-db.json` (or host it remotely and
point `TA_DESCRIBE_CONFIG.officialDbUrl` at the URL — no redeploy of the
app logic needed). Cross-check new entries against the ACB ADP Master
List before adding.

## Stage 2 — AI generation: service choices

All three providers were verified in October 2026 to work from a browser
PWA: plain `fetch()`, CORS-enabled, $0.

| Provider | Key needed? | Free tier (Oct 2026) | Notes |
|---|---|---|---|
| **Google Gemini API** (`gemini-2.5-flash`) | Yes — free key from [AI Studio](https://aistudio.google.com/apikey), no billing | Free tier covers Flash models only; quotas have been tightened repeatedly (roughly 10–15 req/min, hundreds/day — **check the live dashboard** at aistudio.google.com, it changes) | Best quality. First in chain when a key is set. |
| **Pollinations** (classic text endpoint) | No — no signup at all | Free; community-run, limits opaque | Verified working Oct 2026: `GET https://text.pollinations.ai/{prompt}` → plain prose, CORS-enabled, ~10–20 s per request. Quality varies; it's a shared free gateway. Occasional transient HTTP 404s observed — the provider chain retries/fails over automatically. |
| **LLM7** (OpenAI-compatible) | No — anonymous (`Bearer unused`) | 30 req/min anonymous, plus a **shared daily token quota that can be exhausted** (observed "Daily token quota exceeded" Oct 2026 — the app fails over gracefully when this happens) | Verified working. Models rotate — the code auto-refreshes from `/v1/models` if the pinned model is retired. Last-resort fallback. |

Chain behavior: `provider: 'auto'` (default) tries Gemini only if a key
is configured, otherwise Pollinations, then LLM7. Each provider gets
25 s (`requestTimeoutMs`) before the next is tried. Set
`TA_DESCRIBE_CONFIG.provider` to `'gemini'`, `'pollinations'`, or
`'llm7'` to pin one.

### Setup: adding the free Gemini key (better descriptions)

1. On any browser, go to **https://aistudio.google.com/apikey**
   (free Google account; no credit card, no billing).
2. Tap **Create API key**.
3. Open `descriptions.js`, find `TA_DESCRIBE_CONFIG` at the top, and
   paste the key as `geminiApiKey: 'PASTE-HERE'`.
4. Redeploy. — The app will now use Gemini first and only fall back to
   the keyless providers if Gemini fails.

⚠️ A key pasted in client-side JS is visible to anyone who opens the
page source. Fine for Mary's personal build; for anything shared,
move the call behind a tiny backend proxy instead.

## Professional AD style — the rules we encoded

Distilled from real describer guidelines (DCMP Audio Description Tip
Sheet; Texas DIR *General Principles of Audio Description*; American
Translators Association notes on AD writing) and baked into
`AD_SYSTEM_PROMPT` in `descriptions.js`:

1. **Present tense, active voice, third person** — "She crosses the
   room," never "She crossed the room."
2. **Objective — describe, don't interpret.** "Tears fill her eyes and
   her shoulders slump," never "She looks sad."
3. **Prioritize:** setting → who's present and what they look like →
   key visual actions → on-screen text. General first, then specific.
   Skip trivial decoration.
4. **Don't narrate what's already audible** from dialogue, music, or
   sound effects.
5. **Concise, plain-spoken, complete sentences.** No flowery filler.
6. **Never invent names, places, or plot details.** Name a character
   only if the name is certain.
7. **Honesty rule (our addition):** the model cannot see video, so it
   writes a visual *overview* — and must say so plainly in one sentence
   rather than invent details if it doesn't know the title.
8. Output only the description — no headers, disclaimers, or commentary.

`generateDescription(title, verbosity, { transcript })` also accepts an
optional transcript excerpt (for the future transcription worker) so the
model avoids repeating what's already audible.

## Graceful failure

Every public function **resolves, never rejects**. Timeouts
(`AbortController`, 25 s per provider), HTTP errors, empty responses,
and a missing `official-ad-db.json` are all caught. If everything
fails, the spoken result is exactly:

> "I couldn't generate a description for this right now."

Never silence, never a stack trace. One extra guard: some free chat
backends return the model's internal reasoning trace wrapped in a JSON
envelope instead of speakable prose — `extractSpokenText()` detects
this and fails over to the next provider rather than letting the
screen reader speak the model's private monologue. (Observed live on
the Pollinations POST variant, which is why the code uses GET.) Stage progress ("Checking for an
official audio description track…", "Generating an AI description…")
goes through the app's announced status so the screen reader narrates
the wait.

## Accuracy caveats Mary should know before testing

1. **The AI writes an *overview*, not true moment-by-moment AD.**
   The Ray-Ban Meta glasses' camera is locked to third-party apps, so
   the pipeline has no video frames — the LLM describes what the
   program *looks like* (setting, characters' appearance, visual
   style/mood) from its training knowledge. It can get details wrong
   (AI "hallucination") **even with explicit instructions not to**:
   in testing, a model told never to invent names still invented a
   wrong character name for a well-known show. The official track
   (Stage 1) is always the accurate choice when one exists.
2. **The official-track list is a 26-title seed**, not the whole world
   of described content. Most titles will fall through to AI
   generation until the DB grows.
3. **We cannot play Netflix/Disney+/Max AD audio** (DRM). Stage 1
   tells you where the official track is and how to enable it.
4. **Keyless providers are community-run free gateways** — quality and
   uptime vary. A free Gemini key is the quality upgrade path and
   costs nothing.
5. **Identification is still the demo** (fellow worker's area): until
   real Shazam-style identification lands, end-to-end tests with real
   titles need a real title fed into `resolveDescription`.

## API reference (`window.TrueAccessDescribe`)

- `resolveDescription(title, verbosity, demoFallback?, onStage?)` →
  `{ source, text, services?, provider? }`. `source`: `'sample'`
  (built-in demo script) | `'official'` | `'ai'` | `'unavailable'`.
- `checkOfficialAD(title)` → `{ found, title, services: [{name, howTo}] }`.
- `generateDescription(title, verbosity, { transcript }?)` →
  `{ ok, text, provider }`; `text` is the graceful fallback on failure.
- `sourceLabel(result)` → human-friendly source line for the UI.
- `CONFIG` → the clearly-marked config constant (API key lives here).

## Future work (not this worker)

- Grow `official-ad-db.json` (or a hosted version) toward the ADP
  Master List's coverage.
- True frame-accurate AD needs Meta to open the glasses' camera —
  that's the pitch, per Mary's strategy.
- A "give me the AI overview anyway" toggle for titles that *have* an
  official track (the `resolveDescription` API already supports skipping
  Stage 1 internally; it just needs a UI switch).
- Wire the transcription worker's output into the `transcript` option.
