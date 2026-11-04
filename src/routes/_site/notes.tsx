import { createFileRoute } from '@tanstack/react-router'
import { Notes } from '@/features/filter/notes'

export const Route = createFileRoute('/_site/notes')({
  component: Notes,
})
