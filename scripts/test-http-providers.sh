#!/bin/bash
# End-to-end provider verification through the REAL /api/download endpoints.
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
BASE="http://localhost:3000"
enc() { python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=''))" "$1"; }

section() { echo; echo "=== $1 ==="; }

section "1. RESOLVE: BeamFinds public API (proxy expected)"
curl -s -A "$UA" "$BASE/api/download/resolve?url=$(enc 'https://beamfinds.com/mod/5')" | python3 -m json.tool

section "2. RESOLVE: BeamFree no creator link (external + honest reason)"
curl -s -A "$UA" "$BASE/api/download/resolve?url=$(enc 'https://beamfree.pro/mod/2')" | python3 -m json.tool

section "3. RESOLVE: Modsfire (proxy expected)"
curl -s -A "$UA" "$BASE/api/download/resolve?url=$(enc 'https://modsfire.com/B6294i44Dq2Gf4h')" | python3 -m json.tool

section "4. RESOLVE: workupload (external, anti-bot reason)"
curl -s -A "$UA" "$BASE/api/download/resolve?url=$(enc 'https://workupload.com/file/jNMJnxFKsAf')" | python3 -m json.tool

section "5. RESOLVE: discord invite (external)"
curl -s -A "$UA" "$BASE/api/download/resolve?url=$(enc 'https://discord.gg/8taaY6JUmW')" | python3 -m json.tool

section "6. RESOLVE: SSRF attempts must be external/400"
echo -n "localhost: "; curl -s -A "$UA" "$BASE/api/download/resolve?url=$(enc 'https://localhost/x.zip')"; echo
echo -n "169.254.169.254: "; curl -s -A "$UA" "$BASE/api/download/resolve?url=$(enc 'https://169.254.169.254/latest/meta-data/')"; echo
echo -n "non-https: "; curl -s -A "$UA" "$BASE/api/download/resolve?url=$(enc 'http://modsfire.com/abc')"; echo

section "7. DOWNLOAD: BeamFinds real bytes through the proxy (first 4 bytes + headers)"
curl -s -A "$UA" -r 0-1023 -D /tmp/h1.txt -o /tmp/jf-bf5.zip "$BASE/api/download?url=$(enc 'https://beamfinds.com/mod/5')&name=test"
head -1 /tmp/h1.txt; rg -i 'content-(type|range|length|disposition)' /tmp/h1.txt
echo -n "file magic (PK=zip): "; od -A n -t x1z -N 4 /tmp/jf-bf5.zip

section "8. DOWNLOAD: Range request mid-file (bytes 1000000-1000099)"
curl -s -A "$UA" -r 1000000-1000099 -D /tmp/h2.txt -o /tmp/jf-bf5-mid.bin "$BASE/api/download?url=$(enc 'https://beamfinds.com/mod/5')&name=test"
head -1 /tmp/h2.txt; rg -i 'content-range|content-length' /tmp/h2.txt; echo "bytes received: $(stat -c%s /tmp/jf-bf5-mid.bin)"

section "9. DOWNLOAD: internal target must be refused"
echo -n "http code: "; curl -s -o /dev/null -w "%{http_code}\n" -A "$UA" "$BASE/api/download?url=$(enc 'https://127.0.0.1.1/x.zip')"
echo -n "metadata: "; curl -s -o /dev/null -w "%{http_code}\n" -A "$UA" "$BASE/api/download?url=$(enc 'https://169.254.169.254/x.zip')"

section "10. DOWNLOAD: unknown host refused (no open proxy)"
echo -n "http code: "; curl -s -o /dev/null -w "%{http_code}\n" -A "$UA" "$BASE/api/download?url=$(enc 'https://example.com/x.zip')"

section "11. DOWNLOAD: external fallback is a 307 to the original page"
curl -s -A "$UA" -o /dev/null -w "status=%{http_code} redirect=%{redirect_url}\n" "$BASE/api/download?url=$(enc 'https://beamfree.pro/mod/2')&name=test"
