import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import {
  RouterProvider,
  createHashHistory,
  createRouter,
} from '@tanstack/react-router'
import logoDark from './assets/images/logo-dark.png'
import logoLight from './assets/images/logo-light.png'
import { DirectionProvider } from './context/direction-provider'
import { FontProvider } from './context/font-provider'
import { ThemeProvider } from './context/theme-provider'
import { takeLinkFromHash } from './features/filter/state/persist'
// Generated Routes
import { routeTree } from './routeTree.gen'
// Styles
import './styles/index.css'

// Favicons from imported files: the single-file build inlines them.
for (const [href, scheme] of [
  [logoLight, 'light'],
  [logoDark, 'dark'],
]) {
  const link = document.createElement('link')
  link.rel = 'icon'
  link.type = 'image/png'
  link.href = href
  link.media = `(prefers-color-scheme: ${scheme})`
  document.head.append(link)
}

// A design link (#d=...) is read and cleared first: hash history would take
// it for a route.
takeLinkFromHash()

// Hash history: GitHub Pages has no server-side rewrites, so deep links
// such as /#/diagram?level=board keep working after a page reload.
const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <ThemeProvider>
        <FontProvider>
          <DirectionProvider>
            <RouterProvider router={router} />
          </DirectionProvider>
        </FontProvider>
      </ThemeProvider>
    </StrictMode>
  )
}
