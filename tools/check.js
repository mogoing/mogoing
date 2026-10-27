/* 全站自检：HTML 内嵌 JS 语法 + 数据完整性 + 链接有效性 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = 'D:/APPLE/deepseek-harness/work02_edu';
let fails = 0, warns = 0;
const F = m => { fails++; console.log('[FAIL] ' + m); };
const W = m => { warns++; console.log('[WARN] ' + m); };
const OK = m => console.log('[ok] ' + m);

/* 1. HTML 内嵌脚本语法 */
for (const f of ['main.html', 'edu/load.html', 'edu/index.html', 'edu/zuoti.html', 'edu/kaoshi.html', 'edu/ziliao.html', 'edu/list.html', 'edu/quiz.html', 'edu/all.html', 'edu/doc.html', 'edu/videos.html', 'edu/video.html']) {
  const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  scripts.forEach((s, i) => {
    try { new Function(s); } catch (e) { F(f + ' inline script#' + i + ': ' + e.message); }
  });
  OK(f + ' scripts=' + scripts.length);
}

/* 2. 数据完整性 */
const sandbox = {}; sandbox.window = sandbox; // 浏览器里 window 就是全局
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'edu/data/index.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'edu/data/lectures.js'), 'utf8'), sandbox);
const idx = sandbox.window.EDU_INDEX || F('EDU_INDEX missing');
const lecs = sandbox.window.EDU_LECTURES || [];
OK('banks=' + idx.length + ', lectures=' + lecs.length);

let totalQ = 0;
for (const m of idx) {
  const fp = path.join(ROOT, 'edu/data', m.id + '.js');
  if (!fs.existsSync(fp)) { F('data file missing: ' + m.id); continue; }
  const sb2 = {}; sb2.window = sb2; vm.createContext(sb2);
  vm.runInContext(fs.readFileSync(fp, 'utf8'), sb2);
  const d = sb2.window.EDU_DATA && sb2.window.EDU_DATA[m.id];
  if (!d) { F('EDU_DATA missing in ' + m.id); continue; }
  if (!d.q || !d.q.length) { F('empty q in ' + m.id); continue; }
  if (d.q.length !== m.count) F(m.id + ' count mismatch: meta=' + m.count + ' actual=' + d.q.length);
  totalQ += d.q.length;
  const ns = new Set(d.q.map(q => q.n));
  if (ns.size !== d.q.length) W(m.id + ' 题号重复');
  let i = 0;
  for (const q of d.q) {
    i++;
    if (m.kind === 'single') {
      if (!q.opts || q.opts.length !== 4) { F(m.id + ' #' + q.n + ' opts=' + (q.opts || []).length); continue; }
      if (!/^[A-D]{1,2}$/.test(q.ans)) F(m.id + ' #' + q.n + ' ans invalid: ' + q.ans);
      else {
        for (const ch of q.ans) if (!q.opts.some(o => o[0] === ch)) F(m.id + ' #' + q.n + ' ans ' + ch + ' not in opts');
      }
      if (!q.stem) F(m.id + ' #' + q.n + ' empty stem');
      if (!q.sol) W(m.id + ' #' + q.n + ' 无解析');
    } else if (!q.sol) { W(m.id + ' #' + q.n + ' 无参考答案'); }
  }
  // 讲义映射指向的文件存在
  for (const l of (m.lectures || [])) {
    if (!fs.existsSync(path.join(ROOT, 'edu', l.url))) F(m.id + ' lecture missing: ' + l.url);
  }
}
OK('total questions=' + totalQ);
if (totalQ < 1100) W('题量 <1100');

/* 3. 讲义文件存在性 */
for (const l of lecs) {
  if (!fs.existsSync(path.join(ROOT, 'edu', l.url))) F('lecture file missing: ' + l.url);
  if (!Array.isArray(l.banks)) W('lecture no banks: ' + l.title);
}

/* 4. 页面引用资源存在性 */
const refs = {
  'edu/index.html': ['css/edu.css', 'js/common.js', 'data/index.js', 'manifest.json', 'sw.js'],
  'edu/list.html': ['css/edu.css', 'js/common.js', 'data/index.js', 'manifest.json'],
  'edu/quiz.html': ['css/edu.css', 'js/common.js', 'data/index.js', 'manifest.json'],
  'edu/all.html': ['css/edu.css', 'js/common.js', 'data/index.js', 'manifest.json'],
  'edu/doc.html': ['css/edu.css', 'js/common.js', 'data/index.js', 'data/lectures.js', 'manifest.json'],
};
for (const [page, rs] of Object.entries(refs)) {
  for (const r of rs) {
    if (!fs.existsSync(path.join(ROOT, 'edu', r))) F(page + ' 引用缺失: ' + r);
  }
}
for (const ic of ['assets/icon-192.png', 'assets/icon-512.png']) {
  if (!fs.existsSync(path.join(ROOT, 'edu', ic))) F('icon missing: ' + ic);
}

/* 5. main.html 结构检查 */
const main = fs.readFileSync(path.join(ROOT, 'main.html'), 'utf8');
if (!main.includes("name:'教资刷题'")) F('main.html 缺教资入口');
if (!/GAMES = \[\s*\r?\n\s*\{ name:'教资刷题'/.test(main)) F('教资入口不在第一位');
if (!main.includes("target:'edu/load.html'")) F('教资入口应指向 edu/load.html（装载页）');
if (main.includes('--page-w') || main.includes('PER_PAGE')) W('main.html 残留旧变量');
OK('main.html 结构检查完毕');

/* 6. 装载页清单一致性：manifest.json ↔ 磁盘文件双向比对 */
const mfPath = path.join(ROOT, 'edu/data/manifest.json');
if (!fs.existsSync(mfPath)) F('edu/data/manifest.json 缺失（先跑 tools/gen_manifest.py）');
else {
  const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
  const entries = Object.entries(mf.files || {});
  OK('manifest ver=' + mf.ver + ' files=' + entries.length);
  if (!entries.length) F('manifest.files 为空');
  let miss = 0;
  for (const [rel, info] of entries) {
    const fp = path.join(ROOT, 'edu', rel);
    if (!fs.existsSync(fp)) { F('manifest 引用不存在的文件: ' + rel); miss++; continue; }
    if (fs.statSync(fp).size !== info.size) { F('manifest size 不符: ' + rel); miss++; }
  }
  // 反向：磁盘 data/*.js 必须全部在 manifest
  for (const fn of fs.readdirSync(path.join(ROOT, 'edu/data'))) {
    if (fn.endsWith('.js') && !mf.files['data/' + fn]) W('data 文件未入清单: ' + fn);
  }
  // crypto.subtle 算 SHA-256 校验抽样（前3个文件）
  const crypto = require('crypto');
  let checked = 0;
  for (const [rel, info] of entries) {
    if (checked >= 3) break;
    const fp = path.join(ROOT, 'edu', rel);
    const h = crypto.createHash('sha256').update(fs.readFileSync(fp)).digest('hex');
    if (h !== info.sha) { F('manifest sha 不符: ' + rel); miss++; }
    checked++;
  }
  if (!miss) OK('manifest 与磁盘双向一致（sha 抽样通过）');
}

/* 7. 装载页与页面返回链 + 新版三卡片结构 */
const load = fs.readFileSync(path.join(ROOT, 'edu/load.html'), 'utf8');
for (const kw of ['edu-res-', 'sha256', '跳过，直接进', '返回主菜单', 'data/manifest.json']) {
  if (!load.includes(kw)) F('load.html 缺关键逻辑: ' + kw);
}
const idxHtml = fs.readFileSync(path.join(ROOT, 'edu/index.html'), 'utf8');
for (const kw of ['zuoti.html', 'kaoshi.html', 'ziliao.html', 'list.html#star', 'list.html#wrong', 'big-card']) {
  if (!idxHtml.includes(kw)) F('index.html 缺: ' + kw);
}
const quizHtml = fs.readFileSync(path.join(ROOT, 'edu/quiz.html'), 'utf8');
if (!quizHtml.includes("kaoshi.html") || !quizHtml.includes("zuoti.html")) F('quiz.html 返回键未按入口动态指向');
// 交卷回归：showReport 必须接收 auto，且按模式区分解析展示范围
if (!/showReport\(stat,\s*auto\)/.test(quizHtml)) F('quiz.html showReport 未传 auto（交卷死页 bug）');
if (!quizHtml.includes("isExam")) F('quiz.html 缺考试/刷题解析范围区分');
const videoHtmlSrc = fs.readFileSync(path.join(ROOT, 'edu/video.html'), 'utf8');
if (!/function esc\(/.test(videoHtmlSrc)) F('video.html 缺 esc 函数（页面卡加载中 bug）');
const docSrc = fs.readFileSync(path.join(ROOT, 'edu/doc.html'), 'utf8');
if (!docSrc.includes("state.sub !== 'all'")) F('doc.html 分类筛选未生效');
for (const [f2, kws] of [['edu/zuoti.html', ['综合素质 · 科目一', '教育教学知识与能力 · 科目二', '结构化 + 答辩', 'quiz.html?bank=']],
                         ['edu/kaoshi.html', ['EXAMS', '120', 'mock-18', 'quiz.html?bank=']],
                         ['edu/ziliao.html', ['doc.html', 'videos.html', 'all.html']]]) {
  const c = fs.readFileSync(path.join(ROOT, f2), 'utf8');
  for (const kw of kws) if (!c.includes(kw)) F(f2 + ' 缺: ' + kw);
}
OK('返回链与新结构检查完毕');

/* 8. 视频模块 */
const vsPath = path.join(ROOT, 'edu/js/videos.js');
if (!fs.existsSync(vsPath)) F('edu/js/videos.js 缺失');
else {
  const sb3 = {}; sb3.window = sb3; vm.createContext(sb3);
  vm.runInContext(fs.readFileSync(vsPath, 'utf8'), sb3);
  const vids = sb3.window.EDU_VIDEOS || [];
  if (!vids.length) F('EDU_VIDEOS 为空');
  else {
    OK('videos=' + vids.length);
    const badV = vids.filter(v => !v.title || !v.url || !v.type ||
      (v.type === 'bili' && !v.bv) || (v.type === 'm3u8' && !/\.m3u8($|\?)/.test(v.url)) ||
      (v.type !== 'bili' && v.type !== 'm3u8' && !/^https?:\/\//.test(v.url)));
    if (badV.length) F('视频数据字段异常: ' + badV.map(v => v.title).join(' / '));
    const videoHtml = fs.readFileSync(path.join(ROOT, 'edu/video.html'), 'utf8');
    const videosHtml = fs.readFileSync(path.join(ROOT, 'edu/videos.html'), 'utf8');
    for (const kw of ['player.bilibili.com', 'hls', 'goBtn', 'goBank']) {
      if (!videoHtml.includes(kw)) F('video.html 缺逻辑: ' + kw);
    }
    if (!videosHtml.includes('video.html?i=')) F('videos.html 未链接播放页');
    if (!videoHtml.includes('videos.html')) W('video.html 返回键应指向 videos.html');
  }
}

/* 9. 考试日期有效性：必须是未来日期，防止倒计时再变成“已开考” */
const commonJs = fs.readFileSync(path.join(ROOT, 'edu/js/common.js'), 'utf8');
const dm = commonJs.match(/EXAM_DATE\s*=\s*'(\d{4}-\d{2}-\d{2})'/);
if (!dm) F('common.js 缺 EXAM_DATE 配置');
else {
  const exam = new Date(dm[1] + 'T09:00:00+08:00');
  const days = Math.ceil((exam - new Date()) / 86400000);
  if (days <= 0) F('EXAM_DATE ' + dm[1] + ' 已过期，倒计时会显示“待官方公布”');
  else OK('EXAM_DATE=' + dm[1] + '（还剩 ' + days + ' 天）');
}

console.log('\n========== 结果: FAIL=' + fails + ' WARN=' + warns + ' ==========');
process.exit(fails ? 1 : 0);
