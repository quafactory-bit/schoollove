'use client'

import { useQuery } from '@tanstack/react-query'
import { searchSchools } from '@/lib/api/schools'
import { searchProfiles } from '@/lib/api/profiles'

export function useSchoolSearch(query: string) {
  return useQuery({
    queryKey: ['school-search', query],
    queryFn: () => searchSchools(query, 8),
    enabled: query.trim().length >= 1,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}

export function useProfileSearch(query: string) {
  return useQuery({
    queryKey: ['profile-search', query],
    queryFn: () => searchProfiles(query, 8),
    enabled: query.trim().length >= 1,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })
}

export function useCombinedSearch(query: string) {
  const schools = useSchoolSearch(query)
  const profiles = useProfileSearch(query)

  return {
    schools: schools.data || [],
    profiles: profiles.data || [],
    isLoading: schools.isLoading || profiles.isLoading,
    hasResults:
      (schools.data?.length || 0) > 0 || (profiles.data?.length || 0) > 0,
  }
}
