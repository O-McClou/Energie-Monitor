const VERSION='energie-v1.0.0';
const PREFIX='energie:'+self.registration.scope+':';
const CACHE=PREFIX+VERSION;
const FILES=['./','./index.html','./styles.css','./app.js','./core.js','./storage.js','./io.js','./icon.svg','./icon-192.png','./icon-512.png','./manifest.webmanifest','./vendor/exceljs.min.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;event.respondWith(caches.open(CACHE).then(async cache=>{const hit=await cache.match(event.request,{ignoreSearch:true});if(hit)return hit;if(event.request.mode==='navigate')return cache.match('./index.html');return fetch(event.request)}))});
