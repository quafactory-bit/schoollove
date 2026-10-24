// v2: 초록 둥근 사각형 안 흰 체크(목업 v3 0번). 서비스 이름은 v2-10(2026-10-23 운영자 확정)으로 "출석부".
export const BRAND_NAME = '출석부'

export function BrandIcon({ size = 26 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center bg-sl-brand"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.27) }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="none" stroke="#ffffff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  )
}

export default function BrandMark({ size = 26, showName = true }: { size?: number; showName?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-[19px] font-black tracking-[-0.4px] text-sl-ink">
      <BrandIcon size={size} />
      {showName ? <span>{BRAND_NAME}</span> : <span className="sr-only">{BRAND_NAME}</span>}
    </span>
  )
}
