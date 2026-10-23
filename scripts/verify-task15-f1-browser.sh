#!/bin/bash
# Feature 1 agent-browser checks: card title links to /mod/[id]; page renders.
set -uo pipefail
cd /home/z/my-project
FAIL=0
ok()  { echo "  PASS: $1"; }
bad() { echo "  FAIL: $1"; FAIL=1; }
AB="agent-browser"

$AB close > /dev/null 2>&1 || true

echo "--- homepage: card title is a canonical link ---"
$AB open http://localhost:3000/ > /dev/null 2>&1
$AB wait --load networkidle --timeout 45000 > /dev/null 2>&1 || true
sleep 2
HREF=$($AB eval "(() => { const a = document.querySelector('article h3 a[href^=\"/mod/\"]'); return a ? a.getAttribute('href') : ''; })()" 2>/dev/null | tr -d '"')
if [ -n "$HREF" ]; then ok "card title links to $HREF"; else bad "no /mod/ link found on cards"; fi

echo "--- click title link navigates to mod page ---"
if [ -n "$HREF" ]; then
  $AB eval "window.location.href = '$HREF'" > /dev/null 2>&1
  sleep 4
  URL=$($AB get url 2>/dev/null)
  case "$URL" in
    */mod/*) ok "navigated to $URL" ;;
    *) bad "navigation ended at $URL" ;;
  esac
  H1=$($AB eval "document.querySelector('h1')?.textContent?.trim() || ''" 2>/dev/null | tr -d '"')
  [ -n "$H1" ] && ok "page <h1>: $H1" || bad "no h1 on mod page"
  DOWNLOADS=$($AB eval "document.body.innerText.includes('Download links')" 2>/dev/null)
  [ "$DOWNLOADS" = "true" ] && ok "download links section rendered" || bad "no download links section"
  SRC=$($AB eval "document.body.innerText.includes('Back to live finds')" 2>/dev/null)
  [ "$SRC" = "true" ] && ok "back-to-finds top bar rendered" || bad "no back link"
  BADGE=$($AB eval "document.querySelectorAll('article span').length" 2>/dev/null)
  [ "${BADGE:-0}" -gt 3 ] 2>/dev/null && ok "badge chips rendered ($BADGE spans)" || bad "badges missing"
  $AB screenshot /home/z/my-project/download/task15-mod-page.png > /dev/null 2>&1 && ok "screenshot saved" || true
fi

echo "--- console errors ---"
ERRS=$($AB errors 2>/dev/null | tail -n +2 | grep -c . || true)
[ "${ERRS:-0}" -eq 0 ] && ok "zero page errors" || { bad "$ERRS page errors:"; $AB errors 2>/dev/null | head -6; }

$AB close > /dev/null 2>&1 || true
[ $FAIL -eq 0 ] && echo "FEATURE-1 BROWSER: ALL PASS" || echo "FEATURE-1 BROWSER: FAILURES PRESENT"
exit $FAIL
