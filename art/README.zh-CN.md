[English](README.md) | **简体中文**

# 美术工具

这些脚本用 `source/` 中的原始图片生成插件显示的所有图画 —— 开场、她的静态分层图像、
入场与换装时的动态形象 —— 全部为纯矢量 SVG。

## 准备（一次即可）

需要 Python 3.11 或更高版本。在仓库顶层文件夹中运行：

```
python -m venv .venv
.venv\Scripts\pip install -r art/requirements.txt        （Windows）
.venv/bin/pip install -r art/requirements.txt            （macOS / Linux）
```

## 重新生成

在仓库顶层文件夹中，用该环境的 Python 运行：

```
python art/scripts/prep.py art
python art/scripts/compose.py art --plugin plugin
```

1. **`prep.py`** 从每张角色设定图中裁出正面形象，去掉白色背景，并处理标志图：
   生成 `art/build/front-dress.png`、`front-maid.png`、`logo.png`。
2. **`compose.py`** 把它们描摹为矢量图（缓存在 `art/build/final/`），简化轮廓，排布场景和
   动画，检查每张图画是否超出应用的大小限制，然后写出：
   - `plugin/hooks/art/*.ts` 和 `plugin/hooks/scenes.ts` —— 插件显示的图画
   - `art/build/scenes/*.png` —— 用于查看效果的静态图

有了 `art/build/final/` 中的缓存（已提交到仓库），重新生成约需一分钟，并能精确重现仓库中的
图画。加上 `--retrace` 可从头重新描摹图片（修改 `source/` 或描摹参数后需要；耗时几分钟）。

## 文件

| 文件 | 作用 |
|---|---|
| `scripts/prep.py` | 裁剪并抠出原始图片 |
| `scripts/trace.py` | 用 vtracer 把 PNG 描摹成 SVG（由 compose.py 调用） |
| `scripts/svgopt.py` | 压缩描摹后的 SVG：相对路径数据、去掉杂点、简化轮廓 |
| `scripts/compose.py` | 生成所有场景和动画，并写入插件 |
| `scripts/gaps.py` | 诊断工具：列出抠图后仍不透明的近白色区域 |
| `source/` | 原始图片（AI 生成）：两张角色设定图和标志 |
| `build/final/` | compose.py 使用的描摹矢量图（缓存，已提交） |

## 应用的限制

Claude 桌面应用每张图画最多显示 **131,072 个字符**，并会在整个背景超过固定总量（约 22 万至
32.5 万字符之间）时静默拒绝绘制。若某张图画超过前一个限制，compose.py 会报错停止；整个静态
场景（地面、她的分层图像、花瓣）请保持在约 22 万字符以内 —— 脚本会打印每项的总数。

动画只在一次性的"动态"图画（开场、入场与换装）中播放：它们的 CSS 静止状态必须与静态图层
显示的画面一致，因为每张动态图画结束时，应用会显示它的一份静态副本。

## 添加服装或姿势

1. 把新的角色设定图放入 `source/`，人物正面朝前、白色背景。
2. 在 `prep.py` 中添加它的裁剪区域；在 `compose.py` 中把它加到 `"dress"` 和 `"maid"` 旁边。
3. 用 `--retrace` 重新生成，查看 `art/build/scenes/` 中的静态图，然后在
   `plugin/hooks/register.tsx` 中接入新服装（`Outfit` 类型、菜单和命令）。

## 许可证

`source/`、`build/final/` 中的图片以及由它们生成的一切采用 [CC BY-NC 4.0](../LICENSE-ART.md)
（禁止出售）；脚本采用 [MIT](../LICENSE)。
