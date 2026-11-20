**English** | [简体中文](README.zh-CN.md)

# claudia-theme

A look for Claude Code sessions in the Claude desktop (and mobile) app, built on the
orange-haired librarian character and the ornate "Claude" wordmark.

- **Opening (about 6 s, each new session):** measured as it starts, the book and wordmark
  stand whole in the middle of the chat area, clear of the session list and the right
  sidebar, scaled to fit; an open book unfolds, the wordmark's letters rise one by one, the
  flower blooms, the ribbon unfurls, the tassel swings and petals burst out; then she rises
  into view in a soft bloom of light with petals swirling round her.
- **Background:** the character stands at the right, head to toe at the same share of the
  window's height on any window shape, with petals, gold sparks and a band of dress-hem
  embroidery along the bottom. Cream parchment in light mode, black velvet and lamplight in
  dark mode.
- **Colors:** the whole app takes the dress palette (orange, cream, near-black, gold, book red).

## Install

At the prompt of a Claude Code session in a terminal:

```
/plugin install claudia-theme --marketplace DavidZeng-creator/claudia-theme
```

Answer `y` to add the marketplace, then pick a scope (the user scope, first in the list,
makes it apply to every session). From a shell instead:

```
claude plugin install claudia-theme --marketplace DavidZeng-creator/claudia-theme
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then
**Plugins**, **Add marketplace** with `DavidZeng-creator/claudia-theme`, then
**Add plugin**.

The look shows in the Claude desktop app's Code tab (and the mobile app); a terminal session
only gets the `/claudia` command.

## Line her up with your window (one click)

The background spans the whole window, but the app tells a plugin only the chat area's
width, so the plugin measures the session list on the left once:

1. Close the right sidebar.
2. Open the ✿ menu and choose **Calibrate** (or type `/claudia calibrate`).
3. Click the background right beside the session list, just to the right of its edge.

The plugin works out the list's width from where the click landed, remembers it, and from
then on the opening's wordmark centres in the chat area and she is drawn right beside the
right sidebar. Do it again after resizing or collapsing the session list, or changing the
app's text size. **Cancel** in the bar above the prompt stops waiting for the click;
`/claudia calibrate reset` forgets the measurement. The app reports clicks in steps of 1/64 of
the window's width, so the result is within about a column.

## Settings

- **Session list width** (`session_list_columns`, default 25): used only until you calibrate.
  The session list's width in the app's character columns; 0 with it collapsed. It is asked
  for at install and can be changed later in the plugin's settings (`/config`).

## Use

- **The flower** ✿ is all there is above the prompt: a small orange blossom at the top right
  of the prompt box. Click it and the options open in one line beside it, plain text with no
  buttons, the one under the pointer highlighted: White dress, Maid outfit (✓ marks the one
  she wears), Clarity with its 0-100% bar (− and + on the mobile app), Replay opening,
  Calibrate and Hide background. Where the window is too narrow for one line, they wrap onto
  another. Picking an option closes the menu; the clarity bar keeps it open while you adjust,
  and the flower closes it. Choices are remembered.
- **Hide background** turns the plugin's look off: the app goes back to its own colours and
  background, and only the flower above the prompt stays. The choice is remembered, so the
  next session starts the same way, with no opening. The flower's menu then holds only
  **Show background**, which brings the look back with her entrance: the parchment fading in,
  then her rising into view under a bloom of light and petals. `/claudia off` and
  `/claudia on`, and a right-click row, do the same.
- **Right-click menu:** right-clicking in the conversation adds rows to switch outfit, make
  her clearer or softer by 10%, open the menu, or hide the background (only "show
  background" while it is off).
- **Right sidebar and window size:** the moment the window's width changes, even a little,
  she is gone (an invisible strip in the bar above the prompt notices at once). Further
  changes start nothing; once everything has held still she returns at her place with her
  entrance (a bloom of light, petals swirling, her figure rising in), the parchment staying as
  it is, and her sharp drawing takes over. She stands clear of the right sidebar when it is
  open. Clarity doesn't change. Resizing the window by dragging doesn't move her (the sidebar
  is told apart by opening in one quick jump).
- `/claudia` opens the menu; `/claudia intro`, `/claudia dress`, `/claudia maid`,
  `/claudia 0`–`/claudia 100`, `/claudia calibrate`, `/claudia calibrate reset`, `/claudia off`
  and `/claudia on` work too. Clicking bare
  background also switches outfit.
- Changing outfit plays a flash of light and a swirl of petals as she appears in the other
  outfit (about 2 s).

## Limits

- The desktop app plays a background's animation only for one drawing handed over alone, and
  only the first time it sees that exact text; drawings stacked in boxes show still. So the
  opening, her entrance, each outfit change and her return after the window changes are single
  drawings with a fresh note in them. One drawing holds at most 131,072 characters, so she is
  simplified in the moving ones; her sharp stacked layers, which are still, take over when
  each ends.
- The desktop app refuses a whole background past a fixed size without saying so (somewhere
  between about 220k and 325k characters, on any screen), so her traced outlines are
  simplified to within a fraction of a pixel and the whole background stays under 220k.
- The app draws its own full-width strip behind anything in the band above the prompt; a
  plugin can't remove it, so the menu opens as one line to keep it short.
- The right sidebar's state is remembered across sessions: a session that starts at the same
  chat width as when it was last open takes it to be open still. One opened or closed while
  no session ran, at that same width, is taken wrongly until it is next opened or closed.
- The app hides the right sidebar (the session rail) when the window comes out of full screen
  and shows it again on the way back. The plugin reads that from a window that gets smaller
  while the chat area gets wider (she goes to the edge) and bigger while it gets narrower
  (she returns beside the sidebar).
- After resizing or collapsing the session list, or changing the app's text size, calibrate
  again (see above).

## Art and license

The drawings in `hooks/art/` are vector traces of AI-generated character sheets and a
wordmark, built by the art tools in the repository's `art/` folder. The code is under the MIT
license and the artwork under CC BY-NC 4.0 (no selling); see `LICENSE` and `LICENSE-ART.md`
in the repository.

Unofficial fan theme. "Claude" is a trademark of Anthropic; this is not an official product.
