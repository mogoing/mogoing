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
for (const f of ['main.html', 'edu/load.html', 'edu/index.html', 'edu/list.html', 'edu/quiz.html', 'edu/all.html', 'edu/doc.html']) {
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

/* 7. 装载页与页面返回链 */
const load = fs.readFileSync(path.join(ROOT, 'edu/load.html'), 'utf8');
for (const kw of ['edu-res-', 'sha256', '跳过，直接进', '← 主菜单', 'data/manifest.json']) {
  if (!load.includes(kw)) F('load.html 缺关键逻辑: ' + kw);
}
const idxHtml = fs.readFileSync(path.join(ROOT, 'edu/index.html'), 'utf8');
if (!idxHtml.includes('← 主菜单')) W('index.html 返回键不是主菜单样式');
const quizHtml = fs.readFileSync(path.join(ROOT, 'edu/quiz.html'), 'utf8');
if (!quizHtml.includes('← 上一级')) W('quiz.html 返回键不是上一级样式');
OK('返回链检查完毕');

console.log('\n========== 结果: FAIL=' + fails + ' WARN=' + warns + ' ==========');
process.exit(fails ? 1 : 0);
