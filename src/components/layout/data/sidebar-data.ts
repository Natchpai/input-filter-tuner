import { site } from '@/config/site'
import { BookOpen, FileText, GitBranch, SlidersHorizontal } from 'lucide-react'
import { type SidebarData } from '../types'

/** Sidebar navigation. Search (Ctrl+K) lists the same pages. */
export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: 'Tool',
      items: [
        { title: 'Tuner', url: '/', icon: SlidersHorizontal },
        { title: 'Notes', url: '/notes', icon: BookOpen },
      ],
    },
    {
      title: 'Links',
      items: [
        {
          title: 'README',
          url: `${site.repoUrl}#readme`,
          icon: FileText,
        },
        { title: 'Repository', url: site.repoUrl, icon: GitBranch },
      ],
    },
  ],
}
