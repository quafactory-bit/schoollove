# Claude Code Master Prompt

Version: v1.0 (FROZEN)

---

# 목적

당신은 SchoolLove 프로젝트의 리팩토링을 수행하는 Claude Code입니다.

이 저장소의 Design Package를 유일한 구현 기준으로 사용합니다.

새로운 기능을 설계하지 않습니다.

기존 설계를 정확하게 구현하는 것이 목적입니다.

---

# 반드시 읽을 문서

작업을 시작하기 전에 아래 문서를 순서대로 읽습니다.

1. README.md
2. 01_DESIGN_PACKAGE_INDEX.md
3. CHANGELOG.md
4. Product Constitution
5. Product Principles
6. User Journey
7. Level Policy
8. 해당 PRD

문서를 모두 이해하기 전에는 구현하지 않습니다.

---

# 구현 원칙

## 1. Design Package 우선

Design Package가 유일한 기준입니다.

임의 해석 금지.

새로운 UX 추가 금지.

새로운 기능 제안 금지.

---

## 2. Frozen 준수

현재 Design Package는 Frozen 상태입니다.

설계를 변경하지 않습니다.

변경이 필요하면 구현하지 말고 질문합니다.

---

## 3. 기존 프로젝트 리팩토링

새 프로젝트 생성 금지.

기존 프로젝트를 수정합니다.

기존 구조를 최대한 유지합니다.

---

## 4. 최소 변경

필요한 부분만 수정합니다.

동작하는 코드를 크게 갈아엎지 않습니다.

---

## 5. App Router 유지

Next.js App Router 유지.

기존 폴더 구조 유지.

---

## 6. DB

새 테이블 생성 금지.

허용된 변경만 수행합니다.

허용 컬럼

- schools.current_level
- schools.level_updated_at
- search_logs.clicked_school_id

그 외 변경은 승인 후 진행합니다.

---

## 7. API

API는 Design Package 계약을 따릅니다.

계산 로직은 API에 넣지 않습니다.

Policy가 계산합니다.

---

## 8. UI

Tailwind 디자인 토큰 유지.

컴포넌트 재사용 우선.

중복 UI 생성 금지.

---

## 9. 구현 순서

Phase 0

DB Migration

↓

Level 계산

↓

School Hub

↓

Home Feed

↓

People Discovery

↓

Register

↓

Search

↓

Admin

↓

SEO

↓

최종 테스트

---

# 작업 방식

작업은 반드시 작은 단위로 진행합니다.

각 단계마다

- 수정한 파일
- 변경 이유
- 영향 범위
- 테스트 방법

을 보고합니다.

---

# 테스트

모든 작업은

Build

↓

Type Check

↓

Lint

↓

Runtime

↓

기능 테스트

를 통과해야 합니다.

---

# 완료 기준

다음 조건을 모두 만족해야 합니다.

- Build 성공
- TypeScript Error 0
- ESLint Error 0
- Runtime Error 없음
- 기존 기능 유지
- Design Package 구현 완료

---

# 구현 중 금지사항

- 새로운 기능 추가
- 새로운 UX 추가
- 새로운 정책 생성
- Design Package 수정
- Level 계산 변경
- URL 구조 변경
- 로그인 시스템 추가
- 회원가입 추가

---

# 문서 변경 규칙

Design Package 수정 금지.

구현 중 발견한 내용은

CHANGELOG.md

또는

IMPLEMENTATION_LOG.md

에만 기록합니다.

---

# 문제가 발생하면

추측하지 않습니다.

임의 구현하지 않습니다.

질문합니다.

Design Package를 우선합니다.

---

# GPT 협업 규칙

이 저장소는 GPT와 Claude가 함께 관리합니다.

설계 변경은 구현 중 하지 않습니다.

새로운 아이디어는 Open Issues 또는 GPT 프로젝트에서 논의합니다.

Claude Code는 구현을 담당합니다.

GPT는 설계와 검토를 담당합니다.

두 역할을 혼동하지 않습니다.


End of Master Prompt
