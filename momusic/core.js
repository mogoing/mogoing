/* ==========================================================
   烩菜听歌 · 数据层 core.js
   纯函数：搜索 / 直链解析 / 封面 / 歌词   （不含 DOM 与播放状态）
   ========================================================== */
(function (global) {
  'use strict';

  var GD        = 'https://music-api.gdstudio.xyz/api.php';
  var METING    = 'https://api.qijieya.cn/meting/';
  var VKEYS     = 'https://api.vkeys.cn/v2/music/netease';
  var VKEYS_QQ  = 'https://api.vkeys.cn/v2/music/tencent';
  var PROXY     = (global.MOMUSIC_PROXY ? String(global.MOMUSIC_PROXY).replace(/\/$/, '') : '');
  // 自建后端：B站音源兜底代理（解决冷门/付费歌曲播不了）
  var BACKEND   = 'https://api.mogoing.xyz';

  /* ---------------- 文本工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function plain(s) {
    return String(s || '').replace(/[（(【\[].*?[）)】\]]/g, '').replace(/\s/g, '').toLowerCase();
  }
  function stripTags(s) { return String(s || '').replace(/<\/?[^>]+>/g, ''); }
  function fixScheme(u) { return /^http:/i.test(u) ? u.replace(/^http:/i, 'https:') : u; }
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }
  function trackKey(t) {
    return plain(t && t.name) + '|' + plain(t && t.artist).replace(/[\/、,&]/g, '');
  }
  function isCover(t) { return COVER_RE.test(String((t && t.name) || '')); }

  /* ---------------- 原唱 / 翻唱识别 ---------------- */
  var COVER_RE = /翻唱|cover|翻自|钢琴版|钢琴曲|吉他版|女声版|女生版|男声版|DJ版|伴奏|纯音乐|remix|live|现场|改编|对唱|清唱|消音|和声版|加速版|慢速版|烟嗓|3D|环绕|史诗版|史詩版|epic|古风版|说唱版|戏腔|情感版|治愈版|深情版|温柔版|氛围版|伤感版|萨克斯|串烧|合辑|片段|试听|铃声|彩铃|remake|ver\.?|版本/i;
  var FAKE_ARTIST_RE = /epx\s*music|prodreversed|studio|工作室|音乐台|电台|合辑|歌单|翻唱|cover|dj|remix|伴奏|纯音乐|网络歌手|佚名|群星/i;
  var FAMOUS_RE = /周杰伦|周杰倫|jay|陈奕迅|陳奕迅|eason|林俊杰|林俊傑|jj|薛之谦|薛之謙|邓紫棋|鄧紫棋|gem|李荣浩|李榮浩|毛不易|华晨宇|華晨宇|张杰|張傑|王菲|那英|孙燕姿|孫燕姿|梁静茹|梁靜茹|五月天|陈绮贞|陳綺貞|田馥甄|hebe|张惠妹|張惠妹|a-mei|蔡依林|jolin|王力宏|陶喆|陶吉吉|汪苏泷|汪蘇瀧|许嵩|許嵩|周深|张学友|張學友|刘德华|劉德華|beyond|信乐团|苏打绿|蘇打綠|朴树|樸樹|赵雷|趙雷|g\.e\.m|杨千嬅|楊千嬅|容祖儿|容祖兒|twins|she|s\.h\.e/i;
  var SUSPECT_ARTIST_RE = /^(jay|jj|gem|eason|jolin|hebe|a-mei|jay\s*chou)$/i;

  /* ---------------- JSONP（绕过 CORS） ---------------- */
  var jsonpSeq = 0;
  function jsonp(url, timeoutMs) {
    return new Promise(function (resolve) {
      var cb = '__mmj' + (++jsonpSeq) + '_' + Math.random().toString(36).slice(2, 7);
      var script = document.createElement('script');
      var done = false;
      function finish(data) {
        if (done) return;
        done = true;
        try { script.remove(); } catch (e) {}
        try { delete global[cb]; } catch (e) { global[cb] = undefined; }
        resolve(data);
      }
      global[cb] = function (data) { finish(data); };
      script.onerror = function () { finish(null); };
      script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + cb;
      script.async = true;
      document.head.appendChild(script);
      setTimeout(function () { finish(null); }, timeoutMs || 12000);
    });
  }

  /* ---------------- 缓存 ---------------- */
  var picCache = new Map();
  var lyricCache = new Map();
  var urlCache = new Map();
  var URL_TTL = 20 * 60 * 1000;

  /* ================= 搜索 ================= */

  /* 网易云曲库：曲目最全，可无损 */
  async function searchGD(kw, pg, count) {
    try {
      var r = await fetch(GD + '?types=search&source=netease&name=' + encodeURIComponent(kw) +
        '&count=' + (count || 30) + '&pages=' + (pg || 1) + '&_=' + Date.now());
      if (!r.ok) return [];
      var arr = await r.json();
      if (!Array.isArray(arr)) return [];
      return arr.map(function (t) {
        return {
          id: String(t.id), uid: String(t.url_id || t.id),
          name: stripTags(t.name) || '未知歌曲',
          artist: Array.isArray(t.artist) ? t.artist.join('/') : stripTags(t.artist) || '未知歌手',
          album: stripTags(t.album), pic: String(t.pic_id || ''), source: 'netease'
        };
      });
    } catch (e) { return []; }
  }

  /* 酷狗：FileHash 多档变体 → meting 出真音频 */
  async function searchKugou(kw) {
    try {
      var j = await jsonp('https://songsearch.kugou.com/song_search_v2?keyword=' + encodeURIComponent(kw) +
        '&page=1&pagesize=20&platform=WebFilter&userid=0&clienttime=0&mid=1');
      var lists = (j && j.data && j.data.lists) || [];
      return lists.map(function (t) {
        var hs = [t.SQFileHash, t.HQFileHash, t.FileHash, t.ResFileHash]
          .map(function (h) { return String(h || '').toUpperCase(); })
          .filter(function (h, i, a) { return h && a.indexOf(h) === i; });
        return {
          id: 'kg_' + (hs[0] || Math.random().toString(36).slice(2)),
          name: stripTags(t.SongName || t.OriSongName) || '未知歌曲',
          artist: stripTags(t.SingerName) || '未知歌手',
          album: stripTags(t.AlbumName),
          cover: t.Image ? String(t.Image).replace(/{size}/g, '400') : '',
          source: 'kugou',
          kgHashes: hs,
          dur: Number(t.Duration || t.SQDuration || t.HQDuration || 0)
        };
      }).filter(function (x) { return x.kgHashes.length > 0; });
    } catch (e) { return []; }
  }

  /* QQ：songmid → vkeys（只收完整版） */
  async function searchQQ(kw) {
    try {
      var j = await jsonp('https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=' + encodeURIComponent(kw) +
        '&format=jsonp&n=20&p=1&cr=1&t=0');
      var list = (j && j.data && j.data.song && j.data.song.list) || [];
      return list.map(function (t) {
        var singer = (t.singer || []).map(function (s) { return s.name; }).join('/') || '未知歌手';
        return {
          id: 'qq_' + t.songmid,
          name: stripTags(t.songname),
          artist: singer,
          album: stripTags(t.albumname),
          cover: t.albummid ? 'https://y.gtimg.cn/music/photo_new/T002R300x300M000' + t.albummid + '.jpg' : '',
          source: 'qq',
          qqMid: String(t.songmid || ''),
          dur: Number(t.interval || 0)
        };
      }).filter(function (x) { return x.qqMid; });
    } catch (e) { return []; }
  }

  /* 网易云第二通道：vkeys（部分曲目 GD 没有，vkeys 有） */
  async function searchVkeys(kw) {
    try {
      var r = await fetch(VKEYS + '?word=' + encodeURIComponent(kw) + '&page=1&num=30&_=' + Date.now());
      if (!r.ok) return [];
      var j = await r.json();
      var arr = (j && j.data) || [];
      if (!Array.isArray(arr)) return [];
      return arr.map(function (t) {
        return {
          id: String(t.id), uid: String(t.id),
          name: stripTags(t.song || t.name) || '未知歌曲',
          artist: stripTags(t.singer || t.artist) || '未知歌手',
          album: stripTags(t.album),
          cover: fixScheme(String(t.cover || '')),
          source: 'netease',
          vk: true
        };
      });
    } catch (e) { return []; }
  }

  /* 同歌手其它歌（补队列 / 猜你喜欢） */
  async function searchArtistMore(artist) {
    if (!artist) return [];
    var want = plain(artist);
    if (!want) return [];
    for (var attempt = 0; attempt < 2; attempt++) {
      try {
        var r = await fetch(GD + '?types=search&source=netease&name=' + encodeURIComponent(artist) +
          '&count=24&pages=1&_=' + Date.now() + (attempt ? '&r=' + attempt : ''));
        if (!r.ok) { if (!attempt) { await sleep(400); continue; } return []; }
        var arr = await r.json();
        if (!Array.isArray(arr) || !arr.length) { if (!attempt) { await sleep(400); continue; } return []; }
        var out = arr.filter(function (t) {
          var ar = Array.isArray(t.artist) ? t.artist.join('/') : String(t.artist || '');
          if (plain(ar).indexOf(want) < 0) return false;   // 必须确实是这位歌手
          if (isCover(t)) return false;                    // 不要翻唱
          return true;
        }).map(function (t) {
          return {
            id: String(t.id), uid: String(t.url_id || t.id),
            name: stripTags(t.name) || '未知歌曲',
            artist: Array.isArray(t.artist) ? t.artist.join('/') : stripTags(t.artist) || '未知歌手',
            album: stripTags(t.album), pic: String(t.pic_id || ''), source: 'netease', more: true
          };
        });
        // 过滤后为空也重试一次（可能是接口返回了异常内容）
        if (!out.length && !attempt) { await sleep(400); continue; }
        return out;
      } catch (e) {
        if (!attempt) { await sleep(400); continue; }
        return [];
      }
    }
    return [];
  }

  /* 打分：谁更像"原唱" —— 关键是歌手与用户意图、歌曲名纯净度 */
  function scoreOf(t, songKw, artistHint) {
    var s = 0;
    var ar = String(t.artist || ''), pArt = plain(ar), name = String(t.name || ''), pn = plain(name);

    // ① 歌手是否命中用户输入的歌手（最高权重）
    if (artistHint) {
      if (pArt.indexOf(artistHint) >= 0) s += 200;      // 明确是这位歌手
      else s -= 60;                                      // 明确不是
    }

    // ② 歌名纯净度：越接近"纯歌名"越可能是原唱
    if (pn === songKw) s += 80;                          // 歌名一模一样
    else if (pn.indexOf(songKw) === 0) s += 30;          // 前缀相同

    // ③ 歌名带"原唱/翻自"字样 → 说明这首是翻唱，重罚
    if (/原唱\s*[:：]|翻自|翻唱/i.test(name)) s -= 150;

    // ④ 知名歌手加分（整词匹配，避免 jay 命中 "Jay" 这种假名）
    if (FAMOUS_RE.test(ar)) s += 60;

    // ⑤ 翻唱号 / 工作室重罚
    if (FAKE_ARTIST_RE.test(ar)) s -= 80;

    // ⑥ 英文假名（Jay / Lie / en / MIKA STUDIO 这类 2~12 位纯字母）轻微减分
    if (/^[A-Za-z][A-Za-z0-9 .]{1,14}$/.test(ar.trim())) s -= 30;

    // ⑦ 周杰伦类型 beat / type beat / 童声 / 钢琴这类，本身就是二创
    if (/type\s*beat|beat\s*$|童声|钢琴|女声|男声|深情|治愈|正式版|完整版|dj|remix|live|伴奏|纯音乐/i.test(name)) s -= 70;

    // ⑧ 时长过短（片段/铃声）
    var d = (t.dur && t.dur > 0 ? t.dur : 0);
    if (d && d < 120) s -= 60;

    // ⑨ B站来源：只要歌名和歌手都对得上，就是能用的一整首歌，给较高权重
    //   （B站没有"翻唱标记"体系，靠歌手命中判断更可靠）
    if (t.source === 'bilibili') {
      if (artistHint && pArt.indexOf(artistHint) >= 0) s += 90;
      if (pn === songKw) s += 40;
    }

    return s;
  }

  /* B站搜索：商业音源都没有时兜底（周杰伦等版权歌靠这路） */
  async function searchBilibili(kw, songKw) {
    try {
      var r = await fetch(BACKEND + '/api/bi/search?kw=' + encodeURIComponent(kw), {
        signal: AbortSignal.timeout(18000)
      });
      if (!r.ok) return [];
      var j = await r.json();
      if (!j || !j.ok || !Array.isArray(j.list)) return [];
      var wantKw = plain(songKw || kw);
      var ARTIST_RE = /周杰伦|周杰倫|赵雷|陈奕迅|薛之谦|薛之謙|林俊杰|林俊傑|邓紫棋|鄧紫棋|李荣浩|李榮浩|毛不易|王菲|那英|朴树|樸樹|Beyond|田馥甄|梁静茹|梁靜茹|张惠妹|張惠妹|蔡依林|刘若英|劉若英|张学友|張學友|刘德华|劉德華|周深|五月天|苏打绿|蘇打綠|汪苏泷|許嵩|许嵩|张杰|張傑|华晨宇|華晨宇|孙燕姿|孫燕姿|陶喆|王力宏|李健|逃跑计划|汪峰|杨宗纬|楊宗緯|萧煌奇|蕭煌奇|光良|周华健|周華健|郑智化|鄭智化|张雨生|張雨生|邓丽君|鄧麗君|任然|于文文|袁娅维|袁婭維|蔡健雅|张信哲|張信哲|伍佰|Tank|阿信|汪蘇瀧|GEM|周興哲|周兴哲/i;

      return j.list.map(function (v) {
        var title = String(v.title || '');
        // 去掉开头的【xxx】标签
        var clean = title.replace(/^\s*[【\[][^】\]]*[】\]]\s*/, '').trim();
        var artist = '', name = clean;

        var stripNoise = function (x) {
          return String(x || '')
            .replace(/[（(【\[].*?[）)】\]]/g, '')
            .replace(/\s*(MV|4K|8K|Hi-?Res|高清|超清|无损|完整版|修复版|歌词版|纯享|试听|现场|Live|2160P|1080P|720P)\s*/gi, ' ')
            .replace(/[''""「」『』《》【】]/g, '')
            .replace(/^[\s\-—丨|:：]+|[\s\-—丨|:：]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        };

        // 多种标题结构，逐个评估哪个解析结果最像目标歌名
        var tries = [];
        var m1 = /^(.{1,20}?)\s+-\s+(.+)$/.exec(clean);
        if (m1) tries.push({ artist: m1[1], name: m1[2] });
        var m2 = /^(.{1,20}?)\s*[《「](.+?)[》」]/.exec(clean);
        if (m2) tries.push({ artist: m2[1], name: m2[2] });
        var m3 = /^[《「【](.+?)[》」】]\s*(.+)$/.exec(clean);
        if (m3) tries.push({ artist: m3[2], name: m3[1] });
        var m4 = /^(.{1,20}?)\s*[-—丨|]\s*(.{1,20})$/.exec(clean);
        if (m4) { tries.push({ artist: m4[2], name: m4[1] }); tries.push({ artist: m4[1], name: m4[2] }); }
        tries.push({ artist: v.author || '', name: clean });

        var best = null, bestScore = -1;
        tries.forEach(function (cand) {
          var nm = stripNoise(cand.name);
          var ar = stripNoise(cand.artist);
          if (!nm) return;
          var sc = 0;
          if (wantKw && plain(nm).indexOf(wantKw) >= 0) sc += 8;
          if (plain(nm) === wantKw) sc += 4;
          // 歌手名如果本身就是知名歌手，加分；如果只是up主昵称，不加分
          if (ARTIST_RE.test(ar)) sc += 3;
          if (ar && ar.length <= 16) sc += 1;
          if (sc > bestScore) { bestScore = sc; best = { name: nm, artist: ar }; }
        });

        if (!best || !best.name) best = { name: stripNoise(clean) || clean, artist: '' };
        // 歌手字段若只是 UP 主昵称（含"音乐""私藏""歌单"等），丢掉
        if (best.artist && /音乐|私藏|歌单|电台|频道|听歌|每日|推荐|合集|搬运|up主|视频|剪辑/i.test(best.artist) && !ARTIST_RE.test(best.artist)) {
          best.artist = '';
        }

        return {
          id: 'bi_' + v.bvid,
          uid: 'bi_' + v.bvid,
          name: best.name || title || '未知歌曲',
          artist: best.artist || String(v.author || '未知歌手'),
          album: '',
          cover: String(v.pic || ''),
          source: 'bilibili',
          bvid: String(v.bvid || ''),
          dur: 0
        };
      }).filter(function (x) { return x.bvid && x.name; });
    } catch (e) { return []; }
  }

  /* 核心：搜索并挑出唯一"原唱" —— 只返回一首主曲 + 少量备选 */
  async function findBest(kw) {
    kw = String(kw || '').trim();
    if (!kw) return { hero: null, alts: [], all: [] };

    var parts = kw.split(/\s+/);
    var songKw = plain(parts[0]);
    var artistHint = parts.length > 1 ? plain(parts.slice(1).join('')) : '';

    // 并行拉网易云双通道（GD 曲库最全、vkeys 补漏），两路都为空才走酷狗/QQ
    var two = await Promise.all([searchGD(kw, 1, 30), searchVkeys(kw)]);
    var all = two[0].concat(two[1]);
    var needBackup = !all.some(function (t) {
      return plain(t.name).indexOf(songKw) >= 0;
    });
    if (needBackup) {
      var bk = await Promise.all([searchKugou(kw), searchQQ(kw), searchBilibili(kw, songKw)]);
      all = all.concat(bk[0], bk[1], bk[2]);
    }
    // 判断「是否已经有一个可信的原唱」
    // 关键：不能只看歌名匹配——「晴天 / Jay」「晴天 / 梦里啥都有」这类是假名/翻唱号，
    // 必须校验歌手像不像真歌手，否则 B 站兜底永远不会触发（周杰伦就永远落到 Jay）。
    var hasRealOriginal = all.some(function (t) {
      var pn = plain(t.name);
      if (pn.indexOf(songKw) < 0) return false;
      if (isCover(t)) return false;

      var ar = String(t.artist || ''), pArt = plain(ar);
      // ① 用户明确指定了歌手：必须是他
      if (artistHint) return pArt.indexOf(artistHint) >= 0;
      // ② 没指定歌手时，要求歌手「像真歌手」：
      //    不能是纯英文短名(Jay/Lie/en)、不能是翻唱号/工作室
      if (FAKE_ARTIST_RE.test(ar)) return false;
      if (/^[A-Za-z][A-Za-z0-9 .]{1,14}$/.test(ar.trim())) return false;  // Jay / Lie / MIKA
      // ③ 知名歌手直接算数
      if (FAMOUS_RE.test(ar)) return true;
      // ④ 其它情况：中文歌手名（≥2字）才算可信
      return /[\u4e00-\u9fa5]{2,}/.test(ar);
    });

    if (!hasRealOriginal) {
      // ① APK 内：原生一次搞定「搜索+取直链」，直接造一条可用结果
      if (hasNativeBi()) {
        // 带歌手搜更准；用户没给歌手时，用「歌名 + 常见歌手」不行，
        // 所以先按原词搜，B站标题里通常自带歌手
        var nbi = await nativeBilibili(kw, 26000);
        if (nbi && nbi.url) {
          var biArtist = parts.slice(1).join(' ') || String(nbi.title || '').match(/周杰伦|周杰倫|赵雷|陈奕迅|林俊杰|邓紫棋|薛之谦|李荣浩|毛不易|王菲|那英|朴树|田馥甄|梁静茹/);
          biArtist = (biArtist && biArtist[0]) || (parts.slice(1).join(' ') || '');
          all = all.concat([{
            id: 'bi_' + (nbi.bvid || Math.random().toString(36).slice(2)),
            uid: 'bi_' + (nbi.bvid || ''),
            name: (parts[0] || kw),                 // 用户搜的歌名
            artist: biArtist,                       // 从标题提取，或用用户给的
            album: '',
            cover: '',
            source: 'bilibili',
            bvid: nbi.bvid || '',
            dur: 0,
            _biUrl: nbi.url,                        // 已解析好的直链，省一次请求
            _biBr: nbi.br || 0
          }]);
        }
      }
      // ② 网页版：走搜索 + 后端代理
      var bi2 = await searchBilibili(kw, songKw);
      if (bi2.length) all = all.concat(bi2);
    }
    if (!all.length) return { hero: null, alts: [], all: [] };

    var seen = {}, exact = [], loose = [];
    all.forEach(function (t) {
      var k = trackKey(t);
      if (seen[k]) return;
      var pn = plain(t.name);
      // B站条目的标题是视频标题，解析后可能不含完整歌名，放宽为互相包含
      var nameHit = pn.indexOf(songKw) >= 0 ||
                    (t.source === 'bilibili' && songKw.indexOf(pn) >= 0 && pn.length >= 2);
      if (!nameHit) return;
      if (isCover(t) && !(artistHint && plain(t.artist).indexOf(artistHint) >= 0)) return;
      seen[k] = 1;
      (pn === songKw ? exact : loose).push(t);
    });

    var ranked = exact.concat(loose).sort(function (x, y) {
      return scoreOf(y, songKw, artistHint) - scoreOf(x, songKw, artistHint);
    });

    return { hero: ranked[0] || null, alts: ranked.slice(1, 6), all: ranked };
  }

  /* ================= 播放直链 ================= */
  async function gdUrl(uid, br, source) {
    for (var i = 0; i < 2; i++) {
      try {
        var r = await fetch(GD + '?types=url&source=' + encodeURIComponent(source || 'netease') +
          '&id=' + encodeURIComponent(uid) + '&br=' + br + '&_=' + Date.now());
        if (!r.ok) { if (i === 0) await sleep(350); continue; }
        var j = await r.json();
        if (!j || !j.url) { if (i === 0) await sleep(350); continue; }
        return { url: fixScheme(j.url), br: Number(j.br) || br };
      } catch (e) { if (i === 0) await sleep(350); }
    }
    return null;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function vkeysUrl(uid, q) {
    try {
      var r = await fetch(VKEYS + '?id=' + encodeURIComponent(uid) + '&quality=' + q + '&_=' + Date.now());
      if (!r.ok) return null;
      var j = await r.json();
      var d = j && j.data;
      if (!d || !d.url) return null;
      return { url: fixScheme(d.url), br: parseInt(String(d.kbps || ''), 10) || (q === 4 ? 320 : 128) };
    } catch (e) { return null; }
  }

  async function kugouUrl(t, brParam) {
    if (!t || !t.kgHashes || !t.kgHashes.length) return null;
    for (var i = 0; i < t.kgHashes.length; i++) {
      var u = METING + '?server=kugou&type=url&id=' + encodeURIComponent(t.kgHashes[i]) + (brParam ? '&br=' + brParam : '');
      try {
        var r = await fetch(u, { headers: { Range: 'bytes=0-15' } });
        var ct = r.headers.get('content-type') || '';
        if (r.ok && /audio|mpeg|octet-stream/i.test(ct)) {
          return { url: u, br: /br=999/.test(u) ? 999 : (parseInt(brParam, 10) || 320) };
        }
      } catch (e) {}
    }
    return null;
  }

  async function qqUrl(t, q) {
    if (!t || !t.qqMid) return null;
    try {
      var r = await fetch(VKEYS_QQ + '?mid=' + encodeURIComponent(t.qqMid) + '&quality=' + q + '&_=' + Date.now());
      if (!r.ok) return null;
      var j = await r.json();
      var d = j && j.data;
      if (!d || !d.url) return null;
      if (/试听/i.test(d.quality || '')) return null;   // 试听片段不要
      return { url: fixScheme(d.url), br: parseInt(String(d.kbps || ''), 10) || 0 };
    } catch (e) { return null; }
  }

  async function proxyUrl(uid, br) {
    if (!PROXY) return null;
    try {
      var r = await fetch(PROXY + '?id=' + encodeURIComponent(uid) + '&br=' + br + '&_=' + Date.now());
      if (!r.ok) return null;
      var j = await r.json();
      var d = j && (Array.isArray(j.data) ? j.data[0] : j.data);
      var u = (d && d.url) || (j && j.url);
      if (!u) return null;
      return { url: fixScheme(u), br: Number((d && d.br) || j.br) || br };
    } catch (e) { return null; }
  }

  /* ================= B站音源兜底 ================= */
  // B 站接口有防盗链（Origin 白名单），浏览器直连会被 CORS 拦。
  // 但 B 站音频 CDN 不限来源，<audio src> 能直接播。
  // 取音频 URL 这一步有两条路：
  //   ① APK 原生（AndroidBridge.biResolve）：Java 侧无 CORS，走手机自己的网络
  //   ② 自建后端代理（网页版用，但 CF 出口 IP 被 B 站风控，多数时候不可用）
  var biCache = new Map();
  var BI_TTL = 15 * 60 * 1000;
  var biSeq = 0;

  // 判断是否在 APK 里，且原生实现了 biResolve
  function hasNativeBi() {
    try {
      return typeof AndroidBridge !== 'undefined' && AndroidBridge
             && typeof AndroidBridge.biResolve === 'function';
    } catch (e) { return false; }
  }

  // 调 APK 原生解析，包成 Promise。超时/失败都返回 null，不影响后续流程。
  function nativeBilibili(kw, timeoutMs) {
    return new Promise(function (resolve) {
      if (!hasNativeBi()) { resolve(null); return; }

      var id = 'bi' + (++biSeq) + '_' + Math.random().toString(36).slice(2, 7);
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        cleanup();
        global.MUSIC_BI_ERR = 'native timeout ' + (timeoutMs || 22000) + 'ms';
        resolve(null);
      }, timeoutMs || 22000);

      function cleanup() {
        clearTimeout(timer);
        try { if (global.__biCb === wrapper) delete global.__biCb; } catch (e) {}
      }
      function wrapper(cbId, data) {
        if (done || cbId !== id) return;
        done = true;
        cleanup();
        if (!data) { global.MUSIC_BI_ERR = 'native null response'; resolve(null); return; }
        if (!data.ok || !data.url) {
          global.MUSIC_BI_ERR = 'native: ' + (data.error || 'no url');
          resolve(null);
          return;
        }
        global.MUSIC_BI_ERR = '';
        resolve({
          url: fixScheme(String(data.url)),
          br: Number(data.kbps) || 0,
          from: 'bilibili',
          bvid: String(data.bvid || ''),
          title: String(data.title || '')
        });
      }
      // 同一个回调入口，靠 cbId 区分并发请求
      var prev = global.__biCb;
      global.__biCb = function (cbId, data) {
        if (typeof prev === 'function') { try { prev(cbId, data); } catch (e) {} }
        wrapper(cbId, data);
      };

      try {
        AndroidBridge.biResolve(String(kw), id);
      } catch (e) {
        if (done) return;
        done = true; cleanup(); resolve(null);
      }
    });
  }

  async function bilibiliUrl(t, quality) {
    var name = String((t && t.name) || '').trim();
    var artist = String((t && t.artist) || '').split('/')[0].trim();
    if (!name) return null;

    // 去掉版本标记，提高命中「整首歌」的概率
    var cleanName = name.replace(/[（(【\[].*?[）)】\]]/g, '').replace(/\s+/g, ' ').trim();
    var kw = (cleanName + ' ' + artist).trim();
    var ckey = 'bi|' + kw.toLowerCase();
    var hit = biCache.get(ckey);
    if (hit && Date.now() - hit.at < BI_TTL) return hit;

    // ① 优先 APK 原生
    var nres = await nativeBilibili(kw, 22000);
    if (nres && nres.url) {
      nres.at = Date.now();
      biCache.set(ckey, nres);
      return nres;
    }

    // ② 退回后端代理（网页版；CF 出口常被 B 站 -412 拦，失败就放弃）
    try {
      var r = await fetch(BACKEND + '/api/bi/resolve?kw=' + encodeURIComponent(kw), {
        signal: AbortSignal.timeout(18000)
      });
      if (!r.ok) return null;
      var j = await r.json();
      if (!j || !j.ok || !j.url) return null;

      var res = {
        url: j.url,
        br: Number(j.kbps) || 0,
        from: 'bilibili',
        bvid: j.bvid || '',
        at: Date.now()
      };
      biCache.set(ckey, res);
      return res;
    } catch (e) { return null; }
  }

  /* 多通道路由，前端不暴露来源 */
  async function resolveUrl(t, quality) {
    if (!t) return null;
    var key = (t.uid || t.id || (t.kgHashes || [])[0] || t.qqMid) + '|' + quality;
    var hit = urlCache.get(key);
    if (hit && Date.now() - hit.at < URL_TTL) return hit;

    // 搜索阶段已经用原生解析好直链的（B站），直接用，不再发第二轮请求
    if (t._biUrl) {
      var pre = { url: t._biUrl, br: Number(t._biBr) || 0, from: 'bilibili', at: Date.now() };
      urlCache.set(key, pre);
      return pre;
    }

    var uid = t.uid || t.id;
    var isBili = (t.source === 'bilibili') || /^bi_/.test(String(uid || ''));
    var chain = [];

    // B站来源的曲目，商业音源一定拿不到，直接跳过省时间
    if (!isBili) {
      if (t.kgHashes && t.kgHashes.length) {
        if (quality === 'loss') chain.push(function () { return kugouUrl(t, '999'); });
        chain.push(
          function () { return kugouUrl(t, '320'); },
          function () { return kugouUrl(t, '128'); },
          function () { return kugouUrl(t, ''); }
        );
      }
      if (t.qqMid) {
        if (quality === 'loss') chain.push(function () { return qqUrl(t, 6); }, function () { return qqUrl(t, 5); });
        chain.push(function () { return qqUrl(t, 5); }, function () { return qqUrl(t, 4); }, function () { return qqUrl(t, 3); });
      }
      if (uid) {
        var src = t.source || 'netease';
        if (quality === 'loss') chain.push(
          function () { return gdUrl(uid, 999, src); },
          function () { return gdUrl(uid, 740, src); }
        );
        chain.push(function () { return gdUrl(uid, 320, src); });
        if (PROXY) chain.push(function () { return proxyUrl(uid, quality === 'loss' ? 999000 : 320000); });
        if (quality === 'loss') chain.push(function () { return vkeysUrl(uid, 5); });
        chain.push(
          function () { return vkeysUrl(uid, 4); },
          function () { return gdUrl(uid, 128, src); },
          function () { return vkeysUrl(uid, 2); }
        );
      }   // end if (uid)
    }     // end if (!isBili)
    // 最后一道兜底：所有商业音源都拿不到时，走 B 站（周杰伦等版权歌专用）
    chain.push(function () { return bilibiliUrl(t, quality); });

    for (var i = 0; i < chain.length; i++) {
      var res = await chain[i]();
      if (res && res.url) { res.at = Date.now(); urlCache.set(key, res); return res; }
    }
    return null;
  }

  /* 封面 */
  async function fetchPic(t, size) {
    if (!t) return '';
    if (t.cover) return fixScheme(t.cover);
    if (!t.pic) return '';
    size = size || 300;
    var key = t.pic + '|' + size;
    if (picCache.has(key)) return picCache.get(key);
    try {
      var r = await fetch(GD + '?types=pic&source=' + encodeURIComponent(t.source || 'netease') +
        '&id=' + encodeURIComponent(t.pic) + '&size=' + size + '&_=' + Date.now());
      if (!r.ok) return '';
      var j = await r.json();
      var u = (j && j.url) || '';
      if (u) picCache.set(key, u);
      return u;
    } catch (e) { return ''; }
  }

  /* ================= 歌词 ================= */
  function parseLRC(txt) {
    if (!txt) return [];
    var out = [], re = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    String(txt).split(/\r?\n/).forEach(function (line) {
      re.lastIndex = 0;
      var times = [], m;
      while ((m = re.exec(line)) !== null) {
        var ms = m[3] ? parseInt(m[3], 10) : 0;
        if (String(m[3] || '').length === 3) ms = ms; else if (String(m[3] || '').length === 1) ms *= 100; else if (String(m[3] || '').length === 2) ms *= 10;
        times.push(parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + ms / 1000);
      }
      if (!times.length) return;
      var text = line.replace(re, '').trim();
      if (!text) return;
      // 过滤制作人名单 / 版权声明这类非歌词行
      if (/^(作词|作曲|编曲|制作人|监制|混音|母带|录音|和声|吉他|贝斯|鼓|键盘|弦乐|出品|企划|统筹|发行|版权|演唱|原唱|翻唱|OP|SP|策划|文案|封面|视觉|录音室|特别鸣谢|词|曲)\s*[:：]/i.test(text)) return;
      times.forEach(function (tt) { out.push({ t: tt, text: text }); });
    });
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  async function lyricGD(id) {
    try {
      var r = await fetch(GD + '?types=lyric&source=netease&id=' + encodeURIComponent(id) + '&_=' + Date.now());
      if (!r.ok) return null;
      var j = await r.json();
      if (!j) return null;
      return { lrc: j.lyric || j.lrc || '', tr: j.tlyric || '' };
    } catch (e) { return null; }
  }
  /* 网易云第二通道（vkeys），GD 取不到时兜底 */
  async function lyricVkeys(id) {
    try {
      var r = await fetch(VKEYS + '/lyric?id=' + encodeURIComponent(id) + '&_=' + Date.now());
      if (!r.ok) return null;
      var j = await r.json();
      var d = j && j.data;
      if (!d || !d.lrc) return null;
      return { lrc: d.lrc, tr: d.tlyric || '' };
    } catch (e) { return null; }
  }
  async function lyricQQ(mid) {
    try {
      var r = await fetch(VKEYS_QQ + '/lyric?mid=' + encodeURIComponent(mid) + '&_=' + Date.now());
      if (!r.ok) return null;
      var j = await r.json();
      var d = j && j.data;
      if (!d || !d.lrc) return null;
      return { lrc: d.lrc, tr: '' };
    } catch (e) { return null; }
  }

  /* 取歌词：哪条路有就走哪条，实在没有再按歌名去网易云找一遍 */
  async function lyric(t) {
    if (!t) return null;
    var key = trackKey(t);
    if (lyricCache.has(key)) return lyricCache.get(key);

    var got = null;
    if (t.qqMid) got = await lyricQQ(t.qqMid);
    if ((!got || !got.lrc) && (t.source === 'netease' || /^\d+$/.test(String(t.id || '')))) {
      var nid = t.uid || t.id;
      got = await lyricGD(nid);
      if (!got || !got.lrc) got = await lyricVkeys(nid);   // GD 无词时换 vkeys
    }
    if (!got || !got.lrc) {
      // 保底：用歌名+歌手去网易云搜一次，拿 id 再取词
      try {
        var q = (t.name || '') + ' ' + ((t.artist || '').split('/')[0] || '');
        var arr = await searchGD(q.trim(), 1, 10);
        var cand = (arr || []).filter(function (x) {
          return plain(x.name).indexOf(plain(t.name)) >= 0 &&
                 plain(x.artist).indexOf(plain((t.artist || '').split('/')[0])) >= 0;
        })[0] || (arr || [])[0];
        if (cand) got = await lyricGD(cand.id);
      } catch (e) {}
    }
    if (!got || !got.lrc) { return null; }

    var lines = parseLRC(got.lrc);
    if (!lines.length) { return null; }

    // 译文按时间戳对齐
    var trMap = {};
    if (got.tr) {
      parseLRC(got.tr).forEach(function (l) { trMap[l.t.toFixed(2)] = l.text; });
    }
    lines.forEach(function (l) {
      var k2 = l.t.toFixed(2);
      if (trMap[k2]) l.tr = trMap[k2];
    });

    var res = { lines: lines, name: t.name, artist: t.artist };
    lyricCache.set(key, res);
    return res;
  }

  /* ================= 猜你喜欢 ================= */
  async function recommend(seedTracks, exclude) {
    var seeds = (seedTracks || []).filter(Boolean);
    var artists = [];
    seeds.forEach(function (t) {
      var a = String(t.artist || '').split('/')[0].trim();
      if (a && artists.indexOf(a) < 0) artists.push(a);
    });
    artists = artists.slice(0, 2);
    if (!artists.length) return [];

    var lists = await Promise.all(artists.map(function (a) { return searchArtistMore(a); }));
    var ex = {};
    (exclude || []).concat(seeds).forEach(function (t) { if (t) ex[trackKey(t)] = 1; });

    var out = [], seen = {};
    lists.forEach(function (arr) {
      (arr || []).forEach(function (t) {
        var k = trackKey(t);
        if (ex[k] || seen[k]) return;
        seen[k] = 1; out.push(t);
      });
    });
    return out.slice(0, 12);
  }

  global.MUSIC = {
    GD: GD, VKEYS: VKEYS, VKEYS_QQ: VKEYS_QQ, METING: METING,
    esc: esc, plain: plain, stripTags: stripTags, fmtTime: fmtTime, trackKey: trackKey,
    isCover: isCover, jsonp: jsonp,
    searchGD: searchGD, searchKugou: searchKugou, searchQQ: searchQQ, searchVkeys: searchVkeys,
    searchBilibili: searchBilibili, bilibiliUrl: bilibiliUrl, BACKEND: BACKEND,
    searchArtistMore: searchArtistMore, findBest: findBest,
    resolveUrl: resolveUrl, fetchPic: fetchPic,
    lyric: lyric, parseLRC: parseLRC,
    recommend: recommend
  };
})(window);
