import type { ClientModule } from 'claude-code'

// An invisible strip that stretches across the band above the prompt. The app
// calls a Client again the moment its region changes size, while the width it
// hands the background comes only once a resize has settled; so when the right
// sidebar starts to open or close, the band narrows or widens and this posts its
// width at once, and she can be gone before the sidebar reaches her.
// `mode` says how the band is laid out (closed, menu open, calibrating), whose
// own changes move the strip without the window changing.

type Props = { mode: string }

const Sensor: ClientModule<Props, undefined> = (props, surface) => {
  if (surface.columns > 0) {
    surface.post({ mode: props.mode, columns: surface.columns })
  }
  return surface.elements.Text({ children: ' ' })
}

export default Sensor
