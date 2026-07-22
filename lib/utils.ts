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
    elementary: 'bg-schoollove-surface-subtle text-schoollove-text',
    middle: 'bg-schoollove-surface-subtle text-schoollove-text',
    high: 'bg-schoollove-surface-subtle text-schoollove-text',
    university: 'bg-schoollove-surface-subtle text-schoollove-text',
    college: 'bg-schoollove-surface-subtle text-schoollove-text',
  }
  return map[type] || 'bg-schoollove-surface-subtle text-schoollove-text'
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

export function normalizeInstagramId(id: string): string {
  return id.replace(/^@/, '').trim().toLowerCase()
}

export function validateInstagramId(id: string): boolean {
  const clean = id.replace(/^@/, '')
  return /^[a-zA-Z0-9._]{1,30}$/.test(clean)
}

export function sanitizeText(text: string): string {
  return text.trim().replace(/[<>]/g, '')
}

export function getGraduationYears(): number[] {
  const current = new Date().getFullYear()
  const years: number[] = []
  for (let y = current + 6; y >= 1970; y--) {
    years.push(y)
  }
  return years
}

export function getGradesForType(type: string): number[] {
  if (type === 'elementary') return [1, 2, 3, 4, 5, 6]
  if (type === 'middle') return [1, 2, 3]
  if (type === 'high') return [1, 2, 3]
  return []
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
