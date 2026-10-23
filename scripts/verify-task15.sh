#!/bin/bash
# Task 15 verification — atomic single-call runs (harness reaps bg processes
# between calls, so the dev server is started and used within THIS call).
# Usage: bash scripts/verify-task15.sh <f1|f1-browser|f2|f2-browser|f3|f3-browser>
set -uo pipefail
cd /home/z/my-project
PHASE="${1:-f1}"

PORT=3000
already_running=false
if curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/" 2>/dev/null; then
  already_running=true
  echo "== dev server already up =="
else
  echo "== starting dev server =="
  setsid nohup npm run dev > /dev/null 2>&1 &
  for i in $(seq 1 40); do
    sleep 2
    if curl -s -o /dev/null --max-time 3 "http://localhost:$PORT/"; then break; fi
  done
  curl -s -o /dev/null -w "server ready: %{http_code}\n" --max-time 30 "http://localhost:$PORT/"
fi

# one warm-up hit so lazy compile doesn't pollute timing assertions
curl -s -o /dev/null --max-time 60 "http://localhost:$PORT/api/mods?limit=1"

case "$PHASE" in
  f1)
    echo "=== Feature 1: /api/mods/[id] + /mod/[id] page + OG ==="
    bash scripts/verify-task15-f1.sh
    ;;
  f1-browser)
    echo "=== Feature 1: agent-browser ==="
    bash scripts/verify-task15-f1-browser.sh
    ;;
  f2)
    echo "=== Feature 2: push API + sw ==="
    bash scripts/verify-task15-f2.sh
    ;;
  f2-browser)
    echo "=== Feature 2: agent-browser bell ==="
    bash scripts/verify-task15-f2-browser.sh
    ;;
  f3)
    echo "=== Feature 3: dedupe API ==="
    bash scripts/verify-task15-f3.sh
    ;;
  f3-browser)
    echo "=== Feature 3: agent-browser dots ==="
    bash scripts/verify-task15-f3-browser.sh
    ;;
esac

RC=$?
if [ "$already_running" = false ]; then
  echo "== leaving dev server running (best effort) =="
fi
exit $RC
