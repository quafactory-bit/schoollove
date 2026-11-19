#!/usr/bin/env bash
# Disposable local PostgreSQL check for the Part 2 P3 migration.
# Uses an already available image, no network, no ports, no remote credentials.
set -euo pipefail
cd "$(dirname "$0")/../.."
IMAGE='public.ecr.aws/supabase/postgres:17.11.0.002'
NAME="schoollove-p3-${RANDOM}${RANDOM}"
docker image inspect "$IMAGE" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
MSYS_NO_PATHCONV=1 docker run -d --network none --name "$NAME" --user postgres --entrypoint /bin/bash "$IMAGE" \
  -c "initdb -D /tmp/d --auth=trust >/dev/null && exec postgres -D /tmp/d -k /tmp -c listen_addresses=''" >/dev/null
for _ in $(seq 1 40); do
  if docker exec "$NAME" pg_isready -h /tmp -U postgres >/dev/null 2>&1; then break; fi
  sleep 0.5
done
run_sql() {
  MSYS_NO_PATHCONV=1 docker cp "$1" "$NAME:/tmp/in.sql" >/dev/null
  MSYS_NO_PATHCONV=1 docker exec "$NAME" psql -h /tmp -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f /tmp/in.sql
}
run_sql scripts/part2-p3/fixture.sql
run_sql supabase/migrations/20261119120000_part2_p3_status_tags_and_summons.sql
run_sql scripts/part2-p3/matrix.sql
