const STORAGE_KEY = "cuaderno_notas_v1";

const statusEl = document.getElementById("status");
const startVoiceBtn = document.getElementById("startVoice");
const stopVoiceBtn = document.getElementById("stopVoice");
const voiceResultEl = document.getElementById("voiceResult");
const addFromVoiceBtn = document.getElementById("addFromVoice");
const manualNoteEl = document.getElementById("manualNote");
const addManualBtn = document.getElementById("addManual");
const notesListEl = document.getElementById("notesList");
const emptyMessageEl = document.getElementById("emptyMessage");
const editDialogEl = document.getElementById("editDialog");
const editTextEl = document.getElementById("editText");
const saveEditBtn = document.getElementById("saveEdit");

let notes = loadNotes();
let editingId = null;
let recognition = null;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = "es-ES";
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onstart = () => {
    statusEl.textContent = "Estado: escuchando...";
    startVoiceBtn.disabled = true;
    stopVoiceBtn.disabled = false;
  };

  recognition.onend = () => {
    statusEl.textContent = "Estado: listo para escuchar.";
    startVoiceBtn.disabled = false;
    stopVoiceBtn.disabled = true;
  };

  recognition.onerror = (event) => {
    statusEl.textContent = `Error de voz: ${event.error}. Revisa permisos del micrófono.`;
  };

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      transcript += event.results[i][0].transcript;
    }
    voiceResultEl.value = transcript.trim();
  };
} else {
  statusEl.textContent = "Tu navegador no soporta reconocimiento de voz. Usa Chrome en Android.";
  startVoiceBtn.disabled = true;
  stopVoiceBtn.disabled = true;
}

startVoiceBtn.addEventListener("click", () => {
  if (!recognition) return;
  voiceResultEl.value = "";
  recognition.start();
});

stopVoiceBtn.addEventListener("click", () => {
  if (!recognition) return;
  recognition.stop();
});

addFromVoiceBtn.addEventListener("click", () => {
  const text = voiceResultEl.value.trim();
  addNote(text);
  voiceResultEl.value = "";
});

addManualBtn.addEventListener("click", () => {
  const text = manualNoteEl.value.trim();
  addNote(text);
  manualNoteEl.value = "";
});

saveEditBtn.addEventListener("click", (event) => {
  event.preventDefault();
  if (!editingId) {
    editDialogEl.close();
    return;
  }

  const updatedText = editTextEl.value.trim();
  notes = notes.map((note) =>
    note.id === editingId ? { ...note, text: updatedText, updatedAt: Date.now() } : note,
  );
  persistNotes();
  renderNotes();
  editDialogEl.close();
});

function addNote(text) {
  if (!text) {
    statusEl.textContent = "Escribe o dicta una anotación antes de guardar.";
    return;
  }

  const note = {
    id: crypto.randomUUID(),
    text,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  notes.unshift(note);
  persistNotes();
  renderNotes();
  statusEl.textContent = "Anotación guardada correctamente.";
}

function removeNote(id) {
  notes = notes.filter((note) => note.id !== id);
  persistNotes();
  renderNotes();
}

function openEdit(id) {
  const note = notes.find((item) => item.id === id);
  if (!note) return;

  editingId = id;
  editTextEl.value = note.text;
  if (typeof editDialogEl.showModal === "function") {
    editDialogEl.showModal();
  } else {
    const replacement = prompt("Corrige la anotación", note.text);
    if (replacement !== null) {
      note.text = replacement.trim();
      note.updatedAt = Date.now();
      persistNotes();
      renderNotes();
    }
  }
}

function readAloud(text) {
  if (!("speechSynthesis" in window)) {
    alert("Tu navegador no soporta lectura por voz.");
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "es-ES";
  window.speechSynthesis.speak(utterance);
}

async function shareNote(text) {
  if (navigator.share) {
    try {
      await navigator.share({
        title: "Mi anotación",
        text,
      });
    } catch (error) {
      statusEl.textContent = "No se pudo compartir la anotación.";
    }
    return;
  }

  await navigator.clipboard.writeText(text);
  statusEl.textContent = "Anotación copiada al portapapeles (tu navegador no soporta compartir).";
}

function renderNotes() {
  notesListEl.innerHTML = "";
  emptyMessageEl.hidden = notes.length > 0;

  for (const note of notes) {
    const li = document.createElement("li");
    li.className = "note";

    const text = document.createElement("p");
    text.textContent = note.text;

    const actions = document.createElement("div");
    actions.className = "note__actions";

    const editBtn = document.createElement("button");
    editBtn.className = "btn";
    editBtn.textContent = "✏️ Corregir";
    editBtn.addEventListener("click", () => openEdit(note.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn--danger";
    deleteBtn.textContent = "🗑️ Borrar";
    deleteBtn.addEventListener("click", () => removeNote(note.id));

    const listenBtn = document.createElement("button");
    listenBtn.className = "btn btn--primary";
    listenBtn.textContent = "🔊 Escuchar";
    listenBtn.addEventListener("click", () => readAloud(note.text));

    const shareBtn = document.createElement("button");
    shareBtn.className = "btn";
    shareBtn.textContent = "📤 Compartir";
    shareBtn.addEventListener("click", () => {
      shareNote(note.text);
    });

    actions.append(editBtn, deleteBtn, listenBtn, shareBtn);
    li.append(text, actions);
    notesListEl.appendChild(li);
  }
}

function loadNotes() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistNotes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

renderNotes();
