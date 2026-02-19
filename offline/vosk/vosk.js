/*
  Wrapper placeholder for Vosk browser runtime.
  Reemplaza este archivo por la distribución oficial de Vosk para Web
  (vosk.js + vosk.wasm) para reconocimiento offline real.

  La app intenta usar:
  - window.Vosk.createModel(modelUrl)
  - model.KaldiRecognizer(sampleRate)
*/
window.Vosk = window.Vosk || null;
