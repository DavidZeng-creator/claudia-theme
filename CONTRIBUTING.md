# Contributing to claudia-theme

Thank you for helping! Code, animations, artwork, documentation, bug reports and ideas are
all welcome. Please be kind and constructive — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Ways to help

- **Report a bug** or **suggest an idea**: open an issue using one of the templates. For a bug,
  a screenshot and your app and Claude Code versions help a lot.
- **Improve the plugin**: animations, the menu, how she follows the window, new settings.
- **Add artwork**: a new outfit, a new pose, a new opening. See [art/README.md](art/README.md).
- **Improve the documents**, or translate them.

## How a contribution gets in

1. **Fork** the repository on GitHub and clone your fork.
2. Make a **branch** for your change (`git switch -c my-change`).
3. Make the change, **test it** (below), and commit with a clear message.
4. Open a **pull request** against `main`, describing what you changed and why, with a
   screenshot or short recording for anything visible.
5. The maintainer reviews it and may ask for changes; once it's approved it is merged.

Small, focused pull requests are easier to review than large ones. For a big change, open an
issue first to talk it over.

## Repository layout

```
plugin/                 the Claude Code plugin (what people install)
  .claude-plugin/       its manifest (plugin.json) and icon
  hooks/register.tsx    the plugin's logic: theme, background, menu, commands
  hooks/*.tsx           small drawing modules (the flower, menu items, the window sensor)
  hooks/art/            the drawings (generated — don't edit by hand)
  hooks/register.test.tsx  tests
art/                    the tools that build the drawings from the original images
.claude-plugin/         the marketplace file that makes this repository installable
docs/images/            screenshots
```

## Trying your change in the app

Start a Claude Code session with the plugin loaded from your folder:

```
claude --plugin-dir ./plugin
```

or name the folder in the `CLAUDE_CODE_PLUGIN_DIRS` environment variable before starting the
desktop app. Open a Code conversation to see the look.

## Checks before a pull request

From the repository's top folder:

```
claude plugin validate .
claude plugin validate plugin
claude plugin test plugin
```

All three should pass. Add or update a test in `plugin/hooks/register.test.tsx` for any
behaviour you change.

## Changing the artwork

Never edit `plugin/hooks/art/*.ts` by hand: they are generated. Change the original images or
the tools in `art/`, then rebuild as described in [art/README.md](art/README.md), and commit
the regenerated files with your change. Keep in mind the app's limits: one drawing may hold
at most 131,072 characters, and a whole background must stay under about 220,000.

## Versions and the changelog

The maintainer sets the version in `plugin/.claude-plugin/plugin.json` when releasing. Add a
line describing your change under **Unreleased** in [CHANGELOG.md](CHANGELOG.md).

## Licensing of contributions

By contributing, you agree that your code is licensed under the MIT license (`LICENSE`) and
your artwork under CC BY-NC 4.0 (`LICENSE-ART.md`), the same as the rest of the project.
