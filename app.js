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

const OFFLINE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './offline/libs/annyang.min.js',
  './offline/vosk/vosk.js',
  './offline/vosk/vosk.wasm',
  './offline/model.tar.gz',
  './offline/vosk-model-small-es-0.42/README',
  './offline/vosk-model-small-es-0.42/am/final.mdl',
  './offline/vosk-model-small-es-0.42/conf/mfcc.conf',
  './offline/vosk-model-small-es-0.42/conf/model.conf',
  './offline/vosk-model-small-es-0.42/graph/Gr.fst',
  './offline/vosk-model-small-es-0.42/graph/HCLr.fst',
  './offline/vosk-model-small-es-0.42/graph/disambig_tid.int',
  './offline/vosk-model-small-es-0.42/graph/phones/word_boundary.int',
  './offline/vosk-model-small-es-0.42/ivector/final.dubm',
  './offline/vosk-model-small-es-0.42/ivector/final.ie',
  './offline/vosk-model-small-es-0.42/ivector/final.mat',
  './offline/vosk-model-small-es-0.42/ivector/global_cmvn.stats',
  './offline/vosk-model-small-es-0.42/ivector/online_cmvn.conf',
  './offline/vosk-model-small-es-0.42/ivector/splice.conf',
];

let isRecording = false;
let isEditable = false;
let transcriptBuffer = '';
let previewBuffer = '';
let finalTranscript = '';
let lastFullFinal = '';
let hasInjectedTokens = false;
let recognition;
let db;
let isAnimatingPage = false;
let touchStartX = 0;
let touchStartY = 0;

let userStoppedRecognition = false;
let currentEngine = null;
let lastVoiceCommandAt = 0;
let areAnnyangCommandsReady = false;
let correctionInFlight = false;
let lastCorrectionSourceText = '';
let lastCorrectionResultText = '';

const ANNYANG_COMMAND_PATTERNS = [
  'coma',
  'coman',
  'comas',
  'punto',
  'dos puntos',
  'punto y coma',
  'abre interrogacion',
  'cierra interrogacion',
  'abre exclamacion',
  'cierra exclamacion',
  'nueva linea',
  'nuevo parrafo',
];


const voskState = {
  model: null,
  recognizer: null,
  audioContext: null,
  sourceNode: null,
  processorNode: null,
  mediaStream: null,
};

let notebookState = {
  id: NOTEBOOK_ID,
  currentPage: 0,
  pages: [{ entries: [] }],
};

function sanitize(text = '') {
  return text
 .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeTrim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePages(pages = []) {
  if (!pages.length) return [{ entries: [] }];

  return pages.map((page) => {
    if (Array.isArray(page.entries)) {
      return {
        entries: page.entries
          .map((entry) => ({
            title: entry.title || '',
            text: entry.text || '',
          }))
          .filter((entry) => entry.title.trim() || entry.text.trim()),
      };
    }

    const legacyText = page.content || '';
    return legacyText.trim()
      ? { entries: [{ title: '', text: legacyText }] }
      : { entries: [] };
  });
}


function setActive(button) {
  [pencilBtn, recordBtn, notesBtn].forEach((btn) => btn.classList.remove('ativo'));
  if (button) button.classList.add('ativo');
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function loadNotebook() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(NOTEBOOK_ID);

    request.onsuccess = () => {
      const saved = request.result;
      if (saved && Array.isArray(saved.pages) && saved.pages.length) {
        notebookState = {
          id: NOTEBOOK_ID,
          currentPage: Number.isInteger(saved.currentPage) ? saved.currentPage : 0,
          pages: normalizePages(saved.pages),
        };
      }

      notebookState.currentPage = Math.min(
        Math.max(0, notebookState.currentPage),
        notebookState.pages.length - 1,
      );
      resolve();
    };

    request.onerror = () => reject(request.error);
  });
}

function saveNotebook() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(notebookState);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function getCurrentPage() {
  if (!notebookState.pages.length) {
    notebookState.pages = [{ entries: [] }];
    notebookState.currentPage = 0;
  }
  return notebookState.pages[notebookState.currentPage];
}

function getPagePlainText(page) {
  return page.entries
    .map((entry) => [safeTrim(entry.title), safeTrim(entry.text)].filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n\n');
}

function paintNotebook() {
  const currentPage = getCurrentPage();
  notebookSheet.innerHTML = currentPage.entries
    .map((entry) => {
      const safeTitle = sanitize(entry.title.trim());
      const safeText = sanitize(entry.text.trim());
     return `<section class="entry-block">${safeTitle ? `<h3>${safeTitle}</h3>` : ''}${safeText ? `<p>${safeText}</p>` : ''}</section>`;
    })
    .join('') || '<p class="empty-note">Esta página está vacía.</p>';

  currentPageNumber.textContent = String(notebookState.currentPage + 1);
  totalPages.textContent = String(notebookState.pages.length);
  pageIndicator.setAttribute('aria-label', `Página ${notebookState.currentPage + 1} de ${notebookState.pages.length}`);
  prevPageNumber.textContent = notebookState.currentPage > 0 ? String(notebookState.currentPage) : '—';
  nextPageNumber.textContent = notebookState.currentPage < MAX_PAGES - 1
    ? String(notebookState.currentPage + 2)
       : '—';
  prevPageBtn.disabled = notebookState.currentPage === 0;
  nextPageBtn.disabled = notebookState.currentPage >= MAX_PAGES - 1;
}

function showNotebook() {
  welcomePanel.classList.add('hidden');
  notebookView.classList.remove('hidden');
}

function showWelcome() {
  notebookView.classList.add('hidden');
  welcomePanel.classList.remove('hidden');
}

function ensureSpaceForText(text) {
  let currentPage = getCurrentPage();
  if (!getPagePlainText(currentPage).trim()) return;

  const expected = `${getPagePlainText(currentPage)}\n\n${text}`;
  if (expected.length > MAX_CHARS_PER_PAGE && notebookState.pages.length < MAX_PAGES) {
    notebookState.pages.push({ entries: [] });
    notebookState.currentPage = notebookState.pages.length - 1;
    currentPage = getCurrentPage();
    currentPage.entries = [];
  }
}

async function addTextToCurrentPage(text, {
  title = '',
  forceNewPage = false,
  continueWithPreviousEntry = false,
} = {}) {
  if (!text.trim()) return;

  if (forceNewPage && getPagePlainText(getCurrentPage()).trim()) {
    notebookState.pages.push({ entries: [] });
    notebookState.currentPage = notebookState.pages.length - 1;
  }

  ensureSpaceForText(text);

  const page = getCurrentPage();
const trimmedTitle = title.trim();

  if (continueWithPreviousEntry && page.entries.length) {
    const lastEntry = page.entries[page.entries.length - 1];
    const separator = lastEntry.text.trim() ? '\n\n' : '';
    lastEntry.text = `${lastEntry.text}${separator}${text}`;
  } else {
    page.entries.push({ title: trimmedTitle, text });
  }
  
  await saveNotebook();
  paintNotebook();
}

async function animatePageTurn(targetPage) {
  if (isAnimatingPage || targetPage === notebookState.currentPage) return;

  isAnimatingPage = true;
  const movingForward = targetPage > notebookState.currentPage;
  notebookSheet.classList.remove('page-slide-in-left', 'page-slide-in-right', 'page-slide-out-left', 'page-slide-out-right');
  notebookSheet.classList.add(movingForward ? 'page-slide-out-left' : 'page-slide-out-right');

  await new Promise((resolve) => setTimeout(resolve, 170));
  await goToPage(targetPage);

  notebookSheet.classList.remove('page-slide-out-left', 'page-slide-out-right');
  notebookSheet.classList.add(movingForward ? 'page-slide-in-right' : 'page-slide-in-left');

  await new Promise((resolve) => setTimeout(resolve, 170));
  notebookSheet.classList.remove('page-slide-in-left', 'page-slide-in-right');
  isAnimatingPage = false;
}

async function goNextPageAnimated() {
  if (notebookState.currentPage >= MAX_PAGES - 1) return;

  if (notebookState.currentPage === notebookState.pages.length - 1) {
    notebookState.pages.push({ entries: [] });
  }

  await animatePageTurn(notebookState.currentPage + 1);
}

async function goPrevPageAnimated() {
  if (notebookState.currentPage <= 0) return;
  await animatePageTurn(notebookState.currentPage - 1);
}

function removeAccents(text = '') {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeCommandText(text = '') {
  const t = removeAccents(text.toLowerCase()).trim();

  // Misheard comunes
  if (t === 'coman' || t === 'comas') return 'coma';

  return t;
}

function normalizeForTranscriptCompare(text = '') {
  return removeAccents(String(text).toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function mergeTranscriptChunk(baseText = '', chunkText = '') {
  const base = safeTrim(baseText);
  const chunk = safeTrim(chunkText);
  const normalizedBase = normalizeForTranscriptCompare(base);
  const normalizedChunk = normalizeForTranscriptCompare(chunk);

  if (!chunk) return base;
  if (!base) return chunk;
  if (base === chunk || base.endsWith(chunk)) return base;
  if (chunk.startsWith(base)) return chunk;

  if (normalizedBase && normalizedChunk) {
    if (normalizedBase === normalizedChunk || normalizedBase.endsWith(normalizedChunk)) return base;
    if (normalizedChunk.startsWith(normalizedBase)) return chunk;
  }
  const baseWords = base.split(/\s+/).filter(Boolean);
  const chunkWords = chunk.split(/\s+/).filter(Boolean);
  const normalizedBaseWords = normalizedBase.split(/\s+/).filter(Boolean);
  const normalizedChunkWords = normalizedChunk.split(/\s+/).filter(Boolean);
  const maxOverlap = Math.min(baseWords.length, chunkWords.length);

  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
  const baseTail = normalizedBaseWords.slice(-overlap).join(' ');
  const chunkHead = normalizedChunkWords.slice(0, overlap).join(' ');

    if (baseTail === chunkHead) {
      return `${base} ${chunkWords.slice(overlap).join(' ')}`.trim();
    }
  }

  return `${base} ${chunk}`.trim();
}
function dedupeChunkAgainstTail(baseText = '', chunkText = '') {
  const base = safeTrim(baseText);
  const chunk = safeTrim(chunkText);
  const normalizedBase = normalizeForTranscriptCompare(base);
  const normalizedChunk = normalizeForTranscriptCompare(chunk);
  
  if (!base || !chunk) return chunk;
  if (base.endsWith(chunk)) return '';
  if (normalizedBase && normalizedChunk && normalizedBase.endsWith(normalizedChunk)) return '';

const baseWords = normalizedBase.split(/\s+/).filter(Boolean);
  const chunkWords = normalizedChunk.split(/\s+/).filter(Boolean);
  const originalChunkWords = chunk.split(/\s+/).filter(Boolean);
  const maxOverlap = Math.min(baseWords.length, chunkWords.length);
  
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
const tail = baseWords.slice(-overlap).join(' ');
    const head = chunkWords.slice(0, overlap).join(' ');

    if (tail === head) {
      return originalChunkWords.slice(overlap).join(' ').trim();
    }
  }

  return chunk;
}

function longestCommonPrefixLen(a = '', b = '') {
  const s1 = String(a);
  const s2 = String(b);
  const max = Math.min(s1.length, s2.length);
  let i = 0;
  for (; i < max; i += 1) {
    if (s1[i].toLowerCase() !== s2[i].toLowerCase()) break;
  }
  return i;
}

function normalizeDictationChunk(chunkText = '') {
  let normalized = safeTrim(chunkText);
  if (!normalized) return '';

  normalized = normalized.replace(/\bpara\s+asi\b/gi, 'para sí');
  normalized = normalized.replace(
    /\b(g[ée]nesis|exodo|[ée]xodo|levitico|levítico|numeros|números|deuteronomio|josue|josué|jueces|rut|1\s*samuel|2\s*samuel|1\s*reyes|2\s*reyes|1\s*cronicas|1\s*crónicas|2\s*cronicas|2\s*crónicas|esdras|nehemias|nehemías|ester|job|salmos|proverbios|eclesiastes|eclesiastés|isaias|isaías|jeremias|jeremías|ezequiel|daniel|oseas|joel|amos|abdias|abdías|jonas|jonás|miqueas|nahum|habacuc|sofonias|sofonías|hageo|zacarias|zacarías|malaquias|malaquías|mateo|marcos|lucas|juan|hechos|romanos|1\s*corintios|2\s*corintios|galatas|gálatas|efesios|filipenses|colosenses|1\s*tesalonicenses|2\s*tesalonicenses|1\s*timoteo|2\s*timoteo|tito|filemon|filémon|hebreos|santiago|1\s*pedro|2\s*pedro|1\s*juan|2\s*juan|3\s*juan|judas|apocalipsis)\s+(\d)(\d{1,2})\b/gi,
    '$1 $2:$3',
  );

  return normalized;
}
function removeProgressiveRestarts(chunkText = '') {
  const words = safeTrim(chunkText).split(/\s+/).filter(Boolean);
  if (words.length < 6) return safeTrim(chunkText);

  const normalizedWords = words.map((word) => normalizeForTranscriptCompare(word));
  let startIndex = 0;
  let keepSearching = true;

  while (keepSearching) {
    keepSearching = false;
    const pivotWords = normalizedWords.slice(startIndex);
    const maxRestartIndex = pivotWords.length - 3;

    for (let i = 2; i < maxRestartIndex; i += 1) {
      if (pivotWords[i] !== pivotWords[0]) continue;

      let prefixLen = 0;
      while (
        i + prefixLen < pivotWords.length
        && prefixLen < pivotWords.length
        && pivotWords[prefixLen] === pivotWords[i + prefixLen]
      ) {
        prefixLen += 1;
      }

      if (prefixLen >= 3) {
        startIndex += i;
        keepSearching = true;
        break;
      }
    }
  }

  return words.slice(startIndex).join(' ').trim();
}
function collectFinalSegments(results = []) {
  const finalSegments = [];
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    const text = safeTrim(result?.[0]?.transcript || '');
    if (!text || !result?.isFinal) continue;
    finalSegments.push(text);
  }
  return finalSegments;
}

function collapseFinalSegments(segments = []) {
  // Colapsa re-segmentaciones típicas de WebSpeech:
  // - si el último segmento es un prefijo del nuevo, se reemplaza por el nuevo
  // - si el nuevo es un prefijo del último, se ignora
  // - si son muy similares pero no prefijo exacto, se conserva el más largo
  const out = [];
  const norm = (t) => normalizeForTranscriptCompare(t);

  for (const seg of segments) {
    const text = safeTrim(seg);
    if (!text) continue;

    if (!out.length) {
      out.push(text);
      continue;
    }

    const last = out[out.length - 1];
    const nLast = norm(last);
    const nText = norm(text);

    if (!nLast || !nText) {
      out.push(text);
      continue;
    }

    if (nText.startsWith(nLast)) {
      out[out.length - 1] = text;
      continue;
    }

    if (nLast.startsWith(nText)) {
      continue;
    }

    // Similaridad alta: si comparten un prefijo largo, conservar el más largo
    const prefixLen = longestCommonPrefixLen(nLast, nText);
    const longEnough = prefixLen >= Math.min(18, Math.floor(Math.min(nLast.length, nText.length) * 0.6));
    if (longEnough) {
      out[out.length - 1] = (text.length >= last.length) ? text : last;
      continue;
    }

    out.push(text);
  }

  return out;
}
function stripAnnyangCommands(text = '') {
  if (!text) return '';

  const originalWords = text.split(/(\s+)/);
  const normalizedWords = originalWords.map((fragment) => normalizeCommandText(fragment));
  const normalizedCommands = ANNYANG_COMMAND_PATTERNS
    .map((pattern) => pattern.split(/\s+/).filter(Boolean));
  const removeWordIndexes = new Set();

  for (let i = 0; i < normalizedWords.length; i += 1) {
    const current = normalizedWords[i];
    if (!current) continue;

    normalizedCommands.forEach((commandWords) => {
      if (!commandWords.length || commandWords[0] !== current) return;

      let pointer = i;
      let matched = true;
      const candidateIndexes = [];

      for (let j = 0; j < commandWords.length; j += 1) {
        while (pointer < normalizedWords.length && !normalizedWords[pointer]) {
          pointer += 1;
        }

        if (pointer >= normalizedWords.length || normalizedWords[pointer] !== commandWords[j]) {
          matched = false;
          break;
        }

        candidateIndexes.push(pointer);
        pointer += 1;
      }

      if (matched) {
        candidateIndexes.forEach((index) => removeWordIndexes.add(index));
      }
    });
  }

  return originalWords
    .map((fragment, index) => (removeWordIndexes.has(index) ? '' : fragment))
    .join('')
    .replace(/\bcomando\b\s*:?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyVoicePunctuation(rawText = '') {
  if (!rawText) return '';

  return rawText
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([¿¡])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitTextForLanguageTool(text = '') {
  if (text.length <= LANGUAGE_TOOL_MAX_CHARS) return [text];

  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const chunks = [];
  let currentChunk = '';

  blocks.forEach((block) => {
    if (block.length > LANGUAGE_TOOL_MAX_CHARS) {
      throw new Error('Texto demasiado largo para corrección en bloques seguros.');
    }

    if (!currentChunk) {
      currentChunk = block;
      return;
    }

    const candidate = `${currentChunk}\n\n${block}`;
    if (candidate.length <= LANGUAGE_TOOL_MAX_CHARS) {
      currentChunk = candidate;
    } else {
      chunks.push(currentChunk);
      currentChunk = block;
    }
  });

  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

function applyLanguageToolMatches(sourceText = '', matches = []) {
  if (!Array.isArray(matches) || !matches.length) return sourceText;

  let corrected = sourceText;
  const ordered = matches
    .filter((match) => Number.isInteger(match?.offset) && Number.isInteger(match?.length) && Array.isArray(match?.replacements))
    .sort((a, b) => b.offset - a.offset);

  ordered.forEach((match) => {
    const replacement = match.replacements[0]?.value;
    if (typeof replacement !== 'string') return;
    corrected = `${corrected.slice(0, match.offset)}${replacement}${corrected.slice(match.offset + match.length)}`;
  });

  return corrected;
}

async function requestLanguageToolCorrection(blockText = '') {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), LANGUAGE_TOOL_REQUEST_TIMEOUT_MS);

  try {
    const payload = new URLSearchParams({
      text: blockText,
      language: 'auto',
    });

    const response = await fetch(LANGUAGE_TOOL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: payload.toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`LanguageTool HTTP ${response.status}`);
    }

    const data = await response.json();
    return applyLanguageToolMatches(blockText, data.matches || []);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function autocorrectTranscript(rawText = '') {
  const normalized = applyVoicePunctuation(rawText);
  if (!normalized) return '';

  if (correctionInFlight) return lastCorrectionResultText || normalized;
  if (normalized === lastCorrectionSourceText && lastCorrectionResultText) {
    return lastCorrectionResultText;
  }

  correctionInFlight = true;

  try {
    const chunks = splitTextForLanguageTool(normalized);
    const correctedChunks = [];

    for (const chunk of chunks) {
      correctedChunks.push(await requestLanguageToolCorrection(chunk));
    }

    const correctedText = correctedChunks.join('\n\n').trim();
    lastCorrectionSourceText = normalized;
    lastCorrectionResultText = correctedText || normalized;
    return lastCorrectionResultText;
  } catch (error) {
    console.warn('No se pudo aplicar corrección automática:', error);
    lastCorrectionSourceText = normalized;
    lastCorrectionResultText = normalized;
    return normalized;
  } finally {
    correctionInFlight = false;
  }
}


function injectDictationToken(token = '') {
  hasInjectedTokens = true;
  if (!token) return;

  if (token === '\n' || token === '\n\n') {
    finalTranscript = `${safeTrim(finalTranscript)}${token}`;
  } else {
    const needsLeadingSpace = Boolean(finalTranscript) && !/[\s\n]$/.test(finalTranscript) && !/^[,.;:!?¿¡]/.test(token);
    finalTranscript = `${finalTranscript}${needsLeadingSpace ? ' ' : ''}${token}`;
  }

  transcriptBuffer = finalTranscript;
  const previewText = [finalTranscript, previewBuffer].filter(Boolean).join(' ').trim();
  recordingPreview.textContent = previewText || 'Escuchando... habla con normalidad.';
}

function setupAnnyangCommands() {
  if (!window.annyang || areAnnyangCommandsReady) return;

  const commands = {
    coma: () => injectDictationToken(','),
    punto: () => injectDictationToken('.'),
    'dos puntos': () => injectDictationToken(':'),
    'punto y coma': () => injectDictationToken(';'),
    'abre interrogación': () => injectDictationToken('¿'),
    'cierra interrogación': () => injectDictationToken('?'),
    'abre exclamación': () => injectDictationToken('¡'),
    'cierra exclamación': () => injectDictationToken('!'),
    'nueva línea': () => injectDictationToken('\n'),
    'nuevo párrafo': () => injectDictationToken('\n\n'),
  };

  window.annyang.removeCommands();
  window.annyang.addCommands(commands);
  window.annyang.setLanguage('es-ES');
  areAnnyangCommandsReady = true;
}

function toggleAnnyang(shouldRun) {
  if (!window.annyang) return;

  if (shouldRun) {
    setupAnnyangCommands();
    window.annyang.abort();
    window.annyang.start({ autoRestart: true, continuous: true });
    return;
  }

  window.annyang.abort();
}
async function handleVoiceCommand(textFinal) {
  const now = Date.now();
  if (now - lastVoiceCommandAt < VOICE_COMMAND_COOLDOWN_MS) return;

  const normalized = normalizeCommandText(textFinal);
  if (!normalized) return;

  if (normalized.includes('guardar')) {
    lastVoiceCommandAt = now;
    await saveTranscript();
    return;
  }

  if (normalized.includes('cancelar') || normalized.includes('no guardar')) {
    lastVoiceCommandAt = now;
    discardTranscript();
    return;
  }

  if (normalized.includes('siguiente pagina')) {
    lastVoiceCommandAt = now;
    await goNextPageAnimated();
    return;
  }

  if (normalized.includes('pagina anterior')) {
    lastVoiceCommandAt = now;
    await goPrevPageAnimated();
    return;
  }

  if (normalized.includes('borrar cuaderno')) {
    lastVoiceCommandAt = now;
    await clearNotebook();
  }
}

function updateTranscript({ partial = '', finalChunk = '', fullFinal = '' } = {}) {
  if (fullFinal) {
    const cleanFullFinal = currentEngine === 'webspeech'
      ? stripAnnyangCommands(fullFinal)
      : fullFinal;

    const normalizedFullFinal = removeProgressiveRestarts(normalizeDictationChunk(cleanFullFinal));

    const prevFull = safeTrim(lastFullFinal);
    const nextFull = safeTrim(normalizedFullFinal);

    if (!nextFull) {
  // WebSpeech a veces reinicia sesión tras silencio y puede venir vacío.
  // No borres lo acumulado; simplemente ignora este ciclo.
  previewBuffer = partial || '';
  const previewText = [finalTranscript, previewBuffer].filter(Boolean).join(' ').trim();
  recordingPreview.textContent = previewText || 'Escuchando... habla con normalidad.';
  return;
}
 else if (prevFull && nextFull.toLowerCase().startsWith(prevFull.toLowerCase())) {
      const delta = safeTrim(nextFull.slice(prevFull.length));
      if (delta) {
        finalTranscript = mergeTranscriptChunk(finalTranscript, delta);
      }
      transcriptBuffer = finalTranscript;
      lastFullFinal = nextFull;
    } else if (prevFull) {
 // Puede ser re-segmentación o reinicio tras silencio.
      // Si comparten prefijo suficiente, tratarlo como re-segmentación.
      // Si no comparten contexto, anexar como nuevo bloque para no perder lo ya dictado.
   const prefixLen = longestCommonPrefixLen(prevFull, nextFull);
    const minResegmentPrefix = Math.max(12, Math.floor(Math.min(prevFull.length, nextFull.length) * 0.35));
      const looksLikeResegment = prefixLen >= minResegmentPrefix;

     if (looksLikeResegment && !hasInjectedTokens) {
       finalTranscript = nextFull;
     
      } else {
       const appendedChunk = looksLikeResegment
          ? safeTrim(nextFull.slice(prefixLen))
          : nextFull;
        const dedupedChunk = dedupeChunkAgainstTail(finalTranscript, appendedChunk);
        finalTranscript = mergeTranscriptChunk(finalTranscript, dedupedChunk);
      }

      transcriptBuffer = finalTranscript;
      lastFullFinal = nextFull;
    } else {
      // Primer fullFinal
      finalTranscript = nextFull;
      transcriptBuffer = finalTranscript;
      lastFullFinal = nextFull;
    }

    handleVoiceCommand(lastFullFinal);
  } else if (finalChunk) {
    const cleanChunk = currentEngine === 'webspeech'
      ? stripAnnyangCommands(finalChunk)
      : finalChunk;

    const normalizedChunk = removeProgressiveRestarts(normalizeDictationChunk(cleanChunk));
    const dedupedChunk = dedupeChunkAgainstTail(finalTranscript, normalizedChunk);
    finalTranscript = mergeTranscriptChunk(finalTranscript, dedupedChunk);
    transcriptBuffer = finalTranscript;

    // Mantener lastFullFinal como hipótesis de voz (sin tokens manuales)
    lastFullFinal = mergeTranscriptChunk(lastFullFinal, normalizedChunk);

    handleVoiceCommand(normalizedChunk);
  }

  previewBuffer = partial || '';
  const previewText = [finalTranscript, previewBuffer].filter(Boolean).join(' ').trim();
  recordingPreview.textContent = previewText || 'Escuchando... habla con normalidad.';
}

function setupRecognition() {
  if (!SpeechRecognition) return;

  recognition = new SpeechRecognition();
  recognition.lang = 'es-ES';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
  // WebSpeech suele re-segmentar y “rehacer” frases, generando repeticiones
  // tipo: "Génesis 6:2 ..." varias veces. Por eso:
  // 1) Tomamos todos los finales
  // 2) Normalizamos y quitamos reinicios progresivos
  // 3) Colapsamos segmentos redundantes (prefijos / muy similares)
  // 4) Enviamos un fullFinal consolidado (no chunks)
  let interimChunk = '';

  const finals = collectFinalSegments(Array.from(event.results || []))
    .map((t) => stripAnnyangCommands(t))
    .map((t) => removeProgressiveRestarts(normalizeDictationChunk(t)));

  const collapsed = collapseFinalSegments(finals);
  const fullFinal = collapsed.join(' ').trim();

  // Interim (solo lo no-final)
  for (let i = event.resultIndex; i < event.results.length; i += 1) {
    const result = event.results[i];
    if (result.isFinal) continue;
    const text = safeTrim(result[0]?.transcript || '');
    if (text) interimChunk += `${text} `;
  }

  updateTranscript({
    fullFinal,
    partial: safeTrim(interimChunk),
  });
};
  recognition.onerror = (event) => {
    console.error('Error de reconocimiento de voz:', event.error);
    recordingPreview.textContent = 'Hubo un error al grabar. Intenta de nuevo.';
  };

recognition.onend = () => {
  // Si hubo silencio y el motor cerró, muchas veces queda texto solo en interim.
  // Lo pasamos a final antes de reiniciar.
  if (isRecording && currentEngine === 'webspeech') {
    const pending = safeTrim(previewBuffer);
    if (pending) {
      updateTranscript({ finalChunk: pending, partial: '' });
      previewBuffer = '';
    }
  }

  if (isRecording && !userStoppedRecognition && currentEngine === 'webspeech') {
    recognition.start();
  }
};

}

async function isVoskReady() {
  if (localStorage.getItem(VOSK_READY_KEY) === 'true') return true;

  try {
    const checks = await Promise.all([
      fetch('./offline/vosk/vosk.wasm', { cache: 'force-cache' }),
      fetch('./offline/model.tar.gz', { cache: 'force-cache' }).catch(() => null),
      fetch('./offline/vosk-model-small-es-0.42/README', { cache: 'force-cache' }),
    ]);

    const hasWasm = checks[0]?.ok;
    const hasTar = checks[1]?.ok;
    const hasFolderModel = checks[2]?.ok;
    const ready = Boolean(hasWasm && (hasTar || hasFolderModel));

    if (ready) localStorage.setItem(VOSK_READY_KEY, 'true');
    return ready;
  } catch (error) {
    return false;
  }
}

async function precacheOfflinePack() {
  if (!('caches' in window)) return false;

  const cache = await caches.open(OFFLINE_CACHE_NAME);
  const settled = await Promise.allSettled(
    OFFLINE_ASSETS.map((asset) => cache.add(asset)),
  );

  const anySuccess = settled.some((entry) => entry.status === 'fulfilled');
  const critical = [
    './offline/vosk/vosk.js',
    './offline/vosk/vosk.wasm',
    './offline/vosk-model-small-es-0.42/README',
  ];

  const criticalChecks = await Promise.all(
    critical.map((asset) => cache.match(asset)),
  );

  const criticalReady = criticalChecks.every(Boolean);
  const ready = anySuccess && criticalReady;
  if (ready) {
    localStorage.setItem(VOSK_READY_KEY, 'true');
  }
  return ready;
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

async function pickEngine() {
  const hasWebSpeech = Boolean(SpeechRecognition && recognition);
  const voskReady = await isVoskReady();

  if (navigator.onLine && hasWebSpeech) {
    updateOfflineHint('');
    return 'webspeech';
  }

  if (voskReady) {
    updateOfflineHint('');
    return 'vosk';
  }

  if (!navigator.onLine) {
    updateOfflineHint('Conéctate una vez para habilitar dictado sin internet.');
  }

  if (hasWebSpeech) return 'webspeech';
  return null;
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
  voskState.sourceNode = voskState.audioContext.createMediaStreamSource(voskState.mediaStream);

  const bufferSize = 4096;
  voskState.processorNode = voskState.audioContext.createScriptProcessor(bufferSize, 1, 1);
  voskState.processorNode.onaudioprocess = (event) => {
    if (!isRecording || currentEngine !== 'vosk' || !voskState.recognizer) return;

    const input = event.inputBuffer.getChannelData(0);
    const accepted = voskState.recognizer.acceptWaveform(input);

    if (accepted) {
      const finalResult = voskState.recognizer.result();
      if (finalResult?.text) {
        updateTranscript({ finalChunk: finalResult.text });
      }
    } else {
      const partialResult = voskState.recognizer.partialResult();
      updateTranscript({ partial: partialResult?.partial || '' });
    }
  };

  voskState.sourceNode.connect(voskState.processorNode);
  voskState.processorNode.connect(voskState.audioContext.destination);
}

function stopVoskRecording() {
  if (voskState.processorNode) {
    voskState.processorNode.disconnect();
    voskState.processorNode.onaudioprocess = null;
    voskState.processorNode = null;
  }

  if (voskState.sourceNode) {
    voskState.sourceNode.disconnect();
    voskState.sourceNode = null;
  }

  if (voskState.mediaStream) {
    voskState.mediaStream.getTracks().forEach((track) => track.stop());
    voskState.mediaStream = null;
  }

  if (voskState.audioContext) {
    voskState.audioContext.close();
    voskState.audioContext = null;
  }

  if (voskState.recognizer && typeof voskState.recognizer.finalResult === 'function') {
    const finalResult = voskState.recognizer.finalResult();
    if (finalResult?.text) {
      updateTranscript({ finalChunk: finalResult.text });
    }
  }
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
  recordingPreview.textContent = 'Escuchando... habla con normalidad.';
  isRecording = true;
    currentEngine = picked;
  bottomMenu.classList.add('recording');

  showNotebook();
  setActive(recordBtn);
  if (picked === 'webspeech') {
    userStoppedRecognition = false;
        toggleAnnyang(true);
    recognition.start();
    return;
  }

  try {
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

  const correctedText = await autocorrectTranscript(finalTranscript);
  transcriptBuffer = correctedText;
  finalTranscript = correctedText;
  recordingPreview.textContent = correctedText || 'No se detectó voz en esta grabación.';
  recordingTitleInput.focus();
}

async function stopDictation() {
  if (!isRecording) return;

  isRecording = false;
  bottomMenu.classList.remove('recording');

  if (currentEngine === 'webspeech' && recognition) {
    userStoppedRecognition = true;
    recognition.stop();
    toggleAnnyang(false);
  }

  if (currentEngine === 'vosk') {
  toggleAnnyang(false);
  stopVoskRecording();
  }

  transcriptBuffer = applyVoicePunctuation(finalTranscript);
  finalTranscript = transcriptBuffer;
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
  lastFullFinal = '';
  hasInjectedTokens = false;
  previewBuffer = '';
  showNotebook();
  setActive(notesBtn);
}

function discardTranscript() {
  transcriptBuffer = '';
   finalTranscript = '';
  lastFullFinal = '';
  hasInjectedTokens = false;
  previewBuffer = '';
  savePrompt.classList.add('hidden');
  if (!notebookState.pages.some((page) => getPagePlainText(page).trim())) {
    showWelcome();
    setActive(null);
  } else {
    setActive(notesBtn);
  }
}

async function goToPage(pageIndex) {
  notebookState.currentPage = Math.min(Math.max(pageIndex, 0), notebookState.pages.length - 1);
  await saveNotebook();
  paintNotebook();
}

async function persistManualEdit() {
  const page = getCurrentPage();
  const editedText = notebookSheet.textContent.trim();
  page.entries = editedText ? [{ title: '', text: editedText }] : [];

  if (!editedText && notebookState.pages.length > 1) {
    notebookState.pages.splice(notebookState.currentPage, 1);
    notebookState.currentPage = Math.max(0, notebookState.currentPage - 1);
  }

  await saveNotebook();
  paintNotebook();
}

async function clearNotebook() {
  const isConfirmed = window.confirm('¿Seguro que quieres eliminar todo el cuaderno?');
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
  } else {
    setActive(notesBtn);
  }
});

pencilBtn.addEventListener('click', async () => {
  showNotebook();
  setActive(pencilBtn);

  isEditable = !isEditable;
  notebookSheet.contentEditable = String(isEditable);

  if (isEditable) {
    notebookSheet.focus();
  } else {
    await persistManualEdit();
  }

  pencilBtn.style.color = isEditable ? '#2f8f2f' : '';
});

prevPageBtn.addEventListener('click', async () => {
 await goPrevPageAnimated();
});

nextPageBtn.addEventListener('click', async () => {
   await goNextPageAnimated();
});

notebookSheet.addEventListener('touchstart', (event) => {
  const touch = event.changedTouches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: true });

if (prepareOfflineBtn) {
  prepareOfflineBtn.addEventListener('click', async () => {
    if (!navigator.onLine) {
      updateOfflineHint('Conéctate una vez para habilitar dictado sin internet.');
      return;
    }

    prepareOfflineBtn.disabled = true;
    prepareOfflineBtn.textContent = 'Preparando...';
    const ready = await precacheOfflinePack();
    prepareOfflineBtn.disabled = false;
    prepareOfflineBtn.textContent = 'Preparar dictado sin internet';

    if (ready) {
      updateOfflineHint('Dictado offline preparado correctamente.');
      setTimeout(() => updateOfflineHint(''), 2200);
      return;
    }

    updateOfflineHint('No fue posible preparar todos los recursos offline.');
  });
}
notebookSheet.addEventListener('touchend', async (event) => {
  if (isAnimatingPage) return;

  const touch = event.changedTouches[0];
  const diffX = touch.clientX - touchStartX;
  const diffY = touch.clientY - touchStartY;

  if (Math.abs(diffX) < SWIPE_THRESHOLD || Math.abs(diffX) < Math.abs(diffY)) return;

  if (diffX < 0) {
    await goNextPageAnimated();
  } else {
    await goPrevPageAnimated();
  }
}, { passive: true });


trashBtn.addEventListener('click', clearNotebook);
saveBtn.addEventListener('click', saveTranscript);
discardBtn.addEventListener('click', discardTranscript);

window.addEventListener('online', () => updateOfflineHint(''));
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

async function init() {
  try {
    db = await openDatabase();
    await loadNotebook();
    paintNotebook();
    if (notebookState.pages.some((p) => getPagePlainText(p).trim())) {
      setActive(notesBtn);
    }
  } catch (error) {
    console.error('No se pudo iniciar IndexedDB:', error);
    recordingPreview.textContent = 'Error iniciando almacenamiento local.';
  }
  
  setupRecognition();
  await registerServiceWorker();

  if (!navigator.onLine && !(await isVoskReady())) {
    updateOfflineHint('Conéctate una vez para habilitar dictado sin internet.');
  }
}

init();
