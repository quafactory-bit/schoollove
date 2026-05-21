'use client'

import { useState } from 'react'
import { ExternalLink, Flag, Edit2, Plus, Check } from 'lucide-react'
import { instagramUrl, formatDate, cn } from '@/lib/utils'
import type { Profile } from '@/types/profile'
import ReportButton from './ReportButton'
import EditDeleteModal from './EditDeleteModal'

interface ProfileCardProps {
  profile: Profile
  showSchool?: boolean
  onUpdated?: () => void
}

export default function ProfileCard({ profile, showSchool = false, onUpdated }: ProfileCardProps) {
  const [showEditModal, setShowEditModal] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [reportDone, setReportDone] = useState(false)

  const hasInsta = !!profile.instagram_id

  return (
    <>
      <div className="group flex items-center gap-3 py-3 px-4 hover:bg-gray-50 transition-colors rounded-xl">
        {/* 아바타 */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center shrink-0 text-gray-500 text-sm font-medium">
          {profile.nickname.charAt(0)}
        </div>

        {/* 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{profile.nickname}</span>
            {profile.graduation_year && (
              <span className="text-xs text-gray-400">{profile.graduation_year}년</span>
            )}
            {profile.grade && profile.class_number && (
              <span className="text-xs text-gray-400">
                {profile.grade}학년 {profile.class_number}반
              </span>
            )}
            {profile.department && (
              <span className="text-xs text-gray-400">{profile.department}</span>
            )}
          </div>
          {showSchool && profile.school && (
            <p className="text-xs text-gray-500 truncate mt-0.5">{profile.school.school_name}</p>
          )}
          {hasInsta ? (
            <a
              href={instagramUrl(profile.instagram_id!)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-0.5 text-xs text-brand-blue hover:text-brand-blue-hover font-medium"
            >
              @{profile.instagram_id}
              <ExternalLink size={10} />
            </a>
          ) : (
            <span className="text-xs text-gray-400 mt-0.5 block">인스타 미등록</span>
          )}
        </div>

        {/* 액션 버튼 — hover 시 표시 */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {/* 인스타 없을 때 + 추가 */}
          {!hasInsta && (
            <ActionBtn
              icon={<Plus size={14} />}
              label="인스타 추가"
              onClick={() => setShowEditModal(true)}
              variant="blue"
            />
          )}

          {/* 수정/삭제 */}
          <ActionBtn
            icon={<Edit2 size={13} />}
            label="수정·삭제"
            onClick={() => setShowEditModal(true)}
          />

          {/* 신고 */}
          {reportDone ? (
            <ActionBtn
              icon={<Check size={13} />}
              label="신고완료"
              onClick={() => {}}
              variant="done"
              disabled
            />
          ) : (
            <ActionBtn
              icon={<Flag size={13} />}
              label="신고"
              onClick={() => setShowReport(true)}
              variant="red"
            />
          )}
        </div>

        {/* 날짜 (액션 없을 때) */}
        <span className="text-xs text-gray-400 group-hover:hidden shrink-0 tabular-nums">
          {formatDate(profile.created_at)}
        </span>
      </div>

      {/* 모달들 */}
      {showEditModal && (
        <EditDeleteModal
          profile={profile}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false)
            onUpdated?.()
          }}
        />
      )}

      {showReport && (
        <ReportButton
          profile={profile}
          onClose={() => setShowReport(false)}
          onSuccess={() => {
            setShowReport(false)
            setReportDone(true)
          }}
        />
      )}
    </>
  )
}

function ActionBtn({
  icon,
  label,
  onClick,
  variant = 'default',
  disabled = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  variant?: 'default' | 'blue' | 'red' | 'done'
  disabled?: boolean
}) {
  const styles = {
    default: 'text-gray-500 hover:text-gray-700 hover:bg-gray-100',
    blue: 'text-brand-blue hover:bg-brand-blue-light',
    red: 'text-red-500 hover:bg-red-50',
    done: 'text-green-600 bg-green-50 cursor-default',
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        'flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors',
        styles[variant]
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
