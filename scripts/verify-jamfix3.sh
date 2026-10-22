#!/bin/sh
# End-to-end verification of the packaged artifact under the deployed env simulation:
# platform sets PORT=3000 (app port), ingress via FC_CUSTOM_LISTEN_PORT, no DATABASE_URL.
ART=/tmp/build_fullstack_jamfix3
LOG=/tmp/jamfix3-run.log

echo "### PHASE 1: exact packaged startup (deployed-env simulation)"
cd "$ART" || exit 1
env -u DATABASE_URL -u CADDY_PORT PORT=3000 FC_CUSTOM_LISTEN_PORT=8181 \
    sh start.sh > "$LOG" 2>&1 &
SPID=$!

ok_next=0; ok_ingress=0
for i in $(seq 1 25); do
    curl -s -o /dev/null --max-time 2 http://localhost:8181/ 2>/dev/null && ok_ingress=1 && break
    sleep 1
done
curl -s -o /dev/null --max-time 2 http://localhost:3000/ 2>/dev/null && ok_next=1

echo "--- startup log (key lines) ---"
grep -E "数据库|Ready|已启动|❌|conflict|Listening" "$LOG" | head -8
echo "--- port resolution check (from log/env) ---"
grep -E "Port:" "$LOG" | head -2
echo "--- listeners ---"
ss -tlnp 2>/dev/null | grep -E ":3000 |:8181 " | awk '{print $4, $6}'
echo "--- processes alive ---"
ps -o pid,comm,args -e 2>/dev/null | grep -E "server\.js" | grep -v grep | head -2 | cut -c1-80

echo
echo "### PHASE 2: HTTP verification"
printf "homepage via ingress 8181: "
curl -sS -o /tmp/h3.html -w "HTTP %{http_code} in %{time_total}s bytes=%{size_download}\n" http://localhost:8181/
echo "JamFinds mentions in homepage: $(grep -c JamFinds /tmp/h3.html 2>/dev/null)"
printf "mods api via ingress 8181: "
curl -sS -o /tmp/a3.json -w "HTTP %{http_code} in %{time_total}s\n" "http://localhost:8181/api/mods?limit=3"
bun -e "const j=await Bun.file('/tmp/a3.json').json();console.log('   parsed OK — mods:',j.mods.length,'| total:',j.total,'| first:',j.mods[0].title)" 2>&1 | head -1
printf "mods api direct 3000: "
curl -sS -o /tmp/a3b.json -w "HTTP %{http_code} in %{time_total}s\n" "http://localhost:3000/api/mods?limit=1"
bun -e "const j=await Bun.file('/tmp/a3b.json').json();console.log('   parsed OK — total:',j.total)" 2>&1 | head -1
printf "SSRF guard via ingress (expect 400): "
curl -sS -o /dev/null -w "HTTP %{http_code}\n" "http://localhost:8181/api/download?url=http%3A%2F%2F169.254.169.254%2Flatest%2Fmeta-data"

echo
echo "### PHASE 3: both processes still running after tests"
ss -tlnp 2>/dev/null | grep -qE ":3000 " && echo "next.js :3000 — UP" || echo "next.js :3000 — DOWN"
ss -tlnp 2>/dev/null | grep -qE ":8181 " && echo "ingress :8181 — UP" || echo "ingress :8181 — DOWN"

echo
echo "### PHASE 4: conflict guard — CADDY_PORT=3000 must be rejected"
cd "$ART" || exit 1
env -u DATABASE_URL CADDY_PORT=3000 sh start.sh > /tmp/jamfix3-guard.log 2>&1
echo "guard exit code: $? (expect 1)"
grep -E "❌|conflict" /tmp/jamfix3-guard.log | head -3
ss -tlnp 2>/dev/null | grep -qE ":3000 " && echo "WARN: something on 3000" || echo "nothing bound to 3000 by guard test (clean rejection)"
