import { toast } from 'sonner'
import type { SaveResult } from '../state/store'

export function saveToast(r: Exclude<SaveResult, 'ok'>) {
  if (r === 'full')
    toast.error('The saved list is full (30). Delete a design first.')
  else toast.error('The browser refused to store the designs (storage full?).')
}
