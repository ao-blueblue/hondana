// アプリ本体を端末に保存して、電波がなくても開けるようにする
const CACHE = 'hondana-3.7.4';
const FILES = ['./', 'index.html', 'app.js?v=3.7.4', 'zxing.min.js?v=0.21.3', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // 文字（Google Fonts）は一度読んだら保存しておく
  if (u.host === 'fonts.googleapis.com' || u.host === 'fonts.gstatic.com') {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return res; })));
    return;
  }
  if (u.origin !== location.origin) return; // 書誌データや表紙の問い合わせはそのまま通す
  // 新しい版があれば取りに行き、つながらなければ保存しておいた版を使う
  // 毎回サーバーに新しい版があるか確かめる（古い部品と新しい画面が混ざらないように）
  // ページが一時的に開けない（404など）ときは、その画面を保存せず、前に保存しておいた版を使う
  const saved = () => caches.match(e.request).then(r => r || caches.match('index.html'));
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    if (!r.ok) return saved().then(s => s || r);
    const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r;
  }).catch(saved));
});
