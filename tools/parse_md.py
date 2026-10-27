# -*- coding: utf-8 -*-
"""把 edu/docs 下的 Markdown 题库解析成 edu/data/*.js（前端直接 <script> 加载）。
运行：python tools/parse_md.py
输出：edu/data/<id>.js + edu/data/index.js + edu/data/lectures.js + tools/parse_report.txt
"""
import os, re, sys, json, io, traceback

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # work02_edu
DOCS = os.path.join(ROOT, "edu", "docs")
OUT  = os.path.join(ROOT, "edu", "data")
REPORT = os.path.join(ROOT, "tools", "parse_report.txt")

report_lines = []
def log(s): report_lines.append(s)
def warn(m): log("[WARN] " + m)
def err(m): log("[ERROR] " + m)

def rel(p):
    return os.path.relpath(p, DOCS).replace("\\", "/")

def read(p):
    with io.open(p, encoding="utf-8") as f:
        return f.read().replace("\r\n", "\n")

def cut_tail(s):
    """截掉字段尾部混入的下一题/下一节内容：水平线、章节标题、答案速查表。"""
    if not s:
        return s
    for pat in (r"\n\s*---\s*\n", r"\n#{1,6}\s", r"\n\*\*答案速查表"):
        m = re.search(pat, s)
        if m:
            s = s[:m.start()]
    return s.strip()

SUBJECTS = [
    ("01-综合素质-笔试",      "zhsz", "综合素质", "coral"),
    ("02-教育教学知识与能力-笔试", "jyjs", "教育教学知识与能力", "mint"),
    ("03-面试",               "ms",   "面试", "grape"),
    ("06-模拟卷与真题资源",     "mock", "模拟卷", "sunny"),
]

LECTURES = {
    "01-综合素质-笔试/题库/01-单选题-职业理念": [
        ("01-综合素质-笔试/01-职业理念.md", "职业理念讲义"),
        ("01-综合素质-笔试/09-主观题万能答题模板.md", "主观题万能模板")],
    "01-综合素质-笔试/题库/02-单选题-法律法规": [
        ("01-综合素质-笔试/02-教育法律法规.md", "法律法规讲义")],
    "01-综合素质-笔试/题库/03-单选题-职业道德": [
        ("01-综合素质-笔试/03-教师职业道德规范.md", "职业道德讲义")],
    "01-综合素质-笔试/题库/04-单选题-文化素养": [
        ("01-综合素质-笔试/04-文化素养.md", "文化素养讲义")],
    "01-综合素质-笔试/题库/05-单选题-基本能力": [
        ("01-综合素质-笔试/06-基本能力-逻辑推理.md", "逻辑推理讲义"),
        ("01-综合素质-笔试/07-基本能力-信息处理.md", "信息处理讲义"),
        ("01-综合素质-笔试/05-基本能力-阅读理解.md", "阅读理解讲义")],
    "01-综合素质-笔试/题库/06-材料分析题专项": [
        ("01-综合素质-笔试/09-主观题万能答题模板.md", "主观题万能模板")],
    "01-综合素质-笔试/题库/07-写作题专项": [
        ("01-综合素质-笔试/08-写作-审题立意与结构.md", "写作审题立意与结构"),
        ("01-综合素质-笔试/10-作文素材库.md", "作文素材库")],
    "02-教育教学知识与能力-笔试/题库/01-单选题-教育基础": [
        ("02-教育教学知识与能力-笔试/01-教育基础.md", "教育基础讲义")],
    "02-教育教学知识与能力-笔试/题库/02-单选题-学生指导": [
        ("02-教育教学知识与能力-笔试/02-学生指导.md", "学生指导讲义")],
    "02-教育教学知识与能力-笔试/题库/03-单选题-班级管理": [
        ("02-教育教学知识与能力-笔试/03-班级管理.md", "班级管理讲义")],
    "02-教育教学知识与能力-笔试/题库/04-单选题-教学实施": [
        ("02-教育教学知识与能力-笔试/04-教学实施.md", "教学实施讲义")],
    "02-教育教学知识与能力-笔试/题库/05-单选题-教学设计": [
        ("02-教育教学知识与能力-笔试/05-教学设计万能模板.md", "教学设计万能模板")],
    "02-教育教学知识与能力-笔试/题库/06-简答题专项": [
        ("02-教育教学知识与能力-笔试/06-简答题高频考点背诵清单.md", "简答题高频考点背诵清单")],
    "02-教育教学知识与能力-笔试/题库/07-材料分析题专项": [
        ("02-教育教学知识与能力-笔试/07-材料分析题答题模板.md", "材料分析题答题模板")],
    "02-教育教学知识与能力-笔试/题库/08-教学设计题专项": [
        ("02-教育教学知识与能力-笔试/05-教学设计万能模板.md", "教学设计万能模板")],
    "03-面试/02-结构化面试题库": [
        ("03-面试/01-结构化面试七大题型总纲.md", "结构化面试七大题型总纲")],
    "03-面试/04-答辩常见问题": [
        ("03-面试/01-结构化面试七大题型总纲.md", "结构化面试七大题型总纲"),
        ("03-面试/06-面试礼仪与临场技巧.md", "面试礼仪与临场技巧")],
}

# ---------------- 单选（专项题库） ----------------
def parse_single(text):
    qs = []
    parts = re.split(r"\n(?=### 第\s*\d+\s*题)", text)
    for chunk in parts:
        m = re.match(r"###\s*第\s*(\d+)\s*题", chunk)
        if not m:
            continue
        n = int(m.group(1))
        body = chunk[m.end():]
        g = re.search(r"【题干】\s*([\s\S]*?)(?=\n\s*[A-D][\.．、]\s|\n\s*>\s*\*\*答案|\Z)", body)
        if not g:
            err("单选第%d题 找不到题干" % n); continue
        stem = cut_tail(g.group(1))
        opts, line4 = [], []
        rest = body[g.end():]
        for ln in rest.split("\n"):
            s = ln.strip()
            if s.startswith(">") or s.startswith("###"):
                break
            mm = re.match(r"^([A-D])[\.．、]\s*(.*)$", s)
            if mm:
                # 可能一行多个：A. xx　B. xx　C. xx　D. xx
                segs = re.split(r"(?=[A-D][\.．、]\s)", s)
                for seg in segs:
                    m2 = re.match(r"^([A-D])[\.．、]\s*(.*)$", seg.strip())
                    if m2:
                        line4.append((m2.group(1), m2.group(2).strip()))
                opts.extend(line4[-0:] and [(line4[-1])]) if False else None
                if len(line4) > len(opts):
                    opts = line4
            elif ln.strip():
                if opts:
                    opts[-1] = (opts[-1][0], opts[-1][1] + " " + ln.strip())
        am = re.search(r">\s*\*\*答案[：:]\s*([A-D]+)", body)
        ans = am.group(1) if am else ""
        sm = re.search(r">\s*\*\*解析[：:]\*\*\s*([\s\S]*)", body)
        sol = re.sub(r"\n\s*>", "\n", sm.group(1)).strip() if sm else ""
        sol = cut_tail(sol)
        if not ans: err("单选第%d题 无答案" % n)
        if len(opts) != 4: warn("单选第%d题 选项数=%d" % (n, len(opts)))
        qs.append({"n": n, "stem": stem, "opts": opts, "ans": ans, "sol": sol})
    return qs

# ---------------- 简答 ----------------
def parse_short(text):
    qs = []
    parts = re.split(r"\n(?=### 第\s*\d+\s*题)", text)
    for chunk in parts:
        m = re.match(r"###\s*第\s*(\d+)\s*题\s*[\u3000\s]*(.*)", chunk)
        if not m: continue
        n = int(m.group(1)); title = m.group(2).strip()
        body = chunk[m.end():]
        qm = re.search(r"\*\*【题目】\*\*\s*([\s\S]*?)(?=\n\s*\*\*【参考答案】\*\*)", body)
        if not qm:
            qm = re.search(r"【题目】\s*([\s\S]*?)(?=\n*\s*【参考答案】)", body)
        stem = qm.group(1).strip() if qm else (title if title else "")
        am = re.search(r"\*\*【参考答案】\*\*\s*([\s\S]*?)(?=\n\s*\*\*【记忆提示】|\n\s*---|\n### |\Z)", body)
        if not am:
            am = re.search(r"【参考答案】\s*([\s\S]*)", body)
        sol = cut_tail(am.group(1)) if am else ""
        tm = re.search(r"\*\*【记忆提示】\*\*\s*([\s\S]*)", body)
        tip = cut_tail(tm.group(1)) if tm else ""
        if not sol: err("简答第%d题 无参考答案" % n)
        if not stem: stem = title
        qs.append({"n": n, "stem": stem, "opts": [], "ans": "", "sol": sol, "tip": tip})
    return qs

# ---------------- 材料 ----------------
def parse_material(text):
    qs = []
    parts = re.split(r"\n(?=### 第\s*\d+\s*题)", text)
    for chunk in parts:
        m = re.match(r"###\s*第\s*(\d+)\s*题\s*[\u3000\s]*(.*)", chunk)
        if not m: continue
        n = int(m.group(1)); title = m.group(2).strip()
        body = chunk[m.end():]
        mat = ""
        mm = re.search(r"\*\*材料\*\*\s*([\s\S]*?)(?=\n\s*\*\*设问\*\*\s*\n)", body)
        if mm: mat = cut_tail(mm.group(1))
        ask = ""
        am2 = re.search(r"\*\*设问\*\*\s*\n\s*([\s\S]*?)(?=\n\*\*【参考答案】\*\*)", body)
        if am2: ask = am2.group(1).strip()
        if not ask:
            q2 = re.search(r"【设问】\s*([\s\S]*?)(?=\*\*【参考答案】\*\*)", body)
            ask = q2.group(1).strip() if q2 else ""
        a3 = re.search(r"【参考答案】\*\*\s*([\s\S]*?)(?=\n\s*\*\*【采分点】\*\*|\n### |\Z)", body)
        ans = cut_tail(a3.group(1)) if a3 else ""
        t4 = re.search(r"\*\*【采分点】\*\*\s*([\s\S]*)", body)
        tip = cut_tail(t4.group(1)) if t4 else ""
        if not ans: err("材料第%d题 无参考答案" % n)
        qs.append({"n": n, "stem": (mat if mat else ""), "ask": ask or title,
                   "opts": [], "ans": "", "sol": ans, "tip": tip})
    return qs

# ---------------- 写作 ----------------
def parse_writing(text):
    qs = []
    parts = re.split(r"\n(?=### 题目\s*\d+)", text)
    for chunk in parts:
        m = re.match(r"###\s*题目\s*(\d+)\s*[\u3000\s]*(.*)", chunk)
        if not m: continue
        n = int(m.group(1)); title = m.group(2).strip()
        body = chunk[m.end():]
        mat = ""
        mm = re.search(r"\*\*材料\*\*\s*([\s\S]*?)(?=\n\s*\*\*审题立意提示\*\*)", body)
        if mm: mat = cut_tail(mm.group(1))
        sol = cut_tail(body[mm.end():]) if mm else cut_tail(body)
        qs.append({"n": n, "stem": mat, "title": title, "opts": [], "ans": "", "sol": sol})
    return qs

# ---------------- 教学设计 ----------------
def parse_design(text):
    qs = []
    parts = re.split(r"\n(?=### 第\s*\d+\s*题)", text)
    for chunk in parts:
        m = re.match(r"###\s*第\s*(\d+)\s*题\s*[\u3000\s]*(.*)", chunk)
        if not m: continue
        n = int(m.group(1)); title = m.group(2).strip()
        body = chunk[m.end():]
        mat = ""
        mm = re.search(r"\*\*教材素材\*\*\s*([\s\S]*?)(?=\n\s*\*\*任务要求\*\*)", body)
        if mm: mat = cut_tail(mm.group(1))
        task = ""
        tm = re.search(r"\*\*任务要求\*\*\s*\n([\s\S]*?)(?=\n\s*\*\*【参考要点】\*\*|\Z)", body)
        if tm: task = cut_tail(tm.group(1))
        a3 = re.search(r"【参考要点】\*\*\s*([\s\S]*)", body)
        sol = cut_tail(a3.group(1)) if a3 else ""
        if not sol: err("教学设计第%d题 无参考要点" % n)
        qs.append({"n": n, "stem": mat, "task": task, "title": title,
                   "opts": [], "ans": "", "sol": sol})
    return qs

# ---------------- 面试（结构化 / 答辩） ----------------
def parse_interview(text):
    """结构化：**N.【题目】** +【答题思路】+【参考答案】；答辩：+【答题要点】+【参考回答】"""
    qs = []
    blocks = re.split(r"\n(?=\*\*\d+\.【题目】)", text)
    for chunk in blocks:
        m = re.match(r"\*\*(\d+)\.【题目】\*\*\s*([\s\S]*?)(?=\n\s*\*\*【(?:答题思路|答题要点)】\*\*|\n\s*\*\*【参考答案】\*\*|\n\s*\*\*【参考回答】\*\*|\n---)", chunk)
        if not m: continue
        n = int(m.group(1)); stem = m.group(2).strip()
        th = re.search(r"【(?:答题思路|答题要点)】\*\*\s*([\s\S]*?)(?=\n\s*\*\*【(?:参考答案|参考回答)】\*\*|\n---)", chunk)
        thought = cut_tail(th.group(1)) if th else ""
        ta = re.search(r"【(?:参考答案|参考回答)】\*\*\s*([\s\S]*?)(?=\n---|\n## |\Z)", chunk)
        sol = cut_tail(ta.group(1)) if ta else ""
        if not sol: err("面试第%d题 无参考答案" % n)
        if not stem: warn("面试第%d题 题干为空" % n)
        qs.append({"n": n, "stem": stem, "opts": [], "ans": "", "sol": sol, "tip": thought})
    return qs

# ---------------- 模拟卷（两种结构） ----------------
def _split_choice_line(s):
    """一行四个选项：A. xx　B. xx　C. xx　D. xx。
    只在“空白+字母+点”的边界处切分，选项内容里出现 A-D 字母（如 =SUM(A1:A10)）不受影响。"""
    out = []
    for seg in re.split(r"(?:^|\s+)(?=[A-D][\.．、]\s?)", s):
        mm = re.match(r"^([A-D])[\.．、]\s*(.*)$", seg.strip())
        if mm:
            out.append((mm.group(1), mm.group(2).strip()))
    return out

def parse_mock(text, path):
    fname = os.path.basename(path)
    # 答案区标题两种：参考答案与解析 / 参考答案与评分要点
    mp = re.search(r"\n#\s*参考答案与[^\n]+", text)
    if not mp:
        err("模拟卷 %s 找不到答案区" % fname); return [], None
    subj_dir = "06-模拟卷与真题资源/"
    is_jy = "教育教学" in fname
    qpart = text[:mp.start()]
    apart = text[mp.end():]

    score_by_type = {"single": 2, "short": 10 if is_jy else 0,
                     "material": 20 if is_jy else 14, "writing": 50, "design": 40}
    qs = {}

    # ---- 试题区：按 ## 分节追踪题型 ----
    cur_type = None
    # 切 ## 节
    secs = re.split(r"\n(?=## )", qpart)
    for sec in secs:
        sm = re.match(r"##\s*([^\n]+)", sec)
        secline = sm.group(1) if sm else ""
        if "单项选择题" in secline: cur_type = "single"
        elif "简答题" in secline: cur_type = "short"
        elif "材料分析题" in secline: cur_type = "material"
        elif "教学设计题" in secline: cur_type = "design"
        elif "写作题" in secline: cur_type = "writing"
        elif sec is qpart: cur_type = None  # 文件头
        body = sec[sm.end():] if sm else sec

        if cur_type == "single":
            for m in re.finditer(r"\*\*(\d+)\.\*\*\s*([\s\S]*?)(?=\n\*\*\d+\.\*\*|\n## |\n### |\Z)", body):
                n = int(m.group(1)); bb = m.group(2).strip()
                lines = bb.split("\n")
                stem = re.sub(r"\s*（\s*）\s*$", "", lines[0]).strip()
                stem_lines = [stem]
                opt_start = 0
                for i, ln in enumerate(lines):
                    if re.match(r"^[A-D][\.．、]\s", ln.strip()):
                        opt_start = i; break
                # 题干可能多行：选项行之前的其余行并入题干
                for j in range(1, opt_start if opt_start else len(lines)):
                    if opt_start and j == opt_start: break
                    s2 = lines[j].strip()
                    if s2 and not s2.startswith("A.") and not s2.startswith("B."):
                        stem_lines.append(s2)
                opts = []
                if opt_start:
                    joined = " ".join(l.strip() for l in lines[opt_start:])
                    opts = _split_choice_line(joined)
                qs[n] = {"n": n, "type": "single",
                         "stem": "\n".join(stem_lines).strip(),
                         "opts": opts[:4], "ans": "", "sol": ""}
        elif cur_type in ("material", "design", "writing"):
            pat = r"###\s*(\d+)\.[^\n]*\n"
            for m in re.finditer(pat + r"([\s\S]*?)(?=\n###\s*\d+\.|\n## |\Z)", body):
                n = int(m.group(1)); bb = m.group(2).strip()
                if cur_type == "writing":
                    qs[n] = {"n": n, "type": "writing", "stem": bb, "opts": [], "ans": "", "sol": ""}
                elif cur_type == "design":
                    qs[n] = {"n": n, "type": "design", "stem": bb, "opts": [], "ans": "", "sol": ""}
                else:
                    qs[n] = {"n": n, "type": "material", "stem": bb, "opts": [], "ans": "", "sol": ""}
        elif cur_type == "short":
            for m in re.finditer(r"\*\*(\d+)\.\*\*\s*([^\n]+)", body):
                n = int(m.group(1))
                qs[n] = {"n": n, "type": "short", "stem": m.group(2).strip(), "opts": [], "ans": "", "sol": ""}

    # ---- 答案区 ----
    # 1) 单选：速查表（| 题号 | 1 | 2 | ... | + | 答案 | A | D | ... |）
    tm = re.findall(r"\| 题号 \|([^\n]*)\n\| --- [^\n]*\n\| 答案 \|([^\n]*)", apart)
    for nums, ans in tm:
        ns = [x.strip() for x in nums.split("|") if x.strip()]
        as_ = [x.strip() for x in ans.split("|") if x.strip()]
        for a, b in zip(ns, as_):
            try:
                n = int(a)
                if n in qs: qs[n]["ans"] = b
            except ValueError:
                pass
    # 2) 单选逐题解析 **N. X。** 解析
    for m in re.finditer(r"\*\*(\d+)\.\s*([A-D])。\*\*\s*([^\n]*)", apart):
        n = int(m.group(1))
        if n in qs:
            qs[n]["ans"] = qs[n]["ans"] or m.group(2)
            qs[n]["sol"] = m.group(3).strip()
    # 3) 综合素质格式：**N.【答案】X** + 【解析】...
    for m in re.finditer(r"\*\*(\d+)\.【答案】([A-D]+)\*\*\s*\n?【解析】([^\n]*)", apart):
        n = int(m.group(1))
        if n in qs:
            qs[n]["ans"] = qs[n]["ans"] or m.group(2)
            qs[n]["sol"] = m.group(3).strip()
    # 4) 主观题答案：### N.【参考答案】/ ### N. xxx（10 分）/ ### N.（20 分）
    for m in re.finditer(r"###\s*(\d+)\.[^\n]*?\n([\s\S]*?)(?=\n###\s*\d+\.|\n###\s*【|\n## |\Z)", apart):
        n = int(m.group(1)); bb = m.group(2).strip()
        if n in qs and not qs[n]["sol"]:
            qs[n]["sol"] = bb
        elif n in qs:
            qs[n]["sol"] = (qs[n]["sol"] + "\n" + bb).strip()
    # 写作：写作指导 + 范文
    wg = re.search(r"###\s*(\d+)\.【写作指导】\s*\n([\s\S]*?)(?=\n### 【范文】|\Z)", apart)
    if wg:
        n = int(wg.group(1))
        if n in qs:
            qs[n]["sol"] = (qs[n]["sol"] + "\n\n" + wg.group(2).strip()).strip()
    fw = re.search(r"###\s*【范文】\s*\n([\s\S]*)", apart)
    if fw:
        for n, q in qs.items():
            if q["type"] == "writing":
                q["sol"] = (q["sol"] + "\n\n【参考范文】\n" + fw.group(1).strip()).strip()

    # ---- 组装 + 分值 ----
    out = []
    for n in sorted(qs):
        q = qs[n]
        q["score"] = score_by_type.get(q["type"], 0)
        if q["type"] == "single":
            if not q["ans"]: err("模拟卷 %s 第%d题 无答案" % (fname, n))
            if len(q["opts"]) != 4: warn("模拟卷 %s 第%d题 选项数=%d" % (fname, n, len(q["opts"])))
        else:
            if not q["sol"]: warn("模拟卷 %s 第%d题 无参考答案" % (fname, n))
        out.append(q)

    # parts
    parts_meta = []
    if is_jy:
        parts_meta = [
            {"name": "单项选择题", "type": "single", "score": 2, "from": 1, "to": 20},
            {"name": "简答题", "type": "short", "score": 10, "from": 21, "to": 23},
            {"name": "材料分析题", "type": "material", "score": 20, "from": 24, "to": 25},
            {"name": "教学设计题", "type": "design", "score": 40, "from": 26, "to": 26},
        ]
    else:
        parts_meta = [
            {"name": "单项选择题", "type": "single", "score": 2, "from": 1, "to": 29},
            {"name": "材料分析题", "type": "material", "score": 14, "from": 30, "to": 32},
            {"name": "写作题", "type": "writing", "score": 50, "from": 33, "to": 33},
        ]
    return out, {"parts": parts_meta, "totalScore": 150}

# ---------------- 主流程 ----------------
def main():
    meta, data = [], {}

    bank_files = []
    for dirpath, dirs, files in os.walk(DOCS):
        for fn in files:
            if not fn.lower().endswith(".md"):
                continue
            p = os.path.join(dirpath, fn)
            r = rel(p)
            is_bank = ("题库" in r.split("/") or
                       "面试题库" in fn or
                       "答辩" in fn or
                       "模拟卷" in r)
            if not is_bank:
                continue
            if fn.startswith("00-") and "题库" not in r:
                continue
            bank_files.append((r, p, fn))

    counter = 0
    for r, p, fn in sorted(bank_files):
        counter += 1
        skey, sname = None, None
        for d, k, n, color in SUBJECTS:
            if r.startswith(d + "/"):
                skey, sname = k, n
                break
        if skey is None:
            err("未知科目目录: " + r); continue
        if "模拟卷与真题资源" in r:
            skey, sname = "mock", "模拟卷"
        elif "面试" in r:
            skey, sname = "ms", "面试"

        text = read(p)
        parts_info = None
        kind = None
        if skey == "mock":
            qs, parts_info = parse_mock(text, p)
            kind = "mixed"
        elif "单选题" in fn:
            qs = parse_single(text); kind = "single"
        elif "简答题" in fn:
            qs = parse_short(text); kind = "short"
        elif "材料分析" in fn:
            qs = parse_material(text); kind = "material"
        elif "写作题" in fn:
            qs = parse_writing(text); kind = "writing"
        elif "教学设计题" in fn:
            qs = parse_design(text); kind = "design"
        elif "结构化面试" in fn or "答辩" in fn:
            qs = parse_interview(text); kind = "interview"
        else:
            err("无法识别题库类型: " + fn); continue

        if not qs:
            err("题库解析为空: " + r); continue

        # id
        idbase = re.sub(r"[（）()（）\s·、,，+]+", "-", os.path.splitext(fn)[0])
        idbase = re.sub(r"-+", "-", idbase).strip("-")
        bank_id = "%s-%02d-%s" % (skey, counter, idbase)

        base = os.path.splitext(fn)[0]
        title = re.sub(r"（.*?）", "", base).strip()
        title = title.replace("专项", "").replace("题库", "").replace("单选题", "单选").strip()
        suggest = {"single": 45, "short": 60, "material": 60, "writing": 60,
                   "design": 60, "interview": 20, "mixed": 120}[kind]

        lec = []
        for prefix, links in LECTURES.items():
            if r.startswith(prefix):
                lec = links; break

        m = {
            "id": bank_id, "sub": skey, "subName": sname,
            "title": title, "kind": kind, "count": len(qs),
            "suggestMin": suggest, "doc": r,
            "lectures": [{"url": "docs/" + u, "title": t} for u, t in lec],
            "qs": qs,
        }
        if parts_info:
            m.update(parts_info)
        meta.append(m)
        data[bank_id] = qs
        log("OK %-52s %-9s %3d题 %s" % (bank_id, kind, len(qs), fn))

    total = sum(len(v) for v in data.values())
    log("")
    log("总计 %d 个题库, %d 道题" % (len(data), total))
    if total < 1100:
        warn("题量 %d 少于预期 1100+" % total)

    # 校验单题
    bad = 0
    for m in meta:
        for q in m["qs"]:
            if m["kind"] == "single" and (not q["ans"] or len(q["opts"]) != 4):
                bad += 1
                err("校验失败 %s 第%d题" % (m["id"], q["n"]))
    log("校验失败题数: %d" % bad)

    os.makedirs(OUT, exist_ok=True)
    for m in meta:
        bid = m["id"]
        with io.open(os.path.join(OUT, bid + ".js"), "w", encoding="utf-8") as f:
            f.write("/* auto-generated by tools/parse_md.py */\n")
            f.write("window.EDU_DATA=window.EDU_DATA||{};\n")
            f.write("EDU_DATA[%s]=%s;\n" % (
                json.dumps(bid, ensure_ascii=False),
                json.dumps({"meta": {k: v for k, v in m.items() if k != "qs"},
                            "q": m["qs"]}, ensure_ascii=False, separators=(",", ":"))))
    idx = [{k: v for k, v in m.items() if k != "qs"} for m in meta]
    with io.open(os.path.join(OUT, "index.js"), "w", encoding="utf-8") as f:
        f.write("/* auto-generated by tools/parse_md.py */\n")
        f.write("window.EDU_INDEX=%s;\n" % json.dumps(idx, ensure_ascii=False, separators=(",", ":")))

    # 讲义索引（题库以外的 md），并反查每个讲义关联的题库
    lecs = []
    for dirpath, dirs, files in os.walk(DOCS):
        for fn in files:
            if not fn.lower().endswith(".md"):
                continue
            r = rel(os.path.join(dirpath, fn))
            if "题库" in r:
                continue
            for d, k, n, color in SUBJECTS:
                if r.startswith(d + "/"):
                    banks = [m["id"] for m in meta
                             if any(l["url"] == "docs/" + r for l in m.get("lectures", []))]
                    lecs.append({"url": "docs/" + r,
                                 "title": os.path.splitext(fn)[0],
                                 "sub": k, "subName": n, "banks": banks})
                    break
    with io.open(os.path.join(OUT, "lectures.js"), "w", encoding="utf-8") as f:
        f.write("/* auto-generated by tools/parse_md.py */\n")
        f.write("window.EDU_LECTURES=%s;\n" % json.dumps(lecs, ensure_ascii=False, separators=(",", ":")))
    log("讲义索引: %d 篇" % len(lecs))

    with io.open(REPORT, "w", encoding="utf-8") as f:
        f.write("\n".join(report_lines) + "\n")
    print("\n".join(report_lines))
    if any(l.startswith("[ERROR]") for l in report_lines):
        sys.exit(1)

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        traceback.print_exc()
        sys.exit(2)
