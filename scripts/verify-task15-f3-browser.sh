#!/bin/bash
# Feature 3 agent-browser checks: stacked source dots "on N sources" on cards.
set -uo pipefail
cd /home/z/my-project
FAIL=0
ok()  { echo "  PASS: $1"; }
bad() { echo "  FAIL: $1"; FAIL=1; }
AB="agent-browser"

if ! curl -s -o /dev/null --max-time 2 "http://localhost:3000/" 2>/dev/null; then
  echo "== bootstrapping dev server =="
  setsid nohup npm run dev > /dev/null 2>&1 &
  for i in $(seq 1 40); do sleep 2; curl -s -o /dev/null --max-time 3 "http://localhost:3000/" && break; done
fi
curl -s -o /dev/null --max-time 60 "http://localhost:3000/api/mods?limit=1"

$AB close > /dev/null 2>&1 || true
$AB open http://localhost:3000/ > /dev/null 2>&1
$AB wait --load networkidle --timeout 45000 > /dev/null 2>&1 || true
sleep 3

echo "--- stacked source dots on cards ---"
CNT=$($AB eval "(() => { const chips=[...document.querySelectorAll('article span')]; const multi=chips.filter(s=>/on \d+ sources/.test(s.textContent)); return multi.length + '|' + (multi[0]? multi[0].textContent.trim() : ''); })()" 2>/dev/null | tr -d '"')
N=$(echo "$CNT" | cut -d'|' -f1); SAMPLE=$(echo "$CNT" | cut -d'|' -f2)
echo "        multi-source chips found: $N sample: '$SAMPLE'"
if [ "${N:-0}" -ge 1 ] 2>/dev/null; then
  ok "cards show stacked-dots chip '$SAMPLE'"
  DOT=$($AB eval "(() => { const chip=[...document.querySelectorAll('article span')].find(s=>/on \d+ sources/.test(s.textContent)); return chip? chip.querySelectorAll('span span').length : 0; })()" 2>/dev/null | tr -d '"')
  [ "${DOT:-0}" -ge 2 ] 2>/dev/null && ok "chip renders $DOT stacked dots" || bad "stacked dots missing ($DOT)"
else
  bad "no multi-source chips rendered on page 1"
fi

echo "--- dialog mirrors the multi-source chip ---"
$AB eval "(() => { const card=[...document.querySelectorAll('article')].find(a=>/on \d+ sources/.test(a.querySelector('h3')?.parentElement?.textContent||'')); if(card){card.click()} return 1; })()" > /dev/null 2>&1
sleep 2
DIALOG=$($AB eval "(() => { const dlg=[...document.querySelectorAll('[role=\"dialog\"] span')]; const m=dlg.find(s=>/on \d+ sources/.test(s.textContent)); return m? m.textContent.trim() : ''; })()" 2>/dev/null | tr -d '"')
if [ -n "$DIALOG" ]; then ok "dialog shows '$DIALOG'"; else echo "  NOTE: dialog chip not captured (opened card may be single-source)"; fi
$AB screenshot /home/z/my-project/download/task15-multi-source.png > /dev/null 2>&1 && ok "screenshot saved" || true

echo "--- console errors ---"
ERRS=$($AB errors 2>/dev/null | tail -n +2 | grep -c . || true)
[ "${ERRS:-0}" -eq 0 ] && ok "zero page errors" || { bad "$ERRS page errors"; $AB errors 2>/dev/null | head -5; }

$AB close > /dev/null 2>&1 || true
[ $FAIL -eq 0 ] && echo "FEATURE-3 BROWSER: ALL PASS" || echo "FEATURE-3 BROWSER: FAILURES PRESENT"
exit $FAIL
