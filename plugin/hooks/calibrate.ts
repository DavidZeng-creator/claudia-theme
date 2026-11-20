/**
 * The session list's width in the app's columns, from one click on bare
 * background right beside it. The background spans the whole window: session
 * list, chat area (`cols`) and right sidebar (`right`), and the click comes
 * `x` of the way across it (0-1), so the list is to the rest as x is to 1 - x.
 * Undefined for a click too far right to be beside the list.
 */
export function measureLeft(x: number, cols: number, right: number): number | undefined {
  if (!(cols > 0) || !(x >= 0) || x >= 0.9) {
    return undefined
  }
  return Math.round((x * (cols + Math.max(0, right))) / (1 - x))
}
