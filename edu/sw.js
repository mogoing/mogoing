/* edu 教资刷题 service worker
   - 页面壳（html/css/js入口）走 edu-v1 壳缓存，网络优先保证入口最新
   - 题库数据 data/*.js 与讲义 docs/*.md 走 edu-res-* 资源缓存（装载页下载/校验/更新）
*/
var CACHE = 'edu-v2';

self.addEventListener('install', function(e){
  self.skipWaiting();
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE && k.indexOf('edu-res-') !== 0 && k !== 'edu-meta'; })
        .map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // 后端 API 不拦截

  var p = url.pathname;
  var isData = p.indexOf('/edu/data/') >= 0 && /\.js$/.test(p) && p.indexOf('manifest.js') < 0;
  var isDoc = p.endsWith('.md');
  var isManifestJson = p.endsWith('data/manifest.json');

  // 资源类：edu-res 缓存优先（装载页已下载并校验），网络兜底
  if (isData || isDoc || isManifestJson){
    e.respondWith(
      caches.match(e.request, { ignoreSearch: true }).then(function(hit){
        if (hit) return hit;
        return fetch(e.request).then(function(resp){
          return resp;
        }).catch(function(){ return Response.error(); });
      })
    );
    return;
  }

  // 页面壳与其它：网络优先，失败落壳缓存（离线可开）
  e.respondWith(
    fetch(e.request).then(function(resp){
      if (resp.ok){
        var copy = resp.clone();
        caches.open(CACHE).then(function(c){ c.put(e.request, copy); });
      }
      return resp;
    }).catch(function(){
      return caches.match(e.request).then(function(hit){
        return hit || Response.error();
      });
    })
  );
});
