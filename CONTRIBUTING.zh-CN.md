[English](CONTRIBUTING.md) | **简体中文**

# 参与 claudia-theme

感谢你的帮助！代码、动画、美术、文档、问题反馈和创意都非常欢迎。请友善、建设性地交流 ——
见 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。

## 参与方式

- **报告问题** 或 **提出建议**：使用模板新建一个 Issue。报告问题时，附上截图以及你的应用和
  Claude Code 版本会很有帮助。
- **改进插件**：动画、菜单、跟随窗口的方式、新的设置项。
- **添加美术作品**：新服装、新姿势、新开场。见 [art/README.zh-CN.md](art/README.zh-CN.md)。
- **改进文档**，或把它翻译成其他语言。

## 贡献如何被合并

1. 在 GitHub 上 **Fork** 本仓库，并克隆你的副本。
2. 为你的修改新建一个 **分支**（`git switch -c my-change`）。
3. 完成修改，**进行测试**（见下文），并用清楚的说明提交。
4. 向 `main` 分支发起 **Pull Request**，说明你改了什么、为什么改；对于看得见的变化，请附上
   截图或简短的录屏。
5. 维护者审核后可能会请你做些修改；批准后即会合并。

小而专注的 Pull Request 比大的更容易审核。如果是较大的改动，请先开一个 Issue 讨论。

## 仓库结构

```
plugin/                 Claude Code 插件（大家安装的部分）
  .claude-plugin/       插件清单（plugin.json）和图标
  hooks/register.tsx    插件逻辑：主题、背景、菜单、命令
  hooks/*.tsx           小的绘制模块（小花、菜单项、窗口感应条）
  hooks/art/            图画（自动生成 —— 请勿手动编辑）
  hooks/register.test.tsx  测试
art/                    用原始图片生成图画的工具
.claude-plugin/         让本仓库可以被安装的插件市场文件
docs/images/            截图
```

## 在应用中试用你的修改

启动一个从你的文件夹加载插件的 Claude Code 会话：

```
claude --plugin-dir ./plugin
```

或在启动桌面应用前，把文件夹写入环境变量 `CLAUDE_CODE_PLUGIN_DIRS`。打开一个 Code 对话即可
看到效果。

## 提交 Pull Request 前的检查

在仓库顶层文件夹中运行：

```
claude plugin validate .
claude plugin validate plugin
claude plugin test plugin
```

三项都应通过。修改任何行为时，请在 `plugin/hooks/register.test.tsx` 中添加或更新测试。

## 修改美术作品

请不要手动编辑 `plugin/hooks/art/*.ts`：它们是自动生成的。修改原始图片或 `art/` 中的工具，
按照 [art/README.zh-CN.md](art/README.zh-CN.md) 重新生成，并把重新生成的文件和你的修改一起提交。请注意
应用的限制：一张图画最多 131,072 个字符，整个背景须保持在约 220,000 个字符以内。

## 版本与更新日志

维护者在发布时设置 `plugin/.claude-plugin/plugin.json` 中的版本号。请在
[CHANGELOG.md](CHANGELOG.md) 的 **Unreleased** 下添加一行说明你的修改。

## 贡献内容的许可

提交贡献即表示你同意：你的代码采用 MIT 许可证（`LICENSE`），你的美术作品采用 CC BY-NC 4.0
（`LICENSE-ART.md`），与项目其余部分相同。
