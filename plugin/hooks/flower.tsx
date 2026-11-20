import type { ClientModule } from 'claude-code'

// The flower above the prompt: a single orange blossom, no button around it.
// A click (or Return / Space once it has focus) posts { menu: 'toggle' } to the
// hooks module, which opens or closes the Claudia menu.

type Props = { open: boolean }

const PETAL = '#e0662a'
const OPEN = '#b8501f'

const Flower: ClientModule<Props, undefined> = (props, surface) => {
  const { Text } = surface.elements

  surface.onPointer(ev => {
    if (ev.type === 'down' && ev.button === 'left') {
      surface.post({ menu: 'toggle' })
    }
  })

  surface.onKey(ev => {
    if (ev.key === 'return' || ev.key === ' ') {
      surface.post({ menu: 'toggle' })
    }
  })

  return Text({ color: props.open ? OPEN : PETAL, bold: true, children: '✿' })
}

export default Flower
