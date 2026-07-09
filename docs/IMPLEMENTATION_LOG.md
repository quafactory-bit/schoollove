# SchoolLoveI Implementation Log

개발 구현 진행 상황을 기록합니다.

Decisions는 "왜 이렇게 결정했는가"를 기록합니다.

Implementation Log는 "실제로 무엇을 구현했는가"를 기록합니다.

---

## 기록 규칙

각 개발 작업 완료 후 아래 형식으로 기록합니다.

### YYYY-MM-DD

#### 구현

- 구현한 기능
- 변경한 화면
- 수정한 구조

#### 관련 파일

- 변경 파일 경로

#### 검증

- 테스트 결과
- 확인한 상태

#### 비고

- 남은 문제
- 후속 작업

---

## 2026-07-09

### 구현

- Design Package v1.0 개발 기준 확정
- Design Package FROZEN 상태 적용
- Product Principles 문서 추가
- Decisions 기록 구조 추가

### 관련 파일

- docs/design-package-v1.0/
- docs/decisions/

### 검증

- Design Package README 확인
- FROZEN 상태 확인
- Decisions 폴더 구조 확인

### 비고

- 이후 실제 기능 구현 완료 내역부터 순차 기록

---

## 2026-07-09 (2)

### 구현

- Level Policy 순수 모듈 구현 (docs/design-package-v1.0/03-level-policy.md 기준)
- threshold(1) = 0 명시적 예외, L >= 2는 `round(50 * L^1.5)` 공식 적용
- cumulativeXp를 입력받아 LevelState(level, xpIntoLevel, xpForNextLevel, remainingToNext)를 반환하는 `calculateLevelState` 구현
- 음수/NaN/Infinity cumulativeXp 입력을 0으로 클램프하여 음수 레벨이 발생하지 않도록 처리
- remainingToNext가 항상 1 이상의 정수가 되도록 ceil 적용
- 레벨 탐색을 지수 확장 + 이분 탐색으로 구현하여 매우 큰 cumulativeXp에서도 안전하게 동작
- 프로젝트에 테스트 러너가 없어 vitest를 devDependency로 추가하고 `test`, `typecheck` npm script 추가
- calculateLevelState 단위 테스트 11개 작성 (threshold 경계값, 음수/비정상 입력, 매우 큰 값, level >= 1 / remainingToNext >= 1 불변 조건 포함)

### 관련 파일

- types/level.ts (신규)
- lib/policy/levelPolicy.ts (신규)
- lib/policy/levelPolicy.test.ts (신규)
- package.json (`test`, `typecheck` script 추가, vitest devDependency 추가)
- package-lock.json (vitest 설치 반영)

### 검증

- `npx vitest run lib/policy/levelPolicy.test.ts` → 11 passed
- `npx tsc --noEmit` → 오류 없음
- `npm test` (현재 저장소의 유일한 테스트 스위트) → 11 passed

### 비고

- School Hub UI, Home Feed, Register Flow, DB Migration, clicked_school_id 로직은 이번 범위에 포함하지 않음
- 저장된 schools.current_level과의 비교/보존(레벨 하락 방지 저장 규칙, §8)은 이번 순수 계산 모듈 범위 밖이며 별도 구현 필요
- XP Source 연결(등록 1명 = 1 XP 등)은 이번 범위에 포함하지 않음 — calculateLevelState는 cumulativeXp만 입력으로 받음
