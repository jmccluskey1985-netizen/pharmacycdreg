#!/usr/bin/env bash
# Database tests: a throwaway Postgres 16, every migration in order (twice, to prove they're
# re-runnable), then tests/db/*.test.sql. Usage: tests/db/run.sh   (needs Postgres 16 binaries)
set -euo pipefail
BIN=${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
DIR=$(mktemp -d /tmp/cdreg-dbtest.XXXX); chmod 777 "$DIR"
RUNAS=""; [ "$(id -u)" = 0 ] && RUNAS="su postgres -c"
run() { if [ -n "$RUNAS" ]; then $RUNAS "$*"; else bash -c "$*"; fi; }
run "$BIN/initdb -D $DIR/data -A trust >/dev/null"
run "$BIN/pg_ctl -D $DIR/data -o '-p 55433 -k $DIR' -l $DIR/log start >/dev/null"
trap 'run "$BIN/pg_ctl -D $DIR/data stop >/dev/null" || true; rm -rf "$DIR"' EXIT
sleep 1.5
P="psql -h $DIR -p 55433 -U postgres -v ON_ERROR_STOP=1 -q -X"
# Supabase-provided objects the migrations reference
$P -c "create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create schema storage; create table storage.buckets(id text primary key, name text, public boolean);"
cd "$(dirname "$0")/../.."
for f in supabase/migrations/*.sql; do $P -1 -f "$f" >/dev/null 2>"$DIR/err" || { echo "MIGRATION FAILED: $f"; cat "$DIR/err"; exit 1; }; done
echo "ok   all migrations apply in order"
# Every migration after the base schema must be safe to run again (people re-run them).
for f in supabase/migrations/*.sql; do
  case "$f" in *0001_*) continue;; esac
  $P -1 -f "$f" >/dev/null 2>"$DIR/err" || { echo "FAIL re-running $f"; grep -m1 ERROR "$DIR/err"; RERUN_FAIL=1; }
done
[ -z "${RERUN_FAIL:-}" ] && echo "ok   migrations 0002+ are safe to re-run"
fail=0
for t in tests/db/*.test.sql; do
  echo "== $(basename "$t")"
  if $P -f "$t" >/dev/null 2>"$DIR/err"; then sed -n 's/.*NOTICE:  //p' "$DIR/err"; else sed -n 's/.*NOTICE:  //p' "$DIR/err"; echo "FAIL"; grep -m3 -E "ERROR|FAIL" "$DIR/err"; fail=1; fi
done
exit $fail
