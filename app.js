/* ============================================================================
 * True Access — prototype app logic
 * ----------------------------------------------------------------------------
 * WHAT IS REAL in this prototype:
 *   - Microphone capture via getUserMedia (including Bluetooth headset mics
 *     such as the Ray-Ban Meta glasses when paired to the phone)
 *   - Live microphone level meter (visual bar + throttled text alternative)
 *   - Audio fingerprinting: 10 seconds of microphone audio are fingerprinted
 *     ON THE PHONE with the Chromaprint algorithm (WebAssembly, vendored)
 *     and looked up in the free AcoustID music database — no server, no
 *     cost. Needs the free API key (see FINGERPRINTING.md). Demo mode keeps
 *     the sample programs available for offline testing.
 *   - Text-to-speech via the Web Speech API (voice picker, rate control)
 *   - The full listening -> identifying -> describing user flow
 *   - Hands-free voice trigger: say "describe this" to run the describe flow
 *     without touching the phone (voice-trigger.js; Porcupine wake-word
 *     engine when set up, browser speech recognition as the fallback)
 *
 * WHAT IS DEMO (simulated) in this prototype:
 *   - The free AcoustID database covers MUSIC only. It cannot identify TV
 *     shows or movies — no free service can (see FINGERPRINTING.md). Music
 *     matches flow into the real descriptions.js pipeline like any title.
 *   - The audio descriptions for the built-in DEMO programs are short ORIGINAL
 *     sample scripts (SAMPLE_PROGRAMS) — not descriptions of real content.
 *     For any REAL identified title, descriptions.js runs the real two-stage
 *     pipeline: official-AD-track lookup first, then free-LLM AI generation.
 *     (descriptions.js is loaded by index.html before this file.)
 *
 * ACCESSIBILITY CONTRACT (screen-reader-first — see ACCESSIBILITY.md):
 *   - Every state change is announced: status via role="status" (polite),
 *     errors via role="alert" (assertive).
 *   - Focus is managed, never lost: when a focused control is disabled,
 *     focus moves to its replacement FIRST, then the control is disabled.
 *   - Focus moves to the results heading when a description is ready.
 *   - The level meter exposes aria-valuenow + aria-valuetext, updated at
 *     most once per second (never floods the screen reader).
 *   - Microphone permission is only requested after plain-language consent.
 * ========================================================================== */

'use strict';

/* ---------- Fingerprinting configuration (Worker 1) ----------
 * HOW TO ACTIVATE REAL IDENTIFICATION (free, no credit card):
 *   1. Sign in at https://acoustid.org (a free MusicBrainz account works).
 *   2. Open "API keys" and register this app ("True Access") for a key.
 *   3. Paste the key below between the quotes. 4. Redeploy the app.
 * Full comparison of services and the TV/movie gap: FINGERPRINTING.md
 * Until a key is set, the app says so plainly instead of failing silently. */
const FINGERPRINTING = {
  ACOUSTID_API_KEY: '',
  CLIP_SECONDS: 10,      // seconds of microphone audio captured per attempt
  LOOKUP_TIMEOUT_MS: 30000,
  MIN_SCORE: 0.8          // minimum AcoustID match confidence (0-1)
};

/* ---------- Sample programs with original demo audio descriptions ----------
 * Each program has three verbosity variants. These are original scripts
 * written for the demo — not taken from any real film or show.            */

const SAMPLE_PROGRAMS = [
  {
    title: 'Demo: "Harbor Lights" (sample short film)',
    descriptions: {
      brief: 'A fishing boat returns to harbor at sunset.',
      standard: 'A small fishing boat glides into a quiet harbor at sunset. Gulls circle overhead as the captain ties the boat to the dock. Warm orange light reflects on the water.',
      detailed: 'A small wooden fishing boat glides into a quiet harbor as the sun sinks low, painting the sky in bands of orange and rose. Gulls wheel and cry overhead. On deck, the captain — a woman in a yellow raincoat — tosses a rope to a waiting dockhand and ties off with practiced hands. Warm light shimmers across the rippling water, and the harbor lamps flicker on one by one.'
    }
  },
  {
    title: 'Demo: "The Night Market" (sample documentary)',
    descriptions: {
      brief: 'A bustling night market full of color and steam.',
      standard: 'A bustling night market stretches down a narrow street. Stalls glow with strings of lights, steam rises from sizzling grills, and crowds weave between vendors calling out their wares.',
      detailed: 'A bustling night market stretches down a narrow street, every stall strung with warm glowing lights. Steam rises in thick ribbons from sizzling grills where skewers turn over open flame. A vendor in a red apron flips noodles in a smoking wok, laughing with a customer. Crowds weave slowly between the stalls — children pointing at candied fruit, elders haggling over fresh fish — while paper lanterns sway gently overhead in the evening breeze.'
    }
  },
  {
    title: 'Demo: "Morning on the Farm" (sample nature short)',
    descriptions: {
      brief: 'Sunrise over a quiet farm; animals wake up.',
      standard: 'Dawn breaks over a quiet farm. Mist lifts off the fields as a rooster crows. A brown horse trots along a fence line, and chickens scatter across the barnyard.',
      detailed: 'Dawn breaks over a quiet farm, pale gold light spilling across rolling fields as thin mist lifts and dissolves. A rooster on a fence post throws back its head and crows. In the pasture, a brown horse trots along the fence line, mane bouncing, breath puffing in the cool air. Chickens scatter across the barnyard, pecking at the dirt, while smoke curls lazily from the farmhouse chimney.'
    }
  }
];

/* ---------- Element references ---------- */
const statusEl = document.getElementById('status');
const alertEl = document.getElementById('alert');
const levelMeter = document.getElementById('level-meter');
const levelFill = document.getElementById('level-fill');
const levelText = document.getElementById('level-text');
const micPicker = document.getElementById('mic-picker');
const refreshMicsBtn = document.getElementById('refresh-mics');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const describeBtn = document.getElementById('describe-btn');
const resultCard = document.getElementById('result-card');
const resultHeading = document.getElementById('result-heading');
const identifiedTitle = document.getElementById('identified-title');
const descriptionText = document.getElementById('description-text');
const descriptionSource = document.getElementById('description-source');
const speakBtn = document.getElementById('speak-btn');
const stopSpeechBtn = document.getElementById('stop-speech-btn');
const voicePicker = document.getElementById('voice-picker');
const verbositySelect = document.getElementById('verbosity');
const rateInput = document.getElementById('rate');
const rateValue = document.getElementById('rate-value');
const autoSpeakCheckbox = document.getElementById('auto-speak');
const demoModeCheckbox = document.getElementById('demo-mode');
const consentCard = document.getElementById('consent-card');
const consentHeading = document.getElementById('consent-heading');
const consentYesBtn = document.getElementById('consent-yes');
const consentNoBtn = document.getElementById('consent-no');
const repeatBtn = document.getElementById('repeat-btn');
const stopAllBtn = document.getElementById('stop-all-btn');

/* ---------- Audio state ---------- */
let mediaStream = null;
let audioContext = null;
let analyser = null;
let levelRafId = null;
let currentProgram = null;
let lastDescription = null; // { title, text } — for "Repeat last description"
let lastMeterAriaUpdate = 0;
let lastMeterWord = '';

/* ---------- Microphone consent (remembered for this browser) ---------- */
let micConsent = false;
try {
  micConsent = window.localStorage.getItem('taMicConsent') === 'yes';
} catch (e) {
  micConsent = false; // private browsing etc. — just ask each session
}

/* ---------- Announced status + errors ---------- */
let statusToken = 0;
function setStatus(message) {
  // Clear-then-set forces screen readers to re-announce repeated messages.
  const token = ++statusToken;
  statusEl.textContent = '';
  window.setTimeout(() => {
    if (token === statusToken) statusEl.textContent = message;
  }, 40);
}

function setAlert(message) {
  // role="alert" is assertive: interruptions and errors always break through.
  alertEl.textContent = '';
  window.setTimeout(() => { alertEl.textContent = message; }, 40);
}

function moveFocus(el) {
  if (el && typeof el.focus === 'function') el.focus();
}

function levelWord(value) {
  if (value < 5) return 'quiet';
  if (value < 30) return 'low';
  if (value < 65) return 'moderate';
  return 'loud';
}

/* ---------- Microphone device listing ----------
 * REAL: uses enumerateDevices. Note: device labels are hidden until the user
 * grants microphone permission at least once (browser privacy rule). */
async function loadMicrophones(announce) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    if (announce) setAlert('This browser cannot list microphones.');
    return;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === 'audioinput');
    const previous = micPicker.value;
    micPicker.innerHTML = '';
    const def = document.createElement('option');
    def.value = '';
    def.textContent = 'Default microphone';
    micPicker.appendChild(def);
    mics.forEach((mic, i) => {
      const opt = document.createElement('option');
      opt.value = mic.deviceId;
      opt.textContent = mic.label || ('Microphone ' + (i + 1));
      micPicker.appendChild(opt);
    });
    if (previous) micPicker.value = previous;
    if (announce) {
      if (mics.length === 0) {
        setAlert('No microphones found. Make sure your glasses or headset is paired by Bluetooth, then tap "Refresh microphone list" again.');
      } else {
        setStatus('Found ' + mics.length + (mics.length === 1 ? ' microphone.' : ' microphones.'));
      }
    }
  } catch (err) {
    if (announce) setAlert('Could not list microphones: ' + err.message);
  }
}

/* ---------- Microphone consent flow ----------
 * The OS permission prompt is never requested without plain-language
 * consent first, so Mary is never surprised by a system dialog. */
function showConsent() {
  consentCard.hidden = false;
  setStatus('Before we start, please confirm microphone use.');
  moveFocus(consentHeading);
}

function hideConsent(returnFocusToStart) {
  consentCard.hidden = true;
  if (returnFocusToStart) moveFocus(startBtn);
}

function grantConsent() {
  micConsent = true;
  try { window.localStorage.setItem('taMicConsent', 'yes'); } catch (e) { /* ignore */ }
  hideConsent(false);
  startListening();
}

function declineConsent() {
  hideConsent(true);
  setStatus('No problem. Tap "Start Listening" whenever you are ready.');
}

/* ---------- Listening (REAL) ---------- */
async function startListening() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setAlert('Sorry — this browser does not support microphone access.');
    return;
  }
  if (!micConsent) {
    showConsent();
    return;
  }
  /* Free on-device audio cleanup (built into the browser — no service, no
   * credits): noise suppression + echo cancellation make both the level
   * meter and fingerprinting more reliable, especially with TV audio. */
  const constraints = {
    audio: {
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true
    }
  };
  if (micPicker.value) {
    constraints.audio.deviceId = { exact: micPicker.value };
  }
  try {
    setStatus('Requesting microphone access…');
    mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioContext.createMediaStreamSource(mediaStream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    drawLevel();
    // Refresh labels now that permission is granted (silent — no announcement spam).
    loadMicrophones(false);
    stopBtn.disabled = false;
    describeBtn.disabled = false;
    moveFocus(stopBtn); // focus moves BEFORE startBtn is disabled: focus is never lost
    startBtn.disabled = true;
    setStatus('Listening. Play something nearby, then tap "Describe what\u2019s playing".');
    /* An external trigger (Siri Shortcut, deep link, connected app) asked
     * for a describe as soon as listening was up — run it now. */
    if (pendingActionAfterListen === 'describe') {
      pendingActionAfterListen = null;
      describeWhatsPlaying();
    } else {
      pendingActionAfterListen = null;
    }
  } catch (err) {
    const name = err && err.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      setAlert('Microphone permission was denied. To turn it on, open your iPhone Settings, find your browser, and allow microphone access. Then tap "Start Listening" again.');
    } else {
      setAlert('Microphone access failed: ' + (err && err.message ? err.message : 'unknown error') + '.');
    }
    setStatus('Microphone is off. Tap "Start Listening" to try again.');
  }
}

function drawLevel() {
  const data = new Uint8Array(analyser.frequencyBinCount);
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    const pct = Math.min(100, Math.round(rms * 260));
    const word = levelWord(pct);
    // Visual bar updates every frame; the screen-reader value updates at
    // most once per second so it never floods the speech queue.
    levelFill.style.width = pct + '%';
    const now = performance.now();
    if (word !== lastMeterWord || now - lastMeterAriaUpdate >= 1000) {
      lastMeterWord = word;
      lastMeterAriaUpdate = now;
      levelMeter.setAttribute('aria-valuenow', String(pct));
      levelMeter.setAttribute('aria-valuetext', word);
      levelText.textContent = 'Level: ' + word;
    }
    levelRafId = requestAnimationFrame(tick);
  };
  tick();
}

/* ---------- Stop everything: halts listening AND speech ----------
 * One big, always-findable stop. Never leaves audio running behind Mary. */
function stopEverything() {
  const wasListening = !!mediaStream;
  const wasSpeaking = ('speechSynthesis' in window) && speechSynthesis.speaking;
  if (levelRafId) cancelAnimationFrame(levelRafId);
  levelRafId = null;
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  analyser = null;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (window.VoiceTrigger) {
    window.VoiceTrigger.resumeAfterSpeech();
    window.VoiceTrigger.handleMainListeningStopped();
  }
  levelFill.style.width = '0%';
  levelMeter.setAttribute('aria-valuenow', '0');
  levelMeter.setAttribute('aria-valuetext', 'quiet');
  levelText.textContent = 'Level: quiet';
  lastMeterWord = 'quiet';
  startBtn.disabled = false;
  moveFocus(startBtn); // focus moves BEFORE the stop buttons are disabled
  stopBtn.disabled = true;
  describeBtn.disabled = true;
  if (wasListening || wasSpeaking) {
    setStatus('Stopped everything. Listening and speech are off.');
  } else {
    setStatus('Nothing to stop — the app is already idle.');
  }
}

/* ---------- Content identification (Worker 1: REAL) ----------
 * 10 seconds of microphone audio -> on-device Chromaprint fingerprint
 * (WebAssembly, vendored in vendor/chromaprint/) -> free AcoustID music
 * lookup. Resolves to a program shaped like { title, descriptions }; for
 * real matches `descriptions` is undefined and descriptions.js runs its
 * two-stage pipeline (official AD track, then AI overview) on the title.
 * Demo mode keeps the sample programs for offline testing.
 * Progress goes to setStatus (polite); failures throw with plain-language
 * messages that describeWhatsPlaying routes to setAlert (assertive). */

/* Demo path: the original simulated behaviour, kept behind the toggle. */
function identifyDemo() {
  return new Promise(resolve => {
    setTimeout(() => {
      const pick = SAMPLE_PROGRAMS[Math.floor(Math.random() * SAMPLE_PROGRAMS.length)];
      resolve(pick);
    }, 3000);
  });
}

/* Capture N seconds of microphone audio as a Blob. */
function recordClip(stream, seconds) {
  return new Promise((resolve, reject) => {
    if (typeof MediaRecorder === 'undefined') {
      reject(new Error('Audio recording is not supported in this browser.'));
      return;
    }
    const preferredTypes = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', ''];
    const mimeType = preferredTypes.find(t => !t || MediaRecorder.isTypeSupported(t));
    let recorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch (err) {
      reject(new Error('Could not start audio recording: ' + err.message));
      return;
    }
    const chunks = [];
    let timerId = null;
    recorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      clearTimeout(timerId);
      reject(new Error('Audio recording failed unexpectedly.'));
    };
    recorder.onstop = () => {
      clearTimeout(timerId);
      resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
    };
    recorder.start(1000);
    timerId = setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, seconds * 1000);
  });
}

/* Fetch with a hard timeout so a stalled network never hangs the app.
 * Named fetchWithDeadline to avoid clobbering descriptions.js's
 * fetchWithTimeout (classic scripts share one global scope). */
function fetchWithDeadline(url, timeoutMs) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timerId));
}

/* Look a Chromaprint fingerprint up in the free AcoustID database.
 * Resolves to { title, artist, score } or null when nothing matches. */
async function lookupAcoustId(fingerprint, durationSec) {
  const url =
    'https://api.acoustid.org/v2/lookup' +
    '?client=' + encodeURIComponent(FINGERPRINTING.ACOUSTID_API_KEY) +
    '&duration=' + durationSec +
    '&meta=recordings' +
    '&fingerprint=' + encodeURIComponent(fingerprint);
  let response;
  try {
    response = await fetchWithDeadline(url, FINGERPRINTING.LOOKUP_TIMEOUT_MS);
  } catch (err) {
    throw new Error('Could not reach the identification service. Check your internet connection and try again.');
  }
  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new Error('The identification service returned an unreadable response.');
  }
  if (data && data.status === 'error') {
    const msg = data.error && data.error.message ? data.error.message : 'unknown error';
    throw new Error('Identification service error: ' + msg);
  }
  const results = ((data && data.results) || [])
    .filter(r => r && typeof r.score === 'number')
    .sort((a, b) => b.score - a.score);
  const best = results[0];
  if (!best || best.score < FINGERPRINTING.MIN_SCORE) return null;
  const recording = (best.recordings && best.recordings[0]) || null;
  if (!recording || !recording.title) return null;
  const artist = ((recording.artists || []).map(a => a.name).filter(Boolean).join(', ')) || 'Unknown artist';
  return { title: recording.title, artist: artist, score: best.score };
}

/* Real path: record -> fingerprint on the phone -> look up. */
async function identifyReal() {
  if (!FINGERPRINTING.ACOUSTID_API_KEY) {
    throw new Error('Real identification is not set up yet. Add your free AcoustID API key in app.js (steps in FINGERPRINTING.md), or turn on Demo mode in Settings below.');
  }
  setStatus('Recording ' + FINGERPRINTING.CLIP_SECONDS + ' seconds of audio…');
  const clipBlob = await recordClip(mediaStream, FINGERPRINTING.CLIP_SECONDS);
  if (!clipBlob.size) {
    throw new Error('The recording came back empty. Make sure something is playing and the microphone is working.');
  }
  setStatus('Fingerprinting the recording on your phone…');
  let processAudioFile;
  try {
    // Vendored WebAssembly build; loaded lazily so startup stays light.
    ({ processAudioFile } = await import('./vendor/chromaprint/index.js'));
  } catch (err) {
    throw new Error('Could not load the audio fingerprinting engine. Reload the page and try again.');
  }
  const clipBuffer = await clipBlob.arrayBuffer();
  let fingerprint = null;
  for await (const fp of processAudioFile(clipBuffer, { maxDuration: FINGERPRINTING.CLIP_SECONDS })) {
    fingerprint = fp;
    break; // one fingerprint covers the whole clip by default
  }
  if (!fingerprint) {
    throw new Error('Could not fingerprint the recording. The audio may be too quiet or unclear.');
  }
  setStatus('Looking up the fingerprint in the music database…');
  const match = await lookupAcoustId(fingerprint, FINGERPRINTING.CLIP_SECONDS);
  if (!match) return null; // no confident match — caller announces this
  // descriptions stays undefined: descriptions.js runs its two-stage
  // pipeline (official AD track, then AI overview) on the real title.
  return { title: match.artist + ' — "' + match.title + '"' };
}

function identifyContent() {
  if (demoModeCheckbox && demoModeCheckbox.checked) {
    return identifyDemo();
  }
  return identifyReal();
}

function generateDemoDescription(program, verbosity) {
  // FALLBACK DEMO: used only when descriptions.js is unavailable. The
  // separate step exists so every async state ("identifying", "generating",
  // "speaking") is announced — see ACCESSIBILITY.md.
  // NOTE: deliberately NOT named generateDescription — descriptions.js
  // defines a global generateDescription(title, verbosity) for its AI
  // pipeline, and classic scripts share one global scope. This name keeps
  // both working (Worker 1 fix, 2026-10-18).
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(program.descriptions[verbosity] || program.descriptions.standard);
    }, 1200);
  });
}

async function describeWhatsPlaying() {
  if (!mediaStream) {
    setStatus('Start listening first, so the app can hear what is playing.');
    return;
  }
  unlockSpeech(); // keep iOS speech allowed across the async gap (see below)
  moveFocus(statusEl); // focus leaves the Describe button BEFORE it is disabled
  describeBtn.disabled = true;
  resultCard.hidden = true;
  const inDemoMode = !!(demoModeCheckbox && demoModeCheckbox.checked);
  setStatus(inDemoMode
    ? 'Identifying what\u2019s playing… (demo mode: matching against the sample programs)'
    : 'Identifying what\u2019s playing…');
  try {
    currentProgram = await identifyContent();
    if (!currentProgram) {
      // Real fingerprinting ran but nothing in the music database matched
      // confidently — e.g. dialogue, a TV show/movie (not in the free music
      // database), or an unclear recording. Announced, never silent.
      setAlert('No match found in the music database. It may be dialogue, a TV show or a movie — those are not in the free music database yet — or the recording was too unclear. Try again with the volume up, or switch on Demo mode in Settings.');
      setStatus('No match found. Tap "Describe what\u2019s playing" to try again.');
      return;
    }
    identifiedTitle.textContent = currentProgram.title;

    /* Real description pipeline (descriptions.js): official-AD-track lookup
     * first, then free-LLM AI generation, then a graceful spoken fallback.
     * Demo programs keep their original sample scripts. Stage updates go
     * through setStatus so screen readers announce progress. */
    let text, sourceInfo;
    if (window.TrueAccessDescribe) {
      setStatus('Identified as ' + currentProgram.title + '. Checking for an official audio description track…');
      const result = await window.TrueAccessDescribe.resolveDescription(
        currentProgram.title,
        verbositySelect.value,
        currentProgram.descriptions, // demo fallback; undefined for real titles
        stage => {
          if (stage === 'ai') setStatus('No official track found. Generating an AI description…');
        }
      );
      text = result.text;
      sourceInfo = window.TrueAccessDescribe.sourceLabel(result);
    } else {
      // descriptions.js failed to load — local demo fallback (see below).
      setStatus('Identified as ' + currentProgram.title + '. Generating description…');
      text = await generateDemoDescription(currentProgram, verbositySelect.value);
      sourceInfo = 'Description module unavailable — built-in demo script';
    }
    descriptionText.textContent = text;
    if (descriptionSource) descriptionSource.textContent = sourceInfo;
    lastDescription = { title: currentProgram.title, text: text, source: sourceInfo };
    resultCard.hidden = false;
    moveFocus(resultHeading); // focus moves to the results when ready
    setStatus('Description ready: ' + currentProgram.title + '.');
    if (autoSpeakCheckbox.checked) speakText(text);
  } catch (err) {
    setAlert('Sorry, that did not work: ' + (err && err.message ? err.message : 'unknown error') + '. Please try again.');
    setStatus('No description yet. Tap "Describe what\u2019s playing" to try again.');
  } finally {
    describeBtn.disabled = false;
  }
}

/* ---------- Text-to-speech (REAL, Web Speech API) ---------- */
function getVoices() {
  return window.speechSynthesis ? speechSynthesis.getVoices() : [];
}

function loadVoices() {
  if (!('speechSynthesis' in window)) {
    voicePicker.innerHTML = '<option value="">Speech not supported in this browser</option>';
    voicePicker.disabled = true;
    return;
  }
  const voices = getVoices();
  const previous = voicePicker.value || recallSetting('taVoice') || '';
  voicePicker.innerHTML = '<option value="">System default voice</option>';
  voices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = v.name + ' (' + v.lang + ')';
    voicePicker.appendChild(opt);
  });
  if (previous && voicePicker.querySelector('option[value="' + CSS.escape(previous) + '"]')) {
    voicePicker.value = previous;
  }
}

/* iOS Safari only allows speechSynthesis.speak() inside (or very near) a
 * user gesture. Calling this from the tap handler keeps speech working
 * after the multi-second identify/generate gap. */
function unlockSpeech() {
  try {
    if ('speechSynthesis' in window) {
      const warmup = new SpeechSynthesisUtterance(' ');
      warmup.volume = 0;
      speechSynthesis.speak(warmup);
    }
  } catch (e) { /* not fatal — speech may still work */ }
}

function speakText(text) {
  if (!('speechSynthesis' in window)) {
    setAlert('Sorry — speech output is not supported in this browser.');
    return;
  }
  speechSynthesis.cancel();
  const clean = (text || '').trim();
  if (!clean) {
    setStatus('There is no description to speak yet.');
    return;
  }
  const utter = new SpeechSynthesisUtterance(clean);
  const chosen = voicePicker.value;
  if (chosen) {
    const voice = getVoices().find(v => v.name === chosen);
    if (voice) utter.voice = voice;
  }
  utter.rate = parseFloat(rateInput.value) || 1;
  utter.onend = () => {
    if (window.VoiceTrigger) window.VoiceTrigger.resumeAfterSpeech();
    setStatus('Finished speaking the description.');
  };
  utter.onerror = (e) => {
    if (window.VoiceTrigger) window.VoiceTrigger.resumeAfterSpeech();
    if (e && e.error === 'interrupted') {
      setStatus('Speech stopped.');
    } else {
      setAlert('Speech was interrupted before it finished.');
    }
  };
  if (window.VoiceTrigger) window.VoiceTrigger.pauseForSpeech(); // trigger must not hear itself
  speechSynthesis.speak(utter);
  setStatus('Speaking the description…');
}

function speakDescription() {
  speakText(descriptionText.textContent);
}

function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (window.VoiceTrigger) window.VoiceTrigger.resumeAfterSpeech();
  setStatus('Speech stopped.');
}

/* ---------- Repeat last description ----------
 * Stays enabled even when empty so it is always findable; it announces
 * politely when there is nothing to repeat yet. */
function repeatLastDescription() {
  if (!lastDescription) {
    setStatus('There is no description to repeat yet. Describe something first.');
    return;
  }
  unlockSpeech();
  if (resultCard.hidden) {
    identifiedTitle.textContent = lastDescription.title;
    descriptionText.textContent = lastDescription.text;
    if (descriptionSource) descriptionSource.textContent = lastDescription.source || '';
    resultCard.hidden = false;
  }
  setStatus('Repeating the last description: ' + lastDescription.title + '.');
  speakText(lastDescription.text);
}

/* ---------- Settings announcements + persistence ----------
 * Mary's voice, speed, and detail choices are remembered on her phone
 * (localStorage) so she never has to set them up twice. */
function rememberSetting(key, value) {
  try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
}
function recallSetting(key) {
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
}

function rateSpeechText(value) {
  return value.toFixed(1) + ' times normal speed';
}

rateInput.addEventListener('input', () => {
  const v = parseFloat(rateInput.value) || 1;
  rateValue.textContent = v.toFixed(1);
  rateInput.setAttribute('aria-valuetext', rateSpeechText(v));
});

rateInput.addEventListener('change', () => {
  const v = parseFloat(rateInput.value) || 1;
  rememberSetting('taRate', String(v));
  setStatus('Speech speed set to ' + rateSpeechText(v) + '. Saved.');
});

verbositySelect.addEventListener('change', () => {
  const label = verbositySelect.options[verbositySelect.selectedIndex].textContent;
  rememberSetting('taVerbosity', verbositySelect.value);
  setStatus('Description detail set to: ' + label + '. Saved.');
});

voicePicker.addEventListener('change', () => {
  rememberSetting('taVoice', voicePicker.value);
  const label = voicePicker.options[voicePicker.selectedIndex].textContent;
  setStatus('Description voice set to: ' + label + '. Saved.');
});

/* Restore remembered settings on load (before voices arrive; loadVoices
 * re-applies the voice choice once the list populates). */
(function restoreSettings() {
  const rate = parseFloat(recallSetting('taRate'));
  if (rate >= 0.5 && rate <= 2) {
    rateInput.value = String(rate);
    rateValue.textContent = rate.toFixed(1);
    rateInput.setAttribute('aria-valuetext', rateSpeechText(rate));
  }
  const verbosity = recallSetting('taVerbosity');
  if (verbosity && verbositySelect.querySelector('option[value="' + verbosity + '"]')) {
    verbositySelect.value = verbosity;
  }
})();

micPicker.addEventListener('change', () => {
  const label = micPicker.options[micPicker.selectedIndex].textContent;
  setStatus('Microphone set to: ' + label + '.');
});

/* ---------- Demo mode toggle (Worker 1) ----------
 * Remembered on this phone. When on, "Describe what's playing" matches
 * against the built-in sample programs instead of real fingerprinting —
 * the full flow stays testable with no network and no API key. */
const DEMO_MODE_KEY = 'taDemoMode';
if (demoModeCheckbox) {
  try {
    demoModeCheckbox.checked = window.localStorage.getItem(DEMO_MODE_KEY) === '1';
  } catch (e) { /* private browsing — default off */ }
  demoModeCheckbox.addEventListener('change', () => {
    try {
      window.localStorage.setItem(DEMO_MODE_KEY, demoModeCheckbox.checked ? '1' : '0');
    } catch (e) { /* ignore */ }
    setStatus(demoModeCheckbox.checked
      ? 'Demo mode is on. Identifications will use the built-in sample programs.'
      : 'Demo mode is off. Identifications will use real audio fingerprinting.');
  });
}

/* ---------- Wire up events ---------- */
startBtn.addEventListener('click', startListening);
stopBtn.addEventListener('click', stopEverything);
stopAllBtn.addEventListener('click', stopEverything);
repeatBtn.addEventListener('click', repeatLastDescription);
describeBtn.addEventListener('click', describeWhatsPlaying);
speakBtn.addEventListener('click', speakDescription);
stopSpeechBtn.addEventListener('click', stopSpeaking);
refreshMicsBtn.addEventListener('click', () => loadMicrophones(true));
consentYesBtn.addEventListener('click', grantConsent);
consentNoBtn.addEventListener('click', declineConsent);

if ('speechSynthesis' in window) {
  loadVoices();
  // Voices often load asynchronously; re-populate when they arrive.
  speechSynthesis.onvoiceschanged = loadVoices;
} else {
  loadVoices();
}

if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', () => loadMicrophones(false));
}
loadMicrophones(false);

/* ============================================================================
 * EXTERNAL TRIGGER SURFACE — deep links, Siri Shortcuts, Meta integration
 * ----------------------------------------------------------------------------
 * True Access can be driven from outside the page, with no tapping inside
 * the app:
 *
 *   URL actions (works from Siri Shortcuts, home-screen shortcuts, links):
 *     ?action=describe   start listening (if needed) and describe what's playing
 *     ?action=repeat     speak the last description again (no mic needed)
 *     ?action=start      just start listening
 *     ?action=stop       stop everything
 *   Combine with &autostart=1 to begin immediately on page load.
 *   Example: https://pure-photography.github.io/true-access/?action=describe&autostart=1
 *
 *   Custom protocol (installed PWA, Chrome/Edge):
 *     web+trueaccess://describe   (registered in manifest.json)
 *
 *   postMessage API (for embedding in another app — e.g. Meta's app — as a
 *   webview or iframe). Send { type:'true-access/<action>', id } and get
 *   back { type:'true-access/response', id, ok, ... }:
 *     true-access/ping     -> { ok:true, app:'true-access', version }
 *     true-access/status   -> { ok:true, listening, speaking, hasResult }
 *     true-access/describe -> { ok:true } | { ok:false, error:'not-listening' }
 *     true-access/repeat   -> { ok:true }
 *     true-access/stop     -> { ok:true }
 *   Honest limits: browsers only grant the microphone after a user gesture,
 *   so describe/repeat-via-message work once listening is already on. If
 *   not, the response says so instead of failing silently.
 * ========================================================================== */
const TRUE_ACCESS_VERSION = '0.4.0';

function handleExternalAction(action) {
  const a = (action || '').toLowerCase().trim();
  if (!a) return false;
  if (a === 'describe') {
    // If the mic is already on, describe right away. Otherwise start
    // listening first — the describe follows automatically once audio is up.
    if (mediaStream) {
      describeWhatsPlaying();
    } else {
      pendingActionAfterListen = 'describe';
      startListening();
    }
    return true;
  }
  if (a === 'repeat') {
    repeatLastDescription();
    return true;
  }
  if (a === 'start') {
    startListening();
    return true;
  }
  if (a === 'stop') {
    stopEverything();
    return true;
  }
  return false;
}

/* When listening starts via an external action, run the queued action. */
let pendingActionAfterListen = null;

/* Parse ?action= from the URL. Also unwraps web+trueaccess://<action>
 * links (manifest protocol_handlers deliver the full URL as ?action=). */
function readUrlAction() {
  try {
    const params = new URLSearchParams(window.location.search);
    let action = params.get('action') || '';
    const protoPrefix = 'web+trueaccess://';
    if (action.toLowerCase().indexOf(protoPrefix) === 0) {
      action = action.slice(protoPrefix.length).split(/[?#]/)[0];
    }
    return {
      action: action,
      autostart: params.get('autostart') === '1' || params.get('action') !== null
    };
  } catch (e) {
    return { action: '', autostart: false };
  }
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
  if (msg.type.indexOf('true-access/') !== 0) return;
  const action = msg.type.slice('true-access/'.length);
  const reply = (payload) => {
    try {
      const response = Object.assign({ type: 'true-access/response', id: msg.id || null }, payload);
      if (event.source && event.source.postMessage) {
        event.source.postMessage(response, event.origin || '*');
      }
    } catch (e) { /* the sender went away — nothing to do */ }
  };
  const speaking = ('speechSynthesis' in window) && speechSynthesis.speaking;
  if (action === 'ping') {
    reply({ ok: true, app: 'true-access', version: TRUE_ACCESS_VERSION });
  } else if (action === 'status') {
    reply({ ok: true, listening: !!mediaStream, speaking: speaking, hasResult: !!lastDescription });
  } else if (action === 'describe') {
    if (!mediaStream) {
      setStatus('A connected app asked for a description, but listening is off. Starting the microphone — tap "Yes, allow the microphone" to continue.');
      pendingActionAfterListen = 'describe';
      startListening();
      reply({ ok: false, error: 'not-listening', note: 'mic consent needed; describe will run once listening starts' });
    } else {
      describeWhatsPlaying().then(
        () => reply({ ok: true }),
        (err) => reply({ ok: false, error: (err && err.message) || 'describe-failed' })
      );
    }
  } else if (action === 'repeat') {
    repeatLastDescription();
    reply({ ok: true });
  } else if (action === 'stop') {
    stopEverything();
    reply({ ok: true });
  } else {
    reply({ ok: false, error: 'unknown-action' });
  }
});

/* ---------- Hands-free voice trigger integration ----------
 * voice-trigger.js loads after this file, so wire it up once the page
 * (and all scripts) are ready. The trigger reuses describeWhatsPlaying()
 * and the live-region announcements above; it is paused while the app
 * itself is speaking so it can never trigger on its own output. */
window.addEventListener('load', () => {
  if (window.VoiceTrigger && typeof window.VoiceTrigger.init === 'function') {
    window.VoiceTrigger.init({
      onTrigger: () => describeWhatsPlaying(),
      // Errors and blocks go to the assertive region; state changes stay polite.
      announce: (msg) => {
        if (/blocked|could not|failed|not supported|denied|rejected|kept stopping|not set up/i.test(msg)) setAlert(msg);
        else setStatus(msg);
      },
      isListening: () => !!mediaStream
    });
  }
  /* External trigger: ?action=describe&autostart=1 (Siri Shortcut,
   * home-screen shortcut, Meta deep link). Runs after everything is wired.
   * Note: browsers may still need one tap for the microphone — an Apple/
   * browser rule, not ours. If so, the consent card is shown and focused
   * so the single tap is all it takes. */
  const urlAction = readUrlAction();
  if (urlAction.action) {
    if (urlAction.autostart) {
      setStatus('Opening True Access from a shortcut…');
    }
    // Small delay lets the voice list and mic list settle first.
    window.setTimeout(() => {
      if (!handleExternalAction(urlAction.action)) {
        setAlert('Unknown shortcut action: "' + urlAction.action + '". Try "describe", "repeat", "start", or "stop".');
      }
    }, 600);
  }
});
