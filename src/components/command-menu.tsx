import React from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Laptop,
  Moon,
  Sun,
} from 'lucide-react'
import { useSearch } from '@/context/search-provider'
import { useTheme } from '@/context/theme-provider'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { sidebarData } from './layout/data/sidebar-data'
import { ScrollArea } from './ui/scroll-area'

const isExternal = (url: string) => /^https?:\/\//.test(url)

/**
 * Ctrl+K search. Lists every sidebar page and link, and the theme. Add a
 * CommandGroup per kind of project item (parts, documents ...) to search it.
 */
export function CommandMenu() {
  const navigate = useNavigate()
  const { setTheme } = useTheme()
  const { open, setOpen } = useSearch()

  const runCommand = React.useCallback(
    (command: () => unknown) => {
      setOpen(false)
      command()
    },
    [setOpen]
  )

  return (
    <CommandDialog modal open={open} onOpenChange={setOpen}>
      <CommandInput placeholder='Search pages and links…' />
      <CommandList>
        <ScrollArea type='hover' className='h-96 pe-1'>
          <CommandEmpty>No results found.</CommandEmpty>

          {sidebarData.navGroups.map((group) => (
            <CommandGroup key={group.title} heading={group.title}>
              {group.items.flatMap((navItem, i) => {
                const url = navItem.url ? String(navItem.url) : undefined
                if (url && isExternal(url))
                  return [
                    <CommandItem
                      key={`${url}-${i}`}
                      value={navItem.title}
                      onSelect={() =>
                        runCommand(() =>
                          window.open(url, '_blank', 'noreferrer')
                        )
                      }
                    >
                      <ExternalLink className='size-3 text-muted-foreground/80' />
                      {navItem.title}
                    </CommandItem>,
                  ]
                if (url)
                  return [
                    <CommandItem
                      key={`${url}-${i}`}
                      value={navItem.title}
                      onSelect={() =>
                        runCommand(() => navigate({ to: url as never }))
                      }
                    >
                      <ArrowRight className='size-3 text-muted-foreground/80' />
                      {navItem.title}
                    </CommandItem>,
                  ]
                return (navItem.items ?? []).map((sub, j) => (
                  <CommandItem
                    key={`${navItem.title}-${sub.title}-${j}`}
                    value={`${navItem.title} ${sub.title}`}
                    onSelect={() =>
                      runCommand(() =>
                        navigate({
                          to: sub.url as never,
                          search: sub.search as never,
                        })
                      )
                    }
                  >
                    <ArrowRight className='size-3 text-muted-foreground/80' />
                    {navItem.title} <ChevronRight /> {sub.title}
                  </CommandItem>
                ))
              })}
            </CommandGroup>
          ))}

          <CommandSeparator />
          <CommandGroup heading='Theme'>
            <CommandItem onSelect={() => runCommand(() => setTheme('light'))}>
              <Sun /> <span>Light</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setTheme('dark'))}>
              <Moon className='scale-90' />
              <span>Dark</span>
            </CommandItem>
            <CommandItem onSelect={() => runCommand(() => setTheme('system'))}>
              <Laptop />
              <span>System</span>
            </CommandItem>
          </CommandGroup>
        </ScrollArea>
      </CommandList>
    </CommandDialog>
  )
}
