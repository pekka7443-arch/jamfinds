#!/bin/bash
# Task 16 — agent-browser verification (fixed): strip eval quotes, drive the
# cookie explicitly, use locale-correct switcher labels.
set -uo pipefail
cd /home/z/my-project
B="http://localhost:3100"
AB="agent-browser --session t16b"
FAIL=0
ok()  { echo "  PASS: $1"; }
bad() { echo "  FAIL: $1"; FAIL=1; }
mkdir -p download

if ! curl -s -o /dev/null --max-time 2 "$B/" 2>/dev/null; then
  setsid env PORT=3100 NODE_ENV=production bun .next/standalone/server.js > /tmp/task16-prod.log 2>&1 &
  for i in $(seq 1 30); do sleep 1; curl -s -o /dev/null --max-time 3 "$B/" && break; done
fi
MOD=$(curl -s --max-time 30 "$B/api/mods?limit=1&sort=new" | python3 -c "import json,sys; print(json.load(sys.stdin)['mods'][0]['id'])")
echo "  (mod id: $MOD)"

$AB close >/dev/null 2>&1 || true

echo "--- 1. homepage (en) -> switch to Suomi ---"
$AB open "$B/" >/dev/null 2>&1
$AB wait --text "Every BeamNG mod drop" >/dev/null 2>&1 && ok "en homepage hero visible" || bad "en hero not visible"
$AB find role button click --name "Language" >/dev/null 2>&1 && ok "language switcher opens" || bad "switcher not found"
sleep 1
$AB find text "Suomi" click >/dev/null 2>&1 && ok "selected Suomi" || bad "Suomi not clickable"
sleep 2
URL=$($AB get url 2>/dev/null)
echo "$URL" | grep -q "/fi$" && ok "URL switched to $URL" || bad "URL after switch: $URL"
$AB wait --text "Jokainen BeamNG-modien julkaisu" >/dev/null 2>&1 && ok "Finnish hero renders" || bad "Finnish hero missing"
BODY=$($AB eval "document.body.innerText" 2>/dev/null)
echo "$BODY" | grep -q "Ilmoita minulle" && ok "bell localized (Ilmoita minulle)" || bad "bell not localized"
echo "$BODY" | grep -q "Kaikki lähteet" && ok "source dropdown localized" || bad "source dropdown not localized"
LANG=$($AB eval "document.documentElement.lang" 2>/dev/null | tr -d '"')
[ "$LANG" = "fi" ] && ok "<html lang=fi>" || bad "html lang: $LANG"
DC=$($AB eval "document.cookie" 2>/dev/null | tr -d '"')
echo "$DC" | grep -q "NEXT_LOCALE=fi" && ok "NEXT_LOCALE cookie = fi" || bad "cookie: $DC"
LS=$($AB eval "localStorage.getItem('jamfinds:locale')" 2>/dev/null | tr -d '"')
[ "$LS" = "fi" ] && ok "localStorage jamfinds:locale = fi" || bad "localStorage: $LS"
$AB screenshot download/t16-home-fi.png >/dev/null 2>&1 && ok "screenshot t16-home-fi.png" || bad "screenshot failed"

echo "--- 2. cookie-driven SSR: /mod/[id] redirects to /fi/mod/[id] ---"
$AB open "$B/mod/$MOD" >/dev/null 2>&1
sleep 2
URL=$($AB get url 2>/dev/null)
echo "$URL" | grep -q "/fi/mod/$MOD" && ok "fi cookie redirects /mod -> /fi/mod ($URL)" || bad "no cookie redirect: $URL"
$AB wait --text "Takaisin live-löytöihin" >/dev/null 2>&1 && ok "/fi/mod/[id] Finnish chrome" || bad "/fi/mod missing fi chrome"
$AB wait --text "Latauslinkit" >/dev/null 2>&1 && ok "/fi/mod/[id] Finnish download links" || bad "Latauslinkit missing"
$AB screenshot download/t16-mod-fi.png >/dev/null 2>&1 && ok "screenshot t16-mod-fi.png" || bad "screenshot failed"

echo "--- 3. fi -> deep-path switch keeps /mod/[id] ---"
$AB find role button click --name "Kieli" >/dev/null 2>&1 && ok "switcher (Kieli) opens on mod page" || bad "switcher missing on mod page"
sleep 1
$AB find text "Deutsch" click >/dev/null 2>&1 && ok "selected Deutsch" || bad "Deutsch not clickable"
sleep 2
URL=$($AB get url 2>/dev/null)
echo "$URL" | grep -q "/de/mod/$MOD" && ok "deep path preserved -> $URL" || bad "URL after de switch: $URL"
$AB wait --text "Zurück zu den Live-Funden" >/dev/null 2>&1 && ok "German chrome on mod page" || bad "de chrome missing"
$AB screenshot download/t16-mod-de.png >/dev/null 2>&1 && ok "screenshot t16-mod-de.png" || bad "screenshot failed"

echo "--- 4. clear cookie -> unprefixed /mod/[id] serves en (default) ---"
$AB eval "document.cookie = 'NEXT_LOCALE=; path=/; max-age=0'" >/dev/null 2>&1
$AB open "$B/mod/$MOD" >/dev/null 2>&1
sleep 2
URL=$($AB get url 2>/dev/null)
echo "$URL" | grep -qE "/mod/$MOD$" && ok "no cookie: /mod/[id] stays unprefixed ($URL)" || bad "unexpected: $URL"
$AB wait --text "Back to live finds" >/dev/null 2>&1 && ok "English chrome on unprefixed mod page" || bad "en chrome missing"
$AB wait --text "Download links" >/dev/null 2>&1 && ok "English download-links header" || bad "en links missing"
$AB screenshot download/t16-mod-en.png >/dev/null 2>&1 && ok "screenshot t16-mod-en.png" || bad "screenshot failed"

echo "--- 5. reload /fi with cookie cleared -> Accept-Language negotiation ---"
$AB eval "document.cookie = 'NEXT_LOCALE=; path=/; max-age=0'" >/dev/null 2>&1
$AB open "$B/fi" >/dev/null 2>&1
sleep 1
$AB wait --text "Jokainen BeamNG-modien julkaisu" >/dev/null 2>&1 && ok "prefixed /fi direct load" || bad "/fi direct load failed"

echo "--- 6. console + page errors ---"
ERRS=$($AB errors 2>/dev/null | tail -n +2 | grep -c . || true)
if [ "${ERRS:-0}" = "0" ]; then ok "zero page errors"; else bad "$ERRS page errors"; $AB errors 2>/dev/null | head -10; fi

$AB close >/dev/null 2>&1
echo ""
[ "$FAIL" = "0" ] && echo "ALL BROWSER CHECKS PASSED" || echo "SOME BROWSER CHECKS FAILED"
exit $FAIL
