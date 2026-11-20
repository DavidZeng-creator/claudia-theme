/** The opening, a moving drawing (entrance, outfit change, return), gone while
 *  the window changes, or her resting scene. */
export type Phase = 'intro' | 'move' | 'away' | 'steady'
export type Outfit = 'dress' | 'maid'

declare module 'claude-code' {
  interface PluginState {
    'claudia-theme': {
      phase: Phase
      outfit: Outfit
      /** 0-100: how clearly she shows through the app's panels. */
      clarity: number
      /** Columns the right sidebar takes; she moves left by as much. */
      shift: number
      /** Whether the menu above the prompt is open. */
      menu: boolean
      /** How many one-off moving drawings have been shown; each gets a fresh note. */
      take: number
      /** Waiting for the click that measures the session list. */
      calibrating: boolean
      /** Whether the background is shown; off, the app keeps its own. */
      background: boolean
    }
  }
}
