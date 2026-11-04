import { defineConfig, mergeConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import base from './vite.config'

// One self-contained HTML file in dist-single/ that opens with a double-click
// (file://). Scripts, styles, Plotly and images are all inlined.
export default mergeConfig(
  base,
  defineConfig({
    base: './',
    plugins: [viteSingleFile()],
    build: { outDir: 'dist-single', assetsInlineLimit: () => true },
  })
)
