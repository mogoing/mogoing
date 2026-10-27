# -*- coding: utf-8 -*-
"""通过 GitHub API 把整站上传到 mogoing/mogoing 仓库（tree/commit 方式，保留历史）。
用法：GH_TOKEN=xxx python tools/deploy.py [--repo mogoing/mogoing] [--branch main] [--message "..."]
上传范围：main.html + edu/**（含 docs/data/PWA）+ tools/** + PRODUCT.md + DESIGN.md
"""
import os, sys, json, base64, time, urllib.request, urllib.error, io

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = "mogoing/mogoing"
BRANCH = "main"
MESSAGE = "edu: 教资刷题模块上线（1127题/考试模式/汇总搜索/讲义/PWA）+ 主页拆盲盒改直显宫格"

# 上传清单
INCLUDE_FILES = ["main.html", "PRODUCT.md", "DESIGN.md"]
INCLUDE_DIRS = ["edu", "tools"]
EXCLUDE_PARTS = {"__pycache__", ".pyc", "debug", "parse_report.txt"}

def want(rel):
    parts = rel.replace("\\", "/").split("/")
    if rel.startswith("tools/"):
        base = os.path.basename(rel)
        if "__pycache__" in rel: return False
        if base.startswith("debug"): return False
        if base == "parse_report.txt": return False
    return True

def collect():
    files = []
    for f in INCLUDE_FILES:
        p = os.path.join(ROOT, f)
        if os.path.isfile(p): files.append((f, p))
    for d in INCLUDE_DIRS:
        for dp, dns, fns in os.walk(os.path.join(ROOT, d)):
            for fn in fns:
                full = os.path.join(dp, fn)
                rel = os.path.relpath(full, ROOT).replace("\\", "/")
                if want(rel): files.append((rel, full))
    return sorted(set(files))

class GH:
    def __init__(self, token):
        self.token = token
        self.h = {
            "Authorization": "token " + token,
            "User-Agent": "doubao-agent",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        }
    def req(self, method, path, body=None):
        url = "https://api.github.com" + path
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(url, data=data, headers=self.h, method=method)
        try:
            with urllib.request.urlopen(r, timeout=30) as resp:
                txt = resp.read().decode()
                return resp.status, (json.loads(txt) if txt else {})
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read().decode() or "{}")

def main():
    token = os.environ.get("GH_TOKEN")
    if not token:
        print("ERROR: 未设置 GH_TOKEN 环境变量"); sys.exit(2)
    gh = GH(token)

    # 0. 权限验证
    st, info = gh.req("GET", "/repos/" + REPO)
    if st != 200:
        print("ERROR: 无法访问仓库 %s (%s) %s" % (REPO, st, info.get("message", ""))); sys.exit(1)
    perms = info.get("permissions", {})
    if not perms.get("push"):
        print("ERROR: token 无 push 权限"); sys.exit(1)
    default_branch = info.get("default_branch", BRANCH)
    print("repo OK: %s (default=%s)" % (REPO, default_branch))

    # 1. 当前 commit / tree
    st, ref = gh.req("GET", "/repos/%s/git/ref/heads/%s" % (REPO, default_branch))
    if st != 200:
        print("ERROR: 获取分支失败", st, ref); sys.exit(1)
    commit_sha = ref["object"]["sha"]
    st, cinfo = gh.req("GET", "/repos/%s/commits/%s" % (REPO, commit_sha))
    if st != 200:
        print("ERROR: 获取 commit 失败", st); sys.exit(1)
    base_tree = cinfo["commit"]["tree"]["sha"] if "commit" in cinfo else cinfo["tree"]["sha"]
    print("base commit:", commit_sha[:10], "tree:", base_tree[:10])

    # 2. blobs
    files = collect()
    print("待上传文件数:", len(files))
    tree_items = []
    for i, (rel, full) in enumerate(files):
        with io.open(full, "rb") as f:
            raw = f.read()
        st, b = gh.req("POST", "/repos/%s/git/blobs" % REPO,
                       {"content": base64.b64encode(raw).decode(), "encoding": "base64"})
        if st != 201:
            print("ERROR blob:", rel, st, b.get("message", "")); sys.exit(1)
        tree_items.append({"path": rel, "mode": "100644", "type": "blob", "sha": b["sha"]})
        if (i + 1) % 20 == 0:
            print("  blobs %d/%d" % (i + 1, len(files)))

    # 3. tree（base_tree 保证未列出的文件保留）
    st, t = gh.req("POST", "/repos/%s/git/trees" % REPO, {"base_tree": base_tree, "tree": tree_items})
    if st != 201:
        print("ERROR tree:", st, t); sys.exit(1)
    print("new tree:", t["sha"][:10])

    # 4. commit
    st, nc = gh.req("POST", "/repos/%s/git/commits" % REPO,
                    {"message": MESSAGE, "tree": t["sha"], "parents": [commit_sha]})
    if st != 201:
        print("ERROR commit:", st, nc); sys.exit(1)
    print("new commit:", nc["sha"][:10])

    # 5. 推进分支
    st, u = gh.req("PATCH", "/repos/%s/git/refs/heads/%s" % (REPO, default_branch),
                   {"sha": nc["sha"], "force": False})
    if st != 200:
        print("ERROR push:", st, u); sys.exit(1)
    print("PUSHED -> %s@%s" % (default_branch, nc["sha"][:10]))

    # 6. 轮询 Pages 构建
    print("等待 GitHub Pages 构建…")
    for i in range(24):
        time.sleep(10)
        st, pb = gh.req("GET", "/repos/%s/pages/builds/latest" % REPO)
        if st == 200:
            status = pb.get("status")
            print("  pages build: %s" % status)
            if status == "built":
                print("DEPLOY DONE: https://mogoing.github.io/mogoing/main.html")
                return
            if status == "errored":
                print("PAGES BUILD ERROR:", json.dumps(pb, ensure_ascii=False)[:500]); sys.exit(1)
        else:
            print("  pages API: %s（可能未启用 Pages）" % st)
            if st == 404:
                print("提交完成，但该仓库未启用 Pages 或 API 不可见。")
                return
    print("构建超时（可稍后手动查看 Actions/Pages 状态）")

if __name__ == "__main__":
    main()
