
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
