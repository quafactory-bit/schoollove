'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Loader2, GraduationCap, User } from 'lucide-react'
import { useCombinedSearch } from '@/lib/hooks/useSchoolSearch'
import { SCHOOL_TYPE_LABELS } from '@/types/school'
import { cn, debounce } from '@/lib/utils'
import type { School } from '@/types/school'
import type { Profile } from '@/types/profile'

interface SearchBarProps {
  placeholder?: string
  size?: 'lg' | 'md'
  className?: string
  autoFocus?: boolean
}

export default function SearchBar({
  placeholder = '학교 이름을 검색하세요',
  size = 'md',
  className,
  autoFocus = false,
}: SearchBarProps) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { schools, profiles, isLoading } = useCombinedSearch(query)

  // debounce 적용
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSetQuery = useCallback(
    debounce((val: string) => setQuery(val), 300),
    []
  )

  const handleInput = (val: string) => {
    setInput(val)
    debouncedSetQuery(val)
    if (val.trim()) setOpen(true)
    else setOpen(false)
  }

  const handleClear = () => {
    setInput('')
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  const handleSchoolSelect = (school: School) => {
    setOpen(false)
    setInput(school.school_name)
    router.push(`/school/${school.slug}`)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    setOpen(false)
    router.push(`/search?q=${encodeURIComponent(input.trim())}`)
  }

  // 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const hasResults = schools.length > 0 || profiles.length > 0
  const showDropdown = open && query.trim().length >= 1

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <form onSubmit={handleSubmit}>
        <div
          className={cn(
            'flex items-center gap-2 bg-white border rounded-2xl transition-all',
            size === 'lg'
              ? 'px-4 py-3.5 text-base shadow-card focus-within:shadow-search focus-within:border-brand-blue'
              : 'px-3.5 py-2.5 text-sm shadow-card focus-within:shadow-search focus-within:border-brand-blue',
            'border-gray-200'
          )}
        >
          <Search
            size={size === 'lg' ? 20 : 18}
            className={cn('shrink-0', isLoading ? 'text-brand-blue animate-pulse' : 'text-gray-400')}
          />
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={() => { if (query.trim()) setOpen(true) }}
            placeholder={placeholder}
            autoFocus={autoFocus}
            className="flex-1 bg-transparent outline-none text-gray-900 placeholder-gray-400 min-w-0"
            autoComplete="off"
          />
          {isLoading && <Loader2 size={16} className="text-brand-blue animate-spin shrink-0" />}
          {input && !isLoading && (
            <button type="button" onClick={handleClear} className="text-gray-400 hover:text-gray-600 shrink-0">
              <X size={16} />
            </button>
          )}
        </div>
      </form>

      {/* 드롭다운 */}
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-2xl shadow-card-hover overflow-hidden z-50">
          {!hasResults && !isLoading && (
            <div className="px-4 py-6 text-center text-sm text-gray-500">
              검색 결과가 없습니다
            </div>
          )}

          {schools.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1.5">
                <span className="text-2xs font-semibold text-gray-400 uppercase tracking-wide">학교</span>
              </div>
              {schools.map((school) => (
                <SchoolDropdownItem
                  key={school.id}
                  school={school}
                  onClick={() => handleSchoolSelect(school)}
                />
              ))}
            </div>
          )}

          {profiles.length > 0 && (
            <div>
              <div className={cn('px-4 pb-1.5', schools.length > 0 ? 'pt-2 border-t border-gray-100 mt-1' : 'pt-3')}>
                <span className="text-2xs font-semibold text-gray-400 uppercase tracking-wide">사람</span>
              </div>
              {profiles.map((profile) => (
                <ProfileDropdownItem
                  key={profile.id}
                  profile={profile}
                  onClick={() => {
                    setOpen(false)
                    if (profile.school?.slug) {
                      router.push(`/school/${profile.school.slug}`)
                    }
                  }}
                />
              ))}
            </div>
          )}

          {hasResults && (
            <button
              onClick={handleSubmit as React.MouseEventHandler}
              className="w-full px-4 py-3 text-sm text-brand-blue font-medium border-t border-gray-100 hover:bg-brand-blue-light transition-colors text-center"
            >
              "{query}" 전체 검색 결과 보기
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function SchoolDropdownItem({ school, onClick }: { school: School; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
    >
      <div className="w-8 h-8 rounded-full bg-brand-blue-light flex items-center justify-center shrink-0">
        <GraduationCap size={16} className="text-brand-blue" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{school.school_name}</p>
        <p className="text-xs text-gray-500 truncate">
          {SCHOOL_TYPE_LABELS[school.school_type]} · {school.sido} {school.sigungu}
        </p>
      </div>
    </button>
  )
}

function ProfileDropdownItem({ profile, onClick }: { profile: Profile; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
    >
      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
        <User size={16} className="text-gray-500" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {profile.nickname}
          {profile.instagram_id && (
            <span className="ml-1.5 text-xs text-gray-400 font-normal">@{profile.instagram_id}</span>
          )}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {profile.school?.school_name} · {profile.graduation_year}년 졸업
        </p>
      </div>
    </button>
  )
}
