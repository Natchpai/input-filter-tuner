import { Link } from '@tanstack/react-router'
import { build, commitUrl, site } from '@/config/site'
import { useLayout } from '@/context/layout-provider'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { BrandLogo, ThemedImage } from '@/components/brand-logo'
import { sidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const { setOpenMobile } = useSidebar()
  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size='lg' asChild>
              <Link to='/' onClick={() => setOpenMobile(false)}>
                <BrandLogo className='size-8 shrink-0' />
                <div className='grid flex-1 text-start text-sm leading-tight'>
                  <span className='truncate font-bold tracking-tight'>
                    {site.name}
                  </span>
                  <span className='truncate text-xs text-muted-foreground'>
                    {site.subtitle}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {sidebarData.navGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <div className='rounded-md border border-status-open/40 bg-status-open/10 px-3 py-2 text-xs leading-snug group-data-[collapsible=icon]:hidden'>
          <span className='font-semibold text-status-open'>{site.status}</span>
          <span className='text-muted-foreground'> · {site.statusNote}</span>
          <a
            href={commitUrl(build.commit)}
            target='_blank'
            rel='noreferrer'
            className='mt-1 block text-[11px] text-muted-foreground hover:text-foreground'
          >
            Build <span className='font-mono'>{build.commit.slice(0, 7)}</span>{' '}
            · {build.date}
          </a>
        </div>
        {site.partner && (
          <div className='flex items-center gap-2 px-1 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden'>
            In co-op with
            <ThemedImage
              light={site.partner.light}
              dark={site.partner.dark}
              alt={site.partner.name}
              className='h-4 w-6 shrink-0'
            />
          </div>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
