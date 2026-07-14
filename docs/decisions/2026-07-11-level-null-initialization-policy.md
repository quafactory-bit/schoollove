# Level Policy §8 — null 초기화와 실제 Level Up 구분

Date: 2026-07-11

## Decision

- `schools.current_level = null`은 미초기화/backfill 상태다.
- null에서 계산된 Level을 최초 저장하는 것은 Level Up이 아니다.
- 초기화 시 `current_level`만 저장하고 `level_updated_at`은 갱신하지 않는다.
- 저장된 유효 Level N에서 더 높은 Level M으로 상승한 경우만 실제 Level Up이다.
- 실제 Level Up일 때만 `level_updated_at`을 갱신한다.

## Reason

기존 FROZEN §8은 null 초기화와 실제 Level 상승의 경계를 명시하지 않았다. 최초 backfill을 Level Up으로 처리하면 사용자 활동에 의한 성장과 데이터 초기화가 혼동된다. 현재 `resolveLevelUpdate` 구현과 테스트는 이 정책을 이미 구현하고 있다.

## Impact

- `docs/design-package-v1.0/03-level-policy.md` §8의 승인된 정책 보완을 공식 기록한다.
- 현재 `lib/policy/levelPersistence.ts`의 null 초기화/실제 상승 분기와 문서 정책이 정합성을 유지한다.
- 기존 Level 계산 기준과 downgrade 금지 정책은 변경하지 않는다.
- Level Sync Route 계약은 변경하지 않는다.

## Status

APPROVED
