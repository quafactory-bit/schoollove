import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { SchoolType } from '@/types/school'

// ─── Tailwind 유틸 ───────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── 인스타그램 ID 정규화 ─────────────────────────────────────────
export function normalizeInstagramId(id: string): string {
  return id.replace(/^@/, '').trim().toLowerCase()
}

export function validateInstagramId(id: string): boolean {
  const normalized = normalizeInstagramId(id)
  // 영문/숫자/언더스코어/마침표, 1~30자
  return /^[a-zA-Z0-9._]{1,30}$/.test(normalized)
}

export function instagramUrl(id: string): string {
  return `https://www.instagram.com/${normalizeInstagramId(id)}/`
}

// ─── 날짜 포맷 ───────────────────────────────────────────────────
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export function formatRelativeDate(dateStr: string): string {
  const now = new Date()
  const d = new Date(dateStr)
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000)

  if (diff < 60) return '방금 전'
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`
  return formatDate(dateStr)
}

// ─── 학년/반 표시 ────────────────────────────────────────────────
export function formatClassLabel(grade: number | null, classNum: number | null): string {
  if (!grade && !classNum) return ''
  if (grade && classNum) return `${grade}학년 ${classNum}반`
  if (grade) return `${grade}학년`
  if (classNum) return `${classNum}반`
  return ''
}

export function parseClassFromUrl(classStr: string): { grade: number; classNum: number } | null {
  // URL: "3-2" → { grade: 3, classNum: 2 }
  const match = classStr.match(/^(\d+)-(\d+)$/)
  if (!match) return null
  return { grade: parseInt(match[1]), classNum: parseInt(match[2]) }
}

export function classToUrl(grade: number, classNum: number): string {
  return `${grade}-${classNum}`
}

// ─── 학교 타입 배지 ──────────────────────────────────────────────
export function schoolTypeBadgeColor(type: SchoolType): string {
  const colors: Record<SchoolType, string> = {
    elementary: 'bg-green-50 text-green-700 border-green-200',
    middle: 'bg-blue-50 text-blue-700 border-blue-200',
    high: 'bg-purple-50 text-purple-700 border-purple-200',
    university: 'bg-orange-50 text-orange-700 border-orange-200',
    college: 'bg-pink-50 text-pink-700 border-pink-200',
  }
  return colors[type]
}

// ─── 졸업년도 목록 생성 ───────────────────────────────────────────
export function getGraduationYears(startYear = 1990): number[] {
  const currentYear = new Date().getFullYear()
  const endYear = currentYear + 6
  const years: number[] = []
  for (let y = endYear; y >= startYear; y--) {
    years.push(y)
  }
  return years
}

// ─── 학년 목록 ────────────────────────────────────────────────────
export function getGradesForType(type: SchoolType): number[] {
  if (type === 'elementary') return [1, 2, 3, 4, 5, 6]
  if (type === 'middle') return [1, 2, 3]
  if (type === 'high') return [1, 2, 3]
  return []
}

// ─── 숫자 포맷 ────────────────────────────────────────────────────
export function formatNumber(n: number): string {
  return n.toLocaleString('ko-KR')
}

// ─── Debounce ────────────────────────────────────────────────────
export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

// ─── 텍스트 sanitize ─────────────────────────────────────────────
export function sanitizeText(text: string): string {
  return text
    .replace(/[<>'"]/g, '')
    .trim()
    .slice(0, 100)
}
