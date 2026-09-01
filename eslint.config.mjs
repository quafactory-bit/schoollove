import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: import.meta.dirname })

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  ...compat.config({ extends: ['next/core-web-vitals', 'next/typescript'] }),
  {
    // Preserve the established legacy baseline as visible CI warnings while
    // keeping every other Next and TypeScript rule enforcement-capable.
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'prefer-const': 'warn',
      'react/no-unescaped-entities': 'warn',
    },
  },
]

export default config
