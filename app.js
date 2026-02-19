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

const notesKey = 'cuadernoNotasVoz';
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let isRecording = false;
let isEditable = false;
let transcriptBuffer = '';
let notes = [];
let recognition;

function loadNotes() {
  try {
    notes = JSON.parse(localStorage.getItem(notesKey)) || [];
  } catch {
    notes = [];
  }
  paintNotebook();
}

function paintNotebook() {
  notebookSheet.textContent = notes.join('\n\n');
}

function showNotebook() {
  welcomePanel.classList.add('hidden');
  notebookView.classList.remove('hidden');
}

function showWelcome() {
  notebookView.classList.add('hidden');
  welcomePanel.classList.remove('hidden');
}

function setupRecognition() {
  if (!SpeechRecognition) {
    recordingPreview.textContent = 'Tu navegador no soporta reconocimiento de voz.';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'es-ES';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    const resultText = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join(' ')
      .trim();

    transcriptBuffer = resultText;
    recordingPreview.textContent = resultText || 'Escuchando... habla con normalidad.';
  };

  recognition.onend = () => {
    if (isRecording) {
      recognition.start();
    }
  };
}

function startRecording() {
  if (!recognition) {
    alert('Tu navegador no permite convertir voz a texto automáticamente.');
    return;
  }

  transcriptBuffer = '';
  recordingPreview.textContent = 'Escuchando... habla con normalidad.';
  isRecording = true;
  bottomMenu.classList.add('recording');
  recognition.start();
  showNotebook();
}

function pauseRecording() {
  isRecording = false;
  bottomMenu.classList.remove('recording');
  recognition.stop();
  savePrompt.classList.remove('hidden');
  recordingPreview.textContent = transcriptBuffer || 'No se detectó voz en esta grabación.';
}

function saveTranscript() {
  savePrompt.classList.add('hidden');

  if (!transcriptBuffer.trim()) {
    return;
  }

  notes.push(`• ${transcriptBuffer.trim()}`);
  localStorage.setItem(notesKey, JSON.stringify(notes));
  paintNotebook();
  showNotebook();
}

function discardTranscript() {
  transcriptBuffer = '';
  savePrompt.classList.add('hidden');
  if (!notebookSheet.textContent.trim()) {
    showWelcome();
  }
}

recordBtn.addEventListener('click', () => {
  if (!isRecording) {
    startRecording();
    return;
  }

  pauseRecording();
});

notesBtn.addEventListener('click', () => {
  if (notebookView.classList.contains('hidden')) {
    showNotebook();
  } else if (!notes.length) {
    showWelcome();
  }
});

pencilBtn.addEventListener('click', () => {
  showNotebook();
  isEditable = !isEditable;
  notebookSheet.contentEditable = String(isEditable);
  notebookSheet.focus();

  if (!isEditable) {
    notes = notebookSheet.textContent
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);
    localStorage.setItem(notesKey, JSON.stringify(notes));
  }

  pencilBtn.style.color = isEditable ? '#2f8f2f' : '';
});

saveBtn.addEventListener('click', saveTranscript);
discardBtn.addEventListener('click', discardTranscript);

loadNotes();
setupRecognition();
