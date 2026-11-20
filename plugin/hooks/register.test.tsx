import type { On } from 'claude-code'
import { measureLeft } from './calibrate'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

type RunInput = Parameters<Engine['command']['run']>[0]
const run = ($: Engine, args: string) => $.command.run({ command: 'claudia', args } as RunInput)

const BACKDROP = {
  plugin: 'claudia-theme',
  component: 'Backdrop',
  requestId: 'backdrop-1',
  props: { scene: 'claudia', plugin: 'claudia-theme', glass: { blur: 0, opacity: 0.3 } },
} as const

const BAND = {
  plugin: 'claudia-theme',
  component: 'AbovePrompt',
  requestId: 'band',
  surface: 'desktop',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const

// The opening (6.6 s), then her entrance (2.3 s), then her resting scene.
const TO_SCENE = 9000

/** Stands in for the engine; returns every glass the mod sent with theme.set. */
function engine(on: On, stored?: Record<string, unknown>) {
  const glasses: unknown[] = []
  mock.store(on, stored)
  on('theme.set', (_, e) => {
    glasses.push((e as { backdrop?: { glass?: unknown } }).backdrop?.glass)
    return { value: { isDrawn: true, requestId: 'backdrop-1' } }
  })
  // A clear (the app back to its own look) is noted as 'cleared'.
  on('theme.clear', () => {
    glasses.push('cleared')
    return { value: { isDrawn: false, reason: 'cleared' } }
  })
  on('command.register', () => ({ value: { command: 'claudia' } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('command.run', () => ({ text: 'engine' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return glasses
}

async function start($: Engine) {
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
}

async function backdrop($: Engine, columns = 200, rows = 50) {
  const ui = await $.ui.mount({ ...BACKDROP, surface: 'desktop', viewport: { columns, rows } })
  const svgs = await ui.findAll({ type: 'Svg' })
  const boxes = await ui.findAll({ type: 'Box' })
  await ui.unmount()
  const figureBox = boxes.find(b => typeof b.props.right === 'number')
  return {
    layers: svgs.map(s => ({ alt: String(s.props.alt ?? ''), size: String(s.props.source ?? '').length })),
    sources: svgs.map(s => String(s.props.source ?? '')),
    right: figureBox ? Number(figureBox.props.right) : undefined,
  }
}

const total = (layers: { size: number }[]) => layers.reduce((n, l) => n + l.size, 0)

test('the opening plays first, then the layered scene in the saved outfit', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await start($)

  // The opening is one drawing on its own, with nothing stacked round it.
  const first = (await backdrop($)).layers
  expect(first.length).toBe(1)
  expect(first[0]?.alt).toMatch(/wordmark/)
  expect(first[0]?.size).toBeLessThan(131072)

  // Her entrance: one drawing too.
  await clock.advance(6700)
  const entrance = await backdrop($)
  expect(entrance.layers.length).toBe(1)
  expect(entrance.layers[0]?.alt).toMatch(/appears in her white dress/)
  expect(entrance.layers[0]?.size).toBeLessThan(131072)
  expect(entrance.sources[0]).toContain('class="entrance"')

  await clock.advance(2400)
  const { layers, right } = await backdrop($)
  expect(layers.length).toBeGreaterThan(3)
  expect(layers.some(l => /white dress/.test(l.alt))).toBe(true)
  expect(right).toBe(0)
  for (const l of layers) {
    expect(l.size).toBeLessThan(131072)
  }
})

test('the flower above the prompt opens a short menu that switches outfit and clarity', async ($, on) => {
  const clock = mock.clock(on)
  const glasses = engine(on)
  await start($)
  await clock.advance(TO_SCENE)
  expect(glasses[0]).toEqual({ blur: 0.8, opacity: 0.26 })

  const band = await $.ui.mount(BAND)
  // Closed, the band is the flower alone: no label, no button.
  expect(await band.find({ key: 'flower' })).toBeDefined()
  expect(await band.find({ type: 'Button' })).toBeUndefined()
  const click = () => band.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'flower' })

  // Open, the options sit in one wrapping line of plain text items, each one
  // line high: no buttons anywhere, so no button shadows.
  await click()
  const kinds = ['dress', 'maid', 'clarity', 'replay', 'calibrate']
  for (const kind of kinds) {
    const item = await band.find({ key: `menu-${kind}` })
    expect(item?.props.height).toBe(1)
  }
  expect(await band.find({ type: 'Button' })).toBeUndefined()
  const line = (await band.findAll({ type: 'Box' })).find(b => b.props.flexWrap === 'wrap')
  expect(line?.props.flexDirection).toBe('row')

  // Clicking an option (Maid outfit) closes the menu.
  await band.pointer({ type: 'down', x: 3, y: 0, button: 'left', in: 'menu-maid' })
  expect(await band.find({ key: 'menu-maid' })).toBeUndefined()

  // Dragging the clarity bar keeps it open; the flower closes it.
  await click()
  await band.pointer({ type: 'down', x: 19, y: 0, button: 'left', in: 'menu-clarity' })
  await band.pointer({ type: 'up', x: 19, y: 0, button: 'left', in: 'menu-clarity' })
  expect(await band.find({ key: 'menu-clarity' })).toBeDefined()
  await click()
  expect(await band.find({ key: 'menu-clarity' })).toBeUndefined()
  await band.unmount()
  await clock.advance(2000)

  expect((await backdrop($)).layers.some(l => /maid outfit/.test(l.alt))).toBe(true)
  // Column 19, past the bar's end (columns 9-18), is 100%.
  expect(glasses.at(-1)).toEqual({ blur: 0, opacity: 0.12 })

  await run($, '0')
  expect(glasses.at(-1)).toEqual({ blur: 20, opacity: 0.8 })
})

test('on the mobile app the flower is a one-glyph button and clarity steps by − and +', async ($, on) => {
  const clock = mock.clock(on)
  const glasses = engine(on)
  await start($)
  await clock.advance(TO_SCENE)
  const band = await $.ui.mount({ ...BAND, surface: 'mobile' })
  await band.press({ key: 'open' })
  await band.press({ key: 'plus' })
  expect(await band.find({ key: 'plus' })).toBeDefined()
  expect(glasses.at(-1)).toEqual({ blur: 0.2, opacity: 0.19 })
  await band.unmount()
})

test('the right sidebar opening hides her at once, then she returns beside it with her entrance; closing does the same', async ($, on) => {
  const clock = mock.clock(on)
  const glasses = engine(on)
  await start($)
  await clock.advance(TO_SCENE)
  const sent = glasses.length
  const has = (layers: { alt: string }[], re: RegExp) => layers.some(l => re.test(l.alt))

  await backdrop($, 200)
  await backdrop($, 140)
  // Gone at once: the ground and petals stay, she doesn't.
  await clock.advance(1)
  const away = (await backdrop($, 140)).layers
  expect(away.length).toBe(2)
  expect(has(away, /white dress/)).toBe(false)

  // Once the width has held still, she returns with her entrance, in one drawing of
  // its own, at her share beside the sidebar (session list 25 + chat 140 over 225:
  // 73.3%), the ground left as it is.
  await clock.advance(400)
  const back = await backdrop($, 140)
  expect(back.layers.length).toBe(1)
  expect(back.layers[0]?.alt).toMatch(/appears in her white dress in a burst of light/)
  expect(back.layers[0]?.size).toBeLessThan(131072)
  expect(back.sources[0]).toContain('class="entrance return"')
  expect(back.sources[0]).toContain('.return .calm{animation:none}')
  expect(back.sources[0]).toContain('width="73.3%"')
  expect(back.sources[0]).not.toContain('class="ln"')
  // ...then her sharp layers stand clear of the sidebar.
  await clock.advance(2400)
  expect((await backdrop($, 140)).right).toBe(60)

  // An outfit change while it is open lays her moving figure in the same place.
  await run($, 'maid')
  expect((await backdrop($, 140)).sources[0]).toContain('width="73.3%"')
  await clock.advance(2400)

  await backdrop($, 200)
  await clock.advance(1)
  expect((await backdrop($, 200)).layers.length).toBe(2)
  await clock.advance(400)
  expect((await backdrop($, 200)).sources[0]).toContain('class="entrance return"')
  await clock.advance(2400)
  expect((await backdrop($, 200)).right).toBe(0)
  expect(glasses.length).toBe(sent)
})

test('any change of the band hides her at once; more changes start nothing until all is still', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await start($)
  await backdrop($, 200)
  await clock.advance(TO_SCENE)
  const band = await $.ui.mount(BAND)
  expect(await band.find({ key: 'sensor' })).toBeDefined()
  await band.post({ mode: 'closed', columns: 190 }, { in: 'sensor' })
  await clock.advance(800)
  // Even one column: she is gone, before the background's width changes at all.
  await band.post({ mode: 'closed', columns: 189 }, { in: 'sensor' })
  expect((await backdrop($, 200)).layers.length).toBe(2)
  // The window keeps changing for a while: nothing plays.
  for (let cols = 185; cols >= 159; cols -= 2) {
    await clock.advance(100)
    await band.post({ mode: 'closed', columns: cols }, { in: 'sensor' })
    expect((await backdrop($, 200)).layers.length).toBe(2)
  }
  await band.unmount()
  // The background hears of it; once still, she returns beside it with her entrance.
  await backdrop($, 140)
  await clock.advance(450)
  expect((await backdrop($, 140)).sources[0]).toContain('class="entrance return"')
  await clock.advance(2400)
  expect((await backdrop($, 140)).right).toBe(60)
})

test('a layout change of the band itself (the menu opening) is not taken for the sidebar', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await start($)
  await clock.advance(TO_SCENE)
  const band = await $.ui.mount(BAND)
  await band.post({ mode: 'closed', columns: 190 }, { in: 'sensor' })
  await band.post({ mode: 'open', columns: 100 }, { in: 'sensor' })
  expect((await backdrop($, 200)).layers.length).toBeGreaterThan(2)
  await band.unmount()
})

test('clicking the flower opens the menu without hiding her or playing her return', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await start($)
  await backdrop($, 200)
  await clock.advance(TO_SCENE)
  const band = await $.ui.mount(BAND)
  await band.post({ mode: 'closed', columns: 190 }, { in: 'sensor' })
  await band.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'flower' })
  // The strip reports the old width first, then the narrower one the menu leaves it.
  await band.post({ mode: 'open', columns: 190 }, { in: 'sensor' })
  await clock.advance(30)
  await band.post({ mode: 'open', columns: 110 }, { in: 'sensor' })
  // A report still carrying the closed layout is stale.
  await band.post({ mode: 'closed', columns: 60 }, { in: 'sensor' })
  expect((await backdrop($, 200)).layers.length).toBeGreaterThan(2)
  await clock.advance(1500)
  const after = await backdrop($, 200)
  expect(after.layers.length).toBeGreaterThan(2)
  expect(after.sources.some(src => src.includes('class="entrance return"'))).toBe(false)
  // Closing it again doesn't either.
  await band.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'flower' })
  await band.post({ mode: 'closed', columns: 110 }, { in: 'sensor' })
  await clock.advance(30)
  await band.post({ mode: 'closed', columns: 190 }, { in: 'sensor' })
  expect((await backdrop($, 200)).layers.length).toBeGreaterThan(2)
  await band.unmount()
})

test('hidden by the band but the background never changes: once all is still she returns where she stood', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await start($)
  await backdrop($, 200)
  await clock.advance(TO_SCENE)
  const band = await $.ui.mount(BAND)
  await band.post({ mode: 'closed', columns: 190 }, { in: 'sensor' })
  await clock.advance(800)
  await band.post({ mode: 'closed', columns: 150 }, { in: 'sensor' })
  expect((await backdrop($, 200)).layers.length).toBe(2)
  await band.unmount()
  await clock.advance(750)
  expect((await backdrop($, 200)).sources[0]).toContain('class="entrance return"')
  await clock.advance(2400)
  const back = await backdrop($, 200)
  expect(back.layers.length).toBeGreaterThan(2)
  expect(back.right).toBe(0)
})

test('she waits for a sidebar that opens in two steps to hold still, then returns in place', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await start($)
  await clock.advance(TO_SCENE)

  await backdrop($, 200)
  await backdrop($, 150)
  await clock.advance(1)
  expect((await backdrop($, 150)).layers.length).toBe(2)
  await clock.advance(50)
  await backdrop($, 140)
  // Still moving 300 ms ago: she stays away.
  await clock.advance(300)
  expect((await backdrop($, 140)).layers.length).toBe(2)
  // Held still: she returns where the whole width leaves room.
  await clock.advance(150)
  expect((await backdrop($, 140)).sources[0]).toContain('width="73.3%"')
  await clock.advance(2400)
  expect((await backdrop($, 140)).right).toBe(60)
})

test('in a moving drawing only she moves; the ground, petals and light rest as they end', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await start($)
  await clock.advance(TO_SCENE)
  await run($, 'maid')
  const src = (await backdrop($)).sources[0] ?? ''
  expect(src).toContain('.calm *{animation:none!important}')
  expect(src.match(/<g class="calm">/g)?.length).toBe(2)
  expect(src).toContain('.mglow{opacity:0}')
})

test('leaving full screen hides the session rail: she goes to the edge, and back beside it on return', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await start($)
  // As recorded: full screen 98 x 29; the rail opens (chat 66); she stands 32 columns in.
  await backdrop($, 98, 29)
  await clock.advance(TO_SCENE)
  await backdrop($, 66, 29)
  await clock.advance(3000)
  expect((await backdrop($, 66, 29)).right).toBe(32)
  // Out of full screen: a shorter window (25 rows) yet a wider chat (73): the rail hid.
  await backdrop($, 73, 25)
  // Settled (0.35 s), then still a moment (0.4 s): she returns at the edge.
  await clock.advance(800)
  expect((await backdrop($, 73, 25)).sources[0]).toContain('class="entrance return"')
  await clock.advance(2400)
  expect((await backdrop($, 73, 25)).right).toBe(0)
  // Back to full screen: taller (29) yet narrower (66): the rail is back, and so is she.
  await backdrop($, 66, 29)
  await clock.advance(800)
  await clock.advance(2400)
  expect((await backdrop($, 66, 29)).right).toBe(32)
})

test('a window made bigger or smaller with the rail kept open leaves her beside it', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await start($)
  await backdrop($, 98, 29)
  await clock.advance(TO_SCENE)
  await backdrop($, 66, 29)
  await clock.advance(3000)
  // Smaller and narrower together: an ordinary resize.
  await backdrop($, 50, 25)
  await clock.advance(3000)
  expect((await backdrop($, 50, 25)).right).toBe(32)
})

test('dragging the window narrower step by step does not move her', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await start($)
  await clock.advance(TO_SCENE)

  await backdrop($, 200)
  for (let cols = 194; cols >= 140; cols -= 6) {
    await backdrop($, cols)
    await clock.advance(100)
  }
  await clock.advance(400)
  expect((await backdrop($, 140)).right).toBe(0)
})

test('the whole background stays under the size the desktop app refuses, in both outfits', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await start($)
  await clock.advance(TO_SCENE)

  // The app refused about 325k characters in all; 220k drew. One level of detail now.
  expect(total((await backdrop($)).layers)).toBeLessThan(240_000)
  // The old /claudia high and light are gone: they are no longer commands.
  expect((await run($, 'high')).text).toMatch(/^Usage/)

  await run($, 'maid')
  await clock.advance(200)
  expect(total((await backdrop($)).layers)).toBeLessThan(240_000)
  await clock.advance(2000)
  expect(total((await backdrop($)).layers)).toBeLessThan(240_000)
})

test('changing outfit plays one fresh moving drawing, then her sharp layers', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await start($)
  await clock.advance(TO_SCENE)

  await run($, 'maid')
  const first = await backdrop($)
  expect(first.layers.length).toBe(1)
  expect(first.layers[0]?.alt).toMatch(/appears in her maid outfit/)
  expect(first.layers[0]?.size).toBeLessThan(131072)
  expect(first.sources[0]).toContain('class="change"')

  await clock.advance(2400)
  const sharp = (await backdrop($)).layers
  expect(sharp.length).toBeGreaterThan(3)
  expect(sharp.some(l => /maid outfit/.test(l.alt))).toBe(true)

  // Back again: a drawing with a different note, so the app plays it anew.
  await run($, 'dress')
  await run($, 'maid')
  const again = await backdrop($)
  expect(again.layers[0]?.alt).toMatch(/appears in her maid outfit/)
  expect(again.sources[0]).not.toBe(first.sources[0])
})

test('the opening stands its wordmark in the chat area, between the session list and the sidebar', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await start($)
  // Session list 25 + chat 200 columns: the stage starts 11.1% in and is 88.9% wide.
  expect((await backdrop($, 200)).sources[0]).toContain('class="stage" x="11.1%" width="88.9%"')
  // Measured once: a later size doesn't restart it.
  expect((await backdrop($, 180)).sources[0]).toContain('class="stage" x="11.1%" width="88.9%"')
  await clock.advance(TO_SCENE)

  // With the sidebar open (60 columns), a replay fits 140 columns of 225.
  await backdrop($, 200)
  await backdrop($, 140)
  await clock.advance(2000)
  await run($, 'intro')
  expect((await backdrop($, 140)).sources[0]).toContain('class="stage" x="11.1%" width="62.2%"')
})

test('a click beside the session list gives its width; one too far right gives none', () => {
  // A quarter of the way across a window of chat 140 and no sidebar: 0.25 x 140 / 0.75.
  expect(measureLeft(0.25, 140, 0)).toBe(47)
  // With the right sidebar open (11 columns) it counts in the whole.
  expect(measureLeft(0.25, 129, 11)).toBe(47)
  // At the very left: a collapsed session list.
  expect(measureLeft(0, 140, 0)).toBe(0)
  expect(measureLeft(0.95, 140, 0)).toBeUndefined()
  expect(measureLeft(0.25, 0, 0)).toBeUndefined()
})

test('Calibrate in the menu asks for the click, with a way out', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await start($)
  await backdrop($, 140)
  await clock.advance(TO_SCENE)
  const band = await $.ui.mount(BAND)
  await band.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'flower' })
  await band.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'menu-calibrate' })
  expect(await band.find({ key: 'menu-cancel' })).toBeDefined()
  expect(await band.find({ key: 'menu-dress' })).toBeUndefined()
  await band.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'menu-cancel' })
  expect(await band.find({ key: 'menu-cancel' })).toBeUndefined()
  await band.unmount()
})

test('a measured width is kept for the next session, and calibrate reset forgets it', async ($, on) => {
  mock.clock(on)
  engine(on, { leftCols: 47 })
  await start($)
  expect((await backdrop($, 140)).sources[0]).toContain('class="stage" x="25.1%" width="74.9%"')
  await run($, 'calibrate reset')
  await run($, 'intro')
  // Back to the setting's 25: 25 / 165.
  expect((await backdrop($, 140)).sources[0]).toContain('class="stage" x="15.2%" width="84.8%"')
})

test('the session list width setting moves the wordmark: 0 for a collapsed list', { options: { session_list_columns: 0 } }, async ($, on) => {
  mock.clock(on)
  engine(on)
  await start($)
  expect((await backdrop($, 200)).sources[0]).toContain('class="stage" x="0%" width="100%"')
})

test('a wider session list setting is counted too', { options: { session_list_columns: 50 } }, async ($, on) => {
  mock.clock(on)
  engine(on)
  await start($)
  // 50 + 200 columns: the stage starts 20% in.
  expect((await backdrop($, 200)).sources[0]).toContain('class="stage" x="20%" width="80%"')
})

test('a sidebar left open last session, at the same chat width, is taken as open', async ($, on) => {
  const clock = mock.clock(on)
  engine(on, { side: { shift: 60, cols: 140 } })
  await start($)
  expect((await backdrop($, 140)).sources[0]).toContain('class="stage" x="11.1%" width="62.2%"')
  await clock.advance(TO_SCENE)
  expect((await backdrop($, 140)).right).toBe(60)
})

test('at another chat width a remembered sidebar is taken as closed', async ($, on) => {
  const clock = mock.clock(on)
  engine(on, { side: { shift: 60, cols: 140 } })
  await start($)
  expect((await backdrop($, 200)).sources[0]).toContain('class="stage" x="11.1%" width="88.9%"')
  await clock.advance(TO_SCENE)
  expect((await backdrop($, 200)).right).toBe(0)
})

test('replay plays the opening at once, alone, then shows her', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await start($)
  await clock.advance(TO_SCENE)
  const has = (layers: { alt: string }[], re: RegExp) => layers.some(l => re.test(l.alt))

  await run($, 'intro')
  let now = (await backdrop($)).layers
  expect(now.length).toBe(1)
  expect(has(now, /wordmark/)).toBe(true)
  expect(has(now, /white dress/)).toBe(false)

  await clock.advance(6500)
  expect(has((await backdrop($)).layers, /wordmark/)).toBe(true)
  await clock.advance(200)
  now = (await backdrop($)).layers
  expect(has(now, /wordmark/)).toBe(false)
  expect(has(now, /appears in her white dress/)).toBe(true)
  await clock.advance(2400)
  expect((await backdrop($)).layers.length).toBeGreaterThan(3)
})

test('each replay hands over the opening with a fresh note', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await start($)
  const first = (await backdrop($)).sources[0]
  await clock.advance(TO_SCENE)

  await run($, 'intro')
  const second = (await backdrop($)).sources[0]
  expect(second).toMatch(/wordmark/)
  expect(second).not.toBe(first)
})

test('Hide background gives the app its own look, the flower staying; its menu brings her back with her entrance', async ($, on) => {
  const clock = mock.clock(on)
  const glasses = engine(on)
  await start($)
  await backdrop($, 200)
  await clock.advance(TO_SCENE)
  const band = await $.ui.mount(BAND)
  await band.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'flower' })
  expect(await band.find({ key: 'menu-background' })).toBeDefined()
  await band.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'menu-background' })
  // Off: the theme is cleared (the app's own colours and background); the flower
  // stays, and its menu holds only the way back.
  expect(glasses.at(-1)).toBe('cleared')
  expect(await band.find({ key: 'flower' })).toBeDefined()
  await band.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'flower' })
  expect(await band.find({ key: 'menu-background' })).toBeDefined()
  expect(await band.find({ key: 'menu-dress' })).toBeUndefined()
  // The band's sensor changes nothing while it is off.
  await band.post({ mode: 'open', columns: 60 }, { in: 'sensor' })

  // The right-click menu keeps the way back, and nothing else.
  const menuUi = await $.ui.mount({ plugin: 'claudia-theme', surface: 'desktop', component: 'ContextMenu', props: {} })
  expect(await menuUi.find({ key: 'cm-background' })).toBeDefined()
  expect(await menuUi.find({ key: 'cm-outfit' })).toBeUndefined()
  await menuUi.unmount()

  // Show background: the whole look comes back with her entrance, the parchment
  // fading in.
  await band.pointer({ type: 'down', x: 2, y: 0, button: 'left', in: 'menu-background' })
  await band.unmount()
  expect(glasses.at(-1)).toEqual({ blur: 0.8, opacity: 0.26 })
  const entrance = await backdrop($, 200)
  expect(entrance.layers.length).toBe(1)
  expect(entrance.sources[0]).toContain('class="entrance"')
  expect(entrance.sources[0]).toContain('.entrance .calm{animation:calmin')
  await clock.advance(2400)
  expect((await backdrop($, 200)).layers.length).toBeGreaterThan(3)
  const band2 = await $.ui.mount(BAND)
  expect(await band2.find({ key: 'flower' })).toBeDefined()
  await band2.unmount()
})

test('turned off, it stays off in the next session: no theme set at all, and no clearing either', async ($, on) => {
  const clock = mock.clock(on)
  const glasses = engine(on, { background: false })
  await start($)
  expect(glasses).toEqual([])
  await clock.advance(TO_SCENE)
  await run($, 'on')
  expect(glasses.at(-1)).toEqual({ blur: 0.8, opacity: 0.26 })
  expect((await backdrop($, 200)).sources[0]).toContain('class="entrance"')
  await run($, 'off')
  expect(glasses.at(-1)).toBe('cleared')
})

test('the right-click menu has a row that changes her outfit', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await start($)
  await clock.advance(TO_SCENE)

  const ui = await $.ui.mount({ plugin: 'claudia-theme', surface: 'desktop', component: 'ContextMenu', props: {} })
  await ui.press({ key: 'cm-outfit' })
  await ui.unmount()
  await clock.advance(2000)
  expect((await backdrop($)).layers.some(l => /maid outfit/.test(l.alt))).toBe(true)
})

test('a backdrop another theme set is left alone', async ($, on) => {
  engine(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>other</Text>
  })
  await start($)
  const ui = await $.ui.mount({ ...BACKDROP, props: { ...BACKDROP.props, scene: 'lagoon', plugin: 'someone-else' }, surface: 'desktop' })
  expect((await ui.find({ type: 'Text' }))?.text).toBe('other')
  await ui.unmount()
})
