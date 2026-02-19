const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const state = {
  activeView: "home",
  isRecording: false,
  pages: [""],
  activePage: 0,
  draftTranscript: "",
  recognition: null,
  tool: "write"
};

const PAGE_CHAR_LIMIT = 950;

const STORAGE_KEY = "voice_notebook_pages_v1";

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data?.pages)) {
      state.pages = data.pages.map((p) => String(p));
      state.activePage = Number.isInteger(data.activePage) ? Math.min(Math.max(data.activePage, 0), state.pages.length - 1) : 0;
    }
  } catch (err) {
    // ignore corrupted storage
  }
}

function persistToStorage() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ pages: state.pages, activePage: state.activePage })
    );
  } catch (err) {
    // storage may be unavailable (private mode, quota, etc.)
  }
}

const els = {
  homeView: document.getElementById("homeView"),
  decisionView: document.getElementById("decisionView"),
  notebookView: document.getElementById("notebookView"),
  recordBtn: document.getElementById("recordBtn"),
  openNotebookBtn: document.getElementById("openNotebookBtn"),
  saveBtn: document.getElementById("saveBtn"),
  discardBtn: document.getElementById("discardBtn"),
  page: document.getElementById("page"),
  pageIndicator: document.getElementById("pageIndicator"),
  prevPageBtn: document.getElementById("prevPageBtn"),
  nextPageBtn: document.getElementById("nextPageBtn"),
  deletePageBtn: document.getElementById("deletePageBtn"),
  recordMoreBtn: document.getElementById("recordMoreBtn"),
  toolWrite: document.getElementById("toolWrite"),
  toolErase: document.getElementById("toolErase"),
  toolCorrect: document.getElementById("toolCorrect")
};

function showView(name) {
  Object.entries({
    home: els.homeView,
    decision: els.decisionView,
    notebook: els.notebookView
  }).forEach(([key, el]) => {
    el.classList.toggle("view--active", key === name);
  });
  state.activeView = name;
}

function setupRecognition() {
  if (!SpeechRecognition) {
    alert("Tu navegador no soporta reconocimiento de voz.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "es-ES";
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        state.draftTranscript += `${transcript.trim()} `;
      } else {
        interim += transcript;
      }
    }
    if (state.activeView === "notebook") {
      const preview = [state.draftTranscript.trim(), interim.trim()].filter(Boolean).join(" ");
      applyTextToPages(mergeForAppend(preview));
      state.activePage = state.pages.length - 1;
      renderCurrentPage();
    }
  };

  recognition.onend = () => {
    if (state.isRecording) recognition.start();
  };

  state.recognition = recognition;
}

function mergeForAppend(text) {
  const base = state.pages.join("");
  return `${base}${base && text ? "\n" : ""}${text}`;
}

function normalizeSpacing(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])(\S)/g, "$1 $2")
    .trim();
}

function capitalizeSentences(text) {
  // Capitaliza la primera letra y la que sigue a . ! ?
  const trimmed = text.trim();
  if (!trimmed) return "";
  return trimmed
    .replace(/(^|[.!?]\s+)([a-záéíóúñü])/g, (m0, p1, p2) => p1 + p2.toUpperCase());
}

function simpleCorrect(text) {
  // Corrección ligera sin servicios externos: espacios + capitalización básica.
  return capitalizeSentences(normalizeSpacing(text));
}

function correctSelectionOrPage() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  if (!selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const selectedText = selection.toString();
    const corrected = simpleCorrect(selectedText);
    if (!corrected) return;
    range.deleteContents();
    range.insertNode(document.createTextNode(corrected));
    // Colapsa al final del texto insertado
    selection.removeAllRanges();
    const after = document.createRange();
    after.setStart(range.endContainer, range.endOffset);
    after.collapse(true);
    selection.addRange(after);
    syncFromEditors();
    return;
  }

  // Si no hay selección, corrige toda la página actual
  const current = state.pages[state.activePage] ?? "";
  const correctedPage = simpleCorrect(current);
  if (correctedPage !== current) {
    state.pages[state.activePage] = correctedPage;
    applyTextToPages(state.pages.join("\n"));
    renderCurrentPage();
    persistToStorage();
  }
}

function startRecording() {
  if (!state.recognition) setupRecognition();
  if (!state.recognition) return;
  state.draftTranscript = "";
  state.isRecording = true;
  els.recordBtn.classList.add("is-recording");
  state.recognition.start();
}

function stopRecordingAndPromptSave() {
  state.isRecording = false;
  els.recordBtn.classList.remove("is-recording");
  state.recognition?.stop();
  showView("decision");
}

function applyTextToPages(fullText) {
  const chunks = [];
  let cursor = 0;

  if (!fullText.trim()) {
    state.pages = [""];
    return;
  }

  while (cursor < fullText.length) {
    let next = Math.min(cursor + PAGE_CHAR_LIMIT, fullText.length);
    if (next < fullText.length) {
      const splitAt = fullText.lastIndexOf(" ", next);
      if (splitAt > cursor + 120) next = splitAt;
    }
    chunks.push(fullText.slice(cursor, next).trimStart());
    cursor = next;
  }

  state.pages = chunks.length ? chunks : [""];
  if (state.activePage > state.pages.length - 1) state.activePage = state.pages.length - 1;
}

function renderCurrentPage() {
  const pageText = state.pages[state.activePage] ?? "";
  els.page.textContent = pageText;
  els.pageIndicator.textContent = `Página ${state.activePage + 1} / ${state.pages.length}`;
}

function syncFromEditors() {
  state.pages[state.activePage] = els.page.textContent;
  const joined = state.pages.join("\n").replace(/\n{3,}/g, "\n\n");
  applyTextToPages(joined);
  renderCurrentPage();
  persistToStorage();
}

function saveRecording() {
  const transcript = state.draftTranscript.trim();
  if (transcript) {
    const merged = mergeForAppend(transcript);
    applyTextToPages(merged);
    state.activePage = state.pages.length - 1;
  }
  showView("notebook");
  renderCurrentPage();
  els.page.focus();
  persistToStorage();
}

function discardRecording() {
  state.draftTranscript = "";
  showView("home");
}

function setTool(tool) {
  state.tool = tool;
  [els.toolWrite, els.toolErase, els.toolCorrect].forEach((btn) => btn.classList.remove("tool--active"));
  if (tool === "write") els.toolWrite.classList.add("tool--active");
  if (tool === "erase") els.toolErase.classList.add("tool--active");
  if (tool === "correct") els.toolCorrect.classList.add("tool--active");

  // Estilos de cursor/estado
  els.page.classList.toggle("is-erasing", tool === "erase");
  els.page.classList.toggle("is-correcting", tool === "correct");

  // El corrector trabaja mejor con spellcheck habilitado
  els.page.setAttribute("spellcheck", tool !== "erase");
}

function eraseSelection() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
  selection.deleteFromDocument();
  syncFromEditors();
}

els.recordBtn.addEventListener("click", () => {
  if (!state.isRecording) {
    startRecording();
  } else {
    stopRecordingAndPromptSave();
  }
});

els.openNotebookBtn.addEventListener("click", () => {
  showView("notebook");
  renderCurrentPage();
  persistToStorage();
});

els.saveBtn.addEventListener("click", saveRecording);
els.discardBtn.addEventListener("click", discardRecording);

els.prevPageBtn.addEventListener("click", () => {
  syncFromEditors();
  if (state.activePage > 0) state.activePage -= 1;
  renderCurrentPage();
  persistToStorage();
});

els.nextPageBtn.addEventListener("click", () => {
  syncFromEditors();
  if (state.activePage < state.pages.length - 1) {
    state.activePage += 1;
  } else {
    state.pages.push("");
    state.activePage += 1;
  }
  renderCurrentPage();
  persistToStorage();
});

els.deletePageBtn.addEventListener("click", () => {
  if (state.pages.length === 1) {
    state.pages = [""];
  } else {
    state.pages.splice(state.activePage, 1);
  }
  applyTextToPages(state.pages.join("\n"));
  renderCurrentPage();
});

els.recordMoreBtn.addEventListener("click", () => {
  showView("home");
  startRecording();
});

els.page.addEventListener("input", () => {
  if (state.tool === "erase") return;
  syncFromEditors();
});

els.page.addEventListener("mouseup", () => {
  if (state.tool === "erase") eraseSelection();
  if (state.tool === "correct") correctSelectionOrPage();
});

els.page.addEventListener("keyup", (event) => {
  if (state.tool === "erase" && event.key === "Delete") syncFromEditors();
  if (state.tool === "correct" && event.ctrlKey && event.key === "Enter") correctSelectionOrPage();
});

els.toolWrite.addEventListener("click", () => setTool("write"));
els.toolErase.addEventListener("click", () => setTool("erase"));
els.toolCorrect.addEventListener("click", () => setTool("correct"));

setupRecognition();
loadFromStorage();
renderCurrentPage();
