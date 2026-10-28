/* edu 公共层：主题 / 后端同步 / 进度模型 / 每日一题 / markdown 渲染 */
(function(){
'use strict';
var EDU = window.EDU = {};

/* ===== 考试日期（可改） ===== */
EDU.EXAM_DATE = '2027-03-07'; // 2027 上半年教资笔试（官方公布后如变动，改这一行即可）

/* ===== 主题 ===== */
EDU.theme = function(){
  var saved = null;
  try { saved = localStorage.getItem('edu_theme'); } catch(e){}
  if (!saved) saved = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  return saved;
};
EDU.setTheme = function(t){
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('edu_theme', t); } catch(e){}
  var b = document.querySelector('.theme-btn');
  if (b) b.textContent = t === 'dark' ? '☀️' : '🌙';
};
EDU.initTheme = function(){
  EDU.setTheme(EDU.theme());
  var b = document.querySelector('.theme-btn');
  if (b) b.addEventListener('click', function(){
    EDU.setTheme(EDU.theme() === 'dark' ? 'light' : 'dark');
  });
};

/* ===== toast ===== */
var _tt = null;
EDU.toast = function(msg, ms){
  var t = document.querySelector('.toast');
  if (!t){ t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(_tt); _tt = setTimeout(function(){ t.classList.remove('show'); }, ms || 2200);
};

/* ===== 后端同步（进度只存后端，不做本地兜底） ===== */
var API = 'https://api.mogoing.xyz';
var GAME = 'edu_v1';
var _saveTimer = null, _saving = false, _dirty = false, _pending = false;

function syncbar(show, text){
  var el = document.querySelector('.syncbar');
  if (!el){ el = document.createElement('div'); el.className = 'syncbar'; document.body.appendChild(el); }
  if (show){ el.textContent = text || '⇅ 同步中…'; el.classList.add('show'); }
  else el.classList.remove('show');
}

EDU.user = function(){
  var u = null, p = '', off = false;
  try {
    u = localStorage.getItem('blindbox_user');
    p = localStorage.getItem('blindbox_pass') || '';
    off = localStorage.getItem('blindbox_offline') === '1';
  } catch(e){}
  return { name: u, pass: p, offline: off, ok: !!(u && p) && !off };
};

/* 进度数据：{ banks:{id:{done:{n:'right|wrong|done'},wrong:[n],wrongStat:{n:{c:次数,t:最近错误时间,f:首次}},star:[n],draft:{...}}}, daily:{date:{n,bank,ans,ok}}, checkin:{date:ts}, mockHist:[] } */
EDU.P = { banks: {}, daily: {}, checkin: {}, mockHist: [] };
EDU.loaded = false;     // 后端进度是否已拉取
EDU.readonly = true;    // true=游客/离线，只可看不可记

/* 老数据迁移：wrong 是老版数字数组，补上错误次数/时间；checkin 缺失则补空 */
function migrate(){
  if (!EDU.P.checkin || typeof EDU.P.checkin !== 'object') EDU.P.checkin = {};
  var banks = EDU.P.banks || {};
  Object.keys(banks).forEach(function(id){
    var s = banks[id];
    if (!s || typeof s !== 'object') return;
    if (!Array.isArray(s.wrong)) s.wrong = [];
    if (!Array.isArray(s.star)) s.star = [];
    if (!s.done || typeof s.done !== 'object') s.done = {};
    if (!s.wrongStat || typeof s.wrongStat !== 'object') s.wrongStat = {};
    // 老错题：没有次数/时间，补 c=1, t=0（表示时间未知）
    s.wrong.forEach(function(n){
      if (!s.wrongStat[n]) s.wrongStat[n] = { c: 1, t: 0, f: 0 };
    });
    // 已不在 wrong 里的残留记录清掉
    Object.keys(s.wrongStat).forEach(function(k){
      if (s.wrong.indexOf(Number(k)) < 0) delete s.wrongStat[k];
    });
  });
  // 有每日一题记录的日子也算打卡（老数据兼容）
  Object.keys(EDU.P.daily || {}).forEach(function(k){
    if (!EDU.P.checkin[k]) EDU.P.checkin[k] = 1;
  });
}
EDU.migrate = migrate;

EDU.loadProgress = function(){
  var u = EDU.user();
  if (!u.ok){ EDU.loaded = true; return Promise.resolve(false); }
  return fetch(API + '/api/save?username=' + encodeURIComponent(u.name) +
    '&password=' + encodeURIComponent(u.pass) + '&game=' + GAME, { signal: AbortSignal.timeout(8000) })
    .then(function(r){ return r.json(); })
    .then(function(d){
      /* 后端把 POST 的 data 原样存在 save 上（save 就是数据本身）；
         兼容旧写法 save.data，两种都认 */
      if (d && d.ok && d.save && typeof d.save === 'object'){
        var data = (d.save.data && typeof d.save.data === 'object') ? d.save.data : d.save;
        EDU.P = {
          banks: data.banks || {}, daily: data.daily || {},
          checkin: data.checkin || {}, mockHist: data.mockHist || []
        };
      }
      migrate();
      EDU.loaded = true; EDU.readonly = false;
      return true;
    })
    .catch(function(){ EDU.loaded = true; EDU.readonly = true;
      EDU.toast('进度同步失败，暂时只读（不影响做题）'); return false; });
};

EDU.saveProgress = function(immediate){
  if (EDU.readonly) return;
  _dirty = true;
  if (_saveTimer && !immediate) return;
  if (immediate && _saveTimer){ clearTimeout(_saveTimer); _saveTimer = null; }
  var doSave = function(){
    _saveTimer = null;
    if (!_dirty) return;
    // 正在保存时不丢改动：标记 pending，等这次保存结束后再补一次
    if (_saving){ _pending = true; return; }
    _saving = true; _dirty = false;
    syncbar(true);
    var u = EDU.user();
    fetch(API + '/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u.name, password: u.pass, game: GAME, data: EDU.P }),
      signal: AbortSignal.timeout(10000)
    }).then(function(r){ return r.json(); }).then(function(d){
      _saving = false;
      if (d && d.ok){ syncbar(false); }
      else { syncbar(true, '⚠️ 同步失败，稍后重试'); setTimeout(function(){ syncbar(false); }, 3000); _dirty = true; EDU.saveProgress(); }
    }).catch(function(){
      _saving = false; syncbar(true, '⚠️ 网络不稳，稍后重试');
      setTimeout(function(){ syncbar(false); }, 3000);
      _dirty = true;
      EDU.saveProgress(); // 重试一次
    }).then(function(){
      if (_pending){ _pending = false; if (_dirty) EDU.saveProgress(true); }
    });
  };
  if (immediate) doSave();
  else _saveTimer = setTimeout(doSave, 800);
};

/* ===== 题库进度操作 ===== */
function bankState(id){
  if (!EDU.P.banks[id]) EDU.P.banks[id] = { done: {}, wrong: [], wrongStat: {}, star: [], draft: null };
  var s = EDU.P.banks[id];
  if (!s.done) s.done = {};
  if (!s.wrong) s.wrong = [];
  if (!s.wrongStat) s.wrongStat = {};
  if (!s.star) s.star = [];
  return s;
}
EDU.bankState = bankState;

EDU.markDone = function(id, n, result, silent){ // result: 'right' | 'wrong' | 'done'；silent=true 时批量调用不逐题保存
  var s = bankState(id);
  s.done[n] = result;
  if (result === 'wrong'){
    var wi = s.wrong.indexOf(n);
    if (wi < 0) s.wrong.push(n);
    var w = s.wrongStat[n] || { c: 0, t: 0, f: 0 };
    w.c = (w.c || 0) + 1;          // 累计做错次数
    w.t = Date.now();              // 最近一次做错时间
    if (!w.f) w.f = w.t;           // 首次做错时间
    s.wrongStat[n] = w;
  }
  /* 答对不自动移出错题本：错过的题保留（次数/时间都在），由用户手动移出 */
  EDU.checkinToday();
  if (!silent) EDU.saveProgress(true);           // 每题立即落库（后端）
};
EDU.markWrongResolved = function(id, n){
  var s = bankState(id);
  var wi = s.wrong.indexOf(n);
  if (wi >= 0) s.wrong.splice(wi, 1);
  if (s.wrongStat[n]) delete s.wrongStat[n];
  EDU.saveProgress(true);
};
/* 移出错题本（手动编辑删除用），保留 done 不变 */
EDU.removeWrong = function(id, n){
  var s = bankState(id);
  var wi = s.wrong.indexOf(n);
  if (wi >= 0) s.wrong.splice(wi, 1);
  if (s.wrongStat[n]) delete s.wrongStat[n];
  EDU.saveProgress(true);
};
/* 某题的错误信息 {c:次数, t:最近时间, f:首次时间} */
EDU.wrongInfo = function(id, n){
  var s = EDU.P.banks[id];
  var w = s && s.wrongStat && s.wrongStat[n];
  return w ? { c: w.c || 1, t: w.t || 0, f: w.f || 0 } : { c: 1, t: 0, f: 0 };
};
EDU.toggleStar = function(id, n){
  var s = bankState(id);
  var i = s.star.indexOf(n);
  if (i >= 0) s.star.splice(i, 1); else s.star.push(n);
  EDU.checkinToday();
  EDU.saveProgress(true);           // 星标改动立即落库
  return i < 0; // 返回是否已 star
};
EDU.isStar = function(id, n){
  var s = EDU.P.banks[id];
  return !!(s && s.star && s.star.indexOf(n) >= 0);
};
EDU.saveDraft = function(id, draft){
  bankState(id).draft = draft;
  EDU.saveProgress();
};
EDU.clearDraft = function(id){
  var s = bankState(id); s.draft = null;
  EDU.saveProgress(true);
};
EDU.bankProgress = function(id, total){ // 返回 [已完成数, 百分比]
  var s = EDU.P.banks[id];
  if (!s || !s.done) return [0, 0];
  var c = Object.keys(s.done).length;
  return [c, total ? Math.round(c / total * 100) : 0];
};

/* ===== 每日一题（全库按日期哈希取题） ===== */
EDU.dailyPick = function(idx){ // idx: window.EDU_INDEX
  if (!idx || !idx.length) return null;
  var total = 0, banks = [];
  idx.forEach(function(m){
    if (m.kind === 'single'){ banks.push(m); total += m.count; }
  });
  if (!total) return null;
  var d = new Date();
  var key = d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
  var h = 0;
  for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  var pick = h % total;
  for (var j = 0; j < banks.length; j++){
    if (pick < banks[j].count){
      return { bank: banks[j].id, n: pick + 1, dateKey: key };
    }
    pick -= banks[j].count;
  }
  return null;
};
EDU.dailyToday = function(){ // 今日是否已答
  var d = new Date();
  var key = d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
  return EDU.P.daily[key] || null;
};
function dayKey(d){
  d = d || new Date();
  return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
}
EDU.dayKey = dayKey;
function stampOf(k){
  var p = String(k).split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]).getTime();
}
EDU.checkinToday = function(){ // 今天打卡（做题/星标/每日一题都会触发，后端保存）
  if (!EDU.P.checkin) EDU.P.checkin = {};
  var k = dayKey();
  if (!EDU.P.checkin[k]) EDU.P.checkin[k] = Date.now();
  var ks = Object.keys(EDU.P.checkin);
  if (ks.length > 400){
    ks.sort(function(a, b){ return stampOf(a) - stampOf(b); });
    while (ks.length > 400) delete EDU.P.checkin[ks.shift()];
  }
};
EDU.isCheckin = function(k){
  return !!((EDU.P.checkin && EDU.P.checkin[k]) || (EDU.P.daily && EDU.P.daily[k]));
};
EDU.dailyRecord = function(key, bank, n, ans, ok){
  EDU.P.daily[key] = { n: n, bank: bank, ans: ans, ok: ok };
  // 保留最近 120 天
  var keys = Object.keys(EDU.P.daily).sort(function(a, b){ return stampOf(a) - stampOf(b); });
  while (keys.length > 120){ delete EDU.P.daily[keys.shift()]; }
  EDU.checkinToday();
  EDU.saveProgress(true);
};
EDU.streak = function(){ // 连续打卡天数（今天没打卡则从昨天数起）
  var s = 0, d = new Date();
  if (!EDU.isCheckin(dayKey(d))) d.setDate(d.getDate() - 1);
  for(;;){
    var key = dayKey(d);
    if (EDU.isCheckin(key)){ s++; d.setDate(d.getDate() - 1); }
    else break;
  }
  return s;
};

/* ===== 考试倒计时 ===== */
EDU.examCountdown = function(){
  var t = new Date(EDU.EXAM_DATE + 'T09:00:00+08:00') - new Date();
  if (t <= 0) return null;
  return Math.ceil(t / 86400000);
};

/* ===== 动态加载题库数据（装载页缓存优先，其次网络） ===== */
function execJS(code){
  (new Function(code))();
}
EDU.loadBank = function(bankId){
  return new Promise(function(res, rej){
    if (window.EDU_DATA && window.EDU_DATA[bankId]) return res(window.EDU_DATA[bankId]);
    var url = 'data/' + encodeURIComponent(bankId) + '.js';
    var finish = function(){
      var d = window.EDU_DATA && window.EDU_DATA[bankId];
      d ? res(d) : rej(new Error('data missing'));
    };
    var fromScript = function(){
      var s = document.createElement('script');
      s.src = url; s.onload = finish;
      s.onerror = function(){ rej(new Error('data load fail')); };
      document.head.appendChild(s);
    };
    if (window.caches && caches.match){
      caches.match(new URL(url, location.href).href).then(function(hit){
        if (hit) return hit.text();
        return fetch(url).then(function(r){
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        });
      }).then(function(code){ execJS(code); finish(); })
        .catch(function(){ fromScript(); });
    } else fromScript();
  });
};

/* ===== 讲义文本获取（同上：缓存优先） ===== */
EDU.fetchDoc = function(url){
  if (window.caches && caches.match){
    return caches.match(new URL(url, location.href).href).then(function(hit){
      if (hit) return hit.text();
      return fetch(url).then(function(r){
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      });
    });
  }
  return fetch(url).then(function(r){
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  });
};

/* ===== 极简 Markdown 渲染（讲义用，零依赖） ===== */
function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function inline(s){
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="link-lec">$1</a>');
  return s;
}
EDU.mdToHtml = function(md){
  var lines = md.replace(/\r\n/g,'\n').split('\n');
  var out = [], i = 0, inList = false, listTag = '';
  function closeList(){ if (inList){ out.push('</'+listTag+'>'); inList = false; } }
  while (i < lines.length){
    var ln = lines[i];
    if (/^```/.test(ln)){ // 代码块
      closeList();
      var buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])){ buf.push(lines[i]); i++; }
      i++;
      out.push('<pre><code>' + esc(buf.join('\n')) + '</code></pre>');
      continue;
    }
    var hm = ln.match(/^(#{1,6})\s+(.*)$/);
    if (hm){
      closeList();
      var lv = hm[1].length; if (lv > 4) lv = 4;
      out.push('<h'+lv+'>' + inline(hm[2]) + '</h'+lv+'>'); i++; continue;
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(ln)){ closeList(); out.push('<hr>'); i++; continue; }
    if (/^\s*\|/.test(ln) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i+1])){ // 表格
      closeList();
      var head = ln.split('|').slice(1, -1).map(function(x){ return x.trim(); });
      i += 2;
      var rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])){
        rows.push(lines[i].split('|').slice(1, -1).map(function(x){ return x.trim(); })); i++;
      }
      var t = '<table><thead><tr>' + head.map(function(x){ return '<th>'+inline(x)+'</th>'; }).join('') + '</tr></thead><tbody>';
      rows.forEach(function(r){
        t += '<tr>' + head.map(function(_, ci){ return '<td>'+inline(r[ci]||'')+'</td>'; }).join('') + '</tr>';
      });
      out.push(t + '</tbody></table>');
      continue;
    }
    var qm = ln.match(/^\s*>\s?(.*)$/);
    if (qm){
      closeList();
      var qb = [qm[1]];
      i++;
      while (i < lines.length && /^\s*>\s?/.test(lines[i])){ qb.push(lines[i].replace(/^\s*>\s?/,'')); i++; }
      out.push('<blockquote>' + EDU.mdToHtml(qb.join('\n')) + '</blockquote>');
      continue;
    }
    var um = ln.match(/^\s*[-*]\s+(.*)$/);
    var om2 = ln.match(/^\s*\d+[\.、]\s+(.*)$/);
    if (um || om2){
      var tag = um ? 'ul' : 'ol';
      if (!inList || listTag !== tag){ closeList(); out.push('<'+tag+'>'); inList = true; listTag = tag; }
      out.push('<li>' + inline((um ? um[1] : om2[1])) + '</li>');
      i++; continue;
    }
    if (!ln.trim()){ closeList(); i++; continue; }
    closeList();
    out.push('<p>' + inline(ln) + '</p>');
    i++;
  }
  closeList();
  return out.join('\n');
};
})();
