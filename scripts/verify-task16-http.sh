#!/bin/bash
# Task 16 HTTP verification: i18n routing + localized rendering + VAPID fix,
# run in one call (harness reaps background processes between calls).
set -uo pipefail
cd /home/z/my-project
B="http://localhost:3000"
FAIL=0
ok()  { echo "  PASS: $1"; }
bad() { echo "  FAIL: $1"; FAIL=1; }

# self-contained bootstrap (dev server on :3000)
if ! curl -s -o /dev/null --max-time 2 "$B/" 2>/dev/null; then
  echo "== bootstrapping dev server =="
  setsid nohup bun run dev > /dev/null 2>&1 &
  for i in $(seq 1 45); do sleep 2; curl -s -o /dev/null --max-time 3 "$B/" && break; done
fi
curl -s -o /dev/null --max-time 60 "$B/api/mods?limit=1"

# newest mod id for the mod-page checks
MOD=$(curl -s --max-time 30 "$B/api/mods?limit=1&sort=new" | python3 -c "import json,sys; print(json.load(sys.stdin)['mods'][0]['id'])" 2>/dev/null)
[ -n "$MOD" ] && ok "sample mod id: $MOD" || { bad "no mods from API"; exit 1; }

echo "--- locale routing (proxy middleware, localePrefix as-needed) ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$B/")
[ "$CODE" = "200" ] && ok "/ serves 200 without locale prefix (default en)" || bad "/ -> $CODE"
LOC=$(curl -s --max-time 30 "$B/" | grep -o '<html lang="[a-z]*"' | head -1)
echo "$LOC" | grep -q 'lang="en"' && ok "/ renders <html lang=en>" || bad "/ html lang: $LOC"
RED=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" --max-time 30 -H "Accept-Language: fi-FI,fi;q=0.9" "$B/")
echo "$RED" | grep -q "307" && echo "$RED" | grep -q "/fi" && ok "Accept-Language fi -> redirect $RED" || bad "Accept-Language redirect: $RED"
RED=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" --max-time 30 "$B/en/mod/$MOD")
echo "$RED" | grep -q "307" && echo "$RED" | grep -qE "/mod/$MOD$" && ok "/en/... prefix stripped -> $RED" || bad "/en strip: $RED"
for L in fi de fr es ru; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 60 "$B/$L")
  [ "$CODE" = "200" ] && ok "/$L serves 200" || bad "/$L -> $CODE"
done

echo "--- localized strings render ---"
check_str() { # url, needle, label
  local H; H=$(curl -s --max-time 60 "$1")
  echo "$H" | grep -q "$2" && ok "$3" || bad "$3 (missing: $2)"
}
check_str "$B"    "Every BeamNG mod drop" "en homepage hero"
check_str "$B/fi" "Jokainen BeamNG-modien julkaisu" "fi homepage hero"
check_str "$B/de" "Jeder BeamNG-Mod-Drop" "de homepage hero"
check_str "$B/fr" "Chaque drop de mod BeamNG" "fr homepage hero"
check_str "$B/es" "Cada lanzamiento de mods de BeamNG" "es homepage hero"
check_str "$B/ru" "Каждая новинка модов BeamNG" "ru homepage hero"
check_str "$B/fi" "Kaikki lähteet" "fi source dropdown"
check_str "$B/ru" "Все источники" "ru source dropdown"
check_str "$B/fi" "Ilmoita minulle" "fi notify bell"
check_str "$B/de" "Bereit zum Download" "de with-links toggle"

echo "--- mod pages under both prefixes ---"
H1=$(curl -s --max-time 90 "$B/mod/$MOD")
echo "$H1" | grep -q "<html lang=\"en\"" && ok "/mod/[id] renders (en, unprefixed)" || bad "/mod/[id] not en: $(echo "$H1" | grep -o '<html lang="[a-z]*"')"
echo "$H1" | grep -q "Back to live finds" && ok "/mod/[id] English chrome" || bad "/mod/[id] missing en strings"
echo "$H1" | grep -qi 'rel="canonical"' && echo "$H1" | grep -q "href=\"/mod/$MOD\"" && ok "/mod/[id] canonical" || bad "/mod/[id] canonical tag"
echo "$H1" | grep -qi 'hrefLang' && ok "/mod/[id] hreflang alternates" || bad "/mod/[id] no hreflang"
echo "$H1" | grep -qi 'hreflang="fi"' || echo "$H1" | grep -qi 'hrefLang="fi"' && ok "/mod/[id] fi hreflang present" || bad "/mod/[id] no fi hreflang"
H2=$(curl -s --max-time 90 "$B/fi/mod/$MOD")
echo "$H2" | grep -q "<html lang=\"fi\"" && ok "/fi/mod/[id] renders lang=fi" || bad "/fi/mod lang: $(echo "$H2" | grep -o '<html lang="[a-z]*"')"
echo "$H2" | grep -q "Takaisin live-löytöihin" && ok "/fi/mod/[id] Finnish chrome" || bad "/fi/mod missing fi strings"
echo "$H2" | grep -q "Latauslinkit" && ok "/fi/mod/[id] Finnish download-links header" || bad "/fi/mod missing Latauslinkit"
H3=$(curl -s --max-time 90 "$B/ru/mod/$MOD")
echo "$H3" | grep -q "Ссылки на скачивание" && ok "/ru/mod/[id] Russian download-links header" || bad "/ru/mod missing ru strings"
H4=$(curl -s --max-time 90 "$B/es/mod/$MOD")
echo "$H4" | grep -q "Enlaces de descarga" && ok "/es/mod/[id] Spanish download-links header" || bad "/es/mod missing es strings"

echo "--- OG metadata intact (Task 15 regression) ---"
echo "$H1" | grep -q 'property="og:title"' && ok "og:title present" || bad "og:title missing"
echo "$H1" | grep -q 'property="og:image"' && ok "og:image present" || bad "og:image missing"
NF=$(curl -s -o /dev/null -w "%{http_code}" --max-time 60 "$B/mod/doesnotexist99")
[ "$NF" = "404" ] && ok "/mod/bad -> 404" || bad "/mod/bad -> $NF"

echo "--- unmatched routes (localized not-found) ---"
NFH=$(curl -s --max-time 30 "$B/xyz-not-a-page")
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$B/xyz-not-a-page")
[ "$CODE" = "404" ] && ok "/xyz -> 404" || bad "/xyz -> $CODE"
echo "$NFH" | grep -q "Page not found" && ok "/xyz localized en not-found" || bad "/xyz missing en not-found text"
NFH=$(curl -s --max-time 30 "$B/fi/xyz-not-a-page")
echo "$NFH" | grep -q "Sivua ei löytynyt" && ok "/fi/xyz localized fi not-found" || bad "/fi/xyz missing fi not-found"

echo "--- middleware must not touch APIs / static files ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$B/api/mods?limit=1")
[ "$CODE" = "200" ] && ok "/api/mods 200 (untouched)" || bad "/api/mods -> $CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$B/api/mods/$MOD")
[ "$CODE" = "200" ] && ok "/api/mods/[id] 200" || bad "/api/mods/[id] -> $CODE"
SW=$(curl -s -o /dev/null -w "%{http_code} %{content_type}" --max-time 30 "$B/sw.js")
echo "$SW" | grep -q "^200" && ok "/sw.js served" || bad "/sw.js -> $SW"
node --check public/sw.js && ok "sw.js syntax valid" || bad "sw.js syntax"
grep -q "FALLBACK_TEXT" public/sw.js && grep -q "Uusia BeamNG-modeja" public/sw.js && ok "sw.js carries localized fallbacks" || bad "sw.js missing localized fallbacks"
grep -q 'api|trpc|_next' src/proxy.ts && ok "proxy matcher excludes /api + dotted paths" || bad "proxy matcher wrong"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$B/robots.txt")
[ "$CODE" = "200" ] && ok "/robots.txt served (dot-path excluded from proxy)" || bad "/robots.txt -> $CODE"

echo "--- VAPID fix (Fix 1) ---"
PK=$(curl -s --max-time 30 "$B/api/push/subscribe")
echo "$PK" | python3 -c "
import json,sys
d=json.load(sys.stdin)
k=d.get('publicKey') or ''
assert k and len(k) >= 80, 'publicKey missing/short: ' + repr(k)
print('        publicKey len', len(k), '(VAPID_PUBLIC_KEY present)')" && ok "GET /api/push/subscribe returns real VAPID key" || bad "publicKey: $PK"
grep -q "^VAPID_PUBLIC_KEY=" .env && grep -q "^VAPID_PRIVATE_KEY=" .env && grep -q "^VAPID_SUBJECT=" .env && ok ".env has VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT" || bad ".env VAPID names missing"
grep -q "VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC" src/lib/sync.ts && ok "sync.ts reads new env names (legacy fallback)" || bad "sync.ts env names wrong"
grep -q "VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC" src/app/api/push/subscribe/route.ts && ok "subscribe route reads new env names" || bad "route env names wrong"

echo "--- localized push payload (sync.ts + sw.js contract) ---"
grep -q "PUSH_BODY_LATEST" src/lib/sync.ts && grep -q "localizedPushTexts" src/lib/sync.ts && ok "sync.ts fan-out payload localized" || bad "sync.ts payload not localized"
python3 - <<'EOF'
import re
src = open("src/lib/sync.ts", encoding="utf-8").read()
for loc in ["en","fi","de","fr","es","ru"]:
    assert re.search(rf'{loc}:', src), f"missing {loc} in sync.ts push texts"
print("        all 6 locales present in sync.ts push maps")
EOF
ok "sync.ts push texts cover all 6 locales" || bad "sync.ts push locale map incomplete"

echo ""
[ "$FAIL" = "0" ] && echo "ALL HTTP CHECKS PASSED" || echo "SOME CHECKS FAILED"
exit $FAIL
