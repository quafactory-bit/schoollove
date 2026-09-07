export function useSchoolAutocomplete(query: string) {
  return { status: 'ok', results: query.trim().length < 2 ? [] : [{ id: '00000000-0000-4000-8000-000000000001', school_name: '합성고등학교', school_type: 'high', sido: '합성시', sigungu: '합성구' }] }
}
