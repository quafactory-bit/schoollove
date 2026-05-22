
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export function schoolTypeLabel(type: string): string {
  const map: Record<string, string> = {
    elementary: '초등학교',
    middle: '중학교',
    high: '고등학교',
    university: '대학교',
    college: '전문대학',
  }
  return map[type] || type
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function formatInstagramId(id: string): string {
  return id.startsWith('@') ? id : `@${id}`
}

export function sanitizeInstagramId(id: string): string {
  return id.replace(/^@/, '').trim()
}

export function parseClassFromUrl(classStr: string): { grade: number; classNumber: number } | null {
  const match = classStr.match(/^(\d+)-(\d+)$/)
  if (!match) return null
  return { grade: parseInt(match[1]), classNumber: parseInt(match[2]) }
}

export function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR')
}
export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}