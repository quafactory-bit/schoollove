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

export function schoolTypeBadgeColor(type: string): string {
  const map: Record<string, string> = {
    elementary: 'bg-green-100 text-green-700',
    middle: 'bg-blue-100 text-blue-700',
    high: 'bg-purple-100 text-purple-700',
    university: 'bg-orange-100 text-orange-700',
    college: 'bg-pink-100 text-pink-700',
  }
  return map[type] || 'bg-gray-100 text-gray-700'
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

export function truncate(str: string, length: number): string {
  return str.length > length ? str.slice(0, length) + '...' : str
}

export function getGradeLabel(grade: number): string {
  return `${grade}학년`
}

export function getClassLabel(classNumber: number): string {
  return `${classNumber}반`
}
