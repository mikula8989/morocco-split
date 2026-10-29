const CACHE = 'morocco-split-shell-v6';
const ASSETS = ['./','./index.html','./app.js','./core.js','./db.js','./config.js','./fx.js','./style.css','./feedback.css','./local-fonts.css','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('morocco-split-shell-') && k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Never cache authentication requests, the Google endpoint, or expense responses.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith(caches.match(event.request, {ignoreSearch:true}).then(hit=>hit || fetch(event.request).catch(error=>{
    if (event.request.mode==='navigate') return caches.match('./index.html');
    throw error;
  })));
});
