export function useRouter() {
  return { refresh: () => (window as unknown as { refreshFixture: () => void }).refreshFixture() }
}
