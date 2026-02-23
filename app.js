const welcomePanel = document.getElementById('welcomePanel');
const notebookView = document.getElementById('notebookView');
const notebookSheet = document.getElementById('notebookSheet');
const bottomMenu = document.getElementById('bottomMenu');
const recordBtn = document.getElementById('recordBtn');
const notesBtn = document.getElementById('notesBtn');
const pencilBtn = document.getElementById('pencilBtn');
const savePrompt = document.getElementById('savePrompt');
const saveBtn = document.getElementById('saveBtn');
const discardBtn = document.getElementById('discardBtn');
const recordingPreview = document.getElementById('recordingPreview');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageIndicator = document.getElementById('pageIndicator');
const trashBtn = document.getElementById('trashBtn');
const recordingTitleInput = document.getElementById('recordingTitle');
const currentPageNumber = document.getElementById('currentPageNumber');
const totalPages = document.getElementById('totalPages');
const prevPageNumber = document.getElementById('prevPageNumber');
const nextPageNumber = document.getElementById('nextPageNumber');
const offlineHint = document.getElementById('offlineHint');
const prepareOfflineBtn = document.getElementById('prepareOfflineBtn');

const DB_NAME = 'cuadernoNotasDB';
const DB_VERSION = 1;
const STORE_NAME = 'notebook';
const NOTEBOOK_ID = 'main';
const MAX_CHARS_PER_PAGE = 700;
const MAX_PAGES = 200;
const SWIPE_THRESHOLD = 45;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const OFFLINE_CACHE_NAME = 'cuaderno-offline-v1';
const VOSK_READY_KEY = 'voskReady';
const VOICE_COMMAND_COOLDOWN_MS = 1800;
const LANGUAGE_TOOL_ENDPOINT = 'https://api.languagetool.org/v2/check';
const LANGUAGE_TOOL_MAX_CHARS = 20000;
const LANGUAGE_TOOL_REQUEST_TIMEOUT_MS = 10000;

// ===== Whisper (OpenAI) - dictado online más preciso =====
// Nota: la API key se configura en Vercel como OPENAI_API_KEY
const WHISPER_MODEL = 'gpt-4o-mini-transcribe';
const WHISPER_LANGUAGE = 'es';
const WHISPER_TRANSCRIBE_ENDPOINT = './api/transcribe';
const WHISPER_HEALTH_ENDPOINT = './api/health';

// Ajusta si quieres más “respuesta rápida” (más llamadas a la API)
// 3500ms = menos llamadas, pero si hablas muy corto necesitas el fix de abajo (ya incluido)
const WHISPER_CHUNK_MS = 3500; // cada cuánto se envían trozos al backend

// Si no detecta voz por un rato, deja de ENVIAR (pero sigue grabando)
const WHISPER_SILENCE_GRACE_MS = 600000; // 10 min de silencio tolerado

const notebookStateTemplate = {
  id: NOTEBOOK_ID,
  currentPage: 0,
  pages: [{ entries: [] }],
};

let notebookState = null;
let isPencilMode = false;
let isRecording = false;
let currentEngine = null; // 'whisper' | 'vosk'
let transcriptBuffer = '';
let previewBuffer = '';
let finalTranscript = '';
let lastPartial = '';
let lastFullFinal = '';
let touchStartX = 0;
let touchStartY = 0;
let userStoppedRecognition = false;
let whisperAvailableCache = null;
let lastVoiceCommandAt = 0;

// ===== Comandos por voz (annyang) =====
let areAnnyangCommandsReady = false;
let hasInjectedTokens = false;
let pendingInjectedCommands = [];

function safeTrim(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setActive(btn) {
  [recordBtn, notesBtn, pencilBtn].forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function showWelcome() {
  welcomePanel.classList.remove('hidden');
  notebookView.classList.add('hidden');
}

function showNotebook() {
  welcomePanel.classList.add('hidden');
  notebookView.classList.remove('hidden');
}

function getDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadNotebook() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(NOTEBOOK_ID);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function saveNotebook() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(notebookState);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function ensurePages() {
  if (!notebookState.pages || !Array.isArray(notebookState.pages)) notebookState.pages = [{ entries: [] }];
  if (typeof notebookState.currentPage !== 'number') notebookState.currentPage = 0;
  if (notebookState.currentPage < 0) notebookState.currentPage = 0;
  if (notebookState.currentPage >= notebookState.pages.length) notebookState.currentPage = notebookState.pages.length - 1;
}

function getPagePlainText(page) {
  if (!page || !page.entries) return '';
  return page.entries.map((e) => e.text).join('\n').trim();
}

function updatePageIndicator() {
  const total = notebookState.pages.length;
  const current = notebookState.currentPage + 1;
  currentPageNumber.textContent = String(current);
  totalPages.textContent = String(total);
  pageIndicator.textContent = `Página ${current} / ${total}`;

  prevPageNumber.textContent = String(Math.max(1, current - 1));
  nextPageNumber.textContent = String(Math.min(total + 1, current + 1));
}

function paintNotebook() {
  ensurePages();
  updatePageIndicator();
  const page = notebookState.pages[notebookState.currentPage];
  const text = page.entries.map((entry) => entry.text).join('\n\n');
  notebookSheet.textContent = text || 'Sin notas aún. Presiona el corazón para grabar.';
}

async function clearNotebook() {
  const isConfirmed = confirm('¿Seguro que quieres borrar TODO el cuaderno?');
  if (!isConfirmed) return;

  notebookState = {
    id: NOTEBOOK_ID,
    currentPage: 0,
    pages: [{ entries: [] }],
  };
  await saveNotebook();
  paintNotebook();
  showWelcome();
  setActive(null);
}

function updateOfflineHint(message = '') {
  if (!offlineHint || !prepareOfflineBtn) return;

  if (!message) {
    offlineHint.classList.add('hidden');
    prepareOfflineBtn.classList.add('hidden');
    return;
  }

  offlineHint.textContent = message;
  offlineHint.classList.remove('hidden');
  prepareOfflineBtn.classList.remove('hidden');
}

async function isWhisperAvailable() {
  if (whisperAvailableCache === true) return true;
  if (whisperAvailableCache === false) return false;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 2500);

  try {
    const resp = await fetch(WHISPER_HEALTH_ENDPOINT, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    whisperAvailableCache = resp.ok;
    return resp.ok;
  } catch (_) {
    whisperAvailableCache = false;
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

// ===== Whisper recorder state =====
const whisperState = {
  mediaStream: null,
  mediaRecorder: null,
  audioContext: null,
  analyserNode: null,
  analyserData: null,
  monitorRaf: 0,
  lastSpeechAt: 0,
  sentFirstChunk: false,
  queue: [],
  inFlight: false,
  stopped: false,
};

function startWhisperLevelMonitor() {
  if (!whisperState.analyserNode || !whisperState.analyserData) return;

  const tick = () => {
    if (!isRecording || currentEngine !== 'whisper' || whisperState.stopped) return;

    whisperState.analyserNode.getByteTimeDomainData(whisperState.analyserData);

    // Calcula nivel RMS aproximado (0..1)
    let sum = 0;
    for (let i = 0; i < whisperState.analyserData.length; i += 1) {
      const v = (whisperState.analyserData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / whisperState.analyserData.length);

    // Umbral simple. Ajusta si hace falta.
    if (rms > 0.015) whisperState.lastSpeechAt = Date.now();

    whisperState.monitorRaf = requestAnimationFrame(tick);
  };

  whisperState.monitorRaf = requestAnimationFrame(tick);
}

async function sendWhisperChunk(blob, promptText = '') {
  const fd = new FormData();

  // Asegura extensión compatible según el navegador
  const mime = String(blob?.type || '');
  const ext = mime.includes('ogg') ? 'ogg' : (mime.includes('mp4') || mime.includes('m4a')) ? 'm4a' : 'webm';
  const filename = `chunk-${Date.now()}.${ext}`;
  fd.append('file', blob, filename);
  fd.append('model', WHISPER_MODEL);
  fd.append('language', WHISPER_LANGUAGE);

  // Prompt para “coser” segmentos y mejorar formato
  const stylePrompt = 'Transcribe en español con buena puntuación. Mantén nombres propios correctamente.';
  const stitchedPrompt = [stylePrompt, safeTrim(promptText)].filter(Boolean).join('\n');
  fd.append('prompt', stitchedPrompt.slice(-1200));

  const resp = await fetch(WHISPER_TRANSCRIBE_ENDPOINT, {
    method: 'POST',
    body: fd,
  });

  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Whisper HTTP ${resp.status} ${txt}`);
  }

  const data = await resp.json();
  return safeTrim(data?.text || '');
}

async function processWhisperQueue() {
  if (whisperState.inFlight || !whisperState.queue.length) return;
  whisperState.inFlight = true;

  try {
    const next = whisperState.queue.shift();
    if (!next) return;

    // Usa un poco de contexto del texto ya acumulado.
    const context = safeTrim(lastFullFinal || finalTranscript).slice(-240);
    const text = await sendWhisperChunk(next, context);
    if (text) {
      updateTranscript({ finalChunk: text, partial: '' });
    }
  } catch (error) {
    console.warn('Error transcribiendo chunk (Whisper):', error);
    // Muestra estado sin borrar lo ya transcrito.
    if (recordingPreview) {
      const stableText = safeTrim(finalTranscript) || 'Escuchando (Whisper)…';
      recordingPreview.textContent = `${stableText} [Error Whisper: seguimos grabando]`;
    }
  } finally {
    whisperState.inFlight = false;
    if (whisperState.queue.length) {
      processWhisperQueue();
    }
  }
}

function queueWhisperBlob(blob) {
  if (!blob || !blob.size) return;

  // Regla simple:
  // - Siempre enviamos el PRIMER chunk (para no perder el inicio: "hola")
  // - Luego, si hay silencio largo, dejamos de ENVIAR chunks (la grabación sigue sin parar).
  const now = Date.now();

  if (!whisperState.sentFirstChunk) {
    whisperState.sentFirstChunk = true;
    whisperState.queue.push(blob);
    processWhisperQueue();
    return;
  }

  const spokeRecently = now - (whisperState.lastSpeechAt || 0) <= WHISPER_SILENCE_GRACE_MS;
  if (!spokeRecently) return;

  whisperState.queue.push(blob);
  processWhisperQueue();
}

async function startWhisperRecording() {
  whisperState.sentFirstChunk = false;
  whisperState.stopped = false;
  whisperState.queue = [];
  whisperState.inFlight = false;
  whisperState.lastSpeechAt = Date.now();

  whisperState.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // Monitor de nivel para detectar silencio
  whisperState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  // En algunos navegadores el AudioContext inicia 'suspended'. Asegura que esté activo.
  if (whisperState.audioContext.state === 'suspended') {
    await whisperState.audioContext.resume().catch(() => null);
  }
  const source = whisperState.audioContext.createMediaStreamSource(whisperState.mediaStream);
  whisperState.analyserNode = whisperState.audioContext.createAnalyser();
  whisperState.analyserNode.fftSize = 2048;
  whisperState.analyserData = new Uint8Array(whisperState.analyserNode.fftSize);
  source.connect(whisperState.analyserNode);
  startWhisperLevelMonitor();

  // MediaRecorder (opus)
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
  ];
  const mimeType = candidates.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));

  whisperState.mediaRecorder = new MediaRecorder(whisperState.mediaStream, mimeType ? { mimeType } : undefined);

  whisperState.mediaRecorder.ondataavailable = (e) => {
    // Importante: al detener el recorder, el último chunk llega con un último ondataavailable.
    // No dependas de isRecording aquí o se perderá ese último trozo (sobre todo en grabaciones cortas).
    if (currentEngine !== 'whisper') return;
    if (e.data && e.data.size > 0) queueWhisperBlob(e.data);
  };

  whisperState.mediaRecorder.onerror = (e) => {
    console.error('MediaRecorder error:', e);
  };

  whisperState.mediaRecorder.start(WHISPER_CHUNK_MS);
}

async function flushWhisperQueue(maxWaitMs = 9000) {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    if (!whisperState.inFlight && whisperState.queue.length === 0) return;
    await sleep(120);
  }
}

async function stopWhisperRecording() {
  whisperState.stopped = true;

  if (whisperState.monitorRaf) {
    cancelAnimationFrame(whisperState.monitorRaf);
    whisperState.monitorRaf = 0;
  }

  // Detén recorder (emite un último dataavailable)
  if (whisperState.mediaRecorder && whisperState.mediaRecorder.state !== 'inactive') {
    // Fuerza a emitir el último trozo antes de parar (mejora compatibilidad entre navegadores)
    try { whisperState.mediaRecorder.requestData(); } catch (_) {}

    await new Promise((resolve) => {
      whisperState.mediaRecorder.addEventListener('stop', resolve, { once: true });
      whisperState.mediaRecorder.stop();
    });
  }

  // Detén tracks
  if (whisperState.mediaStream) {
    whisperState.mediaStream.getTracks().forEach((t) => t.stop());
  }

  // Cierra audio ctx
  if (whisperState.audioContext) {
    await whisperState.audioContext.close().catch(() => null);
  }

  whisperState.mediaStream = null;
  whisperState.mediaRecorder = null;
  whisperState.audioContext = null;
  whisperState.analyserNode = null;
  whisperState.analyserData = null;

  await flushWhisperQueue();
}

// ===== Vosk (offline) =====
const voskState = {
  mediaStream: null,
  audioContext: null,
  processor: null,
  recognizer: null,
  model: null,
};

async function isVoskReady() {
  return localStorage.getItem(VOSK_READY_KEY) === 'true';
}

async function initVoskModel() {
  if (!window.Vosk || typeof window.Vosk.createModel !== 'function') {
    throw new Error('Falta runtime de Vosk Web (offline/vosk/vosk.js).');
  }

  if (!voskState.model) {
    const modelUrl = './offline/model.tar.gz';
    try {
      voskState.model = await window.Vosk.createModel(modelUrl);
    } catch (error) {
      voskState.model = await window.Vosk.createModel('./offline/vosk-model-small-es-0.42/');
    }
  }

  if (!voskState.recognizer) {
    voskState.recognizer = new voskState.model.KaldiRecognizer(48000);
  }
}

async function startVoskRecording() {
  await initVoskModel();

  voskState.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  voskState.audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });

  const source = voskState.audioContext.createMediaStreamSource(voskState.mediaStream);
  voskState.processor = voskState.audioContext.createScriptProcessor(4096, 1, 1);

  source.connect(voskState.processor);
  voskState.processor.connect(voskState.audioContext.destination);

  voskState.recognizer.reset();

  voskState.processor.onaudioprocess = (event) => {
    if (!isRecording || currentEngine !== 'vosk') return;

    const input = event.inputBuffer.getChannelData(0);
    const ok = voskState.recognizer.acceptWaveform(input, 48000);
    if (ok) {
      const result = voskState.recognizer.result();
      if (result?.text) updateTranscript({ finalChunk: result.text + ' ', partial: '' });
    } else {
      const partial = voskState.recognizer.partialResult();
      if (partial?.partial) updateTranscript({ finalChunk: '', partial: partial.partial });
    }
  };
}

function stopVoskRecording() {
  try {
    if (voskState.processor) voskState.processor.disconnect();
    if (voskState.audioContext) voskState.audioContext.close();
    if (voskState.mediaStream) voskState.mediaStream.getTracks().forEach((t) => t.stop());
  } catch (_) {}

  voskState.processor = null;
  voskState.audioContext = null;
  voskState.mediaStream = null;
}

// ===== Comandos (annyang) =====
function toggleAnnyang(shouldEnable) {
  if (!window.annyang) return;
  try {
    if (shouldEnable) {
      window.annyang.start({ autoRestart: true, continuous: true });
    } else {
      window.annyang.abort();
    }
  } catch (_) {}
}

function registerAnnyangCommands() {
  if (!window.annyang) return;

  const commands = {
    'punto': () => injectCommand('.'),
    'coma': () => injectCommand(','),
    'dos puntos': () => injectCommand(':'),
    'punto y coma': () => injectCommand(';'),
    'signo de interrogación': () => injectCommand('?'),
    'signo de exclamación': () => injectCommand('!'),
    'nueva línea': () => injectCommand('\n'),
    'borrar': () => injectCommand('{BACKSPACE}'),
  };

  window.annyang.addCommands(commands);
  window.annyang.addCallback('resultMatch', () => {
    areAnnyangCommandsReady = true;
  });
}

function injectCommand(token) {
  const now = Date.now();
  if (now - lastVoiceCommandAt < VOICE_COMMAND_COOLDOWN_MS) return;
  lastVoiceCommandAt = now;

  pendingInjectedCommands.push(token);
  hasInjectedTokens = true;
}

function applyInjectedCommands(text) {
  if (!pendingInjectedCommands.length) return text;

  let out = text;
  while (pendingInjectedCommands.length) {
    const cmd = pendingInjectedCommands.shift();
    if (cmd === '{BACKSPACE}') {
      out = out.replace(/\s*\S+\s*$/, '');
    } else {
      out += cmd;
    }
  }
  return out;
}

function applyVoicePunctuation(text, opts = {}) {
  const convertSingleWordPunctuation = opts.convertSingleWordPunctuation ?? true;
  let t = String(text || '');

  t = t.replace(/\s+([,.;:!?])/g, '$1');

  if (convertSingleWordPunctuation) {
    t = t.replace(/\b(punto)\b/gi, '.');
    t = t.replace(/\b(coma)\b/gi, ',');
    t = t.replace(/\b(dos puntos)\b/gi, ':');
    t = t.replace(/\b(punto y coma)\b/gi, ';');
    t = t.replace(/\b(signo de interrogación)\b/gi, '?');
    t = t.replace(/\b(signo de exclamación)\b/gi, '!');
  }

  t = t.replace(/\s{2,}/g, ' ');
  return t.trim();
}

function updateTranscript({ finalChunk, partial }) {
  if (!isRecording) return;

  if (finalChunk) {
    finalTranscript += finalChunk;
    lastFullFinal = finalTranscript;
    lastPartial = '';
  }

  if (partial !== undefined) {
    lastPartial = partial || '';
  }

  const combined = safeTrim(applyInjectedCommands(`${finalTranscript} ${lastPartial}`));
  previewBuffer = combined;
  transcriptBuffer = combined;

  if (recordingPreview) {
    recordingPreview.textContent = combined || 'Escuchando... habla con normalidad.';
  }
}

async function autocorrectTranscript(text, opts = {}) {
  // Corrección local simple (puedes conectar LanguageTool si quieres)
  const t = applyVoicePunctuation(text, opts);
  return t;
}

async function pickEngine() {
  const voskReady = await isVoskReady();

  // 1) Sin internet -> Vosk (si está listo)
  if (!navigator.onLine) {
    if (voskReady) {
      updateOfflineHint('');
      return 'vosk';
    }
    updateOfflineHint('Conéctate para dictado online (Whisper) o prepara el modo offline.');
    return null;
  }

  // 2) Con internet -> SOLO Whisper
  const canRecord = Boolean(navigator.mediaDevices && window.MediaRecorder);
  if (!canRecord) {
    updateOfflineHint('Tu navegador no soporta grabación para Whisper.');
    return null;
  }

  const whisperAvailable = await isWhisperAvailable();
  if (whisperAvailable) {
    updateOfflineHint('');
    return 'whisper';
  }

  updateOfflineHint('Whisper no está disponible ahora mismo. Verifica /api/health o usa modo offline sin internet.');
  return null;
}

async function startDictation() {
  const picked = await pickEngine();

  if (!picked) {
    alert('No hay motor de dictado disponible.');
    return;
  }

  transcriptBuffer = '';
  previewBuffer = '';
  finalTranscript = '';
  lastFullFinal = '';
  hasInjectedTokens = false;
  pendingInjectedCommands = [];
  recordingPreview.textContent = 'Escuchando... habla con normalidad.';
  isRecording = true;
  currentEngine = picked;
  bottomMenu.classList.add('recording');

  showNotebook();
  setActive(recordBtn);

  if (picked === 'whisper') {
    userStoppedRecognition = true;
    toggleAnnyang(false);
    recordingPreview.textContent = 'Escuchando (Whisper)… habla con normalidad.';
    await startWhisperRecording();
    return;
  }

  try {
    recordingPreview.textContent = 'Offline (Vosk)… habla con normalidad.';
    await startVoskRecording();
  } catch (error) {
    console.error('No se pudo iniciar Vosk:', error);
    isRecording = false;
    currentEngine = null;
    bottomMenu.classList.remove('recording');
    recordingPreview.textContent = 'No se pudo iniciar el dictado sin internet.';
  }
}

async function openSaveModal() {
  savePrompt.classList.remove('hidden');
  recordingTitleInput.value = '';
  recordingPreview.textContent = 'Corrigiendo texto...';

  const shouldConvertSingleWordPunctuation = !(currentEngine === 'webspeech' && areAnnyangCommandsReady);
  const correctedText = await autocorrectTranscript(finalTranscript, {
    convertSingleWordPunctuation: shouldConvertSingleWordPunctuation,
  });
  transcriptBuffer = correctedText;
  finalTranscript = correctedText;
  recordingPreview.textContent = correctedText || 'No se detectó voz en esta grabación.';
  recordingTitleInput.focus();
}

async function stopDictation() {
  if (!isRecording) return;

  // Mantén isRecording=true hasta detener el recorder, para no perder el último chunk de audio.
  bottomMenu.classList.remove('recording');

  if (currentEngine === 'whisper') {
    toggleAnnyang(false);
    await stopWhisperRecording();
  }

  if (currentEngine === 'vosk') {
    toggleAnnyang(false);
    stopVoskRecording();
  }

  isRecording = false;

  pendingInjectedCommands = [];
  const shouldConvertSingleWordPunctuation = !(currentEngine === 'webspeech' && areAnnyangCommandsReady);
  transcriptBuffer = applyVoicePunctuation(finalTranscript, {
    convertSingleWordPunctuation: shouldConvertSingleWordPunctuation,
  });
  finalTranscript = transcriptBuffer;
  recordingPreview.textContent = 'Grabación detenida.';
  await openSaveModal();
}

async function saveRecordingToNotebook() {
  const title = safeTrim(recordingTitleInput.value);
  const text = safeTrim(transcriptBuffer);

  savePrompt.classList.add('hidden');
  if (!text) return;

  ensurePages();
  const page = notebookState.pages[notebookState.currentPage];

  const bullet = title ? `📝 ${title}\n${text}` : `• ${text}`;
  page.entries.push({ text: bullet });

  // Si se pasó de MAX_CHARS_PER_PAGE, crea nueva página automáticamente
  const pageText = getPagePlainText(page);
  if (pageText.length > MAX_CHARS_PER_PAGE && notebookState.pages.length < MAX_PAGES) {
    notebookState.pages.push({ entries: [] });
    notebookState.currentPage = notebookState.pages.length - 1;
    notebookState.pages[notebookState.currentPage].entries.push({ text: bullet });
  }

  await saveNotebook();
  paintNotebook();

  transcriptBuffer = '';
  previewBuffer = '';
  finalTranscript = '';
  lastPartial = '';
  lastFullFinal = '';
}

function discardRecording() {
  savePrompt.classList.add('hidden');
  transcriptBuffer = '';
  previewBuffer = '';
  finalTranscript = '';
  lastPartial = '';
  lastFullFinal = '';
  recordingPreview.textContent = '';
}

function togglePencilMode() {
  isPencilMode = !isPencilMode;
  notebookSheet.contentEditable = String(isPencilMode);
  notebookSheet.classList.toggle('editable', isPencilMode);
  setActive(isPencilMode ? pencilBtn : null);
}

async function savePencilChanges() {
  ensurePages();
  const page = notebookState.pages[notebookState.currentPage];
  const text = safeTrim(notebookSheet.textContent);

  page.entries = text ? [{ text }] : [];
  await saveNotebook();
  paintNotebook();
}

function goToPage(newIndex) {
  ensurePages();
  if (newIndex < 0 || newIndex >= notebookState.pages.length) return;
  notebookState.currentPage = newIndex;
  paintNotebook();
  saveNotebook().catch(() => null);
}

function goPrevPage() {
  goToPage(notebookState.currentPage - 1);
}

function goNextPage() {
  goToPage(notebookState.currentPage + 1);
}

function handleSwipeStart(event) {
  const touch = event.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}

function handleSwipeEnd(event) {
  const touch = event.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;

  if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;

  if (dx > 0) goPrevPage();
  else goNextPage();
}

async function prepareOffline() {
  try {
    updateOfflineHint('Preparando recursos offline… esto puede tardar un momento.');

    const cache = await caches.open(OFFLINE_CACHE_NAME);
    // cachea modelo + runtime
    await cache.addAll([
      './offline/vosk/vosk.js',
      './offline/vosk/vosk.wasm',
      './offline/model.tar.gz',
    ]);

    localStorage.setItem(VOSK_READY_KEY, 'true');
    updateOfflineHint('Modo offline listo. Puedes desconectarte y dictar con Vosk.');
  } catch (error) {
    console.error('Error preparando offline:', error);
    updateOfflineHint('No se pudo preparar el modo offline. Intenta de nuevo con buena conexión.');
  }
}

recordBtn.addEventListener('click', async () => {
  if (!isRecording) {
    await startDictation();
    return;
  }
  await stopDictation();
});

notesBtn.addEventListener('click', () => {
  if (notebookView.classList.contains('hidden')) {
    showNotebook();
    setActive(notesBtn);
  } else if (!notebookState.pages.some((page) => getPagePlainText(page).trim())) {
    showWelcome();
    setActive(null);
  }
});

pencilBtn.addEventListener('click', async () => {
  togglePencilMode();
  if (!isPencilMode) {
    await savePencilChanges();
  }
});

saveBtn.addEventListener('click', async () => {
  await saveRecordingToNotebook();
});

discardBtn.addEventListener('click', () => {
  discardRecording();
});

trashBtn.addEventListener('click', async () => {
  await clearNotebook();
});

prevPageBtn.addEventListener('click', () => {
  goPrevPage();
});

nextPageBtn.addEventListener('click', () => {
  goNextPage();
});

notebookSheet.addEventListener('touchstart', handleSwipeStart, { passive: true });
notebookSheet.addEventListener('touchend', handleSwipeEnd, { passive: true });

prepareOfflineBtn.addEventListener('click', async () => {
  await prepareOffline();
});

window.addEventListener('online', () => {
  whisperAvailableCache = null;
  updateOfflineHint('');
});

window.addEventListener('offline', async () => {
  if (!(await isVoskReady())) {
    updateOfflineHint('Conéctate una vez para habilitar dictado sin internet.');
  }
});

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  try {
    await navigator.serviceWorker.register('./sw.js');
  } catch (error) {
    console.warn('No se pudo registrar Service Worker:', error);
  }
}

async function bootstrap() {
  registerAnnyangCommands();

  notebookState = await loadNotebook();
  if (!notebookState) notebookState = { ...notebookStateTemplate };

  ensurePages();
  paintNotebook();

  const hasAnyText = notebookState.pages.some((page) => getPagePlainText(page).trim());
  if (hasAnyText) showNotebook();
  else showWelcome();

  await registerServiceWorker();

  // Mensajes iniciales
  if (!navigator.onLine) {
    const ready = await isVoskReady();
    if (!ready) updateOfflineHint('Conéctate una vez para habilitar dictado sin internet.');
  }
}

bootstrap().catch((error) => {
  console.error('Error iniciando app:', error);
});
