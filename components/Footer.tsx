import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-gray-100 bg-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-gray-500">
            <span className="font-medium text-black">스쿨러브아이</span>
            <span className="mx-2">·</span>
            <span>학교 동창 인스타 찾기</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <Link href="/contact" className="hover:text-black transition-colors">
              문의 및 제휴
            </Link>
            <span>·</span>
            <Link href="/terms" className="hover:text-black transition-colors">
              이용약관
            </Link>
            <span>·</span>
            <Link href="/privacy" className="hover:text-black transition-colors">
              개인정보처리방침
            </Link>
          </div>
        </div>
        <div className="mt-4 text-center text-xs text-gray-400">
          © 2026 스쿨러브아이. All rights reserved.
        </div>
      </div>
    </footer>
  );
}