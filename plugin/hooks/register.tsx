import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Outfit, Phase } from '../types'
import { measureLeft } from './calibrate'
import { makeColors } from './make-colors.js'
import { INTRO, MOTION, STEADY } from './scenes'

const SCENE = 'claudia'
// The pane an earlier version opened; closed if it is still up.
const OLD_PANE = 'claudia'
// The desktop app plays a background's animation only for one drawing handed over
// alone, and only the first time it sees that exact text; drawings stacked in boxes,
// and a text it has seen before, show still. So the opening, her entrance and her
// outfit change are each a single drawing with a fresh note in it, and when one
// ends her sharp stacked layers (still) take over.
// The opening runs about 6.4 s and ends on bare parchment.
const INTRO_MS = 6600
// Her entrance and outfit change run about 1.9 s.
const MOVE_MS = 2300
// The moment the window's width changes (the band's sensor sees even a column)
// she is gone. Further changes start nothing: once the background's new width
// has held still for STABLE_MS she returns at her new place with her entrance
// (a bloom of light, petals swirling, her figure rising in; MOVE_MS), the ground
// staying as it is. STABLE_MS outlasts SETTLE_MS, so the tail of a sidebar that
// opens in more than one step is taken first. Gone on the sensor's word alone,
// she returns once the band has held still for BAND_STILL_MS if the background's
// width never changes.
const STABLE_MS = 400
const BAND_STILL_MS = 700
const DEFAULT_CLARITY = 80

// Telling the right sidebar from a window resize. The chat area narrows either
// way; the sidebar does it in one jump, a resize in a drag of small steps.
// A jump is a change of at least JUMP_SHARE of the width (and under half, which
// is a window snapped to one side) at the same height. One that comes within
// QUICK_MS of the first change is the sidebar, and she moves at once; otherwise
// the burst is judged once it has been still for SETTLE_MS, as the sidebar if it
// took at most JUMP_MS. Changes just after a jump are its tail and follow it.
// The session list's width in the same columns, which the reported width leaves
// out. The app tells a plugin only the chat area's width, so it is measured by
// one click (`/claudia calibrate`): a click on bare background says how far
// across the window it was, and one right beside the session list gives its
// width from the chat area's. Until then, the "Session list width" setting
// (session_list_columns, 25 by default). The mobile app has no session list.
const DEFAULT_LEFT_COLS = 25
let optionLeft = DEFAULT_LEFT_COLS
let measuredLeft: number | undefined
let onMobile = false

function leftCols() {
  return onMobile ? 0 : (measuredLeft ?? optionLeft)
}
const QUICK_MS = 120
const SETTLE_MS = 350
const JUMP_MS = 700
const JUMP_SHARE = 0.08
const JUMP_MIN = 6

const phase = atom({ plugin: 'claudia-theme', key: 'phase' } as const, 'intro' as Phase)
const outfit = atom({ plugin: 'claudia-theme', key: 'outfit' } as const, 'dress' as Outfit)
const clarity = atom({ plugin: 'claudia-theme', key: 'clarity' } as const, DEFAULT_CLARITY)
// Columns the right sidebar takes from the chat area; she moves left by as much.
const shift = atom({ plugin: 'claudia-theme', key: 'shift' } as const, 0)
const menu = atom({ plugin: 'claudia-theme', key: 'menu' } as const, false)
// Counts the one-off moving drawings, so each one is drawn afresh.
const take = atom({ plugin: 'claudia-theme', key: 'take' } as const, 0)
// Waiting for the click that measures the session list.
const calibrating = atom({ plugin: 'claudia-theme', key: 'calibrating' } as const, false)
// Whether the plugin's look is on; off, the app has its own colours and background
// and only the flower above the prompt stays, its menu holding the way back.
// Remembered across sessions.
const background = atom({ plugin: 'claudia-theme', key: 'background' } as const, true)

// Cream parchment by day, black velvet and lamplight by night: the colours of
// her dress (white, orange sash, black under-skirt, gold stitching, red book).
const { theme, problems } = makeColors({
  label: 'Claudia',
  roles: { accent: '#e0662a', danger: '#b8322e', success: '#5d8a3c', warning: '#c18a2c', pro: '#8a3b3b' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#f3e7d5',
        'surface-1': '#f7eddf',
        'surface-2': '#fbf5ec',
        'text-primary': '#2b1d17',
        'text-secondary': '#4f3a2e',
        'text-muted': '#6c5444',
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#1a1210',
        'surface-1': '#221815',
        'surface-2': '#2a1e1a',
        'surface-3': '#30231e',
        'text-primary': '#f5e9da',
        'text-secondary': '#d8c6b2',
        'text-muted': '#b09c88',
      },
    },
  },
})

/** Clarity 0-100 to how the app's panels frost the background. 100: no blur and a
 *  light tint; 0: heavy frosting. Blur falls off on a curve so the middle of the
 *  bar still reads clearly. */
function glassFor(c: number) {
  const k = 1 - Math.min(100, Math.max(0, c)) / 100
  return { blur: Math.round(20 * k * k * 10) / 10, opacity: Math.round((0.12 + 0.68 * k) * 100) / 100 }
}

const ALT = {
  intro: 'The Claude wordmark assembling itself on an open book: a flower blooms, a ribbon unfurls, a tassel swings',
  base: 'Cream parchment with gold embroidery along the bottom and a warm glow',
  dress: 'The orange-haired librarian in her white dress stands at the right',
  maid: 'The orange-haired librarian in her maid outfit stands at the right',
  petals: 'Orange petals drifting down',
} as const

type Timer = ReturnType<EngineInterface['clock']['after']>

function isOutfit(v: unknown): v is Outfit {
  return v === 'dress' || v === 'maid'
}

function clamp(v: number) {
  return Math.round(Math.min(100, Math.max(0, v)))
}

// Module state, rebuilt on reload.
let applied = ''
let pending: Timer | undefined
// The chat area's width as last settled, and the burst of changes since.
let settled: number | undefined
let latest = 0
let latestRows = 0
let burstStart: number | undefined
let burstRows = 0
let lastChange = 0
let settleTimer: Timer | undefined
// When the last jump was taken, and which way the chat area went (-1 narrower).
let jumpedAt = -Infinity
let jumpWay = 0
// Where she stood beside the right sidebar (the session rail) when it was last
// open: the app hides it when the window comes out of full screen and shows it
// again on the way back, and she returns there.
let railShift = 0
let phaseTimer: Timer | undefined
// The note that makes the moving drawing showing now one the app hasn't seen, and
// how her entrance or change is laid out.
let note = ''
// Where the opening's stage (book and wordmark) stands, in % of the window: fixed
// at the opening's first drawing, from the chat area as measured then.
let stage: { x: number; width: number } | undefined
// The right sidebar as last settled ({ shift, cols }: its columns, and the chat
// area's then), kept across sessions; a session that starts at the same chat
// width takes the sidebar to be open still.
type Side = { shift: number; cols: number }
let side: Side | undefined
let sideChecked = false
type MoveMode = 'entrance' | 'change' | 'return'
// `width` is her share of the background's width in %.
let move: { mode: MoveMode; width: number } = { mode: 'entrance', width: 100 }
// Waiting for the window to hold still before she returns.
let awayTimer: Timer | undefined
// Hidden on the band's sensor alone, the background not yet having changed.
let awaitingBackdrop = false
// The band's sensor: its width in each layout, and the quick change under way.
let sensor:
  | { mode: string; last: number; lastAt: number; burstAt: number; burstBase: number; quietUntil: number }
  | undefined
// After the band's own layout changes (the menu or calibration opening or
// closing), its width settles for this long before a change counts.
const BAND_QUIET_MS = 700

function nest(svg: string, attrs: string) {
  return svg.replace('<svg ', `<svg ${attrs} `)
}

/** The opening, with this run's note, its stage in the chat area. */
function introSource() {
  const at = stage ?? { x: 0, width: 100 }
  return INTRO.replace('</title>', `</title><desc>Run ${note}</desc>`).replace(
    '<svg class="stage" x="0%" width="100%"',
    `<svg class="stage" x="${at.x}%" width="${at.width}%"`,
  )
}

/** The chat area's place in the window, in %: right of the session list, left
 *  of the right sidebar. */
function chatArea(cols: number, right: number) {
  const left = leftCols()
  const whole = left + cols + Math.max(0, right)
  const pc = (n: number) => Math.round((n / whole) * 1000) / 10
  return { x: pc(left), width: pc(cols) }
}

function isSide(v: unknown): v is Side {
  const o = v as Partial<Side> | null
  return typeof o === 'object' && o !== null && typeof o.shift === 'number' && typeof o.cols === 'number'
}

/** Keeps the sidebar as now settled for the next session. */
async function keepSide($: EngineInterface) {
  side = { shift: await read($, shift), cols: latest }
  await $.store.set('side', side)
}

/** Her entrance, outfit change or return after the window's layout changed, as
 *  one drawing: the ground, her simplified figure rising into view under a burst
 *  of light and petals, the drifting petals. Her return is her entrance with the
 *  ground already there. Her parts fit the right edge of the same share of the
 *  width her sharp layers use, so she ends where they begin. */
function moveSource(o: Outfit) {
  const parts = STEADY[o]
  const m = MOTION[o]
  const fit = 'width="100%" height="100%"'
  const her = `width="${move.width}%" height="100%"`
  // The app lays this drawing over a still copy of itself with every animation
  // stripped out, which shows for a moment when it ends, as her sharp layers do
  // after. So the ground and petals hold still in their resting places here
  // (fading in, at her entrance after the opening, to where they rest), and only
  // she moves.
  const style =
    '<style>.calm *{animation:none!important}' +
    '.entrance .calm{animation:calmin 1.2s ease-out both}@keyframes calmin{from{opacity:0}}' +
    '.return .calm{animation:none}' +
    '</style>'
  const cls = move.mode === 'return' ? 'entrance return' : move.mode
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" class="${cls}">` +
    `<desc>Run ${note}</desc>` +
    style +
    `<g class="calm">${nest(parts.base, fit)}</g>` +
    `<g class="mfig">${nest(m.figure, her)}</g>` +
    nest(m.fx, her) +
    `<g class="calm">${nest(parts.petals, fit)}</g>` +
    '</svg>'
  )
}

/** Her share of the background's width, in %, so a moving drawing puts her where
 *  her sharp layers stand (their box stops `right` columns short of the edge).
 *  The background spans the whole window, the session list on the left and the
 *  right sidebar included, while the width it reports is the chat area's alone:
 *  so the whole is session list plus chat area plus sidebar. */
function shareOf(cols: number, right: number) {
  const c = leftCols() + (cols > 0 ? cols : 1)
  return Math.round((c / (c + Math.max(0, right))) * 1000) / 10
}

async function freshNote($: EngineInterface) {
  const n = await update($, take, t => t + 1)
  note = `${await $.clock.now()}-${n}`
}

async function applyLook($: EngineInterface) {
  // Off, the plugin sets no theme at all (setBackground clears the one it set).
  if (!(await read($, background))) {
    return
  }
  const glass = glassFor(await read($, clarity))
  const sig = `${glass.blur}/${glass.opacity}`
  if (sig === applied) {
    return
  }
  applied = sig
  const set = await $.theme.set({ colors: theme, backdrop: { scene: SCENE, glass } })
  if (!set.isDrawn) {
    $.ui.toast(`Claudia: the background was not drawn: ${set.reason}`)
  }
}

/** Turns the plugin's look off (the app back to its own look, on the person's
 *  ask), or on again with her entrance: the parchment fading in and her rising
 *  into view under a bloom of light and petals. */
async function setBackground($: EngineInterface, isOn: boolean) {
  await $.store.set('background', isOn)
  await update($, menu, () => false)
  await update($, background, () => isOn)
  phaseTimer?.cancel()
  phaseTimer = undefined
  awayTimer?.cancel()
  awayTimer = undefined
  awaitingBackdrop = false
  await update($, calibrating, () => false)
  if (!isOn) {
    await update($, phase, () => 'steady')
    applied = ''
    await $.theme.clear()
    $.ui.toast('Claudia is off. The ✿ menu above the prompt (or /claudia on) brings her back.')
    return
  }
  // The window may have changed while it was off: its width is taken afresh.
  settled = undefined
  sensor = undefined
  applied = ''
  await applyLook($)
  await playMove($, 'entrance')
}

/** Apply now, or once a drag has paused, so the app isn't re-themed every frame. */
async function scheduleApply($: EngineInterface, now: boolean) {
  pending?.cancel()
  pending = undefined
  if (now) {
    await applyLook($)
  } else {
    pending = $.clock.after(160, () => void applyLook($))
  }
}

async function setClarity($: EngineInterface, value: number, now: boolean) {
  const v = clamp(value)
  await update($, clarity, () => v)
  await $.store.set('clarity', v)
  await scheduleApply($, now)
}

/** Changes outfit under a burst of light and petals. During the opening the
 *  new outfit simply makes the entrance. */
async function setOutfit($: EngineInterface, o: Outfit) {
  await $.store.set('outfit', o)
  const was = await read($, outfit)
  await update($, outfit, () => o)
  const now = await read($, phase)
  if (!(await read($, background)) || now === 'intro' || (was === o && now === 'steady')) {
    return
  }
  await playMove($, 'change')
}

async function showScene($: EngineInterface) {
  phaseTimer?.cancel()
  awayTimer?.cancel()
  awayTimer = undefined
  phaseTimer = undefined
  await update($, phase, () => 'steady')
}

const CALIBRATE_HINT = 'Close the right sidebar, then click the background right beside the session list'

/** Waits for the click that measures the session list. */
async function startCalibrating($: EngineInterface) {
  await update($, menu, () => false)
  await update($, calibrating, () => true)
  $.ui.toast(`Claudia: ${CALIBRATE_HINT.toLowerCase()}.`)
}

/** A click `x` of the way across the window (0-1), right beside the session list:
 *  the list is to the chat area plus the right sidebar as x is to 1 - x. */
async function calibrateAt($: EngineInterface, x: number) {
  await update($, calibrating, () => false)
  const left = measureLeft(x, latest, await read($, shift))
  if (left === undefined) {
    $.ui.toast('Claudia: that click was too far right to measure. Try /claudia calibrate again.')
    return
  }
  measuredLeft = left
  await $.store.set('leftCols', left)
  $.ui.toast(`Claudia: lined up with your window (the session list is ${left} columns wide).`)
}

/** Plays the opening, then her entrance. */
async function replay($: EngineInterface) {
  phaseTimer?.cancel()
  awayTimer?.cancel()
  awayTimer = undefined
  stage = undefined
  await freshNote($)
  await update($, phase, () => 'intro')
  phaseTimer = $.clock.after(INTRO_MS, () => void playMove($, 'entrance'))
}

/** Plays her entrance, outfit change or return, then shows her sharp layers. */
async function playMove($: EngineInterface, mode: MoveMode) {
  phaseTimer?.cancel()
  awayTimer?.cancel()
  awayTimer = undefined
  move = { mode, width: shareOf(latest, await read($, shift)) }
  await freshNote($)
  await update($, phase, () => 'move')
  phaseTimer = $.clock.after(MOVE_MS, () => void showScene($))
}

/** The band's width, the moment it changes by even a column: she is gone at
 *  once. Further changes start nothing; she returns once everything is still. */
async function sensed($: EngineInterface, mode: string, columns: number) {
  if (!(await read($, background))) {
    return
  }
  const now = await $.clock.now()
  // The layout the band has now; a report from another is stale.
  const expected = (await read($, calibrating)) ? 'calibrating' : (await read($, menu)) ? 'open' : 'closed'
  if (mode !== expected) {
    return
  }
  // The band's own layout changed (the flower opened or closed the menu, or
  // calibration began or ended): its width moves with no window change, the first
  // reports even carrying the old width, so it settles before a change counts.
  if (sensor === undefined || sensor.mode !== mode) {
    sensor = { mode, last: columns, lastAt: now, burstAt: now, burstBase: columns, quietUntil: now + BAND_QUIET_MS }
    return
  }
  if (columns === sensor.last) {
    return
  }
  if (now < sensor.quietUntil) {
    sensor = { ...sensor, last: columns, lastAt: now, burstAt: now, burstBase: columns }
    return
  }
  sensor.last = columns
  sensor.lastAt = now
  const now2 = await read($, phase)
  if (now2 === 'away') {
    // Still changing: wait on. A wait for the background's width keeps its time.
    if (awaitingBackdrop) {
      awayTimer?.cancel()
      awayTimer = $.clock.after(BAND_STILL_MS, () => void playMove($, 'return'))
    }
    return
  }
  if (now2 === 'steady' || now2 === 'move') {
    phaseTimer?.cancel()
    phaseTimer = undefined
    await update($, phase, () => 'away')
    awayTimer?.cancel()
    awaitingBackdrop = true
    awayTimer = $.clock.after(BAND_STILL_MS, () => void playMove($, 'return'))
  }
}

/** She returns once the background's width has held still. */
function awaitStill($: EngineInterface) {
  awayTimer?.cancel()
  awaitingBackdrop = false
  awayTimer = $.clock.after(STABLE_MS, () => void playMove($, 'return'))
}

/** Notes a width the backdrop was drawn at; a burst is judged once it is still. */
async function trackWidth($: EngineInterface, cols: number, rows: number) {
  const now = await $.clock.now()
  if (settled === undefined) {
    settled = latest = cols
    latestRows = rows
    return
  }
  if (cols === latest && rows === latestRows) {
    return
  }
  if (burstStart === undefined) {
    burstStart = now
    burstRows = latestRows
  }
  latest = cols
  latestRows = rows
  lastChange = now
  if (awayTimer !== undefined) {
    awaitStill($)
  }
  settleTimer?.cancel()
  settleTimer = undefined
  const from = settled ?? latest
  if (now - burstStart <= QUICK_MS && isJump(latest - from, from)) {
    // Drawing can't change state, so she moves a moment after this drawing.
    settleTimer = $.clock.after(0, () => void takeJump($, now))
    return
  }
  settleTimer = $.clock.after(SETTLE_MS, () => void settleWidth($))
}

function isJump(delta: number, from: number) {
  const share = Math.abs(delta) / Math.max(1, from)
  return latestRows === burstRows && Math.abs(delta) >= JUMP_MIN && share >= JUMP_SHARE && (delta > 0 || share < 0.5)
}

async function settleWidth($: EngineInterface) {
  settleTimer = undefined
  const from = settled ?? latest
  const delta = latest - from
  if (burstStart !== undefined && lastChange - burstStart <= JUMP_MS && isJump(delta, from)) {
    await takeJump($, lastChange)
    return
  }
  const isTail = burstStart !== undefined && burstStart - jumpedAt <= JUMP_MS && Math.sign(delta) === jumpWay
  const heightChange = burstStart !== undefined ? latestRows - burstRows : 0
  settled = latest
  burstStart = undefined
  const before = await read($, shift)
  if (isTail) {
    // The rest of a sidebar that opened in more than one step: she follows it.
    await moveBy($, delta)
  } else if (heightChange < 0 && delta > 0 && before > 0) {
    // The window got smaller yet the chat area wider: the right sidebar hid (the
    // app hides it when the window comes out of full screen). She goes to the
    // edge, and remembers where she stood beside it.
    railShift = before
    await update($, shift, () => 0)
  } else if (heightChange > 0 && delta < 0 && before === 0 && railShift > 0) {
    // The window got bigger yet the chat area narrower: the sidebar is back.
    await update($, shift, () => railShift)
  }
  // Otherwise a resize (or the sidebar dragged wider or narrower): she stays put.
  await keepSide($)
  // Moved while at rest (no sensor saw it coming): she returns at her new place.
  if ((await read($, shift)) !== before && (await read($, phase)) === 'steady') {
    await update($, phase, () => 'away')
    awaitStill($)
  }
}

/** Moves her aside by as much as the chat area narrowed (back if it widened). */
async function moveBy($: EngineInterface, delta: number) {
  await update($, shift, s => Math.max(0, s - delta))
}

/** The sidebar opened or closed: she is gone at once, moved aside by as much as
 *  the chat area changed, and returns there once it holds still. */
async function takeJump($: EngineInterface, at: number) {
  const from = settled ?? latest
  const delta = latest - from
  settled = latest
  burstStart = undefined
  jumpedAt = at
  jumpWay = Math.sign(delta)
  await moveBy($, delta)
  const now = await read($, shift)
  if (now > 0) {
    railShift = now
  }
  await keepSide($)
  // During the opening the entrance simply starts at her new place.
  if ((await read($, phase)) !== 'intro') {
    phaseTimer?.cancel()
    phaseTimer = undefined
    await update($, phase, () => 'away')
    awaitStill($)
  }
}

export const register: Register = (on, options) => {
  const left = (options as { session_list_columns?: unknown } | undefined)?.session_list_columns
  optionLeft = typeof left === 'number' && Number.isFinite(left) && left >= 0 ? Math.round(left) : DEFAULT_LEFT_COLS

  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))
    if (unpainted !== undefined) {
      $.ui.toast(`claudia-theme: ${unpainted}`)
    }

    const savedOutfit = await $.store.get('outfit')
    if (isOutfit(savedOutfit)) {
      await update($, outfit, () => savedOutfit)
    }
    const savedClarity = await $.store.get('clarity')
    if (typeof savedClarity === 'number') {
      await update($, clarity, () => clamp(savedClarity))
    }
    await update($, shift, () => 0)
    await update($, menu, () => false)
    applied = ''
    phaseTimer = undefined
    settled = undefined
    burstStart = undefined
    settleTimer?.cancel()
    settleTimer = undefined
    jumpedAt = -Infinity
    railShift = 0
    stage = undefined
    sideChecked = false
    const savedSide = await $.store.get('side')
    side = isSide(savedSide) ? savedSide : undefined
    await update($, calibrating, () => false)
    const savedLeft = await $.store.get('leftCols')
    measuredLeft = typeof savedLeft === 'number' && Number.isFinite(savedLeft) && savedLeft >= 0 ? savedLeft : undefined
    // Once, on the desktop, before it is measured: say how to line her up.
    if (measuredLeft === undefined && e.surface === 'desktop' && (await $.store.get('calibrateHinted')) !== true) {
      await $.store.set('calibrateHinted', true)
      $.ui.toast('Claudia: to line her up with your window, open the ✿ menu and choose Calibrate (or type /claudia calibrate).')
    }
    const savedBackground = await $.store.get('background')
    await update($, background, () => savedBackground !== false)
    await applyLook($)
    if (savedBackground === false) {
      await update($, phase, () => 'steady')
    } else {
      await replay($)
    }

    await $.command.register({
      name: 'claudia',
      description: 'Claudia theme: open the menu, replay the opening, switch outfit or clarity, turn the background on or off, or line her up with the window (menu | intro | dress | maid | 0-100 | calibrate | on | off)',
    })
    void $.ui.close({ id: OLD_PANE }).catch(() => undefined)

    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || e.props.scene !== SCENE) {
      return next(e)
    }
    const { Box, Svg } = $.ui.resolve(e)

    onMobile = e.surface === 'mobile'
    const cols = e.viewport?.columns
    // A sidebar left open last session, at the same chat width, is open still.
    let opened = 0
    if (cols !== undefined && cols > 0 && !sideChecked) {
      sideChecked = true
      const was = side
      if (was !== undefined && was.shift > 0) {
        railShift = was.shift
      }
      if (was !== undefined && was.shift > 0 && was.cols === cols) {
        opened = was.shift
        // Drawing can't change state, so it is taken a moment after.
        $.clock.after(0, () => void update($, shift, () => was.shift))
      }
    }
    if (cols !== undefined && cols > 0) {
      void trackWidth($, cols, e.viewport?.rows ?? 0)
    }

    const which = await read($, outfit)
    const parts = STEADY[which]
    // Each drawing is keyed, so the app keeps the ones that stay instead of
    // loading them again: the ground stays put from the opening on.
    const full = (key: string, source: string, alt: string) => (
      <Box key={key} position="absolute" top={0} left={0} width="100%" height="100%">
        <Svg source={source} alt={alt} isInteractive />
      </Box>
    )

    // The moving drawings are handed over alone (see INTRO_MS); `take` is read so
    // each new one is drawn.
    await read($, take)
    const now = await read($, phase)
    if (now === 'intro') {
      // The stage is measured once, at the opening's first drawing with a size:
      // a new text would start the opening again.
      if (stage === undefined && cols !== undefined && cols > 0) {
        stage = chatArea(cols, Math.max(opened, await read($, shift)))
      }
      return <Svg source={introSource()} alt={ALT.intro} isInteractive />
    }
    if (now === 'move') {
      const dress = which === 'maid' ? 'maid outfit' : 'white dress'
      const alt = `The orange-haired librarian appears in her ${dress} in a burst of light and petals`
      return <Svg source={moveSource(which)} alt={alt} isInteractive />
    }
    const figure = parts.light
    const right = await read($, shift)
    // While the sidebar opens or closes she is gone: the ground and petals stay.
    if (now === 'away') {
      return (
        <Box position="relative" width="100%" height="100%">
          {full('base', parts.base, ALT.base)}
          {full('petals', parts.petals, ALT.petals)}
        </Box>
      )
    }

    // Stacked drawings, each under the app's size limit for one: the ground, her
    // figure in layers, the petals in front. Her layers fit themselves to the right
    // edge of their box, which stops short of the right sidebar while it is open.
    return (
      <Box position="relative" width="100%" height="100%">
        {full('base', parts.base, ALT.base)}
        <Box key="figure" position="absolute" top={0} left={0} right={right} height="100%">
          {figure.map((source, i) =>
            full(`${which}-${i}`, source, i === 0 ? ALT[which] : `${ALT[which]} (layer ${i + 1})`),
          )}
        </Box>
        {full('petals', parts.petals, ALT.petals)}
      </Box>
    )
  })

  // A small flower at the right of the band, just above the prompt box's top
  // right corner, and nothing else. Pressed, a menu the size of a right-click menu
  // opens above it: picking a row closes it, except clarity, which stays open
  // while it is adjusted; the flower closes it too.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || e.props.hasSurvey) {
      return next(e)
    }
    const { Box, Text, Button } = $.ui.resolve(e)
    const isOpen = await read($, menu)
    const isDesktop = e.surface === 'desktop'
    // On the desktop the flower is a bare glyph that takes clicks (a Client);
    // the mobile app has no Client, so there it is a plain one-glyph button.
    const flower = isDesktop
      ? (() => {
          const { Client } = $.ui.resolve(e)
          return <Client key="flower" module="./flower.tsx" props={{ open: isOpen }} width={2} height={1} />
        })()
      : <Button key="open" plain label="✿" onPress={() => void update($, menu, open => !open)} />
    // The sensor stretches across the free room of the band (desktop only).
    const calibratingNow = isDesktop && (await read($, calibrating))
    const strip = isDesktop
      ? (() => {
          const { Client } = $.ui.resolve(e)
          const mode = calibratingNow ? 'calibrating' : isOpen ? 'open' : 'closed'
          return <Client key="sensor" module="./sensor.tsx" props={{ mode }} flexGrow={1} height={1} />
        })()
      : null
    const toggle = (
      <Box flexDirection="row" justifyContent="flex-end">
        {strip}
        {flower}
      </Box>
    )
    // While calibrating, the band says what to click, with a way out.
    if (calibratingNow) {
      const { Client } = $.ui.resolve(e)
      return (
        <Box flexDirection="row" justifyContent="flex-end" alignItems="flex-start" gap={1}>
          {strip}
          <Box flexDirection="row" flexWrap="wrap" flexShrink={1} justifyContent="flex-end" columnGap={1}>
            <Text dimColor>{CALIBRATE_HINT}</Text>
            <Client key="menu-cancel" module="./item.tsx" props={{ kind: 'cancel', text: 'Cancel', clarity: 0 }} width={8} height={1} />
          </Box>
          {flower}
        </Box>
      )
    }
    if (!isOpen) {
      return toggle
    }

    const c = await read($, clarity)
    const o = await read($, outfit)
    const pick = (act: () => Promise<void>) => () => {
      void update($, menu, () => false).then(act)
    }
    const mark = (isChosen: boolean) => (isChosen ? '✓ ' : '')
    // Off, the flower stays and its menu holds only the way back.
    const isOn = await read($, background)

    // Open, the options sit side by side in one line ending at the flower, so the
    // band stays one line high; where the window is too narrow, the line wraps
    // onto a new one by itself.
    // On the desktop each option is plain text (a Client), highlighted under the
    // pointer: no buttons, so no button frames or shadows.
    if (isDesktop) {
      const { Client } = $.ui.resolve(e)
      type Kind = 'dress' | 'maid' | 'clarity' | 'replay' | 'calibrate' | 'background'
      const item = (kind: Kind, text: string, width: number) => (
        <Client key={`menu-${kind}`} module="./item.tsx" props={{ kind, text, clarity: c }} width={width} height={1} />
      )
      const label = (kind: Exclude<Kind, 'clarity'>, text: string) => item(kind, text, text.length + 2)
      if (!isOn) {
        return (
          <Box flexDirection="row" justifyContent="flex-end" alignItems="flex-start" gap={1}>
            {strip}
            <Box flexDirection="row" flexWrap="wrap" flexShrink={1} justifyContent="flex-end" columnGap={1}>
              {label('background', 'Show background')}
            </Box>
            {flower}
          </Box>
        )
      }
      return (
        <Box flexDirection="row" justifyContent="flex-end" alignItems="flex-start" gap={1}>
          {strip}
          <Box flexDirection="row" flexWrap="wrap" flexShrink={1} justifyContent="flex-end" columnGap={1}>
            {label('dress', `${mark(o === 'dress')}White dress`)}
            {label('maid', `${mark(o === 'maid')}Maid outfit`)}
            {item('clarity', '', 24)}
            {label('replay', 'Replay opening')}
            {label('calibrate', 'Calibrate')}
            {label('background', 'Hide background')}
          </Box>
          {flower}
        </Box>
      )
    }

    // The mobile app has no Client: buttons in the same wrapping line, with −
    // and + for clarity.
    if (!isOn) {
      return (
        <Box flexDirection="row" justifyContent="flex-end" alignItems="flex-start" gap={1}>
          <Button key="background" onPress={pick(() => setBackground($, true))}>
            Show background
          </Button>
          {flower}
        </Box>
      )
    }
    return (
      <Box flexDirection="row" justifyContent="flex-end" alignItems="flex-start" gap={1}>
        <Box flexDirection="row" flexWrap="wrap" flexShrink={1} justifyContent="flex-end" alignItems="center" columnGap={1}>
          <Button key="dress" onPress={pick(() => setOutfit($, 'dress'))}>
            {mark(o === 'dress')}White dress
          </Button>
          <Button key="maid" onPress={pick(() => setOutfit($, 'maid'))}>
            {mark(o === 'maid')}Maid outfit
          </Button>
          <Text>
            Clarity <Text dimColor>{c}%</Text>
          </Text>
          <Button key="minus" label="−" onPress={() => void setClarity($, c - 10, true)} />
          <Button key="plus" label="+" onPress={() => void setClarity($, c + 10, true)} />
          <Button key="replay" onPress={pick(() => replay($))}>
            Replay opening
          </Button>
          <Button key="background" onPress={pick(() => setBackground($, false))}>
            Hide background
          </Button>
        </Box>
        {flower}
      </Box>
    )
  })

  // A few rows in the app's right-click menu.
  on('ui.render', { component: 'ContextMenu' }, async ($, e, next) => {
    if (e.surface !== 'desktop') {
      return next(e)
    }
    const { Box, Button } = $.ui.resolve(e)
    const c = await read($, clarity)
    const o = await read($, outfit)
    const other: Outfit = o === 'dress' ? 'maid' : 'dress'
    if (!(await read($, background))) {
      return (
        <Box>
          <Button key="cm-background" label="Claudia: show background" onPress={() => void setBackground($, true)} />
        </Box>
      )
    }

    return (
      <Box>
        <Button key="cm-outfit" label={`Claudia: wear the ${other === 'maid' ? 'maid outfit' : 'white dress'}`} onPress={() => void setOutfit($, other)} />
        <Button key="cm-clearer" label={`Claudia: clearer (${c}% → ${clamp(c + 10)}%)`} onPress={() => void setClarity($, c + 10, true)} />
        <Button key="cm-softer" label={`Claudia: softer (${c}% → ${clamp(c - 10)}%)`} onPress={() => void setClarity($, c - 10, true)} />
        <Button key="cm-menu" label="Claudia: open menu" onPress={() => void update($, menu, () => true)} />
        <Button key="cm-background" label="Claudia: hide background" onPress={() => void setBackground($, false)} />
      </Box>
    )
  })

  on('ui.message', async ($, e, next) => {
    if (e.element === 'sensor') {
      const data = e.data as { mode?: unknown; columns?: unknown }
      if (typeof data.mode === 'string' && typeof data.columns === 'number') {
        await sensed($, data.mode, data.columns)
      }
    }
    if (e.element === 'flower' && (e.data as { menu?: unknown }).menu === 'toggle') {
      await update($, menu, open => !open)
    }
    if (typeof e.element === 'string' && e.element.startsWith('menu-')) {
      const data = e.data as { pick?: unknown; clarity?: unknown; final?: unknown }
      if (typeof data.clarity === 'number') {
        // The clarity bar keeps the menu open while it is adjusted.
        await setClarity($, data.clarity, data.final === true)
      } else if (typeof data.pick === 'string') {
        // Picking a row closes the menu, then acts.
        await update($, menu, () => false)
        if (data.pick === 'dress' || data.pick === 'maid') {
          await setOutfit($, data.pick)
        } else if (data.pick === 'replay') {
          await replay($)
        } else if (data.pick === 'background') {
          await setBackground($, !(await read($, background)))
        } else if (data.pick === 'calibrate') {
          await startCalibrating($)
        } else if (data.pick === 'cancel') {
          await update($, calibrating, () => false)
        }
      }
    }

    return next(e)
  })

  // A click on bare background also changes her outfit.
  on('ui.pointer', async ($, e, next) => {
    // While calibrating, the click measures the session list instead.
    if (e.scene === SCENE && (await read($, calibrating))) {
      await calibrateAt($, e.x)
      return next(e)
    }
    if (e.scene === SCENE && (await read($, phase)) === 'steady') {
      await setOutfit($, (await read($, outfit)) === 'dress' ? 'maid' : 'dress')
    }

    return next(e)
  })

  on('command.run', { command: 'claudia' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()

    if (arg === 'dress' || arg === 'maid') {
      await setOutfit($, arg)
      return { text: `Claudia changed into her ${arg === 'maid' ? 'maid outfit' : 'white dress'}.` }
    }
    if (arg === 'off' || arg === 'hide') {
      await setBackground($, false)
      return { text: 'Claudia is off: the app has its own look again. /claudia on brings her back.' }
    }
    if (arg === 'on' || arg === 'show') {
      await setBackground($, true)
      return { text: 'The Claudia background is back.' }
    }
    if (arg === 'intro') {
      if (!(await read($, background))) {
        await $.store.set('background', true)
        await update($, background, () => true)
        settled = undefined
        await applyLook($)
      }
      await replay($)
      return { text: 'Replaying the opening.' }
    }
    if (/^\d{1,3}%?$/.test(arg)) {
      const v = clamp(Number.parseInt(arg, 10))
      await setClarity($, v, true)
      return { text: `Clarity set to ${v}%.` }
    }
    if (arg === 'calibrate') {
      await startCalibrating($)
      return { text: `${CALIBRATE_HINT}.` }
    }
    if (arg === 'calibrate reset') {
      measuredLeft = undefined
      await $.store.set('leftCols', null)
      return { text: `Claudia uses the Session list width setting again (${optionLeft} columns).` }
    }
    if (arg === '' || arg === 'menu') {
      await update($, menu, () => true)
      return { text: 'The Claudia menu is open above the prompt.' }
    }

    return { text: 'Usage: /claudia [menu | intro | dress | maid | 0-100 | calibrate | calibrate reset | on | off]. The flower above the prompt opens the menu.' }
  })
}
