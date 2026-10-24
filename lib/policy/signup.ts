import type { SchoolType } from '@/types/school'
import type { GradeClassInput } from '@/lib/accountGradeClass'
import { isGraduationYearAllowed } from '@/lib/policy/adultEligibility'

// v2-05: 가입 한 화면. 이름·생년월일·학교·졸업연도(+선택 반)와 체크 3개를 한 번에 받고,
// 기존 API 4개(성인 확인 → 필수 동의 → 프로필 → 학교 등록)를 아직 끝나지 않은 단계만 순서대로 부른다.
// 두 번째 체크(명단 표시)가 곧 명단 표시 동의라서 학교 등록은 항상 show_in_school_roster=true로 보낸다.
export type SignupChecks = { adult: boolean; roster: boolean; terms: boolean }
export type SignupForm = {
  displayName: string
  birthDate: string
  schoolId: string
  schoolType: SchoolType | null
  graduationYear: string
  checks: SignupChecks
}
export type SignupProgress = { adultReady: boolean; consentsReady: boolean; profileReady: boolean; schoolReady: boolean }
export type SignupStep = { key: 'eligibility' | 'consents' | 'profile' | 'membership'; endpoint: string; payload: Record<string, unknown> }

export function signupFormErrors(form: SignupForm, progress: SignupProgress, now = new Date()): string[] {
  const errors: string[] = []
  const name = form.displayName.normalize('NFKC').trim()
  if (!progress.profileReady && (name.length < 2 || name.length > 50)) errors.push('출석부에 보일 이름을 2~50자로 적어 주세요.')
  if (!progress.adultReady && !/^\d{4}-\d{2}-\d{2}$/.test(form.birthDate)) errors.push('생년월일을 입력해 주세요.')
  if (!form.schoolId || !form.schoolType) errors.push('검색 결과에서 학교를 선택해 주세요.')
  else if (!isGraduationYearAllowed(form.schoolType, Number(form.graduationYear), now)) errors.push('졸업연도를 선택해 주세요. 재학 중인 학교는 등록할 수 없어요.')
  if (!form.checks.adult || !form.checks.roster || !form.checks.terms) errors.push('체크 3개를 모두 확인해 주세요.')
  return errors
}

export function buildSignupSteps(
  form: SignupForm,
  progress: SignupProgress,
  gradeClasses: GradeClassInput[],
  firstTouch: unknown,
): SignupStep[] {
  const steps: SignupStep[] = []
  if (!progress.adultReady) steps.push({ key: 'eligibility', endpoint: '/api/account/eligibility', payload: { dateOfBirth: form.birthDate } })
  if (!progress.consentsReady) steps.push({ key: 'consents', endpoint: '/api/account/consents', payload: {
    terms: form.checks.terms, privacy_collection: form.checks.terms,
    adult_confirmation: form.checks.adult, private_by_default: form.checks.roster,
  } })
  if (!progress.profileReady) steps.push({ key: 'profile', endpoint: '/api/account/profile', payload: {
    display_name: form.displayName.normalize('NFKC').trim(), sl_first_touch: firstTouch,
  } })
  if (!progress.schoolReady) steps.push({ key: 'membership', endpoint: '/api/account/memberships', payload: {
    school_id: form.schoolId, graduation_year: Number(form.graduationYear), grade_classes: gradeClasses, show_in_school_roster: true,
  } })
  return steps
}
