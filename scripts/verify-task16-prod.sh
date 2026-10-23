#!/bin/bash
# Task 16 — mod-page + not-found checks against the PRODUCTION standalone
# build (dev-mode streaming truncates responses mid-flush, making greps flaky).
set -uo pipefail
cd /home/z/my-project
B="http://localhost:3100"
FAIL=0
ok()  { echo "  PASS: $1"; }
bad() { echo "  FAIL: $1"; FAIL=1; }

# boot the standalone production server on :3100 in the background
if ! curl -s -o /dev/null --max-time 2 "$B/" 2>/dev/null; then
  echo "== booting production standalone on :3100 =="
  setsid env PORT=3100 NODE_ENV=production bun .next/standalone/server.js > /tmp/task16-prod.log 2>&1 &
  for i in $(seq 1 30); do sleep 1; curl -s -o /dev/null --max-time 3 "$B/" && break; done
fi
curl -s -o /dev/null --max-time 60 "$B/api/mods?limit=1"

MOD=$(curl -s --max-time 30 "$B/api/mods?limit=1&sort=new" | python3 -c "import json,sys; print(json.load(sys.stdin)['mods'][0]['id'])")
[ -n "$MOD" ] && ok "sample mod id: $MOD" || { bad "no mods"; exit 1; }

echo "--- full mod-page metadata suite (production) ---"
H1=$(curl -s --max-time 60 "$B/mod/$MOD")
echo "$H1" | grep -q "<html lang=\"en\"" && ok "/mod/[id] lang=en" || bad "lang: $(echo "$H1" | grep -o '<html[^>]*>')"
echo "$H1" | grep -q "Back to live finds" && ok "/mod/[id] English chrome" || bad "missing en chrome"
echo "$H1" | grep -qi 'rel="canonical"' && echo "$H1" | grep -q "href=\"/mod/$MOD\"" && ok "canonical -> /mod/[id]" || bad "canonical"
echo "$H1" | grep -qi 'hrefLang="fi"' && ok "hreflang fi" || bad "hreflang fi missing"
echo "$H1" | grep -qi 'hrefLang="ru"' && ok "hreflang ru" || bad "hreflang ru missing"
echo "$H1" | grep -q 'property="og:title"' && ok "og:title" || bad "og:title"
echo "$H1" | grep -q 'property="og:image"' && ok "og:image" || bad "og:image"
echo "$H1" | grep -q 'name="twitter:card"' && ok "twitter:card" || bad "twitter:card"
echo "$H1" | grep -q "Download links" && ok "en download-links header" || bad "missing en 'Download links'"

for pair in "fi:Takaisin live-löytöihin:Latauslinkit" "de:Zurück zu den Live-Funden:Download-Links" "fr:Retour aux trouvailles en direct:Liens de téléchargement" "es:Volver a los hallazgos en vivo:Enlaces de descarga" "ru:Назад к живым находкам:Ссылки на скачивание"; do
  L="${pair%%:*}"; REST="${pair#*:}"; BACK="${REST%%:*}"; LINKS="${REST#*:}"
  H=$(curl -s --max-time 60 "$B/$L/mod/$MOD")
  echo "$H" | grep -q "<html lang=\"$L\"" && ok "/$L/mod lang=$L" || bad "/$L/mod lang"
  echo "$H" | grep -q "$BACK" && ok "/$L/mod back-label" || bad "/$L/mod back-label missing: $BACK"
  echo "$H" | grep -q "$LINKS" && ok "/$L/mod download-links header" || bad "/$L/mod links missing: $LINKS"
done

echo "--- localized not-found (production) ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 60 "$B/xyz-not-a-page")
[ "$CODE" = "404" ] && ok "/xyz -> 404" || bad "/xyz -> $CODE"
H=$(curl -s --max-time 60 "$B/xyz-not-a-page")
echo "$H" | grep -q "Page not found" && ok "/xyz localized en not-found" || bad "/xyz en not-found text"
H=$(curl -s --max-time 60 "$B/fi/xyz-not-a-page")
echo "$H" | grep -q "Sivua ei löytynyt" && ok "/fi/xyz localized fi not-found" || bad "/fi/xyz fi not-found text"
H=$(curl -s --max-time 60 "$B/ru/xyz-not-a-page")
echo "$H" | grep -q "Страница не найдена" && ok "/ru/xyz localized ru not-found" || bad "/ru/xyz ru not-found text"

echo "--- homepage sanity on production ---"
H=$(curl -s --max-time 60 "$B/")
echo "$H" | grep -q "Every BeamNG mod drop" && ok "/ en hero" || bad "/ en hero"
H=$(curl -s --max-time 60 "$B/fi")
echo "$H" | grep -q "Jokainen BeamNG-modien julkaisu" && ok "/fi hero" || bad "/fi hero"

# leave the server up for the browser verification step
echo ""
[ "$FAIL" = "0" ] && echo "ALL PRODUCTION CHECKS PASSED (server left running on :3100)" || echo "SOME CHECKS FAILED"
exit $FAIL
