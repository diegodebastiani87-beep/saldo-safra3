// sw.js — Service Worker do "Nossa Rotina"
// Responsável por: cache básico do PWA + notificações locais

const CACHE_NOME = 'nossa-rotina-v1';
const ARQUIVOS_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// ============ INSTALL ============
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NOME).then((cache) => {
      return cache.addAll(ARQUIVOS_CACHE).catch(() => {});
    })
  );
});

// ============ ACTIVATE ============
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomes) => {
      return Promise.all(
        nomes
          .filter((n) => n !== CACHE_NOME)
          .map((n) => caches.delete(n))
      );
    }).then(() => self.clients.claim())
  );
});

// ============ FETCH (cache-first para estáticos, network-first para API) ============
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignora requisições do Firebase, Google APIs, etc.
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('google') ||
    url.hostname.includes('gstatic') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Network-first para navegação (sempre tenta pegar HTML atualizado)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache-first para o resto
  event.respondWith(
    caches.match(event.request).then((resp) => {
      return resp || fetch(event.request).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NOME).then((c) => c.put(event.request, clone));
        }
        return res;
      }).catch(() => resp);
    })
  );
});

// ============ MENSAGENS DO APP (exibir notificação) ============
self.addEventListener('message', (event) => {
  const data = event.data || {};

  if (data.type === 'show-notification') {
    const { title, options } = data;
    event.waitUntil(
      self.registration.showNotification(title, options || {})
    );
    return;
  }

  // Teste: ping
  if (data.type === 'ping') {
    event.source && event.source.postMessage({ type: 'pong' });
    return;
  }
});

// ============ CLIQUE NA NOTIFICAÇÃO ============
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const eventoId = (event.notification.data && event.notification.data.eventoId) || '';
  const urlParaAbrir = eventoId ? `/#evento-${eventoId}` : '/#agenda';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      // Se já existe uma janela aberta do app, foca e navega
      for (const client of lista) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({
            type: 'open-evento',
            eventoId: eventoId
          });
          return client.focus();
        }
      }
      // Senão, abre nova janela
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlParaAbrir);
      }
    })
  );
});

// ============ FECHAMENTO DA NOTIFICAÇÃO ============
self.addEventListener('notificationclose', (event) => {
  // Opcional: logar analytics de dismiss
  console.log('[SW] Notificação fechada:', event.notification.tag);
});