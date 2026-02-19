const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const state = {
  activeView: "home",
  isRecording: false,
  isManualStop: false,
  pages: [""],
  activePage: 0,
  baseTextSnapshot: "",
  finalTranscript: "",
  interimTranscript: "",
  recognition: null,
  tool: "write"
};

const PAGE_CHAR_LIMIT = 950;

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

function getAllText() {
  return state.pages.join("\n").trim();
}

function mergeForAppend(baseText, text) {
  return [baseText.trim(), text.trim()].filter(Boolean).join("\n");
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
      const transcript = event.results[i][0].transcript.trim();
      if (!transcript) continue;
      if (event.results[i].isFinal) {
        state.finalTranscript = `${state.finalTranscript} ${transcript}`.trim();
      } else {
        interim = `${interim} ${transcript}`.trim();
      }
    }

    state.interimTranscript = interim;

    const liveText = mergeForAppend(
      state.baseTextSnapshot,
      `${state.finalTranscript} ${state.interimTranscript}`.trim()
    );

    applyTextToPages(liveText);
    state.activePage = state.pages.length - 1;
    if (state.activeView === "notebook") {
      renderCurrentPage();
    }
  };

  recognition.onend = () => {
    if (state.isRecording && !state.isManualStop) {
      recognition.start();
    }
  };

  state.recognition = recognition;
}

function startRecording() {
  if (!state.recognition) setupRecognition();
  if (!state.recognition || state.isRecording) return;

  syncFromEditors();
  state.baseTextSnapshot = getAllText();
  state.finalTranscript = "";
  state.interimTranscript = "";
  state.isRecording = true;
  state.isManualStop = false;
  els.recordBtn.classList.add("is-recording");

  try {
    state.recognition.start();
  } catch (error) {
    console.warn("No se pudo iniciar la grabación:", error);
  }
}

function stopRecordingAndPromptSave() {
  state.isRecording = false;
  state.isManualStop = true;
  els.recordBtn.classList.remove("is-recording");
  state.recognition?.stop();
  showView("decision");
}

function applyTextToPages(fullText) {
  const chunks = [];
  let cursor = 0;

  if (!fullText.trim()) {
    state.pages = [""];
    state.activePage = 0;
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
  if (state.activeView !== "notebook") return;
  state.pages[state.activePage] = els.page.textContent;
  applyTextToPages(state.pages.join("\n").replace(/\n{3,}/g, "\n\n"));
  renderCurrentPage();
}

function saveRecording() {
  const transcript = `${state.finalTranscript} ${state.interimTranscript}`.trim();
  const mergedText = mergeForAppend(state.baseTextSnapshot, transcript);
  applyTextToPages(mergedText);
  state.activePage = state.pages.length - 1;
  showView("notebook");
  renderCurrentPage();
  els.page.focus();
}

function discardRecording() {
  applyTextToPages(state.baseTextSnapshot);
  state.finalTranscript = "";
  state.interimTranscript = "";
  showView("home");
}

function setTool(tool) {
  state.tool = tool;
  [els.toolWrite, els.toolErase, els.toolCorrect].forEach((btn) => btn.classList.remove("tool--active"));
  if (tool === "write") els.toolWrite.classList.add("tool--active");
  if (tool === "erase") els.toolErase.classList.add("tool--active");
  if (tool === "correct") els.toolCorrect.classList.add("tool--active");
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
});

els.saveBtn.addEventListener("click", saveRecording);
els.discardBtn.addEventListener("click", discardRecording);

els.prevPageBtn.addEventListener("click", () => {
  syncFromEditors();
  if (state.activePage > 0) state.activePage -= 1;
  renderCurrentPage();
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
});

els.page.addEventListener("keyup", (event) => {
  if (state.tool === "erase" && event.key === "Delete") syncFromEditors();
});

els.toolWrite.addEventListener("click", () => setTool("write"));
els.toolErase.addEventListener("click", () => setTool("erase"));
els.toolCorrect.addEventListener("click", () => setTool("correct"));

setupRecognition();
renderCurrentPage();
