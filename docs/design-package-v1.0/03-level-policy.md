# SchoolLoveI Level Policy v3

Status: **FROZEN — XP Source 보류 유지 / State 경계·완성도·임박·대표학교 기준 확정**

## 0. 이 문서의 역할

Level은 SchoolLoveI의 성장 체감 계약이다.

UI, School Hub, Home Feed, Register Flow는 이 Policy가 반환한 상태를 사용한다.

API나 화면에서 각자 레벨 공식을 만들지 않는다.

---

## 1. 핵심 원칙

- 레벨은 1부터 시작한다.
- 레벨은 절대 내려가지 않는다.
- 최대 레벨은 없다.
- "다음 레벨까지 N"은 항상 사용자가 행동 가능한 **1 이상의 정수**다.
- 소수 값이 나오면 남은 수치는 `ceil`로 표시한다.
- 레벨 숫자보다 성장의 진행감을 우선한다.

---

## 2. LevelState 계약

```ts
export type LevelState = {
  level: number
  xpIntoLevel: number
  xpForNextLevel: number
  remainingToNext: number
}

export type LevelPolicy = (cumulativeXp: number) => LevelState
```

### 불변 조건

```text
level >= 1
remainingToNext >= 1
level은 이전 저장 레벨보다 낮아질 수 없음
max level 없음
```

---

## 3. 레벨 곡선 — v1.0 임시 곡선

```ts
const threshold = (L: number): number => {
  if (L === 1) return 0

  return Math.round(50 * Math.pow(L, 1.5))
}
```

`threshold(1) = 0`은 명시적 예외다.

Level 1은 cumulativeXp 0에서 시작한다.

이 곡선은 **UI/cold-start를 위한 임시 값**이다.

XP Source 최종 확정과 함께 재설계될 수 있다.

곡선 변경은 Level Policy가 소유하며, UI와 API가 공식을 복제하지 않는다.

---

## 4. XP Source 상태

**XP Source 최종 확정은 보류된 의도된 결정이다.**

v1.0 설계의 핵심은 XP 입력 계약과 성장 상태 계약을 먼저 고정하는 것이다.

### 현재 잠정 기본 행동

```text
등록 1명 = 1 XP
```

이는 최종 가치 모델이 아니라 P1 연결을 위한 잠정 Source다.

향후에는 Event-based Value Model로 교체할 수 있어야 한다.

### XP Source 불변 조건

- 음수 XP를 만들지 않는다.
- 이미 발생한 가치 이벤트를 소급 삭제해 레벨을 내리지 않는다.
- Source는 append-only 이벤트 모델과 호환되어야 한다.

### P2 보류

- trace 가치 가중치
- 기수/반 다양성 보너스
- 재방문/발견 가치
- 이벤트별 가치 점수 최종표

---

## 5. SchoolState 경계

School Hub의 기본 상태는 누적 등록 수(`visible profiles count`)를 기준으로 안정적으로 판정한다.

| State | 조건 | 의미 |
|---|---|---|
| A | 등록 0명 | 첫 시작 |
| B | 등록 1~10명 | 성장 중 / 레벨업 임박 경험 |
| C | 등록 11명 이상 | 살아 있는 학교 |
| D | C의 대표학교 상위 상태 | 대표학교 |

### State D

```text
State D = State C
  AND level >= REP_LEVEL_MIN
  AND completion >= REP_COMPLETION
```

v1.0 초기 상수:

```text
REP_LEVEL_MIN = 10
REP_COMPLETION = 60%
```

State D의 최근 활동 조건(freshness)은 P2 Open Issue다.

---

## 6. 완성도(Completion)

완성도는 등록 수 자체를 다시 보여주는 값이 아니다.

학교의 기수·반 단위 발견 구조가 얼마나 채워졌는지 보여주는 성장 보조 지표다.

- State A/B에서는 완성도를 전면 표시하지 않는다.
- State C부터 완성도를 표시한다.
- State D 판정에 완성도를 사용한다.

세부 집계 구현은 Policy 계층이 소유한다.

---

## 7. 표시 규칙

- Level은 모든 State에서 표시한다.
- State A는 `Lv.1 시작 대기` 형태의 preview를 허용한다.
- "다음 레벨까지 N"은 모든 State에서 표시한다.
- State A의 남은 수치는 `다음 레벨까지 1명`으로 행동 가능하게 표현한다.
- `remainingToNext <= 2`이면 **임박 상태**다.
- 완성도 %는 State C부터 표시한다.
- 랭킹 배지는 State D에서만 표시한다.
- 검색 수요 숫자는 State A에서만 핵심 카피에 사용한다.

---

## 8. 저장 규칙

P1에서 `schools`에 다음 두 값을 저장한다.

```text
schools.current_level
schools.level_updated_at
```

- 레벨 계산은 Policy에서 수행한다.
- 새 계산 레벨이 저장 레벨보다 낮으면 저장 레벨을 유지한다.
- 레벨이 상승할 때 `current_level`을 갱신한다.
- 레벨 값이 실제로 변경될 때 `level_updated_at`을 갱신한다.

---

## 9. 하지 않는 것

- API route마다 다른 레벨 계산
- 화면 컴포넌트에서 threshold 재구현
- 레벨 하락
- 최대 레벨 설정
- P1에서 XP Source 최종 가치표 확정
- 랭킹을 모든 학교 상태에 노출

---

## 10. Open

XP Source 최종 확정은 `14-open-issues.md`에 유지한다.

이 항목은 LevelState/API/UI 계약을 깨지 않는 방식으로 추후 교체한다.
