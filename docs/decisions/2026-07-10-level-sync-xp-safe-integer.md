# Level Sync Route — cumulativeXp Safe Integer 제한

Date: 2026-07-10

## Decision

POST /api/admin/tools/level-sync의 cumulativeXp는 API 경계에서 nonnegative safe integer(0 이상, Number.MAX_SAFE_INTEGER 이하의 정수)로만 허용한다. 음수, 소수, NaN, Infinity, safe integer 범위를 벗어난 값은 모두 400으로 거부한다.

## Reason

Level Policy에 max level이 없다는 사실과 JavaScript number의 안전 정수 표현 범위는 별개의 문제다. calculateLevelState 내부의 음수 클램프에 API 경계의 입력 검증을 의존시키지 않고, 신뢰할 수 없는 범위의 값은 계산·저장 이전에 명시적으로 거부해 운영자가 잘못된 입력을 조용히 클램프당하는 대신 즉시 알 수 있게 한다.

## Impact

- app/api/admin/tools/level-sync/route.ts의 zod 스키마는 `z.number().int().nonnegative().safe()`를 사용한다.
- 이 결정은 cumulativeXp를 받는 향후 API 경계(다른 Route Handler 등)에도 동일하게 적용되어야 한다.
- 제품 차원의 임의 XP 상한(예: 특정 최댓값)은 이 결정에 포함되지 않는다 — 순수하게 JS number의 안전 표현 범위 문제다.

## Status

APPROVED
