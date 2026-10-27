/* edu 教资刷题 service worker：缓存壳 + 数据，题库数据后更新 */
var CACHE = 'edu-v1';
var CORE = [
  'index.html', 'list.html', 'quiz.html', 'all.html', 'doc.html',
  'css/edu.css', 'js/common.js', 'data/index.js', 'data/lectures.js',
  'manifest.json', 'assets/icon-192.png', 'assets/icon-512.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(CORE); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; })
        .map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // API 请求不拦截
  // md 讲义与题库数据：缓存优先（数据用版本化缓存名，发版即更新）
  e.respondWith(
    caches.match(e.request).then(function(hit){
      if (hit) return hit;
      return fetch(e.request).then(function(resp){
        if (resp.ok && (url.pathname.endsWith('.md') || url.pathname.endsWith('.js') || url.pathname.endsWith('.json'))){
          var copy = resp.clone();
          caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
        }
        return resp;
      }).catch(function(){
        return caches.match(url.pathname) || Response.error();
      });
    })
  );
});
