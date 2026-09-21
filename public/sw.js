// Service Worker — يجعل تطبيق BMBA يعمل كتطبيق مثبّت (PWA) على أندرويد وآيفون وأي جهاز حديث.
// يخزّن الصفحة الرئيسية وأصول الشعار الرسمي للعمل دون اتصال، ولا يتدخل في وضع التطوير (HMR).
const CACHE = 'bamba-v1';
const CORE = [
  '/',
  '/manifest.json',
  '/assets/branding/bmba-logo.png',
  '/assets/branding/bmba-icon-192.png',
  '/assets/branding/bmba-icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// روابط لا يجب تخزينها أبداً: موديولات التطوير و HMR وواجهات الـ API
const BYPASS = /\/src\/|\/@vite|\/@react-refresh|\/node_modules\/|\/@fs\/|\/api\/|\/@emergent/;

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (BYPASS.test(url.pathname)) return;

  // التنقل: الشبكة أولاً مع سقوط آمن على النسخة المخزنة عند انقطاع الاتصال
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/').then((cached) => cached || Response.error()))
    );
    return;
  }

  // الأصول الثابتة: التخزين أولاً ثم الشبكة
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && (url.pathname.startsWith('/assets/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css'))) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});
