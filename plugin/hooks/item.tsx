import type { ClientModule, ClientPointerEvent } from 'claude-code'

// One option of the Claudia menu on the desktop, drawn as plain text (no
// button, so no frame or shadow) and highlighted under the pointer. The options
// sit side by side in one line above the prompt, which the app wraps onto a new
// line when the window is too narrow.
// A click posts { pick: kind }; the clarity option is a bar that is clicked or
// dragged and posts { clarity, final }. Return, and left / right on clarity,
// work once it has focus.

type Kind = 'dress' | 'maid' | 'clarity' | 'replay' | 'calibrate' | 'cancel' | 'background'
type Props = { kind: Kind; text: string; clarity: number }
type State = { hover: boolean; drag?: number }

const ACCENT = '#e0662a'
const HOVER = '#e0662a33'
// The clarity option: " Clarity " then the bar, then " 100%": 24 columns, the
// width the hooks module gives it.
const CLARITY_LABEL = ' Clarity '
const BAR = 10

const Item: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const hover = surface.state?.hover === true
  const clarity = surface.state?.drag ?? props.clarity
  const isClarity = props.kind === 'clarity'

  const toClarity = (ev: ClientPointerEvent) => {
    const x = (ev.fine?.x ?? ev.x + 0.5) - CLARITY_LABEL.length
    return Math.round(Math.min(1, Math.max(0, x / BAR)) * 100)
  }

  surface.onPointer(ev => {
    const drag = surface.state?.drag
    if (ev.type === 'enter' || (ev.type === 'move' && drag === undefined)) {
      if (!hover) {
        surface.setState({ hover: true })
      }
      return
    }
    if (ev.type === 'leave') {
      surface.setState({ hover: false, drag })
      return
    }
    if (ev.type === 'down' && ev.button === 'left') {
      if (isClarity) {
        const v = toClarity(ev)
        surface.setState({ hover: true, drag: v })
        surface.post({ clarity: v, final: false })
      } else {
        surface.post({ pick: props.kind })
      }
      return
    }
    if (ev.type === 'move' && drag !== undefined) {
      const v = toClarity(ev)
      if (v !== drag) {
        surface.setState({ hover: true, drag: v })
        surface.post({ clarity: v, final: false })
      }
      return
    }
    if (ev.type === 'up' && drag !== undefined) {
      surface.setState({ hover: true })
      surface.post({ clarity: toClarity(ev), final: true })
    }
  })

  surface.onKey(ev => {
    if (!isClarity && (ev.key === 'return' || ev.key === ' ')) {
      surface.post({ pick: props.kind })
    } else if (isClarity && (ev.key === 'left' || ev.key === 'right')) {
      const v = Math.min(100, Math.max(0, props.clarity + (ev.key === 'left' ? -5 : 5)))
      surface.post({ clarity: v, final: true })
    }
  })

  const background = hover ? HOVER : undefined
  if (!isClarity) {
    const chosen = props.text.startsWith('✓')
    return Box({
      flexDirection: 'row',
      backgroundColor: background,
      children: chosen
        ? [Text({ children: ' ' }), Text({ color: ACCENT, children: '✓' }), Text({ children: `${props.text.slice(1)} ` })]
        : [Text({ children: ` ${props.text} ` })],
    })
  }
  const knob = Math.min(BAR - 1, Math.round((clarity / 100) * (BAR - 1)))
  return Box({
    flexDirection: 'row',
    backgroundColor: background,
    children: [
      Text({ children: CLARITY_LABEL }),
      Text({ color: ACCENT, children: '━'.repeat(knob) }),
      Text({ color: ACCENT, bold: true, children: '●' }),
      Text({ dimColor: true, children: '─'.repeat(Math.max(0, BAR - 1 - knob)) }),
      Text({ dimColor: true, children: ` ${`${clarity}%`.padStart(4)}` }),
    ],
  })
}

export default Item
