import logoDark from '@/assets/images/logo-dark.png'
import logoLight from '@/assets/images/logo-light.png'
import { cn } from '@/lib/utils'

/**
 * An image with a light-theme and a dark-theme file. Pass imported URLs
 * (src/assets/images/), so the single-file build can inline them.
 */
export function ThemedImage({
  light,
  dark,
  alt,
  className,
}: {
  light: string
  dark: string
  alt: string
  className?: string
}) {
  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <img
        src={light}
        alt={alt}
        className='h-full w-full object-contain dark:hidden'
      />
      <img
        src={dark}
        alt={alt}
        className='hidden h-full w-full object-contain dark:block'
      />
    </span>
  )
}

/**
 * Site logo: logo-light.png on the light theme, logo-dark.png on the dark
 * theme (same logo with dark parts recoloured to light).
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <ThemedImage
      light={logoLight}
      dark={logoDark}
      alt='Logo'
      className={className}
    />
  )
}
