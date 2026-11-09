/* ==========================================================
   烩菜听歌 · 播放器内核 player.js
   队列 / 音频 / 状态同步 / 收藏 / 最近播放
   所有子页面共享同一个 localStorage 状态
   ========================================================== */
(function (global) {
  'use strict';

  var M = global.MUSIC;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------------- 存储键 ---------------- */
  var K_STATE = 'momusic_state_v1';     // 与主页胶囊共享
  var K_QUEUE = 'momusic_queue_v1';
  var K_QI    = 'momusic_qi_v1';
  var K_Q     = 'momusic_qi_quality';
  var K_MODE  = 'momusic_mode';
  var K_FAV   = 'momusic_fav_local';
  var K_RECENT= 'momusic_recent_v1';
  var PID = 'mu-' + Math.random().toString(36).slice(2, 9);

  /* ---------------- 状态 ---------------- */
  var P = {
    audio: null,
    queue: [],
    qi: 0,
    cur: null,
    quality: 'std',
    mode: 'order',
    playing: false,
    loading: false,
    dead: {}            // id -> true 解析失败
  };

  var bus = ('BroadcastChannel' in window) ? new BroadcastChannel('momusic') : null;
  var listeners = {};

  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return fn; }
  function off(ev, fn) {
    var arr = listeners[ev];
    if (!arr) return;
    var i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  }
  function emit(ev, a, b) {
    (listeners[ev] || []).forEach(function (fn) { try { fn(a, b); } catch (e) {} });
  }

  /* ---------------- 恢复持久状态 ---------------- */
  P.quality = localStorage.getItem(K_Q) || 'std';
  if (P.quality !== 'std' && P.quality !== 'loss') P.quality = 'std';
  P.mode = localStorage.getItem(K_MODE) || 'order';
  if (['order', 'one', 'shuffle'].indexOf(P.mode) < 0) P.mode = 'order';

  try {
    var q = JSON.parse(localStorage.getItem(K_QUEUE) || '[]');
    if (Array.isArray(q)) P.queue = q;
  } catch (e) {}
  P.qi = Math.max(0, parseInt(localStorage.getItem(K_QI) || '0', 10) || 0);
  if (P.qi >= P.queue.length) P.qi = 0;

  var S = null;
  try { S = JSON.parse(localStorage.getItem(K_STATE) || 'null'); } catch (e) { S = null; }
  if (P.queue.length) P.cur = P.queue[P.qi] || null;

  /* ---------------- 保存 ---------------- */
  function persistQueue() {
    try {
      localStorage.setItem(K_QUEUE, JSON.stringify(P.queue.slice(0, 200)));
      localStorage.setItem(K_QI, String(P.qi));
    } catch (e) {}
  }
  function saveState(patch) {
    if (!S) S = {};
    Object.assign(S, patch || {}, { ts: Date.now(), from: PID });
    try { localStorage.setItem(K_STATE, JSON.stringify(S)); } catch (e) {}
    if (bus) { try { bus.postMessage({ type: 'state', state: S, from: PID }); } catch (e) {} }
  }

  /* ---------------- 音频 ---------------- */
  function ensureAudio() {
    if (P.audio) return P.audio;
    var a = new Audio();
    a.preload = 'auto';
    a.setAttribute('playsinline', '');
    P.audio = a;

    a.addEventListener('play', function () {
      P.playing = true;
      emit('play');
      emit('state');
      nativeMedia(true);
      if (P.cur) saveState({ playing: true, pos: a.currentTime || 0 });
    });
    a.addEventListener('pause', function () {
      P.playing = false;
      emit('pause');
      emit('state');
      nativeMedia(false);
      if (P.cur) saveState({ playing: false, pos: a.currentTime || 0 });
    });
    a.addEventListener('timeupdate', function () {
      emit('time', a.currentTime || 0, a.duration || 0);
      if (!P.cur) return;
      var now = Date.now();
      // 系统媒体会话的进度：约 1 秒同步一次（车机进度条才跟得上）
      if (now - lastMediaSync >= 1000) {
        lastMediaSync = now;
        nativeMediaState();
      }
      if (a.paused) return;
      if (now - lastSave < 3000) return;
      lastSave = now;
      saveState({ pos: a.currentTime || 0, dur: a.duration || 0 });
    });
    a.addEventListener('ended', function () {
      emit('time', 0, 0);
      if (P.mode === 'one') {
        try { a.currentTime = 0; a.play().catch(function () {}); } catch (e) {}
        return;
      }
      if (P.mode === 'shuffle' && P.queue.length > 1) {
        var r = Math.floor(Math.random() * P.queue.length);
        if (P.qi === r) r = (r + 1) % P.queue.length;
        P.qi = r; P.cur = P.queue[P.qi]; persistQueue();
        play(0, true);
        return;
      }
      if (P.queue.length > 1) next(); else { saveState({ playing: false, pos: 0 }); emit('state'); }
    });
    a.addEventListener('error', function () {
      if (!a.src) return;
      emit('error', '播放出错了，换个音质或换首歌试试');
      saveState({ playing: false });
      emit('state');
    });
    a.addEventListener('loadedmetadata', function () { emit('meta', a.duration || 0); });
    a.addEventListener('waiting', function () { P.loading = true; emit('busy'); });
    a.addEventListener('playing', function () { P.loading = false; emit('busy'); });
    return a;
  }
  var lastSave = 0;
  var lastMediaSync = 0;   // 系统媒体会话（MediaSession）进度同步节流

  /* ---------------- 原生壳通知栏 + 系统媒体会话 ----------------
     v3.5：除了原来的通知栏（mediaStart/mediaUpdate/mediaStop），
     再向 Android 的 MediaSession 同步「元数据」和「播放状态」。
     有了它，小米 CarWith / 车机音乐卡片 / 方向盘按键 / 蓝牙线控 / 锁屏
     才能识别出「烩菜听歌在放什么」，并回传控制指令。
     这两个调用是「可选能力」：旧版 APK 没有这两个方法时静默跳过。 */
  function nativeMediaSession(force) {
    try {
      if (typeof AndroidBridge === 'undefined' || !AndroidBridge) return;
      var t = P.cur;
      if (!t) return;

      // 元数据：歌名 / 歌手 / 专辑 / 封面 / 时长
      if (AndroidBridge.mediaMeta) {
        var dur = (P.audio && isFinite(P.audio.duration) && P.audio.duration > 0)
          ? Math.round(P.audio.duration * 1000) : 0;
        var art = t.pic || t.cover || '';
        AndroidBridge.mediaMeta(
          String(t.name || ''),
          String(t.artist || ''),
          String(t.album || ''),
          String(art),
          dur
        );
      }
      nativeMediaState();
    } catch (e) {}
  }

  /* 只同步播放状态与进度（比元数据频繁，单独一个入口） */
  function nativeMediaState() {
    try {
      if (typeof AndroidBridge === 'undefined' || !AndroidBridge) return;
      if (!AndroidBridge.mediaState) return;
      var playing = !!(P.audio && !P.audio.paused && !P.audio.ended);
      var pos = (P.audio && isFinite(P.audio.currentTime)) ? Math.round(P.audio.currentTime * 1000) : 0;
      AndroidBridge.mediaState(playing ? 1 : 0, pos);
    } catch (e) {}
  }

  function nativeMedia(onFlag) {
    try {
      if (typeof AndroidBridge === 'undefined' || !AndroidBridge) return;
      if (onFlag) {
        if (AndroidBridge.mediaStart) AndroidBridge.mediaStart((P.cur && P.cur.name) || '烩菜听歌', (P.cur && P.cur.artist) || '');
      } else if (AndroidBridge.mediaStop) {
        AndroidBridge.mediaStop();
      }
      nativeMediaState();
    } catch (e) {}
  }
  function nativeMediaUpdate() {
    try {
      if (typeof AndroidBridge === 'undefined' || !AndroidBridge) return;
      if (AndroidBridge.mediaUpdate) AndroidBridge.mediaUpdate((P.cur && P.cur.name) || '', (P.cur && P.cur.artist) || '');
      nativeMediaSession(true);
    } catch (e) {}
  }

  /* ---------------- 播放 ---------------- */
  async function play(pos, autoplay) {
    if (!P.cur) { emit('toast', '先搜一首歌吧'); return; }
    var a = ensureAudio();
    emit('track', P.cur);
    P.dead[String(P.cur.id)] = false;

    var res = await M.resolveUrl(P.cur, P.quality);

    // 解析失败 → 在同名候选里换一个版本再试
    if (!res) {
      var sameName = P.queue.filter(function (x) {
        return x !== P.cur && !P.dead[String(x.id)] &&
          (M.plain(x.name).indexOf(M.plain(P.cur.name)) >= 0 || M.plain(P.cur.name).indexOf(M.plain(x.name)) >= 0);
      });
      for (var i = 0; i < sameName.length; i++) {
        res = await M.resolveUrl(sameName[i], P.quality);
        if (res) {
          P.cur = sameName[i];
          P.qi = Math.max(0, P.queue.indexOf(sameName[i]));
          persistQueue();
          emit('track', P.cur);
          break;
        }
      }
    }

    if (!res) {
      emit('toast', '这首暂时解析不到，换一首试试');
      P.dead[String(P.cur.id)] = true;
      emit('queue');
      saveState({ playing: false });
      emit('state');
      return;
    }

    var br = Number(res.br) || 0;
    var fromBI = (res.from === 'bilibili');
    emit('quality', br, fromBI);
    // B站兜底来的音轨是 m4a（通常 128~320kbps），不提示"暂无无损"以免打扰
    if (!fromBI && P.quality === 'loss' && br && br < 740) {
      emit('toast', '这首暂无无损，已用 ' + br + 'K 播放');
    }

    saveState({
      id: P.cur.id, uid: P.cur.uid || P.cur.id, name: P.cur.name, artist: P.cur.artist,
      album: P.cur.album || '', pic: P.cur.pic || '', cover: P.cur.cover || '', source: P.cur.source || '',
      kgHashes: P.cur.kgHashes || null, qqMid: P.cur.qqMid || null, bvid: P.cur.bvid || null,
      playing: true, pos: Math.max(0, Number(pos) || 0)
    });

    a.src = res.url;

    var seekTo = Math.max(0, Number(pos) || 0);
    if (seekTo > 0) {
      var ok = await new Promise(function (resolve) {
        var settled = false;
        function done(v) {
          if (settled) return; settled = true;
          a.removeEventListener('loadedmetadata', onMeta);
          resolve(v);
        }
        function onMeta() { done(true); }
        a.addEventListener('loadedmetadata', onMeta, { once: true });
        setTimeout(function () { done(false); }, 5000);
      });
      if (ok && isFinite(a.duration) && a.duration > 0) {
        if (seekTo >= a.duration - 1) seekTo = 0;
        try { a.currentTime = seekTo; } catch (e) {}
      }
    }

    if (autoplay !== false) {
      try { await a.play(); } catch (e) {
        saveState({ playing: false });
        emit('toast', '浏览器拦了自动播放，点一下播放键');
      }
    }
    emit('state');
    pushRecent(P.cur);
    mediaSession();
    nativeMediaUpdate();
  }

  function toggle() {
    if (!P.cur) { emit('toast', '先搜一首歌吧'); return; }
    var a = ensureAudio();
    if (!a.src) {
      var same = !!(S && String(S.id) === String(P.cur.id));
      play(same ? Math.max(0, Number(S.pos) || 0) : 0, true);
      return;
    }
    if (a.paused) a.play().catch(function () { emit('toast', '播放被拦截，再点一次'); });
    else a.pause();
  }

  function next() {
    if (!P.queue.length) return;
    P.qi = (P.qi + 1) % P.queue.length;
    P.cur = P.queue[P.qi];
    persistQueue();
    play(0, true);
  }
  function prev() {
    if (!P.queue.length) return;
    P.qi = (P.qi - 1 + P.queue.length) % P.queue.length;
    P.cur = P.queue[P.qi];
    persistQueue();
    play(0, true);
  }

  function seek(sec) {
    var a = ensureAudio();
    if (!isFinite(a.duration) || a.duration <= 0) return;
    try { a.currentTime = Math.max(0, Math.min(a.duration - 0.05, sec)); } catch (e) {}
    if (P.cur) saveState({ pos: a.currentTime || 0 });
    emit('time', a.currentTime || 0, a.duration || 0);
  }

  /* ---------------- 队列操作 ---------------- */
  function setQueue(list, startIdx) {
    P.queue = (list || []).slice();
    P.qi = Math.max(0, Math.min(P.queue.length - 1, startIdx || 0));
    P.cur = P.queue[P.qi] || null;
    persistQueue();
    emit('queue');
    emit('track', P.cur);
  }
  function addToQueue(t, atFront) {
    if (!t) return;
    var id = String(t.id || '');
    if (P.queue.some(function (x) { return String(x.id) === id; })) {
      var idx = P.queue.findIndex(function (x) { return String(x.id) === id; });
      var item = P.queue.splice(idx, 1)[0];
      var tgt = Math.max(0, P.cur ? P.queue.indexOf(P.cur) + 1 : 0);
      P.queue.splice(tgt, 0, item);
    } else {
      var copy = Object.assign({}, t);
      if (atFront) P.queue.unshift(copy);
      else {
        var tgt2 = Math.max(0, P.cur ? P.queue.indexOf(P.cur) + 1 : P.queue.length);
        P.queue.splice(tgt2, 0, copy);
      }
    }
    persistQueue();
    emit('queue');
  }
  function playTrack(t) {
    if (!t) return;
    var idx = P.queue.findIndex(function (x) { return String(x.id) === String(t.id); });
    if (idx < 0) { P.queue.unshift(Object.assign({}, t)); idx = 0; }
    P.qi = idx;
    P.cur = P.queue[idx];
    persistQueue();
    play(0, true);
  }

  /* ---------------- 音质 / 模式 ---------------- */
  function setQuality(q) {
    P.quality = (q === 'loss' ? 'loss' : 'std');
    localStorage.setItem(K_Q, P.quality);
    emit('mode-state');
    if (P.cur && P.audio && P.audio.src) {
      var pos = P.audio.currentTime || 0, was = !P.audio.paused;
      play(pos, was);
    }
    emit('toast', P.quality === 'loss' ? '已切换无损音质' : '已切换标准音质');
  }
  function toggleQuality() { setQuality(P.quality === 'loss' ? 'std' : 'loss'); }

  function setMode(m) {
    P.mode = ['order', 'one', 'shuffle'].indexOf(m) >= 0 ? m : 'order';
    localStorage.setItem(K_MODE, P.mode);
    emit('mode-state');
  }
  function cycleMode() {
    var arr = ['order', 'one', 'shuffle'];
    setMode(arr[(arr.indexOf(P.mode) + 1) % 3]);
    emit('toast', { order: '顺序播放', one: '单曲循环', shuffle: '随机播放' }[P.mode]);
  }

  /* ---------------- 收藏 ---------------- */
  var BACKEND = 'https://api.mogoing.xyz';
  var FAV_GAME = 'music_love';
  var fav = [];
  var favLoaded = false;

  function favUser() { try { return localStorage.getItem('blindbox_user') || ''; } catch (e) { return ''; } }
  function favPass() { try { return localStorage.getItem('blindbox_pass') || ''; } catch (e) { return ''; } }

  function loadFavLocal() {
    try {
      var a = JSON.parse(localStorage.getItem(K_FAV) || '[]');
      if (Array.isArray(a)) fav = a;
    } catch (e) {}
  }
  function saveFavLocal() {
    try { localStorage.setItem(K_FAV, JSON.stringify(fav.slice(0, 200))); } catch (e) {}
  }
  function getFav() { return fav; }
  function isFav(t) {
    if (!t) return false;
    return fav.some(function (x) { return String(x.id) === String(t.id); });
  }
  /* 把曲目存成可长期复用的精简对象。
     只保存「音源线索」，**不保存直链**（直链约 1~2 小时就失效，存了也没用）：
       source   —— 来自哪个音源（netease / kugou / qq / bilibili）
       kgHashes —— 酷狗的 FileHash 列表
       qqMid    —— QQ 的 songmid
       bvid     —— B 站的视频 id
     下次播放时凭这些线索直接去对应音源取链接，
     省掉「搜歌名 → 猜歌手 → 挑原唱」这最慢的一步。 */
  function trackSnapshot(t) {
    return {
      id: String(t.id || ''),
      uid: String(t.uid || t.id || ''),
      name: String(t.name || ''),
      artist: String(t.artist || ''),
      album: String(t.album || ''),
      pic: String(t.pic || ''),
      cover: String(t.cover || ''),
      source: String(t.source || ''),
      kgHashes: t.kgHashes || null,
      qqMid: t.qqMid || null,
      bvid: t.bvid || null,
      ts: Date.now()
    };
  }

  function toFavObj(t) { return trackSnapshot(t); }

  async function loadFavorites() {
    loadFavLocal();
    emit('fav');
    var u = favUser(), p = favPass();
    if (!u || !p) { favLoaded = true; return fav; }
    try {
      var r = await fetch(BACKEND + '/api/save?username=' + encodeURIComponent(u) +
        '&password=' + encodeURIComponent(p) + '&game=' + FAV_GAME, { signal: AbortSignal.timeout(12000) });
      if (r.ok) {
        var j = await r.json();
        var data = j && j.save;
        if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = null; } }
        if (data && Array.isArray(data.items) && data.items.length) {
          fav = data.items;
          saveFavLocal();
          emit('fav');
        }
      }
    } catch (e) {}
    favLoaded = true;
    return fav;
  }

  async function pushFavorites() {
    saveFavLocal();
    var u = favUser(), p = favPass();
    if (!u || !p) return false;
    try {
      var r = await fetch(BACKEND + '/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p, game: FAV_GAME, data: { items: fav.slice(0, 200) } }),
        signal: AbortSignal.timeout(12000)
      });
      var j = await r.json().catch(function () { return null; });
      return !!(j && j.ok);
    } catch (e) { return false; }
  }

  async function toggleFav(t) {
    if (!t) return;
    var id = String(t.id || '');
    var i = fav.findIndex(function (x) { return String(x.id) === id; });
    if (i >= 0) { fav.splice(i, 1); emit('toast', '已取消收藏'); }
    else { fav.unshift(toFavObj(t)); emit('toast', '❤️ 已收藏'); }
    emit('fav');
    var ok = await pushFavorites();
    if (!ok && favUser() && favPass()) emit('toast', '已存本地（云端同步失败）');
  }

  /* ---------------- 最近播放 ---------------- */
  function getRecent() {
    try {
      var a = JSON.parse(localStorage.getItem(K_RECENT) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function pushRecent(t) {
    if (!t || !t.id) return;
    var list = getRecent();
    var id = String(t.id);
    list = list.filter(function (x) { return String(x.id) !== id; });
    list.unshift(trackSnapshot(t));
    try { localStorage.setItem(K_RECENT, JSON.stringify(list.slice(0, 30))); } catch (e) {}
    emit('recent');
  }

  /* ---------------- MediaSession ---------------- */
  async function mediaSession() {
    if (!('mediaSession' in navigator) || !P.cur) return;
    try {
      var art = await M.fetchPic(P.cur, 300);
      navigator.mediaSession.metadata = new MediaMetadata({
        title: P.cur.name || '', artist: P.cur.artist || '', album: P.cur.album || '烩菜听歌',
        artwork: art ? [{ src: art, sizes: '300x300', type: 'image/jpeg' }] : []
      });
      navigator.mediaSession.setActionHandler('play', function () { if (P.audio && P.audio.paused) toggle(); });
      navigator.mediaSession.setActionHandler('pause', function () { if (P.audio && !P.audio.paused) P.audio.pause(); });
      navigator.mediaSession.setActionHandler('previoustrack', prev);
      navigator.mediaSession.setActionHandler('nexttrack', next);
      navigator.mediaSession.setActionHandler('seekto', function (d) {
        if (d && d.seekTime != null) seek(d.seekTime);
      });
    } catch (e) {}
  }

  /* ---------------- 跨页同步 ---------------- */
  function adopt(st) {
    if (!st || st.from === PID) return;
    S = st;
    if (st.id && (!P.cur || String(P.cur.id) !== String(st.id))) {
      var t = P.queue.find(function (x) { return String(x.id) === String(st.id); });
      if (!t) {
        t = {
          id: String(st.id), uid: String(st.uid || st.id), name: st.name || '未知歌曲',
          artist: st.artist || '', album: st.album || '', pic: st.pic || '', cover: st.cover || '',
          source: st.source || '', kgHashes: st.kgHashes || null, qqMid: st.qqMid || null, bvid: st.bvid || null
        };
        P.queue.splice(Math.min(P.qi, P.queue.length), 0, t);
      }
      P.cur = t;
      P.qi = Math.max(0, P.queue.indexOf(t));
      persistQueue();
      emit('queue');
      emit('track', P.cur);
    }
    // 只同步播放/暂停，不打断本地选曲
    if (P.audio) {
      if (st.playing && P.audio.paused && P.audio.src) P.audio.play().catch(function () {});
      else if (!st.playing && !P.audio.paused) P.audio.pause();
    }
    emit('state');
  }
  if (bus) bus.onmessage = function (ev) {
    var m = ev.data || {};
    if (m.type === 'state' && m.state) adopt(m.state);
  };
  window.addEventListener('storage', function (e) {
    if (e.key !== K_STATE || !e.newValue) return;
    try { adopt(JSON.parse(e.newValue)); } catch (err) {}
  });

  /* ---------------- 对外暴露（供 APK 通知栏回调） ---------------- */
  global.mmTogglePlay = function () { try { toggle(); } catch (e) {} };
  global.mmPause = function () { try { if (P.audio && !P.audio.paused) P.audio.pause(); } catch (e) {} };
  global.mmPlay  = function () { try { if (P.audio && P.audio.paused) P.audio.play().catch(function () {}); } catch (e) {} };
  global.mmNext  = function () { try { next(); } catch (e) {} };
  global.mmPrev  = function () { try { prev(); } catch (e) {} };

  /* ---------------- API ---------------- */
  global.PLAYER = {
    P: P,
    ensureAudio: ensureAudio, play: play, toggle: toggle, next: next, prev: prev, seek: seek,
    setQueue: setQueue, addToQueue: addToQueue, playTrack: playTrack,
    setQuality: setQuality, toggleQuality: toggleQuality,
    setMode: setMode, cycleMode: cycleMode,
    getFav: getFav, isFav: isFav, toggleFav: toggleFav, loadFavorites: loadFavorites,
    getRecent: getRecent, pushRecent: pushRecent,
    saveState: saveState, persistQueue: persistQueue,
    on: on, off: off, emit: emit,
    MODE_NAME: { order: '顺序播放', one: '单曲循环', shuffle: '随机播放' }
  };
})(window);
