# huicai-wx —— 烩菜微信小程序专用资源

这个目录只放「烩菜 Braised」微信小程序（`Braised` 项目）走的静态资源，别和仓库里 H5 的 `assets/` 混用。

## 为什么在这里

小程序「代码质量」有一条规则：**代码包内图片和音频合计 ≤ 200K**（不是单个文件 200K，主包+分包一起算）。
所以小程序的代码包里不放图片，全部从 CDN 引：

```
https://mogoing.github.io/mogoing/huicai-wx/banner/b1.jpg
https://mogoing.github.io/mogoing/huicai-wx/textures/soil-diffuse-512.jpg
```

## 目录

| 路径 | 用途 | 小程序里的引用 |
|---|---|---|
| `banner/b1~b3.jpg` | 大厅轮播图（1100×550，2:1，JPEG q78） | `pages/index/index.js` → `BANNERS[].img` |
| `textures/*-512.jpg` | 3D 菜园 PBR 贴图（512×512，2 的幂） | `game3d/pages/garden/index.js` → `SOIL_TEXTURES` / `GROUND_TEXTURES` |

## 改图规矩

- **同名覆盖**：换图直接覆盖同名文件，小程序里的 URL 不用改（贴图带 `ASSET_VERSION` 版本号，改图时同步 +1 才会刷缓存）。
- 贴图必须是 **512×512、2 的幂**，否则 WebGL 的 `RepeatWrapping` 和 mipmap 失效，地面会发糊/报错。
- 这里不是源码目录，源文件在 Braised 项目的 `_cdn/` 里，上传即拷贝。

_本目录由小程序项目维护，别处的资源别往这里放。_
