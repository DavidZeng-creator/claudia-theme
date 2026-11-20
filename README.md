**English** | [简体中文](README.zh-CN.md)

# Claudia — a theme for Claude Code

An animated, character-themed look for Claude Code in the **Claude desktop app**: an ornate
wordmark opening, an orange-haired librarian standing behind your conversation, and an
orange, cream and gold palette across the whole app.

![The opening: the wordmark assembling on an open book](docs/images/intro.png)

| White dress | Maid outfit |
|---|---|
| ![In the white dress](docs/images/steady-dress-light.png) | ![In the maid outfit](docs/images/steady-maid-light.png) |

> Unofficial fan project. "Claude" is a trademark of Anthropic; this theme is not made or
> endorsed by Anthropic.

## What it does

- **Opening, each new session (about 6 s):** a book unfolds, the wordmark's letters rise one
  by one, a flower blooms, a ribbon unfurls and petals burst out, centred in the chat area.
  Then she rises into view in a bloom of light.
- **Background:** she stands at the right, head to toe at any window size, on cream parchment
  (black velvet and lamplight in dark mode), with drifting petals and gold embroidery.
- **Two outfits** — the white dress and the maid outfit — changed with a flash of light and a
  swirl of petals.
- **The ✿ flower** above the prompt opens a one-line menu: outfit, clarity, replay the
  opening, calibrate, and hide or show the whole look.
- **Follows your window:** when the right sidebar opens or closes, or the window changes,
  she steps out and returns beside it with her entrance.

## Requirements

- The Claude desktop app, in a **Code** conversation (the mobile app shows the background and
  a simpler menu; a terminal session only gets the `/claudia` command).
- Claude Code with plugin support (tested with Claude Code 2.1.326 and desktop app 6.6395 on
  Windows 11).

## Install

At the prompt of a Claude Code session in a terminal:

```
/plugin install claudia-theme --marketplace DavidZeng-creator/claudia-theme
```

Answer `y` to add the marketplace, then pick the user scope (first in the list) so it applies
to every session. From a shell instead:

```
claude plugin install claudia-theme --marketplace DavidZeng-creator/claudia-theme
```

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace**
with `DavidZeng-creator/claudia-theme`, then **Add plugin**.

To update later: `claude plugin update claudia-theme@claudia-theme`, then start a new session.

## First step: line her up with your window

The app tells a plugin only the chat area's width, not the window's, so the plugin measures
your session list once:

1. Close the right sidebar.
2. Click the ✿ flower above the prompt and choose **Calibrate** (or type `/claudia calibrate`).
3. Click the background just to the right of the session list's edge.

Do it again after resizing or collapsing the session list or changing the app's text size.
Full details, settings, commands and known limits are in [plugin/README.md](plugin/README.md).

## Contributing

Everyone is welcome to improve the theme — code, animations, new outfits, translations, bug
reports and ideas. Start with [CONTRIBUTING.md](CONTRIBUTING.md) ([简体中文](CONTRIBUTING.zh-CN.md)); the art tools that build
every drawing from the original images are in [art/](art/README.md).

## License

- **Code:** [MIT](LICENSE) — use, change and share freely.
- **Artwork:** [CC BY-NC 4.0](LICENSE-ART.md) — use, change and share freely, but not sell.

See [CHANGELOG.md](CHANGELOG.md) for what changed in each version.
