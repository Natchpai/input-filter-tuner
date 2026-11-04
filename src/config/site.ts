/**
 * Site settings. Change these first in a new project; the sidebar, header,
 * Overview hero and page title read them from here.
 */
export const site = {
  name: 'Input Filter Tuner',
  /** Line under the name in the sidebar */
  subtitle: 'DC-DC input filter design',
  tagline:
    'Zout against Rn, H and S21, Zin and the Middlebrook check for DC-DC converter input filters.',
  /** Badge in the header and sidebar footer, e.g. DRAFT, BETA, RELEASE */
  status: 'DRAFT',
  statusNote: 'Vite port (M0)',
  repoUrl: 'https://github.com/Natchpai/input-filter-tuner',
  /**
   * Small "In co-op with" logo in the sidebar footer, or null for none.
   * light/dark are image URLs: import the files from src/assets/images/.
   */
  partner: null as { name: string; light: string; dark: string } | null,
}

/** Commit and date of this build, set in vite.config.ts. */
export const build = __BUILD__

/** Link to a commit on GitHub. A local build without Git has none. */
export function commitUrl(sha: string) {
  return /^[0-9a-f]{7,40}$/.test(sha)
    ? `${site.repoUrl}/commit/${sha}`
    : undefined
}

/** Link to a file (and line) in the repo on GitHub. */
export function sourceUrl(file: string, line?: number) {
  const base = `${site.repoUrl}/blob/main/${file}`
  return line ? `${base}?plain=1#L${line}` : base
}
