import { site } from '@/config/site'
import { Badge } from '@/components/ui/badge'
import { ConfigDrawer } from '@/components/config-drawer'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { Header } from './header'

type SiteHeaderProps = {
  title?: React.ReactNode
  fixed?: boolean
}

/** Page header: title, status badge, search, theme and layout settings. */
export function SiteHeader({ title, fixed }: SiteHeaderProps) {
  return (
    <Header fixed={fixed}>
      <div className='me-auto min-w-0 truncate text-sm font-medium'>
        {title}
      </div>
      <Badge
        variant='outline'
        className='hidden border-status-open/50 bg-status-open/10 text-status-open md:inline-flex'
      >
        {site.status}
        {site.statusNote && ` · ${site.statusNote}`}
      </Badge>
      <Search placeholder='Search…' />
      <ThemeSwitch />
      <ConfigDrawer />
    </Header>
  )
}
