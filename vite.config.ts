import { defineConfig } from 'vite'
import userscript from 'vite-userscript-plugin'
import pkg from './package.json' with { type: 'json' }
import { presenterHub } from './src/presenter/plugin.ts'

export default defineConfig((config) => {
  return {
    base: './',
    build: {
      minify: true,
      sourcemap: config.mode === 'development',
    },
    plugins: [
      presenterHub(),
      userscript({
        entry: 'src/index.ts',
        fileName: 'origamiok-presentation',
        autoMetaUrls: true,
        header: {
          'name': 'OrigamiOK Presentation',
          'version': pkg.version,
          'description': pkg.description,
          'icon': 'greasify.svg',
          'homepage': 'https://greasify.github.io/userscript-origamiok-presentation/',
          'match': [
            'https://origamiok.com/*',
            'https://www.origamiok.com/*',
          ],
          'run-at': 'document-idle',
          'noframes': true,
        },
        server: {
          file: true,
        },
      }),
    ],
  }
})
