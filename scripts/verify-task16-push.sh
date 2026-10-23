#!/bin/bash
# Task 16 push e2e wrapper — self-bootstraps the standalone server (harness
# reaps background processes between calls), runs the real-browser push flow.
set -uo pipefail
cd /home/z/my-project
B="http://localhost:3100"

if ! curl -s -o /dev/null --max-time 2 "$B/" 2>/dev/null; then
  echo "== bootstrapping standalone on :3100 =="
  setsid env PORT=3100 NODE_ENV=production bun .next/standalone/server.js > /tmp/task16-prod.log 2>&1 &
  for i in $(seq 1 30); do sleep 1; curl -s -o /dev/null --max-time 3 "$B/" && break; done
fi
curl -s -o /dev/null --max-time 60 "$B/api/mods?limit=1"
echo "== server ready =="

# Xvfb display for headed chromium (headless denies Notification permission)
if ! curl -s -o /dev/null --max-time 2 "http://localhost:3100/" 2>/dev/null; then
  echo "server failed to start"; exit 1
fi
(Xvfb :99 -screen 0 1280x800x24 &) 2>/dev/null
sleep 2
set -a; source .env; set +a
DISPLAY=:99 node scripts/verify-task16-push-browser.js
RC=$?
pkill -f "Xvfb :99" 2>/dev/null || true
exit $RC
