import { configDefaults, defineConfig } from 'vitest/config'
import path from 'path'

// tsconfig.json의 "@/*": ["./*"] path alias를 Vitest 런타임에서도 동일하게 resolve한다.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
