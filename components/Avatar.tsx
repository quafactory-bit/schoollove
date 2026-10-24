// v2: 사진 업로드 없이 이름 첫 글자 + 이름 해시로 고정된 6색 중 하나.
export const AVATAR_COLORS = ['#5b8def', '#e8803a', '#8e5bd1', '#3aa876', '#d65a7c', '#4c9fc0'] as const

export function avatarColor(name: string): string {
  let hash = 0
  for (const char of name.trim()) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function avatarInitial(name: string): string {
  return Array.from(name.trim())[0] ?? '?'
}

export default function Avatar({ name, size = 44, highlighted = false }: { name: string; size?: number; highlighted?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-black text-white ${highlighted ? 'outline outline-[2.5px] outline-offset-2 outline-sl-brand' : ''}`}
      style={{ width: size, height: size, background: avatarColor(name), fontSize: Math.round(size * 0.36) }}
    >
      {avatarInitial(name)}
    </span>
  )
}
