import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "문의 및 제휴",
  description: "스쿨러브아이 문의 및 제휴 안내",
};

export default function ContactPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-black mb-2">문의 및 제휴</h1>
      <p className="text-gray-500 mb-10">스쿨러브아이에 대한 문의사항이나 제휴 제안을 보내주세요.</p>
      <div className="space-y-6">
        <div className="bg-gray-50 rounded-xl p-6">
          <h2 className="font-semibold text-black mb-1">이메일 문의</h2>
          <p className="text-sm text-gray-600 mb-3">아래 이메일로 문의주시면 빠르게 답변드리겠습니다.</p>
          <a href="mailto:schoollove.contact@gmail.com" className="inline-flex items-center gap-2 text-blue-600 hover:underline font-medium">
            schoollove.contact@gmail.com
          </a>
        </div>
        <div className="bg-gray-50 rounded-xl p-6">
          <h2 className="font-semibold text-black mb-1">광고 및 제휴</h2>
          <p className="text-sm text-gray-600">광고 게재, 학교 커뮤니티 연계, 기타 비즈니스 제휴에 관심 있으신 분들은 이메일 제목에 [제휴 문의]를 포함하여 보내주세요.</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-6">
          <h2 className="font-semibold text-black mb-1">개인정보 삭제 요청</h2>
          <p className="text-sm text-gray-600 mb-3">본인 정보 삭제를 원하시면 이메일로 문의해주세요.</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-6">
          <h2 className="font-semibold text-black mb-1">답변 시간</h2>
          <p className="text-sm text-gray-600">영업일 기준 1~3일 내로 답변드리겠습니다.</p>
        </div>
      </div>
      <div className="mt-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-black transition-colors">
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}