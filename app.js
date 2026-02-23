const welcomePanel = document.getElementById('welcomePanel');
const notebookView = document.getElementById('notebookView');
const notebookSheet = document.getElementById('notebookSheet');
const bottomMenu = document.getElementById('bottomMenu');
const recordBtn = document.getElementById('recordBtn');
const notesBtn = document.getElementById('notesBtn');
const pencilBtn = document.getElementById('pencilBtn');
const pageBtn = document.getElementById('pageBtn');
const settingsBtn = document.getElementById('settingsBtn');
const pageIndicator = document.getElementById('pageIndicator');
const pageTitleEl = document.getElementById('pageTitle');
const pageNumberEl = document.getElementById('pageNumber');
const recordingPreview = document.getElementById('recordingPreview');
const savePrompt = document.getElementById('savePrompt');
const recordingTitleInput = document.getElementById('recordingTitle');
const saveTranscriptBtn = document.getElementById('saveTranscript');
const cancelSaveBtn = document.getElementById('cancelSave');
const notebookGrid = document.getElementById('notebookGrid');
const saveDocumentBtn = document.getElementById('saveDocument');
const openSavedBtn = document.getElementById('openSaved');
const deleteDocumentBtn = document.getElementById('deleteDocument');
const exportDocBtn = document.getElementById('exportDoc');
const imageButton = document.getElementById('imageButton');
const photoButton = document.getElementById('photoButton');
const galleryButton = document.getElementById('galleryButton');
const backgroundBtn = document.getElementById('backgroundBtn');
const backgroundPicker = document.getElementById('backgroundPicker');
const backgroundOverlay = document.getElementById('backgroundOverlay');
const backgroundImageInput = document.getElementById('backgroundImageInput');
const backgroundCameraBtn = document.getElementById('backgroundCameraBtn');
const backgroundGalleryBtn = document.getElementById('backgroundGalleryBtn');
const backgroundRemoveBtn = document.getElementById('backgroundRemoveBtn');
const backgroundCloseBtn = document.getElementById('backgroundCloseBtn');
const pageModal = document.getElementById('pageModal');
const pageModalOverlay = document.getElementById('pageModalOverlay');
const pagesList = document.getElementById('pagesList');
const addPageBtn = document.getElementById('addPage');
const closePagesBtn = document.getElementById('closePages');
const settingsModal = document.getElementById('settingsModal');
const settingsModalOverlay = document.getElementById('settingsModalOverlay');
const saveSettingsBtn = document.getElementById('saveSettings');
const closeSettingsBtn = document.getElementById('closeSettings');

const engineWebspeechRadio = document.getElementById('engineWebspeech');
const engineWhisperRadio = document.getElementById('engineWhisper');
const engineVoskRadio = document.getElementById('engineVosk');
const engineStatusEl = document.getElementById('engineStatus');
const offlineHintEl = document.getElementById('offlineHint');

const WHISPER_CHUNK_MS = 3500;                // tamaño de chunk (ms)
const WHISPER_SILENCE_THRESHOLD = 0.012;      // umbral RMS para “hablando”
const WHISPER_SILENCE_GRACE_MS = 2800;        // tiempo máximo tras última voz para seguir enviando chunks

let isRecording = false;
let transcriptBuffer = '';
let finalTranscript = '';
let currentNote = '';
let currentTitle = '';
let currentEngine = 'webspeech';

let areAnnyangCommandsReady = false;
let annyangCommandsSet = false;

let lastPartial = '';
let lastFullFinal = '';

const notebook = {
  title: 'Mi cuaderno',
  pages: [
    {
      id: crypto.randomUUID(),
      title: 'Página 1',
      background: '',
      entries: [],
    },
  ],
  currentPageId: null,
};

notebook.currentPageId = notebook.pages[0].id;

let pendingInjectedCommands = [];

// ========== Persistencia ==========
function loadSavedNotebook() {
  const raw = localStorage.getItem('cuadernoVoz');
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.pages) return;
    notebook.title = parsed.title || notebook.title;
    notebook.pages = parsed.pages;
    notebook.currentPageId = parsed.currentPageId || notebook.pages?.[0]?.id || null;
  } catch (err) {
    console.warn('Error cargando cuaderno:', err);
  }
}

function saveNotebook() {
  localStorage.setItem('cuadernoVoz', JSON.stringify(notebook));
}

// ========== UI ==========
function getCurrentPage() {
  return notebook.pages.find((p) => p.id === notebook.currentPageId) || notebook.pages[0];
}

function renderNotebook() {
  const page = getCurrentPage();
  pageTitleEl.textContent = page.title;
  pageNumberEl.textContent = `${notebook.pages.findIndex((p) => p.id === page.id) + 1}/${notebook.pages.length}`;

  notebookGrid.innerHTML = '';
  if (page.background) {
    notebookSheet.style.backgroundImage = `url("${page.background}")`;
    notebookSheet.classList.add('has-bg');
  } else {
    notebookSheet.style.backgroundImage = '';
    notebookSheet.classList.remove('has-bg');
  }

  if (!page.entries.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-note';
    empty.textContent = 'Sin notas aún. Pulsa el micrófono para empezar.';
    notebookGrid.appendChild(empty);
    return;
  }

  page.entries.forEach((entry) => {
    const card = document.createElement('div');
    card.className = 'note-card';

    const title = document.createElement('div');
    title.className = 'note-title';
    title.textContent = entry.title || 'Nota';
    card.appendChild(title);

    const body = document.createElement('div');
    body.className = 'note-body';
    body.textContent = entry.text;
    card.appendChild(body);

    if (entry.createdAt) {
      const meta = document.createElement('div');
      meta.className = 'note-meta';
      meta.textContent = new Date(entry.createdAt).toLocaleString();
      card.appendChild(meta);
    }

    notebookGrid.appendChild(card);
  });
}

function showNotebookView() {
  welcomePanel.classList.add('hidden');
  notebookView.classList.remove('hidden');
  renderNotebook();
}

function updateRecordButton() {
  recordBtn.classList.toggle('active', isRecording);
  bottomMenu.classList.toggle('recording', isRecording);
  recordBtn.setAttribute('aria-pressed', String(isRecording));
}

function updateEngineStatus(text) {
  if (engineStatusEl) engineStatusEl.textContent = text || '';
}

function updateOfflineHint(text) {
  if (offlineHintEl) offlineHintEl.textContent = text || '';
}

// ========== WebSpeech (online) ==========
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const hasWebSpeech = Boolean(SpeechRecognition);

let recognition = null;

function initWebSpeech() {
  if (!hasWebSpeech) return;
  recognition = new SpeechRecognition();
  recognition.lang = 'es-ES';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const tr = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        final += tr + ' ';
      } else {
        interim += tr;
      }
    }
    updateTranscript({ finalChunk: final, partial: interim });
  };

  recognition.onerror = (event) => {
    console.warn('WebSpeech error:', event?.error);
  };

  recognition.onend = () => {
    if (isRecording && currentEngine === 'webspeech') {
      try { recognition.start(); } catch {}
    }
  };
}

// ========== Annyang (comandos) ==========
function toggleAnnyang(enable) {
  if (!window.annyang) return;
  if (enable) {
    try {
      window.annyang.start({ autoRestart: true, continuous: true });
    } catch {}
  } else {
    try { window.annyang.abort(); } catch {}
  }
}

function setAnnyangCommands() {
  if (!window.annyang || annyangCommandsSet) return;

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

  annyangCommandsSet = true;
}

function injectCommand(token) {
  pendingInjectedCommands.push(token);
}

// ========== Utilidades texto ==========
function safeTrim(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
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
  transcriptBuffer = combined;

  if (recordingPreview) {
    recordingPreview.textContent = combined || 'Escuchando... habla con normalidad.';
  }
}

// ========== Autocorrección simple (local) ==========
async function autocorrectTranscript(text, opts = {}) {
  const t = applyVoicePunctuation(text, opts);
  return t;
}

// ========== Whisper (Vercel /api/transcribe) ==========
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

function rmsFromAnalyser(analyserNode, dataArray) {
  analyserNode.getByteTimeDomainData(dataArray);
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const v = (dataArray[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / dataArray.length);
}

function startWhisperLevelMonitor() {
  const tick = () => {
    if (!whisperState.analyserNode || !whisperState.analyserData) return;
    const rms = rmsFromAnalyser(whisperState.analyserNode, whisperState.analyserData);
    const now = Date.now();
    if (rms >= WHISPER_SILENCE_THRESHOLD) {
      whisperState.lastSpeechAt = now;
    }
    whisperState.monitorRaf = requestAnimationFrame(tick);
  };
  whisperState.monitorRaf = requestAnimationFrame(tick);
}

async function sendWhisperChunk(blob, promptText = '') {
  const fd = new FormData();
  fd.append('file', blob, 'audio.webm');
  fd.append('prompt', promptText || '');

  const resp = await fetch('/api/transcribe', {
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

    const context = safeTrim(lastFullFinal || finalTranscript).slice(-240);
    const text = await sendWhisperChunk(next, context);
    if (text) {
      updateTranscript({ finalChunk: text, partial: '' });
    }
  } catch (error) {
    console.warn('Error transcribiendo chunk (Whisper):', error);
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

function startWhisperRecording() {
  whisperState.sentFirstChunk = false;
  whisperState.stopped = false;
  whisperState.queue = [];
  whisperState.inFlight = false;
  whisperState.lastSpeechAt = Date.now();

  whisperState.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  whisperState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  if (whisperState.audioContext.state === 'suspended') {
    await whisperState.audioContext.resume().catch(() => null);
  }
  const source = whisperState.audioContext.createMediaStreamSource(whisperState.mediaStream);
  whisperState.analyserNode = whisperState.audioContext.createAnalyser();
  whisperState.analyserNode.fftSize = 2048;
  whisperState.analyserData = new Uint8Array(whisperState.analyserNode.fftSize);
  source.connect(whisperState.analyserNode);
  startWhisperLevelMonitor();

  const candidates = [
    'audio/webm;codecs=opus',
    'audio/ogg;codecs=opus',
    'audio/webm',
    'audio/ogg',
  ];
  const mimeType = candidates.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));

  whisperState.mediaRecorder = new MediaRecorder(whisperState.mediaStream, mimeType ? { mimeType } : undefined);

  whisperState.mediaRecorder.ondataavailable = (e) => {
    if (!isRecording || currentEngine !== 'whisper') return;
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
    await new Promise((r) => setTimeout(r, 120));
  }
}

async function stopWhisperRecording() {
  whisperState.stopped = true;

  if (whisperState.monitorRaf) {
    cancelAnimationFrame(whisperState.monitorRaf);
    whisperState.monitorRaf = 0;
  }

  if (whisperState.mediaRecorder && whisperState.mediaRecorder.state !== 'inactive') {
    await new Promise((resolve) => {
      whisperState.mediaRecorder.addEventListener('stop', resolve, { once: true });
      whisperState.mediaRecorder.stop();
    });
  }

  if (whisperState.mediaStream) {
    whisperState.mediaStream.getTracks().forEach((t) => t.stop());
  }

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

// ========== Vosk (offline) ==========
const VOSK_ASSETS = {
  JS: './offline/vosk/vosk.js',
  WASM: './offline/vosk/vosk.wasm',
  MODEL: './offline/vosk-model-small-es-0.42',
  MODEL_TAR: './offline/model.tar.gz',
};

let voskState = {
  worker: null,
  audioContext: null,
  scriptNode: null,
  mediaStream: null,
  modelReady: false,
  recognizing: false,
};

async function isVoskReady() {
  try {
    const cacheName = 'vosk-model-cache-v1';
    const cache = await caches.open(cacheName);
    const modelReadme = await cache.match(`${VOSK_ASSETS.MODEL}/README`);
    return Boolean(modelReadme);
  } catch {
    return false;
  }
}

function startVoskRecording() {
  // placeholder: tu lógica actual offline
}

function stopVoskRecording() {
  // placeholder: tu lógica actual offline
}

// ========== Selección motor ==========
async function pickEngine() {
  const voskReady = await isVoskReady();

  if (!navigator.onLine) {
    if (voskReady) {
      updateOfflineHint('');
      return 'vosk';
    }
    updateOfflineHint('Conéctate para dictado online (Whisper) o prepara Vosk para dictado offline.');
    return hasWebSpeech ? 'webspeech' : 'whisper';
  }

  updateOfflineHint('');
  return currentEngine || (hasWebSpeech ? 'webspeech' : 'whisper');
}

function applyEngineFromSettings() {
  if (engineWhisperRadio?.checked) currentEngine = 'whisper';
  else if (engineVoskRadio?.checked) currentEngine = 'vosk';
  else currentEngine = 'webspeech';
}

function setEngineUI(engine) {
  if (!engineWebspeechRadio || !engineWhisperRadio || !engineVoskRadio) return;
  engineWebspeechRadio.checked = engine === 'webspeech';
  engineWhisperRadio.checked = engine === 'whisper';
  engineVoskRadio.checked = engine === 'vosk';
}

// ========== Modal guardar ==========
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

async function saveTranscript() {
  savePrompt.classList.add('hidden');
  if (!transcriptBuffer.trim()) return;

   const currentPage = getCurrentPage();
  const hasPreviousEntry = currentPage.entries.length > 0;
  const hasCustomTitle = Boolean(recordingTitleInput.value.trim());
  const continueWithPreviousEntry = hasPreviousEntry && !hasCustomTitle;
  
  await addTextToCurrentPage(`• ${transcriptBuffer.trim()}`, {
    title: recordingTitleInput.value,
    continueWithPreviousEntry,
  });

  transcriptBuffer = '';
  finalTranscript = '';
  lastPartial = '';
  lastFullFinal = '';
  recordingPreview.textContent = '';
  renderNotebook();
}

function cancelSave() {
  savePrompt.classList.add('hidden');
  transcriptBuffer = '';
  finalTranscript = '';
  lastPartial = '';
  lastFullFinal = '';
  recordingPreview.textContent = '';
}

// ========== Notas / páginas ==========
async function addTextToCurrentPage(text, opts = {}) {
  const page = getCurrentPage();
  const title = opts.title?.trim();

  if (opts.continueWithPreviousEntry && page.entries.length) {
    page.entries[page.entries.length - 1].text += `\n${text}`;
  } else {
    page.entries.push({
      id: crypto.randomUUID(),
      title: title || `Nota ${page.entries.length + 1}`,
      text,
      createdAt: Date.now(),
    });
  }

  saveNotebook();
}

function openPagesModal() {
  pageModal.classList.remove('hidden');
  renderPagesList();
}

function closePagesModal() {
  pageModal.classList.add('hidden');
}

function renderPagesList() {
  pagesList.innerHTML = '';
  notebook.pages.forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = 'page-item';
    item.textContent = `${idx + 1}. ${p.title}`;
    item.onclick = () => {
      notebook.currentPageId = p.id;
      saveNotebook();
      renderNotebook();
      closePagesModal();
    };
    pagesList.appendChild(item);
  });
}

function addPage() {
  const n = notebook.pages.length + 1;
  const page = {
    id: crypto.randomUUID(),
    title: `Página ${n}`,
    background: '',
    entries: [],
  };
  notebook.pages.push(page);
  notebook.currentPageId = page.id;
  saveNotebook();
  renderNotebook();
  renderPagesList();
}

// ========== Settings ==========
function openSettingsModal() {
  settingsModal.classList.remove('hidden');
  setEngineUI(currentEngine);
  updateEngineStatus('');
}

function closeSettingsModal() {
  settingsModal.classList.add('hidden');
}

function saveSettings() {
  applyEngineFromSettings();
  saveNotebook();
  closeSettingsModal();
}

// ========== Grabación (control central) ==========
async function startDictation() {
  if (isRecording) return;

  currentEngine = await pickEngine();
  setEngineUI(currentEngine);

  finalTranscript = '';
  transcriptBuffer = '';
  lastPartial = '';
  lastFullFinal = '';
  pendingInjectedCommands = [];

  if (recordingPreview) recordingPreview.textContent = 'Escuchando... habla con normalidad.';

  isRecording = true;
  updateRecordButton();

  if (currentEngine === 'webspeech') {
    if (window.annyang) {
      setAnnyangCommands();
      toggleAnnyang(true);
    }
    if (!recognition) initWebSpeech();
    try { recognition.start(); } catch {}
    updateEngineStatus('Motor: WebSpeech (online)');
    return;
  }

  if (currentEngine === 'whisper') {
    if (window.annyang) {
      setAnnyangCommands();
      toggleAnnyang(true);
    }
    updateEngineStatus('Motor: Whisper (online)');
    await startWhisperRecording();
    return;
  }

  if (currentEngine === 'vosk') {
    if (window.annyang) {
      setAnnyangCommands();
      toggleAnnyang(true);
    }
    updateEngineStatus('Motor: Vosk (offline)');
    startVoskRecording();
  }
}

async function toggleRecording() {
  if (!isRecording) {
    await startDictation();
  } else {
    if (recognition && currentEngine === 'webspeech') {
      try { recognition.stop(); } catch {}
    }
    await stopDictation();
    updateRecordButton();
  }
}

// ========== Background ==========
function openBackgroundPicker() {
  backgroundPicker.classList.remove('hidden');
}

function closeBackgroundPicker() {
  backgroundPicker.classList.add('hidden');
}

function setBackground(dataUrl) {
  const page = getCurrentPage();
  page.background = dataUrl || '';
  saveNotebook();
  renderNotebook();
}

backgroundBtn?.addEventListener('click', openBackgroundPicker);
backgroundOverlay?.addEventListener('click', closeBackgroundPicker);
backgroundCloseBtn?.addEventListener('click', closeBackgroundPicker);

backgroundRemoveBtn?.addEventListener('click', () => {
  setBackground('');
  closeBackgroundPicker();
});

backgroundImageInput?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    setBackground(String(reader.result || ''));
    closeBackgroundPicker();
  };
  reader.readAsDataURL(file);
});

backgroundCameraBtn?.addEventListener('click', () => {
  backgroundImageInput?.setAttribute('capture', 'environment');
  backgroundImageInput?.click();
});

backgroundGalleryBtn?.addEventListener('click', () => {
  backgroundImageInput?.removeAttribute('capture');
  backgroundImageInput?.click();
});

// ========== Export / borrar ==========
function exportNotebook() {
  const blob = new Blob([JSON.stringify(notebook, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(notebook.title || 'cuaderno').replace(/\s+/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function deleteNotebook() {
  if (!confirm('¿Borrar todo el cuaderno?')) return;
  localStorage.removeItem('cuadernoVoz');
  location.reload();
}

// ========== Eventos ==========
recordBtn?.addEventListener('click', toggleRecording);
saveTranscriptBtn?.addEventListener('click', saveTranscript);
cancelSaveBtn?.addEventListener('click', cancelSave);

pageBtn?.addEventListener('click', openPagesModal);
pageModalOverlay?.addEventListener('click', closePagesModal);
closePagesBtn?.addEventListener('click', closePagesModal);
addPageBtn?.addEventListener('click', addPage);

settingsBtn?.addEventListener('click', openSettingsModal);
settingsModalOverlay?.addEventListener('click', closeSettingsModal);
closeSettingsBtn?.addEventListener('click', closeSettingsModal);
saveSettingsBtn?.addEventListener('click', saveSettings);

exportDocBtn?.addEventListener('click', exportNotebook);
deleteDocumentBtn?.addEventListener('click', deleteNotebook);

// ========== Init ==========
loadSavedNotebook();
showNotebookView();
if (hasWebSpeech) initWebSpeech();
updateRecordButton();
