/* ============================================================================
 * True Access — AI description generation (Worker 2)
 * ----------------------------------------------------------------------------
 * TWO-STAGE FLOW
 *   Stage 1 — Official AD track lookup: checkOfficialAD(title)
 *     Searches a curated local database (official-ad-db.json) of titles
 *     known to ship with a professional audio description track on major
 *     streaming services. If found, the app tells the user WHERE the real
 *     track lives and HOW to turn it on. (We cannot stream the services'
 *     AD audio ourselves — those tracks are DRM-protected — so the honest
 *     move is to point the user at the official track.)
 *
 *   Stage 2 — AI generation: generateDescription(title, verbosity)
 *     If no official track is known, a free LLM writes an audio-description-
 *     style VISUAL OVERVIEW of the program. Provider chain (first working
 *     provider wins):
 *       1. Google Gemini API  — needs a free key (see TA_DESCRIBE_CONFIG)
 *       2. Pollinations       — no key, no signup (community-run, free)
 *       3. LLM7               — no key, no signup (anonymous tier, free)
 *     All three are callable directly from a browser PWA (CORS-enabled).
 *
 * GRACEFUL FAILURE: every public function resolves — never rejects. If all
 * providers fail, the result text is a clear spoken message, never silence:
 *   "I couldn't generate a description for this right now."
 *
 * PROFESSIONAL AD STYLE (encoded in AD_SYSTEM_PROMPT below).
 * Rules distilled from real describer guidelines:
 *   - DCMP Audio Description Tip Sheet (dcmp.org)
 *   - Texas DIR "General Principles of Audio Description"
 *   - American Translators Association notes on AD writing
 * Key rules: present tense, active voice, third person; objective (describe,
 * don't interpret); prioritize setting / people / key actions / on-screen
 * text; never narrate what the listener already hears; concise; complete
 * sentences; never talk over dialogue (here: keep it tight).
 *
 * HONESTY LIMIT: the Ray-Ban Meta glasses' camera is locked to third-party
 * apps, so this pipeline has NO video frames. The AI writes an OVERVIEW of
 * what the program looks like (setting, characters' appearance, visual
 * style/mood) from its training knowledge — NOT true moment-by-moment AD.
 * It can get details wrong. The official track (Stage 1) is always
 * preferable when it exists.
 * ========================================================================== */

'use strict';

/* ============================ CONFIG — EDIT ME ============================
 * The ONLY place credentials live. Everything works with no key at all
 * (Pollinations + LLM7 need no signup). Add a free Gemini key for the
 * best-quality generation:
 *   1. Go to https://aistudio.google.com/apikey (free Google account)
 *   2. "Create API key" — no billing required for the free tier
 *   3. Paste it below as geminiApiKey.
 * NEVER commit a real key to a public repo — for a personal build, pasting
 * it here is fine; for anything shared, use a tiny backend proxy instead.
 * ========================================================================== */
const TA_DESCRIBE_CONFIG = {
  provider: 'auto', // 'auto' | 'gemini' | 'pollinations' | 'llm7'
  geminiApiKey: '', // <-- PASTE YOUR FREE GEMINI KEY HERE (or leave empty)
  geminiModel: 'gemini-2.5-flash', // free-tier Flash model (quotas change; see AD_GENERATION.md)
  llm7Model: 'DeepSeek-V4-Flash-0731', // fallback if this model rotates (auto-refreshed below)
  requestTimeoutMs: 25000, // per-provider timeout
  officialDbUrl: './official-ad-db.json', // curated official-AD-track database
  unavailableMessage: "I couldn't generate a description for this right now."
};

/* ---------- Verbosity: target lengths for the generated overview ---------- */
const VERBOSITY_TARGETS = {
  brief:    { words: 40,  maxTokens: 120 },
  standard: { words: 120, maxTokens: 350 },
  detailed: { words: 250, maxTokens: 700 }
};

/* ==================== PROFESSIONAL AD STYLE (system prompt) =============== */
const AD_SYSTEM_PROMPT = [
  'You write audio description overviews for blind and low-vision viewers,',
  'in the style of professional audio describers.',
  '',
  'RULES — follow all of them:',
  '1. Present tense, active voice, third person. ("She crosses the room," never "She crossed the room.")',
  '2. Objective: describe only what can be SEEN. Never interpret feelings, motives, or thoughts.',
  '   Say "Tears fill her eyes and her shoulders slump," never "She looks sad."',
  '3. Prioritize what matters: the setting, who is present and what they look like,',
  '   key visual actions, and any on-screen text. General first, then specific. Skip trivial decoration.',
  '4. Do not narrate anything the listener would already hear from dialogue, music, or sound effects.',
  '5. Concise, plain-spoken, complete sentences. No flowery filler ("In this breathtaking scene").',
  '6. Name a character only if the name is certain. Never invent names, places, or plot details.',
  '7. HONESTY: you cannot see the video. Write a visual OVERVIEW of the program — its look,',
  '   setting, main characters\' appearance, visual style and mood — not moment-by-moment narration.',
  '   If you are not confident you know this title, say so plainly in one sentence instead of inventing details.',
  '8. Output ONLY the description. No headers, no disclaimers, no commentary around it.'
].join('\n');

function buildUserPrompt(title, verbosity, transcript) {
  const target = VERBOSITY_TARGETS[verbosity] || VERBOSITY_TARGETS.standard;
  let prompt = 'Write an audio-description-style visual overview of "' + title + '".\n';
  if (transcript && transcript.trim()) {
    prompt += 'A short transcript of what is being heard right now (use it only to avoid repeating what is audible):\n"""' +
      transcript.trim().slice(0, 600) + '"""\n';
  } else {
    prompt += 'No transcript is available.\n';
  }
  prompt += 'Detail level: ' + verbosity + ' — about ' + target.words + ' words.';
  return prompt;
}

/* ============================ fetch helpers ============================= */
function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || TA_DESCRIBE_CONFIG.requestTimeoutMs);
  const opts = Object.assign({}, options, { signal: controller.signal });
  return fetch(url, opts).finally(() => clearTimeout(timer));
}

function cleanText(text) {
  // Collapse whitespace; strip markdown-ish wrappers some models add.
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/* ==================== STAGE 1: official AD track lookup =================== */
let officialDbCache = null;

async function loadOfficialDb() {
  if (officialDbCache) return officialDbCache;
  try {
    const res = await fetchWithTimeout(TA_DESCRIBE_CONFIG.officialDbUrl, {}, 8000);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    officialDbCache = await res.json();
  } catch (err) {
    officialDbCache = { titles: [], services: {} }; // DB missing: Stage 1 just finds nothing
  }
  return officialDbCache;
}

function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/\(\d{4}\)/g, ' ')        // drop "(2021)" year tags
    .replace(/[“”"']/g, '')           // drop quotes
    .replace(/[^a-z0-9\s]/g, ' ')     // drop punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * checkOfficialAD(title) -> { found, title, services:[{name, howTo}], note }
 * Never rejects; resolves { found:false } when the DB is missing or empty.
 */
async function checkOfficialAD(title) {
  const notFound = { found: false, title: title, services: [] };
  if (!title || !title.trim()) return notFound;
  const db = await loadOfficialDb();
  if (!db.titles || db.titles.length === 0) return notFound;
  const norm = normalizeTitle(title);
  if (!norm) return notFound;

  const hit = db.titles.find(entry => {
    const eNorm = normalizeTitle(entry.title);
    if (!eNorm) return false;
    if (eNorm === norm) return true;
    // Partial match, guarded against tiny/ambiguous fragments.
    if (eNorm.length >= 6 && norm.includes(eNorm)) return true;
    if (norm.length >= 6 && eNorm.includes(norm)) return true;
    return false;
  });
  if (!hit) return notFound;

  const services = (hit.services || []).map(key => {
    const info = (db.services && db.services[key]) || {};
    return { key: key, name: info.name || key, howTo: info.howTo || '' };
  });
  return { found: true, title: hit.title, services: services, note: db.note || '' };
}

/** Spoken guidance pointing the user at the official AD track. */
function officialTrackMessage(check) {
  const names = check.services.map(s => s.name).join(check.services.length > 1 ? ' or ' : '');
  const howTos = check.services
    .filter(s => s.howTo)
    .map(s => s.name + ': ' + s.howTo)
    .join(' ');
  let msg = '"' + check.title + '" has an official audio description track';
  msg += names ? ' on ' + names + '.' : '.';
  msg += ' For the real, professionally described version, ' +
    'open it on that service and turn on audio description. ' + howTos;
  return cleanText(msg);
}

/* ==================== STAGE 2: AI description providers =================== */

/* ---- Provider 1: Google Gemini API (free tier, needs free key) ---- */
async function generateWithGemini(title, verbosity, transcript) {
  const key = TA_DESCRIBE_CONFIG.geminiApiKey;
  if (!key) throw new Error('no Gemini key configured');
  const target = VERBOSITY_TARGETS[verbosity] || VERBOSITY_TARGETS.standard;
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(TA_DESCRIBE_CONFIG.geminiModel) + ':generateContent?key=' + encodeURIComponent(key);
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: AD_SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: buildUserPrompt(title, verbosity, transcript) }] }],
      generationConfig: { maxOutputTokens: target.maxTokens, temperature: 0.7 }
    })
  });
  if (!res.ok) throw new Error('Gemini HTTP ' + res.status);
  const data = await res.json();
  const text = (data.candidates && data.candidates[0] && data.candidates[0].content &&
    data.candidates[0].content.parts || []).map(p => p.text || '').join(' ');
  const cleaned = cleanText(text);
  if (!cleaned) throw new Error('Gemini returned no text');
  return cleaned;
}

/* ---- Provider 2: Pollinations (free, no key, no signup) ---- */
async function generateWithPollinations(title, verbosity, transcript) {
  // Keyless endpoint: GET https://text.pollinations.ai/{prompt} -> text.
  // (The POST /messages variant was observed returning the model's raw
  // reasoning trace in a JSON envelope — unusable for speech — so we use
  // GET, which returns clean prose. extractSpokenText() below guards
  // against envelope-shaped responses anyway.)
  // Verified Oct 2026: CORS-enabled, ~7-20s per request, quality varies.
  const prompt = AD_SYSTEM_PROMPT + '\n\n' + buildUserPrompt(title, verbosity, transcript);
  const url = 'https://text.pollinations.ai/' + encodeURIComponent(prompt);
  const res = await fetchWithTimeout(url, { method: 'GET' });
  if (!res.ok) throw new Error('Pollinations HTTP ' + res.status);
  const cleaned = extractSpokenText(await res.text());
  if (!cleaned) throw new Error('Pollinations returned no usable text');
  return cleaned;
}

/**
 * extractSpokenText(raw) — pull speakable prose out of a provider response.
 * Some free chat backends wrap output in a JSON envelope like
 * {"role":"assistant","reasoning":"<internal monologue>","tool_calls":[]}.
 * A screen reader must NEVER speak a reasoning trace, so: prefer a real
 * `content` field; if the envelope carries only `reasoning`, throw so the
 * caller fails over to the next provider instead of speaking the trace.
 */
function extractSpokenText(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (text[0] !== '{') return cleanText(text); // plain prose — the common case
  let data;
  try { data = JSON.parse(text); } catch (e) { return cleanText(text); }
  if (!data || typeof data !== 'object') return cleanText(text);
  const content = (data.choices && data.choices[0] && data.choices[0].message &&
    data.choices[0].message.content) || data.content || data.text || data.response;
  if (content && String(content).trim()) return cleanText(content);
  if (data.reasoning || data.thought) {
    throw new Error('Pollinations returned only a reasoning trace (no speakable content)');
  }
  return cleanText(text);
}

/* ---- Provider 3: LLM7 (free, no key, OpenAI-compatible) ---- */
let llm7ModelOverride = null;

async function llm7Chat(model, systemPrompt, userPrompt, maxTokens) {
  const res = await fetchWithTimeout('https://api.llm7.io/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer unused' },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: maxTokens,
      temperature: 0.7
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error('LLM7: ' + ((data.error && data.error.message) || ('HTTP ' + res.status)));
    err.code = data.error && data.error.code;
    throw err;
  }
  const text = data.choices && data.choices[0] && data.choices[0].message &&
    data.choices[0].message.content;
  const cleaned = cleanText(text);
  if (!cleaned) throw new Error('LLM7 returned no text');
  return cleaned;
}

async function generateWithLLM7(title, verbosity, transcript) {
  const target = VERBOSITY_TARGETS[verbosity] || VERBOSITY_TARGETS.standard;
  const userPrompt = buildUserPrompt(title, verbosity, transcript);
  const modelsToTry = [];
  if (llm7ModelOverride) modelsToTry.push(llm7ModelOverride);
  modelsToTry.push(TA_DESCRIBE_CONFIG.llm7Model);

  let lastErr = null;
  for (const model of modelsToTry) {
    try {
      return await llm7Chat(model, AD_SYSTEM_PROMPT, userPrompt, target.maxTokens);
    } catch (err) {
      lastErr = err;
      // Model rotated out? Refresh from /v1/models and retry once with a live chat model.
      if (err.code === 'model_unavailable' && !llm7ModelOverride) {
        try {
          const res = await fetchWithTimeout('https://api.llm7.io/v1/models',
            { headers: { 'Authorization': 'Bearer unused' } }, 10000);
          const list = await res.json();
          const live = (list.data || []).find(m =>
            m.model_type === 'chat' &&
            (m.schema_endpoints || []).includes('openai') &&
            (m.availability_last_hour_percent === 100 || m.availability_last_hour_percent == null));
          if (live && live.id && !modelsToTry.includes(live.id)) {
            llm7ModelOverride = live.id;
            modelsToTry.push(live.id);
          }
        } catch (refreshErr) { /* fall through to lastErr */ }
      }
    }
  }
  throw lastErr || new Error('LLM7 failed');
}

/* ---- Provider chain ---- */
const PROVIDERS = [
  { name: 'gemini',       needsKey: true,  run: generateWithGemini },
  { name: 'pollinations', needsKey: false, run: generateWithPollinations },
  { name: 'llm7',         needsKey: false, run: generateWithLLM7 }
];

/**
 * generateDescription(title, verbosity, options)
 * options: { transcript } — optional short transcript excerpt for context.
 * Resolves { ok, text, provider } — never rejects. On total failure,
 * text is the graceful spoken fallback (never silence).
 */
async function generateDescription(title, verbosity, options) {
  const transcript = options && options.transcript;
  const level = VERBOSITY_TARGETS[verbosity] ? verbosity : 'standard';
  const failed = () => ({
    ok: false,
    provider: null,
    text: TA_DESCRIBE_CONFIG.unavailableMessage
  });

  if (!title || !title.trim()) return failed();

  const setting = TA_DESCRIBE_CONFIG.provider;
  const chain = PROVIDERS.filter(p =>
    (setting === 'auto' || setting === p.name) && (!p.needsKey || TA_DESCRIBE_CONFIG.geminiApiKey));

  for (const provider of chain) {
    try {
      const text = await provider.run(title.trim(), level, transcript);
      return { ok: true, provider: provider.name, text: text };
    } catch (err) {
      // Fall through to the next provider; the user hears only the final result.
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[TrueAccess] description provider failed:', provider.name, err.message);
      }
    }
  }
  return failed();
}

/* ================== Combined two-stage resolution ================== */
/**
 * resolveDescription(title, verbosity, demoFallback, onStage)
 *   title        — identified program title
 *   verbosity    — 'brief' | 'standard' | 'detailed'
 *   demoFallback — optional { brief, standard, detailed } original demo
 *                  scripts; used ONLY when the title is one of the built-in
 *                  demo programs (keeps the offline demo working).
 *   onStage      — optional callback(stage) with 'official' | 'ai' for
 *                  screen-reader status updates while working.
 *
 * Resolves { source, text, services?, provider? } where source is one of
 * 'sample' | 'official' | 'ai' | 'unavailable'. Never rejects.
 */
async function resolveDescription(title, verbosity, demoFallback, onStage) {
  const level = VERBOSITY_TARGETS[verbosity] ? verbosity : 'standard';

  // 0. Built-in demo programs keep their original demo scripts (clearly marked).
  if (demoFallback && demoFallback[level]) {
    return { source: 'sample', text: demoFallback[level], services: [], provider: null };
  }

  // 1. Official AD track lookup.
  if (onStage) onStage('official');
  try {
    const check = await checkOfficialAD(title);
    if (check.found) {
      return { source: 'official', text: officialTrackMessage(check), services: check.services, provider: null };
    }
  } catch (err) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[TrueAccess] official AD lookup failed:', err.message);
    }
  }

  // 2. AI generation.
  if (onStage) onStage('ai');
  const gen = await generateDescription(title, level);
  if (gen.ok) {
    return { source: 'ai', text: gen.text, services: [], provider: gen.provider };
  }

  // 3. Graceful failure — a clear spoken message, never silence.
  return { source: 'unavailable', text: TA_DESCRIBE_CONFIG.unavailableMessage, services: [], provider: null };
}

/* Human-friendly source labels for the result card. */
function sourceLabel(result) {
  switch (result.source) {
    case 'official': {
      const names = (result.services || []).map(s => s.name).join(' / ');
      return 'Official audio description track available' + (names ? ' on ' + names : '');
    }
    case 'ai':
      return 'AI-generated visual overview' + (result.provider ? ' (via ' + result.provider + ')' : '') +
        ' — may contain inaccuracies; prefer the official track when one exists';
    case 'sample':
      return 'Built-in demo script (not a real program)';
    default:
      return 'No description available';
  }
}

/* Public API for app.js */
window.TrueAccessDescribe = {
  CONFIG: TA_DESCRIBE_CONFIG,
  VERBOSITY_TARGETS: VERBOSITY_TARGETS,
  AD_SYSTEM_PROMPT: AD_SYSTEM_PROMPT,
  checkOfficialAD: checkOfficialAD,
  generateDescription: generateDescription,
  resolveDescription: resolveDescription,
  sourceLabel: sourceLabel
};
