# -*- coding: utf-8 -*-
"""生成 edu/data/manifest.js：装载页用（URL → 大小 + SHA-256）。
范围：edu/data/*.js（index/lectures/21个题库）+ edu/docs/**/*.md
运行：python tools/gen_manifest.py
"""
import os, sys, json, hashlib, io, time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EDU = os.path.join(ROOT, "edu")

def sha256(b):
    return hashlib.sha256(b).hexdigest()

files = {}
# 题库数据
for fn in sorted(os.listdir(os.path.join(EDU, "data"))):
    if not fn.endswith(".js") or fn in ("manifest.js",):
        continue
    p = os.path.join(EDU, "data", fn)
    with open(p, "rb") as f:
        raw = f.read()
    files["data/" + fn] = {"size": len(raw), "sha": sha256(raw)}
# 讲义 md
docs = os.path.join(EDU, "docs")
for dp, dns, fns in os.walk(docs):
    for fn in fns:
        if not fn.lower().endswith(".md"):
            continue
        full = os.path.join(dp, fn)
        rel = "docs/" + os.path.relpath(full, docs).replace("\\", "/")
        with open(full, "rb") as f:
            raw = f.read()
        files[rel] = {"size": len(raw), "sha": sha256(raw)}

# 版本 = 内容指纹（任一文件变化即整体换缓存名，天然失效旧缓存）
master = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()[:12]
ver = "r" + master

out = {
    "ver": ver,
    "generated": time.strftime("%Y-%m-%d %H:%M"),
    "files": files,
}
with io.open(os.path.join(EDU, "data", "manifest.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

total = sum(v["size"] for v in files.values())
print("manifest ver=%s files=%d total=%.2f MB" % (ver, len(files), total / 1048576))
