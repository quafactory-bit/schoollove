import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        schoollove: {
          bg: 'var(--schoollove-bg)',
          surface: 'var(--schoollove-surface)',
          'surface-subtle': 'var(--schoollove-surface-subtle)',
          'surface-pressed': 'var(--schoollove-surface-pressed)',
          text: 'var(--schoollove-text)',
          secondary: 'var(--schoollove-text-secondary)',
          muted: 'var(--schoollove-text-muted)',
          border: 'var(--schoollove-border)',
          'progress-track': 'var(--schoollove-progress-track)',
          school: 'var(--schoollove-school)',
          number: 'var(--schoollove-number)',
          level: 'var(--schoollove-level)',
          growth: 'var(--schoollove-growth)',
          system: 'var(--schoollove-system)',
          warning: 'var(--schoollove-warning)',
          'system-soft': 'var(--schoollove-system-soft)',
          'neutral-soft': 'var(--schoollove-neutral-soft)',
          'neon-mint': 'var(--schoollove-neon-mint)',
          'neon-lime': 'var(--schoollove-neon-lime)',
          'electric-blue': 'var(--schoollove-electric-blue)',
          'neon-orange': 'var(--schoollove-neon-orange)',
        },
        // 브랜드 컬러를 흑백 모노톤으로 통일 (클래스명 유지 -> 코드 수정 없이 전 페이지 적용)
        brand: {
          blue: '#0a0a0a',
          'blue-hover': '#262626',
          'blue-light': '#f5f5f5',
        },
        gray: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist)', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Apple SD Gothic Neo"', '"Malgun Gothic"', 'sans-serif'],
        status: ['var(--font-schoollove-mono)'],
        retro: ['var(--font-schoollove-retro)'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      maxWidth: {
        content: '600px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.07), 0 1px 2px -1px rgba(0, 0, 0, 0.04)',
        'card-hover': '0 4px 12px 0 rgba(0, 0, 0, 0.1)',
        search: '0 2px 8px 0 rgba(0, 0, 0, 0.12)',
      },
    },
  },
  plugins: [],
}

export default config
