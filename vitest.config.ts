import { configDefaults, defineConfig } from 'vitest/config'
import path from 'path'

// tsconfig.json의 "@/*": ["./*"] path alias를 Vitest 런타임에서도 동일하게 resolve한다.
export default defineConfig({
  // Next preserves JSX for its own compiler; SSR rendering tests need the same
  // automatic React runtime compiled by Vite instead.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    // v2: 화면에서 내린 v1 기능의 테스트는 기능과 함께 v1/로 옮기고 실행에서 제외한다.
    exclude: [...configDefaults.exclude, 'e2e/**', '**/v1/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
