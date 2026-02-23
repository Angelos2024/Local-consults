const CACHE_NAME = 'cuaderno-static-v3';
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(OFFLINE_ASSETS.map((asset) => cache.add(asset))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  // No cachear endpoints dinámicos
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
          return response;
        })
        .catch(() => caches.match('./index.html'));
    }),
  );
});
