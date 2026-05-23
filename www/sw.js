// 版本号：每次发版递增。CACHE_NAME 变了之后 activate 阶段会自动清理旧缓存
const CACHE_NAME = 'teacher-schedule-v4';
const ASSETS = [
  'index.html',
  'css/style.css',
  'js/app.js',
  'manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Network-first 策略：
// - 优先走网络拿最新版本，拿到后顺手更新缓存
// - 网络失败才回退到缓存（离线场景）
// - 之前是 cache-first，导致更新 APK 后 JS/CSS 还是旧版本，必须卸载重装才生效
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response && response.status === 200 && response.type === 'basic') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => {
      // 离线回退到缓存
      return caches.match(event.request).then((cached) => {
        if (cached) return cached;
        if (event.request.mode === 'navigate') {
          return caches.match('index.html');
        }
      });
    })
  );
});
