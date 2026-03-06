import { resolve } from 'path'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

const aliasPlugin: Plugin = {
  name: 'weather-alias',
  config() {
    return {
      resolve: {
        alias: {
          '@': resolve(__dirname, './src'),
        },
      },
    }
  },
}

export default () => [tailwindcss(), aliasPlugin]
