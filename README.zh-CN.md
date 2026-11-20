[English](README.md) | **简体中文**

# Claudia —— Claude Code 主题

为 **Claude 桌面应用** 中的 Claude Code 打造的动画角色主题：华丽的标志开场动画、
站在对话背后的橙发图书管理员少女，以及贯穿整个应用的橙、奶油与金色配色。

![开场：标志在打开的书上组合而成](docs/images/intro.png)

| 白色连衣裙 | 女仆装 |
|---|---|
| ![身穿白色连衣裙](docs/images/steady-dress-light.png) | ![身穿女仆装](docs/images/steady-maid-light.png) |

> 非官方同人项目。"Claude" 是 Anthropic 的商标；本主题并非由 Anthropic 制作或认可。

## 功能

- **每次新会话的开场（约 6 秒）：** 一本书缓缓展开，标志的字母逐个升起，花朵绽放，
  丝带舒展，花瓣迸散，整个画面居中于聊天区域。随后她在柔光中现身。
- **背景：** 她站在右侧，在任何窗口尺寸下都完整显示，从头到脚；背景是奶油色羊皮纸
  （深色模式下为黑色天鹅绒与灯光），飘落的花瓣与金色刺绣点缀其间。
- **两套服装** —— 白色连衣裙与女仆装，切换时伴随一道闪光与旋转的花瓣。
- **提示框上方的 ✿ 小花** 打开一行菜单：服装、清晰度、重播开场、校准，以及隐藏或显示整个主题。
- **跟随窗口变化：** 右侧边栏打开或关闭、窗口大小改变时，她会先消失，待一切静止后
  再以入场动画回到边栏旁边。

## 使用要求

- Claude 桌面应用中的 **Code** 对话（移动应用显示背景和简化菜单；终端会话只提供 `/claudia` 命令）。
- 支持插件的 Claude Code（已在 Windows 11 上的 Claude Code 2.1.326 与桌面应用 6.6395 中测试）。

## 安装

在终端中的 Claude Code 会话提示符处输入：

```
/plugin install claudia-theme --marketplace DavidZeng-creator/claudia-theme
```

输入 `y` 添加插件市场，然后选择用户范围（列表中的第一项），这样它会在所有会话中生效。
也可以在命令行中运行：

```
claude plugin install claudia-theme --marketplace DavidZeng-creator/claudia-theme
```

在桌面应用中：点击提示框旁的 **+**，选择 **Plugins**，点击 **Add marketplace** 并输入
`DavidZeng-creator/claudia-theme`，然后点击 **Add plugin**。

以后更新：运行 `claude plugin update claudia-theme@claudia-theme`，然后开始一个新会话。

## 第一步：让她与你的窗口对齐

应用只告诉插件聊天区域的宽度，而不告诉窗口的宽度，所以插件需要测量一次你的会话列表：

1. 关闭右侧边栏。
2. 点击提示框上方的 ✿ 小花，选择 **Calibrate**（校准），或输入 `/claudia calibrate`。
3. 在会话列表边缘右侧紧挨着的背景上点击一下。

调整或折叠会话列表、或更改应用文字大小之后，请再校准一次。
完整说明、设置、命令与已知限制见 [plugin/README.zh-CN.md](plugin/README.zh-CN.md)。

## 参与贡献

欢迎所有人改进这个主题 —— 代码、动画、新服装、翻译、问题反馈与创意。请先阅读
[CONTRIBUTING.zh-CN.md](CONTRIBUTING.zh-CN.md)；用原始图片生成所有图画的美术工具在
[art/](art/README.zh-CN.md) 文件夹中。

## 许可证

- **代码：** [MIT](LICENSE) —— 可自由使用、修改和分享。
- **美术作品：** [CC BY-NC 4.0](LICENSE-ART.md) —— 可自由使用、修改和分享，但不得出售。

各版本的更新内容见 [CHANGELOG.md](CHANGELOG.md)。
