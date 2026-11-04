import { Fragment } from 'react'

/**
 * Renders a small Markdown subset in table cells and list items:
 * `code` and **bold**. Everything else stays plain text.
 */
export function MdText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('`') && p.endsWith('`'))
          return (
            <code
              key={i}
              className='rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]'
            >
              {p.slice(1, -1)}
            </code>
          )
        if (p.startsWith('**') && p.endsWith('**'))
          return <strong key={i}>{p.slice(2, -2)}</strong>
        return <Fragment key={i}>{p}</Fragment>
      })}
    </>
  )
}
