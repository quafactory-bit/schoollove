'use client'

import { useQuery } from '@tanstack/react-query'
import { getProfilesBySchool, getProfilesByClass, getRecentProfiles } from '@/lib/api/profiles'

export function useProfilesBySchool(schoolId: string, page = 1, year?: number) {
  return useQuery({
    queryKey: ['profiles', 'school', schoolId, page, year],
    queryFn: () => getProfilesBySchool(schoolId, page, year),
    enabled: !!schoolId,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })
}

export function useProfilesByClass(
  schoolId: string,
  year: number,
  grade: number,
  classNum: number,
  page = 1
) {
  return useQuery({
    queryKey: ['profiles', 'class', schoolId, year, grade, classNum, page],
    queryFn: () => getProfilesByClass(schoolId, year, grade, classNum, page),
    enabled: !!schoolId && !!year && !!grade && !!classNum,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })
}

export function useRecentProfiles(limit = 10) {
  return useQuery({
    queryKey: ['profiles', 'recent', limit],
    queryFn: () => getRecentProfiles(limit),
    staleTime: 60_000,
  })
}
