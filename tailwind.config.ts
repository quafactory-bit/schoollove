@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css');
@tailwind base;
@tailwind components;
@tailwind utilities;
@layer base {
  * {
    -webkit-tap-highlight-color: transparent;
    box-sizing: border-box;
  }
  html {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    scroll-behavior: smooth;
  }
  body {
    @apply bg-white text-gray-900 font-sans;
    min-height: 100dvh;
    letter-spacing: -0.018em;
  }
  /* 스크롤바 */
  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }
  ::-webkit-scrollbar-thumb {
    @apply bg-gray-200 rounded-full;
  }
  ::-webkit-scrollbar-thumb:hover {
    @apply bg-gray-300;
  }
}
@layer components {
  .page-container {
    @apply max-w-content mx-auto px-5 py-6;
  }
  .card {
    @apply bg-white border border-gray-200 rounded-2xl shadow-card;
  }
  .btn-primary {
    @apply bg-brand-blue text-white font-bold py-3 px-6 rounded-2xl hover:bg-brand-blue-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed;
  }
  .btn-secondary {
    @apply bg-white text-gray-700 font-medium py-3 px-6 rounded-2xl border border-gray-200 hover:bg-gray-50 transition-colors;
  }
  .input-base {
    @apply w-full border border-gray-200 rounded-2xl px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/20 transition-all;
  }
  .chip {
    @apply inline-flex items-center px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer;
  }
  .chip-active {
    @apply bg-brand-blue text-white;
  }
  .chip-inactive {
    @apply bg-white text-gray-600 border border-gray-200 hover:border-gray-400 hover:text-gray-900;
  }
  .section-title {
    @apply text-sm font-semibold text-gray-500 uppercase tracking-wide;
  }
  .divider {
    @apply border-t border-gray-100 my-4;
  }
}
