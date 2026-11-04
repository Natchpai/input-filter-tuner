import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  // One-off script that wrote the parity fixture from legacy/index.html
  entry: ['scripts/*.mjs'],
  // Block types, defaults and helpers stay exported as the model's API
  ignoreExportsUsedInFile: true,
  ignore: [
    'src/components/ui/**',
    'src/components/layout/app-title.tsx',
    // sortable table pieces, kept for pages that list rows
    'src/components/data-table/**',
    // template card pieces (Overview patterns), kept for new pages
    'src/components/icon-box.tsx',
    'src/components/md-text.tsx',
    'src/components/status-badge.tsx',
    'src/lib/utils.ts',
    'src/config/site.ts',
    'src/context/font-provider.tsx',
  ],
  ignoreDependencies: [
    // used by the template pieces above
    '@tanstack/react-table',
    '@radix-ui/react-icons',
    // types for plotly.js-basic-dist-min (src/features/filter/plots/plotly.d.ts)
    '@types/plotly.js',
  ],
}

export default config
