// Hint state per card: the toolbar switch, or the card's own (i) toggle.
import { createContext, useState } from 'react'
import { useUi } from './ui-store'

/** Whether the hints in this card show; null outside a card (follow the switch). */
export const HintContext = createContext<boolean | null>(null)

/**
 * One card's hint state: the toolbar switch, unless the card's (i) was
 * clicked, which then wins for that card until a reload.
 */
export function useHintScope() {
  const { hints } = useUi()
  const [own, setOwn] = useState<boolean | null>(null)
  const show = own ?? hints
  return { show, toggle: () => setOwn(!show) }
}
