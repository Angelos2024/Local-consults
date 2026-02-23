const CACHE_NAME = 'cuaderno-static-v6';
const OFFLINE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './offline/vosk/vosk.js',
  './offline/vosk/vosk.wasm',
  './offline/model.tar.gz',
  './offline/vosk-model-small-es-0.42/README',
  './offline/vosk-model-small-es-0.42/am/final.mdl',
  './offline/vosk-model-small-es-0.42/conf/mfcc.conf',
  './offline/vosk-model-small-es-0.42/conf/model.conf',
  './offline/vosk-model-small-es-0.42/graph/disambig_tid.int',
  './offline/vosk-model-small-es-0.42/graph/HCLr.fst',
  './offline/vosk-model-small-es-0.42/graph/phones/word_boundary.int',
  './offline/vosk-model-small-es-0.42/graph/phones/align_lexicon.int',
  './offline/vosk-model-small-es-0.42/graph/phones/align_lexicon.fst',
  './offline/vosk-model-small-es-0.42/graph/phones/disambig.int',
  './offline/vosk-model-small-es-0.42/graph/phones/optional_silence.csl',
  './offline/vosk-model-small-es-0.42/graph/phones/optional_silence.int',
  './offline/vosk-model-small-es-0.42/graph/phones/phones.txt',
  './offline/vosk-model-small-es-0.42/graph/phones/silence.csl',
  './offline/vosk-model-small-es-0.42/graph/phones/silence.int',
  './offline/vosk-model-small-es-0.42/graph/phones/word_boundary.txt',
  './offline/vosk-model-small-es-0.42/graph/phones/word_boundary.int',
  './offline/vosk-model-small-es-0.42/graph/phones/wdisambig_phones.int',
  './offline/vosk-model-small-es-0.42/graph/phones/wdisambig_words.int',
  './offline/vosk-model-small-es-0.42/graph/phones/word_boundary.int',
  './offline/vosk-model-small-es-0.42/graph/phones/word_boundary.txt',
  './offline/vosk-model-small-es-0.42/graph/phones/word_boundary.int',
  './offline/vosk-model-small-es-0.42/graph/phones/word_boundary.txt',
  './offline/vosk-model-small-es-0.42/graph/phones/word_boundary.int',
  './offline/vosk-model-small-es-0.42/graph/phones/word_boundary.txt',
  './offline/vosk-model-small-es-0.42/graph/words.txt',
  './offline/vosk-model-small-es-0.42/graph/Gr.fst',
  './offline/vosk-model-small-es-0.42/ivector/final.dubm',
  './offline/vosk-model-small-es-0.42/ivector/final.ie',
  './offline/vosk-model-small-es-0.42/ivector/final.mat',
  './offline/vosk-model-small-es-0.42/ivector/splice.conf',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return resp;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
