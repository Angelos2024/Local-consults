diff --git a/app.js b/app.js
index 9c808b50e3dcada58312efa79c66cc029b41361b..3094ae6ba2b5aff080268e868a52cd512934a1a9 100644
--- a/app.js
+++ b/app.js
@@ -1,172 +1,233 @@
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
+const recordingTitleInput = document.getElementById('recordingTitle');
+const currentPageNumber = document.getElementById('currentPageNumber');
+const totalPages = document.getElementById('totalPages');
+const prevPageNumber = document.getElementById('prevPageNumber');
+const nextPageNumber = document.getElementById('nextPageNumber');
 
 const DB_NAME = 'cuadernoNotasDB';
 const DB_VERSION = 1;
 const STORE_NAME = 'notebook';
 const NOTEBOOK_ID = 'main';
 const MAX_CHARS_PER_PAGE = 700;
 
 const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
 
 let isRecording = false;
 let isEditable = false;
 let transcriptBuffer = '';
 let recognition;
 let db;
 
 let notebookState = {
   id: NOTEBOOK_ID,
   currentPage: 0,
-  pages: [{ content: '' }],
+  pages: [{ entries: [] }],
 };
 
+function sanitize(text = '') {
+  return text
+    .replaceAll('&', '&amp;')
+    .replaceAll('<', '&lt;')
+    .replaceAll('>', '&gt;')
+    .replaceAll('"', '&quot;')
+    .replaceAll("'", '&#039;');
+}
+
+function normalizePages(pages = []) {
+  if (!pages.length) return [{ entries: [] }];
+
+  return pages.map((page) => {
+    if (Array.isArray(page.entries)) {
+      return {
+        entries: page.entries
+          .map((entry) => ({
+            title: entry.title || '',
+            text: entry.text || '',
+          }))
+          .filter((entry) => entry.title.trim() || entry.text.trim()),
+      };
+    }
+
+    const legacyText = page.content || '';
+    return legacyText.trim()
+      ? { entries: [{ title: '', text: legacyText }] }
+      : { entries: [] };
+  });
+}
+
 /* ===== Menú animado (estilo do tutorial) ===== */
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
       if (saved?.pages?.length) {
         notebookState = {
           id: NOTEBOOK_ID,
           currentPage: Number.isInteger(saved.currentPage) ? saved.currentPage : 0,
-          pages: saved.pages.map((page) => ({ content: page.content || '' })),
+          pages: normalizePages(saved.pages),
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
-    notebookState.pages = [{ content: '' }];
+    notebookState.pages = [{ entries: [] }];
     notebookState.currentPage = 0;
   }
   return notebookState.pages[notebookState.currentPage];
 }
 
+function getPagePlainText(page) {
+  return page.entries
+    .map((entry) => [entry.title?.trim(), entry.text?.trim()].filter(Boolean).join('\n'))
+    .filter(Boolean)
+    .join('\n\n');
+}
+
 function paintNotebook() {
   const currentPage = getCurrentPage();
-  notebookSheet.textContent = currentPage.content;
-  pageIndicator.textContent = `Página ${notebookState.currentPage + 1} de ${notebookState.pages.length}`;
+  notebookSheet.innerHTML = currentPage.entries
+    .map((entry) => {
+      const safeTitle = sanitize(entry.title.trim());
+      const safeText = sanitize(entry.text.trim());
+      return `
+        <section class="entry-block">
+          ${safeTitle ? `<h3>${safeTitle}</h3>` : ''}
+          ${safeText ? `<p>${safeText}</p>` : ''}
+        </section>
+      `;
+    })
+    .join('') || '<p class="empty-note">Esta página está vacía.</p>';
+
+  currentPageNumber.textContent = String(notebookState.currentPage + 1);
+  totalPages.textContent = String(notebookState.pages.length);
+  pageIndicator.setAttribute('aria-label', `Página ${notebookState.currentPage + 1} de ${notebookState.pages.length}`);
+  prevPageNumber.textContent = notebookState.currentPage > 0 ? String(notebookState.currentPage) : '—';
+  nextPageNumber.textContent = notebookState.currentPage < notebookState.pages.length - 1
+    ? String(notebookState.currentPage + 2)
+    : '+';
   prevPageBtn.disabled = notebookState.currentPage === 0;
   nextPageBtn.disabled = notebookState.currentPage === notebookState.pages.length - 1;
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
-  if (!currentPage.content.trim()) return;
+  if (!getPagePlainText(currentPage).trim()) return;
 
-  const expected = `${currentPage.content}\n\n${text}`;
+  const expected = `${getPagePlainText(currentPage)}\n\n${text}`;
   if (expected.length > MAX_CHARS_PER_PAGE) {
-    notebookState.pages.push({ content: '' });
+    notebookState.pages.push({ entries: [] });
     notebookState.currentPage = notebookState.pages.length - 1;
     currentPage = getCurrentPage();
-    currentPage.content = '';
+    currentPage.entries = [];
   }
 }
 
-async function addTextToCurrentPage(text, { forceNewPage = false } = {}) {
+async function addTextToCurrentPage(text, { title = '', forceNewPage = false } = {}) {
   if (!text.trim()) return;
 
-  if (forceNewPage && getCurrentPage().content.trim()) {
-    notebookState.pages.push({ content: '' });
+  if (forceNewPage && getPagePlainText(getCurrentPage()).trim()) {
+    notebookState.pages.push({ entries: [] });
     notebookState.currentPage = notebookState.pages.length - 1;
   }
 
   ensureSpaceForText(text);
 
   const page = getCurrentPage();
-  page.content = page.content.trim() ? `${page.content}\n\n${text}` : text;
+  page.entries.push({ title: title.trim(), text });
   await saveNotebook();
   paintNotebook();
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
 
@@ -174,155 +235,161 @@ function setupRecognition() {
     if (isRecording) recognition.start();
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
   setActive(recordBtn);
 }
 
 function pauseRecording() {
   isRecording = false;
   bottomMenu.classList.remove('recording');
   recognition.stop();
   savePrompt.classList.remove('hidden');
+  recordingTitleInput.value = '';
+  recordingTitleInput.focus();
   recordingPreview.textContent = transcriptBuffer || 'No se detectó voz en esta grabación.';
 }
 
 async function saveTranscript() {
   savePrompt.classList.add('hidden');
   if (!transcriptBuffer.trim()) return;
 
-  await addTextToCurrentPage(`• ${transcriptBuffer.trim()}`, { forceNewPage: true });
+  await addTextToCurrentPage(`• ${transcriptBuffer.trim()}`, {
+    title: recordingTitleInput.value,
+    forceNewPage: true,
+  });
   showNotebook();
   setActive(notesBtn);
 }
 
 function discardTranscript() {
   transcriptBuffer = '';
   savePrompt.classList.add('hidden');
-  if (!notebookState.pages.some((page) => page.content.trim())) {
+  if (!notebookState.pages.some((page) => getPagePlainText(page).trim())) {
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
-  page.content = notebookSheet.textContent.trim();
+  const editedText = notebookSheet.textContent.trim();
+  page.entries = editedText ? [{ title: '', text: editedText }] : [];
 
-  if (!page.content && notebookState.pages.length > 1) {
+  if (!editedText && notebookState.pages.length > 1) {
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
-    pages: [{ content: '' }],
+    pages: [{ entries: [] }],
   };
   await saveNotebook();
   paintNotebook();
   showWelcome();
   setActive(null);
 }
 
 /* ===== Eventos ===== */
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
     setActive(notesBtn);
-  } else if (!notebookState.pages.some((page) => page.content.trim())) {
+  } else if (!notebookState.pages.some((page) => getPagePlainText(page).trim())) {
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
   if (notebookState.currentPage > 0) {
     await goToPage(notebookState.currentPage - 1);
   }
 });
 
 nextPageBtn.addEventListener('click', async () => {
   if (notebookState.currentPage < notebookState.pages.length - 1) {
     await goToPage(notebookState.currentPage + 1);
     return;
   }
 
-  notebookState.pages.push({ content: '' });
+  notebookState.pages.push({ entries: [] });
   await goToPage(notebookState.pages.length - 1);
 });
 
 trashBtn.addEventListener('click', clearNotebook);
 saveBtn.addEventListener('click', saveTranscript);
 discardBtn.addEventListener('click', discardTranscript);
 
 async function init() {
   try {
     db = await openDatabase();
     await loadNotebook();
     paintNotebook();
-    if (notebookState.pages.some((p) => p.content.trim())) {
+    if (notebookState.pages.some((p) => getPagePlainText(p).trim())) {
       setActive(notesBtn);
     }
   } catch (error) {
     console.error('No se pudo iniciar IndexedDB:', error);
     recordingPreview.textContent = 'Error iniciando almacenamiento local.';
   }
   setupRecognition();
 }
 
 init();

   
