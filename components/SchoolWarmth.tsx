'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Eye, Send, Users, Search } from 'lucide-react';
import { insertTrace, type Trace } from '@/lib/api/traces';
import { formatNumber } from '@/lib/utils';

// 방문자 수가 이 값 미만이면 숫자 숨기고 정성 문구로 (작은 숫자 역효과 방지)
const VIEW_THRESHOLD = 5;

// 등록자 수가 이 값 이상일 때만 "N명이 모였어요" 배너 노출
const PROOF_THRESHOLD = 3;

// 검색 수가 이 값 이상일 때만 "N명이 찾고 있어요" 강조 (작은 숫자 역효과 방지)
const SEARCH_THRESHOLD = 5;

// 드롭다운 고정 문구 (선택 = 바로 등록)
const PRESET_FIRST = '내가 1등! 😎';
const PRESETS = [
  '친구들아, 나 기억해?',
  '그때 그 사람… 보고싶다',
  '여기 우리 학교 사람 있어?',
];

interface Props {
  schoolId: string;
  schoolName: string;
  slug: string;
  viewCount: number;
  profileCount: number; // 이 학교에 이름을 남긴 사람 수
  searchCount: number;  // 이 학교를 검색한 횟수 ("N명이 찾고 있어요")
  initialTraces: Trace[];
  hasTraces: boolean;
}

export default function SchoolWarmth({
  schoolId,
  schoolName,
  slug,
  viewCount,
  profileCount,
  searchCount,
  initialTraces,
  hasTraces,
}: Props) {
  const [traces, setTraces] = useState<Trace[]>(initialTraces);
  const [selected, setSelected] = useState('');
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const options = hasTraces
    ? [...PRESETS, PRESET_FIRST]
    : [PRESET_FIRST, ...PRESETS];

  const isCustom = selected === '__custom__';

  // 빈 페이지(등록 적음)인데 검색은 많은 경우 = "찾는 사람 많은데 아직 비어있다" → 선점 유도
  const showSearchDemand = profileCount < PROOF_THRESHOLD && searchCount >= SEARCH_THRESHOLD;

  async function submit() {
    setErr('');
    const message = (isCustom ? custom : selected).trim();
    if (!message) {
      setErr('남길 내용을 골라주세요.');
      return;
    }
    if (message.length > 40) {
      setErr('40자까지 남길 수 있어요.');
      return;
    }

    setBusy(true);
    const { data, error } = await insertTrace({ school_id: schoolId, message });
    setBusy(false);

    if (error || !data) {
      setErr(error ?? '잠시 후 다시 시도해주세요.');
      return;
    }

    setTraces((prev) => [data, ...prev]);
    setSelected('');
    setCustom('');
  }

  return (
    <div className="card p-4 space-y-3">
      {/* 빈 페이지 + 검색 수요 많음: "N명이 찾고 있어요 → 네가 첫 번째가 되면 그들이 본다" */}
      {showSearchDemand && (
        <div className="rounded-xl bg-amber-50 px-4 py-3.5 text-center">
          <p className="flex items-center justify-center gap-1.5 text-sm font-bold text-amber-700">
            <Search size={15} />
            이 학교를 {formatNumber(searchCount)}명이 찾고 있어요
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-600">
            아직 아무도 이름을 안 남겼어요.
            <br />
            먼저 남기면, 당신을 찾는 그 {formatNumber(searchCount)}명이 당신을 발견해요.
          </p>
          <Link
            href={`/submit?school=${slug}&self=1`}
            className="mt-2.5 inline-block rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-white transition active:scale-95"
          >
            내가 먼저 이름 남기기
          </Link>
        </div>
      )}

      {/* 온기 띠: 누적 방문자 */}
      {viewCount >= VIEW_THRESHOLD ? (
        <div className="flex items-center gap-1.5 text-sm text-gray-600">
          <Eye size={14} className="text-brand-blue" />
          <span>
            지금까지 <span className="font-semibold text-gray-900">{formatNumber(viewCount)}명</span>이 이 학교를 둘러봤어요.
          </span>
        </div>
      ) : viewCount > 0 ? (
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <Eye size={14} className="text-brand-blue" />
          <span>최근 누군가 이 학교를 둘러봤어요.</span>
        </div>
      ) : null}

      <p className="text-xs text-gray-400">
        그 중 누군가는 당신을 기억하고 있을지도 몰라요.
      </p>

      {/* 흔적 리스트 */}
      {traces.length > 0 && (
        <div className="space-y-1.5 max-h-44 overflow-y-auto">
          {traces.map((t) => (
            <div
              key={t.id}
              className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2"
            >
              {t.message}
            </div>
          ))}
        </div>
      )}

      {/* 드롭다운 + 등록 */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <select
            value={selected}
            onChange={(e) => { setSelected(e.target.value); setErr(''); }}
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 bg-white focus:border-brand-blue focus:outline-none"
          >
            <option value="">한 줄 남기기…</option>
            {options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
            <option value="__custom__">직접 쓰기</option>
          </select>
          <button
            onClick={submit}
            disabled={busy || !selected}
            className="btn-primary px-4 text-sm disabled:opacity-40 flex items-center gap-1"
          >
            <Send size={14} />
            남기기
          </button>
        </div>

        {isCustom && (
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value.slice(0, 40))}
            placeholder="40자까지, 개인정보·연락처는 빼고 적어주세요"
            maxLength={40}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none"
          />
        )}

        {err && <p className="text-xs text-red-500">{err}</p>}
      </div>

      {/* "N명이 모였어요 → 내 인스타 연결" (등록이 충분히 쌓인 학교) */}
      {profileCount >= PROOF_THRESHOLD ? (
        <Link
          href={`/submit?school=${slug}&self=1`}
          className="block rounded-xl bg-blue-50 px-4 py-3.5 text-center transition hover:bg-blue-100"
        >
          <span className="flex items-center justify-center gap-1.5 text-sm font-semibold text-blue-700">
            <Users size={15} />
            {schoolName}에 이미 {formatNumber(profileCount)}명이 모였어요
          </span>
          <span className="mt-0.5 block text-xs text-blue-500">
            그중 누군가 당신을 기억하고 있을지도 몰라요 · 내 인스타 연결하기
          </span>
        </Link>
      ) : (
        <Link
          href={`/submit?school=${slug}&self=1`}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-600 hover:border-brand-blue hover:text-brand-blue transition-colors"
        >
          📷 내 인스타 등록하기
        </Link>
      )}
    </div>
  );
}
