import Link from 'next/link'
import type { OwnClassDiscoveryChoice } from '@/lib/peopleDiscoveryHistory'

export function ownHistoryChoiceKey(choice: OwnClassDiscoveryChoice): string {
  return `${choice.schoolId}:${choice.graduationYear}:${choice.gradeNumber}:${choice.classNumber}`
}

type Props = {
  choices: OwnClassDiscoveryChoice[]
  status: 'ok' | 'unavailable'
  selectedKey: string
  onSelect: (key: string) => void
}

export default function OwnHistoryPicker({ choices, status, selectedKey, onSelect }: Props) {
  if (status === 'unavailable') return <p className="text-sm leading-6 text-gray-600">내 학교 이력을 불러오지 못했습니다. 직접 입력해서 찾을 수 있습니다.</p>
  if (choices.length === 0) return <div className="space-y-2 text-sm leading-6 text-gray-600">
    <p>저장한 학년·반 이력이 없습니다. 직접 입력하거나 내 계정에서 학년·반을 추가해 주세요.</p>
    <Link href="/account" className="schoollove-focus inline-flex min-h-11 items-center font-semibold underline">학년·반 추가하기</Link>
  </div>
  return <fieldset className="min-w-0 space-y-3">
    <legend className="mb-2 text-sm font-semibold text-gray-900">내 학교 이력 선택</legend>
    {choices.map(choice => {
      const key = ownHistoryChoiceKey(choice)
      return <label key={key} className="flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border border-gray-300 p-4 has-[:checked]:border-red-700 has-[:checked]:bg-red-50">
        <input type="radio" name="own-history" checked={selectedKey === key} onChange={() => onSelect(key)} className="mt-1 shrink-0" />
        <span className="min-w-0 break-words text-sm leading-6">
          <span className="block font-semibold text-gray-950">{choice.schoolName}</span>
          {choice.region && <span className="block text-gray-600">{choice.region}</span>}
          <span className="block">{choice.graduationYear}년 졸업 · {choice.gradeNumber}학년 {choice.classNumber}반</span>
        </span>
      </label>
    })}
    <p className="text-xs leading-5 text-gray-500">내가 저장한 이력입니다. 선택만으로 검색하지 않으며, 검색할 때 현재 등록 정보와 다시 확인합니다.</p>
  </fieldset>
}
