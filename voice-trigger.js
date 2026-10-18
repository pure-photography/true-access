/* ============================================================================
 * True Access — hands-free voice trigger
 * ----------------------------------------------------------------------------
 * WHAT THIS DOES:
 *   Lets Mary start a description without touching the phone: while listening
 *   is active, the app also listens for a trigger phrase ("describe this" /
 *   "audio describe"). On detection it runs the same describeWhatsPlaying()
 *   flow as the big button.
 *
 * ENGINES (pick one in the UI; "Auto" picks the best available):
 *   1. Porcupine (Picovoice) — RECOMMENDED. True on-device wake-word
 *      detection, built for always-on listening, hardened against TV/radio
 *      false triggers, tiny battery cost. Free tier ($0, no card): sign up at
 *      console.picovoice.ai, train the phrase "describe this" for the
 *      Web (WASM) platform, paste the AccessKey + keyword model below.
 *      Needs a one-time 5-minute setup by Mary — see VOICE_TRIGGER.md.
 *   2. Browser speech recognition — WORKS TODAY, no setup. Uses the Web
 *      Speech API in continuous mode and matches the trigger phrase in the
 *      transcript. Free and built in. Downsides: NOT available in the
 *      installed iPhone app (Safari only — Apple limitation), sends audio to
 *      Google/Apple servers, stops and restarts itself periodically, and
 *      uses noticeably more battery.
 *   3. Hold-to-talk — fallback button. Press and hold, say "describe this",
 *      release. Works anywhere speech recognition exists (Safari on iPhone,
 *      Chrome on Android).
 *
 * SELF-TRIGGER PROTECTION:
 *   - While the app is speaking a description (speechSynthesis), the trigger
 *     engine is paused — the app can never trigger itself.
 *   - After each trigger there is a cooldown (15 s) so one phrase can't fire
 *     twice and TV dialogue can't chain-trigger.
 *   - The trigger only fires while main listening is active and no
 *     description is already being identified.
 *
 * NOTE on "Hey Meta": saying "Hey Meta" near Ray-Ban Meta glasses wakes the
 * glasses' OWN assistant, not this app. So the trigger phrases intentionally
 * do NOT start with "Hey Meta" — use plain "describe this". Only Meta can
 * route "Hey Meta, describe this" to True Access natively (see
 * VOICE_TRIGGER.md — this is part of the Meta pitch).
 * ========================================================================== */

'use strict';

/* ---------- Trigger phrases ----------
 * Keep these short and unlike ordinary TV dialogue. Variants with a
 * "hey meta" prefix are recognized but OFF by default: the glasses
 * intercept "Hey Meta" before the phone app ever hears it. */
const TRIGGER_PHRASES = ['describe this', 'audio describe'];
const TRIGGER_PHRASES_WITH_PREFIX = [
  'hey meta describe this',
  'hey meta audio describe'
];
const USE_PREFIX_VARIANTS = false; // keep false — glasses steal "Hey Meta"

/* Minimum speech-recognition confidence to accept a trigger (0–1).
 * Safari often omits confidence entirely — a missing value is treated as
 * "no information" and does NOT block the trigger (documented in
 * VOICE_TRIGGER.md). */
const MIN_CONFIDENCE = 0.35;

/* Cooldown after a trigger so one phrase can't fire the flow twice. */
const TRIGGER_COOLDOWN_MS = 15000;

/* Pinned CDN builds of the Picovoice web SDK (checked 2026-10-18).
 * Loaded lazily — only downloaded when the Porcupine engine is enabled. */
const PORCUPINE_CDN = {
  voiceProcessor: 'https://cdn.jsdelivr.net/npm/@picovoice/web-voice-processor@4.0.10/dist/iife/index.js',
  porcupineEnWorker: 'https://cdn.jsdelivr.net/npm/@picovoice/porcupine-web-en-worker@2.1.7/dist/iife/index.js'
};

/* localStorage keys for the one-time Porcupine setup (kept on-device). */
const LS_ACCESS_KEY = 'ta_porcupine_access_key';
const LS_KEYWORD_B64 = 'ta_porcupine_keyword_b64';
const LS_SENSITIVITY = 'ta_porcupine_sensitivity';
const LS_ENGINE_MODE = 'ta_voice_trigger_engine'; // auto | porcupine | speech

/* ---------- Helpers ---------- */
function normalizeTranscript(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTriggerPhrase(text) {
  const norm = normalizeTranscript(text);
  if (!norm) return false;
  const phrases = USE_PREFIX_VARIANTS
    ? TRIGGER_PHRASES.concat(TRIGGER_PHRASES_WITH_PREFIX)
    : TRIGGER_PHRASES;
  return phrases.some(p => norm.includes(p));
}

/* Confidence gate: missing/unreliable confidence never blocks. */
function passesConfidence(confidence) {
  if (confidence === undefined || confidence === null || Number.isNaN(Number(confidence))) return true;
  return Number(confidence) >= MIN_CONFIDENCE;
}

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-vt-src="' + src + '"]')) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.setAttribute('data-vt-src', src);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load ' + src + ' — check your connection.'));
    document.head.appendChild(s);
  });
}

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalonePWA() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;
}

/* ============================================================================
 * Engine 1: Browser speech recognition (Web Speech API), continuous mode.
 * Works today with zero setup. Phrase-matched on final results.
 * ========================================================================== */
class SpeechRecognitionEngine {
  constructor(onHeard, announce) {
    this.onHeard = onHeard;     // called when the trigger phrase is detected
    this.announce = announce;   // status announcer (screen-reader live region)
    this.recognition = null;
    this.wantListening = false; // user intent: trigger toggle is ON
    this.pausedForSpeech = false;
    this.restartTimer = null;
    this.lastTriggerAt = 0;
    this.rapidEndCount = 0;
  }

  static isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  /* iOS quirk (WebKit bug 321436): a getUserMedia mic track goes silent the
   * moment webkitSpeechRecognition starts. The app's level meter may freeze
   * while this engine runs on iPhone — documented in VOICE_TRIGGER.md. */
  static hasIOSMicQuirk() {
    return isIOS() && SpeechRecognitionEngine.isSupported();
  }

  get label() { return 'Browser speech recognition'; }

  start() {
    if (!SpeechRecognitionEngine.isSupported()) {
      this.announce('Voice trigger is not supported in this browser.');
      return false;
    }
    this.wantListening = true;
    this.pausedForSpeech = false;
    this._startInstance();
    return true;
  }

  stop() {
    this.wantListening = false;
    this.pausedForSpeech = false;
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    this._teardownInstance();
  }

  /* Pause while the app speaks its own description — never self-trigger.
   * On iOS the recognizer MUST be aborted before TTS and rebuilt after
   * (WebKit bug 321436); we use that path on every platform for uniformity. */
  pauseForSpeech() {
    if (!this.wantListening) return;
    this.pausedForSpeech = true;
    this._teardownInstance();
  }

  resumeAfterSpeech() {
    if (!this.wantListening) return;
    this.pausedForSpeech = false;
    this._startInstance();
  }

  _teardownInstance() {
    const r = this.recognition;
    this.recognition = null;
    if (!r) return;
    try {
      r.onresult = null; r.onerror = null; r.onend = null; r.onstart = null;
      r.abort();
    } catch (e) { /* already stopped */ }
  }

  _startInstance() {
    if (!this.wantListening || this.pausedForSpeech) return;
    this._teardownInstance();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.continuous = true;      // keep listening across utterances…
    r.interimResults = false; // …but only act on final results (fewer false triggers)
    r.lang = 'en-US';
    try { r.maxAlternatives = 1; } catch (e) { /* optional */ }
    r.onresult = (event) => this._onResult(event);
    r.onerror = (event) => this._onError(event);
    r.onend = () => this._onEnd();
    this.recognition = r;
    try {
      r.start();
    } catch (e) {
      // start() throws if called twice in a row; the onend handler recovers.
    }
  }

  _onResult(event) {
    // Cooldown: one trigger per phrase, no chain-firing on TV dialogue.
    if (Date.now() - this.lastTriggerAt < TRIGGER_COOLDOWN_MS) return;
    // Belt-and-braces: never fire while the app itself is speaking.
    if (window.__taTtsSpeaking) return;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (!result.isFinal) continue;
      const alt = result[0];
      if (!alt) continue;
      if (isTriggerPhrase(alt.transcript) && passesConfidence(alt.confidence)) {
        this.lastTriggerAt = Date.now();
        this.onHeard('speech');
        return;
      }
    }
  }

  _onError(event) {
    const err = (event && event.error) || 'unknown';
    if (err === 'not-allowed' || err === 'service-not-allowed') {
      this.announce('Voice trigger was blocked: microphone or speech permission denied. The trigger is now off.');
      this.stop();
      if (window.VoiceTrigger) window.VoiceTrigger.setToggleOff('permission');
    } else if (err === 'audio-capture') {
      this.announce('Voice trigger could not access the microphone. The trigger is now off.');
      this.stop();
      if (window.VoiceTrigger) window.VoiceTrigger.setToggleOff('mic');
    } else if (err === 'network') {
      // Chrome streams audio to Google's servers; a blip shouldn't kill the toggle.
      this.announce('Voice trigger lost its connection and is reconnecting…');
    }
    // 'no-speech', 'aborted', 'language-not-supported' etc.: onend restarts us.
  }

  _onEnd() {
    if (!this.wantListening || this.pausedForSpeech) return;
    // Continuous mode still ends on its own (Chrome ~60 s cap, Safari
    // silence timeouts) — restart with a little backoff to avoid hot loops.
    this.rapidEndCount += 1;
    const delay = Math.min(300 * this.rapidEndCount, 5000);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.rapidEndCount > 20) {
        // Something is persistently wrong; stop instead of spinning forever.
        this.announce('Voice trigger kept stopping itself, so it is now off. You can turn it back on to retry.');
        this.stop();
        if (window.VoiceTrigger) window.VoiceTrigger.setToggleOff('unstable');
        return;
      }
      this._startInstance();
    }, delay);
    // Decay the counter: healthy long runs reset the backoff.
    setTimeout(() => { this.rapidEndCount = Math.max(0, this.rapidEndCount - 1); }, 30000);
  }
}

/* ============================================================================
 * Engine 2: Porcupine wake-word engine (Picovoice) — on-device, always-on.
 * Needs a one-time setup: free AccessKey + a custom "describe this" keyword
 * model trained at console.picovoice.ai for the Web (WASM) platform.
 * Full setup steps are in VOICE_TRIGGER.md.
 * ========================================================================== */
class PorcupineEngine {
  constructor(onHeard, announce) {
    this.onHeard = onHeard;
    this.announce = announce;
    this.worker = null;
    this.voiceProcessor = null;
    this.wantListening = false;
    this.mutedForSpeech = false; // ignore detections while TTS speaks
    this.lastTriggerAt = 0;
    this.loading = null;
  }

  static isConfigured() {
    try {
      return !!(localStorage.getItem(LS_ACCESS_KEY) && localStorage.getItem(LS_KEYWORD_B64));
    } catch (e) { return false; }
  }

  static getSensitivity() {
    try {
      const v = parseFloat(localStorage.getItem(LS_SENSITIVITY));
      return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.65;
    } catch (e) { return 0.65; }
  }

  get label() { return 'Porcupine wake word (on-device)'; }

  async start() {
    if (!PorcupineEngine.isConfigured()) {
      this.announce('Wake-word engine is not set up yet. Open "Wake-word setup" below — it takes about 5 minutes, and it is free.');
      return false;
    }
    if (!window.isSecureContext) {
      this.announce('Wake-word engine needs a secure connection (HTTPS).');
      return false;
    }
    this.wantListening = true;
    this.mutedForSpeech = false;
    this.announce('Loading the wake-word engine…');
    try {
      await this._ensureLoaded();
      this.announce('Wake-word engine ready. Say "describe this".');
      return true;
    } catch (err) {
      this.announce('Wake-word engine failed to start: ' + err.message);
      this.wantListening = false;
      return false;
    }
  }

  async _ensureLoaded() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      await loadScriptOnce(PORCUPINE_CDN.voiceProcessor);
      await loadScriptOnce(PORCUPINE_CDN.porcupineEnWorker);
      const WVP = window.WebVoiceProcessor && window.WebVoiceProcessor.WebVoiceProcessor;
      const PWW = window.PorcupineWebEnWorker && window.PorcupineWebEnWorker.PorcupineWorkerFactory;
      if (!WVP || !PWW) throw new Error('Wake-word libraries did not initialize.');
      const accessKey = localStorage.getItem(LS_ACCESS_KEY).trim();
      const keywordB64 = localStorage.getItem(LS_KEYWORD_B64).trim();
      const sensitivity = PorcupineEngine.getSensitivity();
      // Follows the official Porcupine Web Quick Start: worker per language,
      // custom keyword passed as base64 .ppn model with a label.
      this.worker = await PWW.create(
        accessKey,
        [{ custom: { base64: keywordB64, label: 'describe-this' }, sensitivity: sensitivity }],
        (keywordLabel) => this._onKeyword(keywordLabel),
        (err) => this._onEngineError(err)
      );
      this.voiceProcessor = await WVP.init({ engines: [this.worker] });
      await this.voiceProcessor.start();
    })();
    try {
      await this.loading;
    } catch (e) {
      this.loading = null;
      throw e;
    }
  }

  _onKeyword(keywordLabel) {
    if (!this.wantListening || this.mutedForSpeech || window.__taTtsSpeaking) return;
    if (Date.now() - this.lastTriggerAt < TRIGGER_COOLDOWN_MS) return;
    this.lastTriggerAt = Date.now();
    this.onHeard('porcupine');
  }

  _onEngineError(err) {
    const msg = (err && err.message) || String(err);
    // Invalid access key is the common setup mistake — say so plainly.
    if (/access ?key/i.test(msg)) {
      this.announce('Wake-word engine: that AccessKey was rejected. Check the key in "Wake-word setup" and try again.');
    } else {
      this.announce('Wake-word engine error: ' + msg);
    }
  }

  async stop() {
    this.wantListening = false;
    this.mutedForSpeech = false;
    this.loading = null;
    try { if (this.voiceProcessor) await this.voiceProcessor.stop(); } catch (e) {}
    try { if (this.worker && this.worker.release) await this.worker.release(); } catch (e) {}
    this.voiceProcessor = null;
    this.worker = null;
  }

  /* Pause detection while the app speaks: stop audio forwarding; detections
   * during TTS are also ignored by the mutedForSpeech flag (belt & braces). */
  async pauseForSpeech() {
    if (!this.wantListening || !this.voiceProcessor) return;
    this.mutedForSpeech = true;
    try {
      if (this.voiceProcessor.pause) await this.voiceProcessor.pause();
      else await this.voiceProcessor.stop();
    } catch (e) { /* flag alone still protects us */ }
  }

  async resumeAfterSpeech() {
    if (!this.wantListening || !this.voiceProcessor) return;
    this.mutedForSpeech = false;
    try {
      if (this.voiceProcessor.resume) await this.voiceProcessor.resume();
      else await this.voiceProcessor.start();
    } catch (e) { /* engine keeps running; flag was the real guard */ }
  }
}

/* ============================================================================
 * VoiceTrigger controller — owns the toggle, engine selection, push-to-talk,
 * TTS coordination, and the cooldown. Exposed as window.VoiceTrigger.
 * app.js calls:
 *   VoiceTrigger.init({ onTrigger, announce, isListening })
 *   VoiceTrigger.pauseForSpeech() / resumeAfterSpeech()  (around TTS)
 *   VoiceTrigger.handleMainListeningStopped()
 * ========================================================================== */
const VoiceTrigger = (function () {
  let onTriggerCb = null;
  let announceFn = (msg) => {};
  let isListeningFn = () => false;
  let engine = null;
  let toggleEl = null;
  let statusEl = null;
  let pttBtn = null;
  let pttRec = null;

  function getEngineMode() {
    try { return localStorage.getItem(LS_ENGINE_MODE) || 'auto'; }
    catch (e) { return 'auto'; }
  }

  function pickEngine() {
    const mode = getEngineMode();
    if (mode === 'porcupine') return new PorcupineEngine(fireTrigger, announceFn);
    if (mode === 'speech') return new SpeechRecognitionEngine(fireTrigger, announceFn);
    // auto: best available
    if (PorcupineEngine.isConfigured()) return new PorcupineEngine(fireTrigger, announceFn);
    if (SpeechRecognitionEngine.isSupported()) return new SpeechRecognitionEngine(fireTrigger, announceFn);
    return null;
  }

  function fireTrigger(source) {
    if (!isListeningFn()) return; // main mic must be live
    announceFn('Voice trigger heard you — describing now.');
    try { onTriggerCb && onTriggerCb(source); } catch (e) { /* app handles errors */ }
  }

  function setToggleUI(on, stateText) {
    if (toggleEl) {
      toggleEl.checked = on;
      toggleEl.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    if (statusEl) statusEl.textContent = stateText;
  }

  async function enable() {
    if (!isListeningFn()) {
      announceFn('Start listening first, then turn on the voice trigger.');
      setToggleUI(false, 'Off — start listening first.');
      return;
    }
    engine = pickEngine();
    if (!engine) {
      // Nothing available: on iOS installed apps this is the expected path.
      if (isIOS() && isStandalonePWA()) {
        announceFn('Voice trigger is not available in the installed app on iPhone. Open True Access in Safari to use it, or use the hold-to-talk button if shown.');
        setToggleUI(false, 'Not available in the installed app — use Safari.');
      } else {
        announceFn('Voice trigger is not supported in this browser.');
        setToggleUI(false, 'Not supported in this browser.');
      }
      return;
    }
    setToggleUI(true, 'Starting ' + engine.label + '…');
    const ok = await engine.start();
    if (ok && engine instanceof PorcupineEngine) {
      setToggleUI(true, 'Listening for "describe this" (on-device wake word).');
      announceFn('Voice trigger listening. Say "describe this" any time.');
    } else if (ok) {
      const quirk = SpeechRecognitionEngine.hasIOSMicQuirk()
        ? ' Note: on iPhone the mic level meter may freeze while the trigger listens — that is an Apple quirk, describing still works.'
        : '';
      setToggleUI(true, 'Listening for "describe this" (browser speech recognition).');
      announceFn('Voice trigger listening. Say "describe this" any time.' + quirk);
    } else {
      engine = null;
      setToggleUI(false, 'Off.');
    }
  }

  async function disable(reason) {
    if (engine) { try { await engine.stop(); } catch (e) {} engine = null; }
    const text = reason === 'main-stopped'
      ? 'Off — listening stopped.'
      : 'Off.';
    setToggleUI(false, text);
  }

  /* --- Hold-to-talk fallback: press & hold, say the phrase, release. --- */
  function pttSupported() {
    return SpeechRecognitionEngine.isSupported();
  }

  function pttStart() {
    if (!isListeningFn()) {
      announceFn('Start listening first, then use hold-to-talk.');
      return;
    }
    if (window.__taTtsSpeaking) {
      announceFn('Wait until the description finishes speaking.');
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    try { if (pttRec) { pttRec.onend = null; pttRec.abort(); } } catch (e) {}
    pttRec = new SR();
    pttRec.continuous = false;
    pttRec.interimResults = true;
    pttRec.lang = 'en-US';
    let heard = false;
    pttRec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const alt = event.results[i][0];
        if (alt && isTriggerPhrase(alt.transcript) && passesConfidence(alt.confidence)) {
          heard = true;
          try { pttRec.stop(); } catch (e) {}
          fireTrigger('hold-to-talk');
          break;
        }
      }
    };
    pttRec.onerror = (event) => {
      const err = (event && event.error) || '';
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        announceFn('Hold-to-talk was blocked: speech permission denied.');
      }
    };
    pttRec.onend = () => {
      pttBtn.classList.remove('listening');
      pttBtn.setAttribute('aria-pressed', 'false');
      if (!heard) announceFn('Did not hear "describe this" — try again, holding the button while you speak.');
      pttRec = null;
    };
    try {
      pttRec.start();
      pttBtn.classList.add('listening');
      pttBtn.setAttribute('aria-pressed', 'true');
      announceFn('Listening — say "describe this".');
    } catch (e) {
      announceFn('Hold-to-talk could not start.');
    }
  }

  function pttStop() {
    if (pttRec) { try { pttRec.stop(); } catch (e) {} }
  }

  return {
    init(opts) {
      onTriggerCb = opts.onTrigger;
      announceFn = opts.announce || announceFn;
      isListeningFn = opts.isListening || isListeningFn;
      toggleEl = document.getElementById('voice-trigger-toggle');
      statusEl = document.getElementById('voice-trigger-state');
      pttBtn = document.getElementById('hold-to-talk-btn');

      if (toggleEl) {
        toggleEl.addEventListener('change', () => {
          if (toggleEl.checked) enable();
          else { announceFn('Voice trigger off.'); disable(); }
        });
      }

      // Engine picker
      const engineSelect = document.getElementById('voice-engine-select');
      if (engineSelect) {
        engineSelect.value = getEngineMode();
        engineSelect.addEventListener('change', async () => {
          try { localStorage.setItem(LS_ENGINE_MODE, engineSelect.value); } catch (e) {}
          // Restart the trigger on the new engine if it was on.
          if (toggleEl && toggleEl.checked) {
            await disable();
            enable();
          }
          const hint = document.getElementById('engine-hint');
          if (hint) hint.textContent = engineHintText(engineSelect.value);
        });
        const hint = document.getElementById('engine-hint');
        if (hint) hint.textContent = engineHintText(engineSelect.value);
      }

      // iOS installed-app guidance
      const iosNote = document.getElementById('ios-voice-note');
      if (iosNote && isIOS() && isStandalonePWA()) iosNote.hidden = false;

      // Push-to-talk wiring
      if (pttBtn) {
        if (!pttSupported()) {
          pttBtn.disabled = true;
          pttBtn.title = 'Speech recognition is not available in this browser.';
        } else {
          pttBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); pttStart(); });
          pttBtn.addEventListener('pointerup', pttStop);
          pttBtn.addEventListener('pointerleave', pttStop);
          pttBtn.addEventListener('pointercancel', pttStop);
          // Keyboard: Enter/Space held — keydown starts, keyup stops.
          pttBtn.addEventListener('keydown', (e) => {
            if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); pttStart(); }
          });
          pttBtn.addEventListener('keyup', (e) => {
            if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); pttStop(); }
          });
          // Screen-reader users get a plain tap = 6-second listen window.
          // (Keyboard hold-release is handled by keydown/keyup above; the
          // !pttRec guard keeps a keyboard click from re-starting it.)
          pttBtn.addEventListener('click', (e) => {
            if (e.detail === 0 && !pttRec) { // keyboard/screen-reader activation, not pointer
              pttStart();
              setTimeout(pttStop, 6000);
            }
          });
        }
      }

      // Porcupine setup form
      const saveBtn = document.getElementById('porcupine-save');
      if (saveBtn) {
        const keyInput = document.getElementById('porcupine-key');
        const fileInput = document.getElementById('porcupine-model-file');
        const sensInput = document.getElementById('porcupine-sensitivity');
        const sensValue = document.getElementById('porcupine-sensitivity-value');
        try {
          if (localStorage.getItem(LS_ACCESS_KEY)) keyInput.value = localStorage.getItem(LS_ACCESS_KEY);
          const s = PorcupineEngine.getSensitivity();
          sensInput.value = s; sensValue.textContent = s.toFixed(2);
        } catch (e) {}
        sensInput.addEventListener('input', () => {
          sensValue.textContent = parseFloat(sensInput.value).toFixed(2);
        });
        saveBtn.addEventListener('click', () => {
          const key = keyInput.value.trim();
          if (!key) { announceFn('Paste your Picovoice AccessKey first.'); keyInput.focus(); return; }
          const file = fileInput.files && fileInput.files[0];
          const done = (b64) => {
            try {
              localStorage.setItem(LS_ACCESS_KEY, key);
              if (b64) localStorage.setItem(LS_KEYWORD_B64, b64);
              localStorage.setItem(LS_SENSITIVITY, parseFloat(sensInput.value).toFixed(2));
            } catch (e) {
              announceFn('Could not save settings on this device.');
              return;
            }
            announceFn('Wake-word setup saved. Turn the voice trigger on to use it.');
            const st = document.getElementById('porcupine-setup-state');
            if (st) st.textContent = 'Saved. Turn the voice trigger on to start listening.';
          };
          if (file) {
            const reader = new FileReader();
            reader.onload = () => {
              // data:application/octet-stream;base64,.... → keep the base64 part
              const b64 = String(reader.result).split(',')[1] || '';
              if (!b64) { announceFn('Could not read that model file.'); return; }
              done(b64);
            };
            reader.onerror = () => announceFn('Could not read that model file.');
            reader.readAsDataURL(file);
          } else {
            done(null); // keep any previously saved model
          }
        });
      }
    },

    /* Called by app.js around speechSynthesis output. */
    async pauseForSpeech() {
      window.__taTtsSpeaking = true;
      if (engine && engine.pauseForSpeech) {
        try { await engine.pauseForSpeech(); } catch (e) {}
      }
    },
    async resumeAfterSpeech() {
      // Race guard: speakText() cancels the previous utterance, whose
      // onerror can fire AFTER the new speak() began. Never clear the
      // self-trigger guard while speech is still going.
      if (window.speechSynthesis && window.speechSynthesis.speaking) return;
      window.__taTtsSpeaking = false;
      if (engine && engine.resumeAfterSpeech) {
        try { await engine.resumeAfterSpeech(); } catch (e) {}
      }
    },

    /* Main listening stopped → the trigger has nothing to trigger. */
    handleMainListeningStopped() {
      if (toggleEl && toggleEl.checked) {
        announceFn('Voice trigger off — listening stopped.');
        disable('main-stopped');
      }
      pttStop();
    },

    /* Engines call this to drop the toggle after a fatal error. */
    setToggleOff() {
      disable();
    },

    isEnabled() {
      return !!(toggleEl && toggleEl.checked && engine);
    }
  };

  function engineHintText(mode) {
    if (mode === 'porcupine') {
      return PorcupineEngine.isConfigured()
        ? 'Porcupine wake word: on-device, always-on, tiny battery use.'
        : 'Porcupine wake word: needs the one-time setup below first.';
    }
    if (mode === 'speech') {
      return 'Browser speech recognition: works now, no setup — but not in the installed iPhone app, and it uses more battery.';
    }
    if (PorcupineEngine.isConfigured()) return 'Auto: will use the Porcupine wake word (on-device).';
    if (SpeechRecognitionEngine.isSupported()) return 'Auto: will use browser speech recognition until the wake word is set up.';
    return 'Auto: no voice engine available in this browser yet.';
  }
})();

window.VoiceTrigger = VoiceTrigger;
