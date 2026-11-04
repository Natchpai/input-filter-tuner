import { type LinkProps } from '@tanstack/react-router'

type BaseNavItem = {
  title: string
  badge?: string
  icon?: React.ElementType
}

type NavLink = BaseNavItem & {
  url: LinkProps['to'] | (string & {})
  /** Search params for the route, e.g. { level: 'board' }. */
  search?: Record<string, string>
  items?: never
}

type NavCollapsible = BaseNavItem & {
  items: (BaseNavItem & {
    url: LinkProps['to'] | (string & {})
    search?: Record<string, string>
  })[]
  url?: never
}

type NavItem = NavCollapsible | NavLink

type NavGroup = {
  title: string
  items: NavItem[]
}

type SidebarData = {
  navGroups: NavGroup[]
}

export type { SidebarData, NavGroup, NavItem, NavCollapsible, NavLink }
