import { createFileRoute } from '@tanstack/react-router'
import { Tuner } from '@/features/filter'

export const Route = createFileRoute('/_site/')({
  component: Tuner,
})
