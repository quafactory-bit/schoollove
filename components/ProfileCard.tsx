'use client'

import { useState } from 'react'
import EditDeleteModal from './EditDeleteModal'
import ReportButton from './ReportButton'

interface Profile {
  id: string
  nickname: string
  instagram_id: string | null
  graduation_year: number
  grade: number | null
  class_number: number | null
  department: string | null
  created_at: string
}

export default function ProfileCard({ profile }: { profile: Profile }) {
  const [showModal, setShowModal] = useState(false)

  const meta = profile.grade
    ? `${profile.graduation_year}년 ${profile.grade}학년 ${profile.class_number}반`
    : `${profile.graduation_year}년 졸업${profile.department ? ' · ' + profile.department : ''}`

  return (
    <>
      <div className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">
            {profile.nickname[0]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{profile.nickname}</span>
              <span className="text-xs text-gray-400">{meta}</span>
            </div>
            {profile.instagram_id ? (
              <a href={`https://instagram.com/${profile.instagram_id}`} target="_blank" rel="noopener noreferrer"
                className="text-blue-500 text-sm hover:underline">
                @{profile.instagram_id}
              </a>
            ) : (
              <button onClick={() => setShowModal(true)} className="text-xs text-gray-400 hover:text-blue-500">
                + 인스타 추가
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setShowModal(true)} className="text-xs text-gray-400 hover:text-gray-600">수정·삭제</button>
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