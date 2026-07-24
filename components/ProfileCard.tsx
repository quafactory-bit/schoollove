'use client'
import { useState } from 'react'
import EditDeleteModal from './EditDeleteModal'
import ReportButton from './ReportButton'
import type { PublicProfileCard } from '@/lib/api/profiles'

export default function ProfileCard({ profile }: { profile: PublicProfileCard }) {
  const [showModal, setShowModal] = useState(false)
  const meta = profile.grade
    ? `${profile.graduation_year}년 ${profile.grade}학년 ${profile.class_number}반`
    : `${profile.graduation_year}년 졸업${profile.department ? ' · ' + profile.department : ''}`
  return (
    <>
      <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-schoollove-text font-bold text-sm shrink-0">
            {profile.nickname[0]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{profile.nickname}</span>
              <span className="text-xs text-gray-400">{meta}</span>
            </div>
            {profile.instagram_id ? (
              <a href={`https://instagram.com/${profile.instagram_id}`} target="_blank" rel="noopener noreferrer"
                aria-label={`인스타그램에서 ${profile.nickname} 보기`}
                className="inline-flex min-h-11 items-center text-sm font-medium text-gray-900 hover:underline">
                @{profile.instagram_id}
              </a>
            ) : (
              <button
                onClick={() => setShowModal(true)}
                aria-label={`${profile.nickname} 인스타그램 추가 요청`}
                className="inline-flex min-h-11 items-center text-xs text-gray-400 hover:text-gray-900"
              >
                + 인스타 추가
              </button>
            )}
            {/* 등록할 때 남긴 "이 친구에게 한마디" - 본인이 보면 연결 동기가 생김 */}
            {profile.message && (
              <p className="mt-1 text-xs text-gray-500 italic">
                💬 “{profile.message}”
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => setShowModal(true)}
            aria-label={`${profile.nickname} 정보 수정 또는 삭제 요청`}
            className="inline-flex min-h-11 items-center text-xs text-gray-400 hover:text-gray-600"
          >
            수정·삭제
          </button>
          <ReportButton profileId={profile.id} />
        </div>
      </div>
      {showModal && (
        <EditDeleteModal
          profileId={profile.id}
          nickname={profile.nickname}
          instagramId={profile.instagram_id}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}
