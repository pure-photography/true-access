/* ============================================================================
 * True Access — prototype app logic
 * ----------------------------------------------------------------------------
 * WHAT IS REAL in this prototype:
 *   - Microphone capture via getUserMedia (including Bluetooth headset mics
 *     such as the Ray-Ban Meta glasses when paired to the phone)
 *   - Live microphone level meter
 *   - Text-to-speech via the Web Speech API (voice picker, rate control)
 *   - The full listening -> identifying -> describing user flow
 *
 * WHAT IS DEMO (simulated) in this prototype:
 *   - Content identification. A real Shazam-style audio-fingerprint service
 *     requires a paid backend. identifyContent() is structured so a real API
 *     can be plugged in later — see the TODO inside. For now it waits ~3
 *     seconds and returns one of the built-in sample programs below.
 *   - The audio descriptions themselves are short ORIGINAL sample scripts
 *     written for this demo, not descriptions of real movies or shows.
 * ========================================================================== */

'use strict';

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
const levelMeter = document.getElementById('level-meter');
const levelFill = document.getElementById('level-fill');
const levelText = document.getElementById('level-text');
const micPicker = document.getElementById('mic-picker');
const refreshMicsBtn = document.getElementById('refresh-mics');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const describeBtn = document.getElementById('describe-btn');
const resultCard = document.getElementById('result-card');
const identifiedTitle = document.getElementById('identified-title');
const descriptionText = document.getElementById('description-text');
const speakBtn = document.getElementById('speak-btn');
const stopSpeechBtn = document.getElementById('stop-speech-btn');
const voicePicker = document.getElementById('voice-picker');
const verbositySelect = document.getElementById('verbosity');
const rateInput = document.getElementById('rate');
const rateValue = document.getElementById('rate-value');
const autoSpeakCheckbox = document.getElementById('auto-speak');

/* ---------- Audio state ---------- */
let mediaStream = null;
let audioContext = null;
let analyser = null;
let levelRafId = null;
let currentProgram = null;

/* ---------- Helpers ---------- */
function setStatus(message) {
  statusEl.textContent = message; // role="status" + aria-live announces this
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
async function loadMicrophones() {
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
    if (mics.length === 0) {
      setStatus('No microphones found. Check that your headset is paired.');
    }
  } catch (err) {
    setStatus('Could not list microphones: ' + err.message);
  }
}

/* ---------- Listening (REAL) ---------- */
async function startListening() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus('Sorry — this browser does not support microphone access.');
    return;
  }
  const constraints = { audio: true };
  if (micPicker.value) {
    constraints.audio = { deviceId: { exact: micPicker.value } };
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
    // Refresh labels now that permission is granted
    loadMicrophones();
    startBtn.disabled = true;
    stopBtn.disabled = false;
    describeBtn.disabled = false;
    setStatus('Listening. Play something nearby, then tap "Describe what\u2019s playing".');
  } catch (err) {
    setStatus('Microphone access was blocked or failed: ' + err.message);
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
    levelFill.style.width = pct + '%';
    levelMeter.setAttribute('aria-valuenow', String(pct));
    levelText.textContent = 'Level: ' + levelWord(pct);
    levelRafId = requestAnimationFrame(tick);
  };
  tick();
}

function stopListening() {
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
  levelFill.style.width = '0%';
  levelMeter.setAttribute('aria-valuenow', '0');
  levelText.textContent = 'Level: quiet';
  startBtn.disabled = false;
  stopBtn.disabled = true;
  describeBtn.disabled = true;
  setStatus('Stopped. Tap "Start Listening" to begin again.');
}

/* ---------- Content identification ----------
 * DEMO: simulates a 3-second identification and returns a sample program.
 *
 * TODO (real backend): replace the body of this function with a call to a
 * real audio-fingerprinting service. Capture a few seconds of audio from
 * `mediaStream` via MediaRecorder, POST the clip to the service, and return
 * { title, descriptions } in the same shape. Everything downstream already
 * expects that shape, so only this function needs to change. */
function identifyContent() {
  return new Promise(resolve => {
    setTimeout(() => {
      const pick = SAMPLE_PROGRAMS[Math.floor(Math.random() * SAMPLE_PROGRAMS.length)];
      resolve(pick);
    }, 3000);
  });
}

async function describeWhatsPlaying() {
  if (!mediaStream) {
    setStatus('Start listening first, so the app can hear what is playing.');
    return;
  }
  describeBtn.disabled = true;
  resultCard.hidden = true;
  setStatus('Identifying what\u2019s playing… (demo mode: matching against sample programs)');
  try {
    currentProgram = await identifyContent();
    const verbosity = verbositySelect.value;
    identifiedTitle.textContent = currentProgram.title;
    descriptionText.textContent = currentProgram.descriptions[verbosity] || currentProgram.descriptions.standard;
    resultCard.hidden = false;
    setStatus('Description ready.');
    if (autoSpeakCheckbox.checked) speakDescription();
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    setStatus('Identification failed: ' + err.message);
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
  const previous = voicePicker.value;
  voicePicker.innerHTML = '<option value="">System default voice</option>';
  voices.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = v.name + ' (' + v.lang + ')';
    voicePicker.appendChild(opt);
  });
  if (previous) voicePicker.value = previous;
}

function speakDescription() {
  if (!('speechSynthesis' in window)) {
    setStatus('Sorry — speech output is not supported in this browser.');
    return;
  }
  speechSynthesis.cancel();
  const text = descriptionText.textContent.trim();
  if (!text) {
    setStatus('There is no description to speak yet.');
    return;
  }
  const utter = new SpeechSynthesisUtterance(text);
  const chosen = voicePicker.value;
  if (chosen) {
    const voice = getVoices().find(v => v.name === chosen);
    if (voice) utter.voice = voice;
  }
  utter.rate = parseFloat(rateInput.value) || 1;
  utter.onend = () => setStatus('Finished speaking.');
  utter.onerror = () => setStatus('Speech was interrupted.');
  speechSynthesis.speak(utter);
  setStatus('Speaking the description…');
}

function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  setStatus('Speech stopped.');
}

/* ---------- Wire up events ---------- */
startBtn.addEventListener('click', startListening);
stopBtn.addEventListener('click', stopListening);
describeBtn.addEventListener('click', describeWhatsPlaying);
speakBtn.addEventListener('click', speakDescription);
stopSpeechBtn.addEventListener('click', stopSpeaking);
refreshMicsBtn.addEventListener('click', loadMicrophones);

rateInput.addEventListener('input', () => {
  rateValue.textContent = parseFloat(rateInput.value).toFixed(1);
});

if ('speechSynthesis' in window) {
  loadVoices();
  // Voices often load asynchronously; re-populate when they arrive.
  speechSynthesis.onvoiceschanged = loadVoices;
} else {
  loadVoices();
}

navigator.mediaDevices.addEventListener('devicechange', loadMicrophones);
loadMicrophones();
