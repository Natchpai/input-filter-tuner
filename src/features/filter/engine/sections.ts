// LC sections: which L and C a damping element works against.
import { TAU } from './complex'
import { dcR } from './ladder'
import type { Block, Design, InductiveBlock, Scale } from './model'
import { effC, isInductive, kindOf, mainL, SC1 } from './types'

export type Section = {
  block: InductiveBlock
  L: number
  C: number
  Z0: number
  f0: number
  rL: number
}

const isLser = (b: Block): b is InductiveBlock =>
  kindOf(b) === 'series' && isInductive(b)

/**
 * One LC section: an inductive series block and the capacitor banks after it,
 * up to the next inductive series block.
 */
function sectionAt(bl: Block[], idx: number, s: Scale = SC1): Section | null {
  let C = 0
  for (let i = idx + 1; i < bl.length; i++) {
    const b = bl[i]
    if (isLser(b)) break
    if (b.type === 'cap') C += effC(b, s) * Math.max(1, b.n)
  }
  if (!(C > 0)) return null
  const block = bl[idx] as InductiveBlock
  const L = mainL(block, s)
  return {
    block,
    L,
    C,
    Z0: Math.sqrt(L / C),
    f0: 1 / (TAU * Math.sqrt(L * C)),
    rL: dcR(block),
  }
}

/**
 * Primary filter section: the inductive series block nearest the converter.
 * Feeds only the summary tiles; use sectionOf for one damping element.
 */
export function primary(st: Design, s: Scale = SC1): Section | null {
  const bl = st.blocks.filter((b) => b.on)
  // An inductive block with no cap after it (a bead at the converter) has
  // no section; try the next one towards the source.
  for (let i = bl.length - 1; i >= 0; i--) {
    if (!isLser(bl[i])) continue
    const sec = sectionAt(bl, i, s)
    if (sec) return sec
  }
  return null
}

/**
 * The section a block belongs to: an inductor is its own section; any other
 * block belongs to the nearest inductive series block on the source side.
 */
export function sectionOf(
  st: Design,
  id: string,
  s: Scale = SC1
): Section | null {
  const bl = st.blocks.filter((b) => b.on || b.id === id)
  const j = bl.findIndex((b) => b.id === id)
  if (j < 0) return null
  for (let i = j; i >= 0; i--) if (isLser(bl[i])) return sectionAt(bl, i, s)
  return null
}
