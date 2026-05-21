import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="page-container text-center py-20 space-y-4">
      <p className="text-5xl">🏫</p>
      <h1 className="text-2xl font-black text-gray-900">페이지를 찾을 수 없어요</h1>
      <p className="text-sm text-gray-500">
        요청하신 페이지가 존재하지 않거나 삭제되었습니다.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
        <Link href="/" className="btn-primary inline-block text-sm">
          홈으로 돌아가기
        </Link>
        <Link href="/search" className="btn-secondary inline-block text-sm">
          학교 검색하기
        </Link>
      </div>
    </div>
  )
}
