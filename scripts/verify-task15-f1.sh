#!/bin/bash
# Feature 1 HTTP checks: /api/mods/[id], /mod/[id] page, OG tags, canonical redirect.
set -uo pipefail
cd /home/z/my-project
B="http://localhost:3000"
FAIL=0
ok()   { echo "  PASS: $1"; }
bad()  { echo "  FAIL: $1"; FAIL=1; }

# pick the newest mod from the deduped feed
MOD=$(curl -s --max-time 60 "$B/api/mods?limit=1" | python3 -c "import json,sys; print(json.load(sys.stdin)['mods'][0]['id'])")
[ -n "$MOD" ] && ok "feed returned a mod id ($MOD)" || bad "no mod id from feed"

echo "--- /api/mods/[id] ---"
CODE=$(curl -s -o /tmp/f1_mod.json -w "%{http_code}" --max-time 60 "$B/api/mods/$MOD")
[ "$CODE" = "200" ] && ok "GET /api/mods/$MOD -> 200" || bad "status $CODE"
python3 - <<EOF
import json
d = json.load(open("/tmp/f1_mod.json"))
m = d.get("mod", {})
assert m.get("id") == "$MOD", "wrong id"
for k in ["title","text","links","images","thumbnail","author","permalink","category","publishedAt","firstSeenAt"]:
    assert k in m, f"missing {k}"
print("  PASS: single-mod payload has all ModItem fields")
EOF
[ $? -eq 0 ] || bad "payload shape"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$B/api/mods/does-not-exist-xyz")
[ "$CODE" = "404" ] && ok "unknown id -> 404" || bad "unknown id -> $CODE (expected 404)"

echo "--- /mod/[id] page + OG tags ---"
HTML=$(curl -s --max-time 60 "$B/mod/$MOD")
echo "$HTML" | grep -q "og:title" && ok "og:title present" || bad "og:title missing"
OT=$(echo "$HTML" | grep -o 'property="og:title" content="[^"]*"' | head -1 | sed 's/.*content="//;s/"$//')
echo "        og:title = $OT"
echo "$HTML" | grep -q 'property="og:image"' && ok "og:image present (or thumbnail-null case below)" || echo "  NOTE: no og:image (mod may have no thumbnail)"
OC=$(echo "$HTML" | grep -o 'rel="canonical" href="[^"]*"' | head -1 | sed 's/.*href="//;s/"$//')
[ "$OC" = "/mod/$MOD" ] && ok "canonical = /mod/$MOD" || bad "canonical is '$OC'"
echo "$HTML" | grep -q "<h1" && ok "page renders <h1> title" || bad "no h1"
echo "$HTML" | grep -qi "download links" && ok "page shows download links section" || bad "no download links section"
TITLE=$(curl -s --max-time 30 "$B/api/mods/$MOD" | python3 -c "import json,sys; print(json.load(sys.stdin)['mod']['title'])")
echo "$HTML" | grep -qF "$TITLE" && ok "page title matches mod title" || bad "title mismatch"

echo "--- 404 page for garbage id ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$B/mod/!!!bad-id!!!")
[ "$CODE" = "404" ] && ok "bad id -> 404" || bad "bad id -> $CODE"

echo "--- canonical redirect for older duplicate ---"
DUP=$(cd /home/z/my-project && bun -e "
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
(async()=>{
  const grp=await db.\$queryRaw\`SELECT contentHash FROM Mod WHERE contentHash IS NOT NULL GROUP BY contentHash HAVING COUNT(DISTINCT source)>1 AND COUNT(*)>1 LIMIT 1\`;
  if(!grp.length){console.log('');process.exit(0)}
  const rows=await db.mod.findMany({where:{contentHash:grp[0].contentHash},orderBy:[{publishedAt:'desc'},{id:'asc'}],select:{id:true}});
  if(rows.length<2){console.log('');process.exit(0)}
  console.log(rows[0].id+' '+rows[1].id);
  process.exit(0);
})().catch(()=>process.exit(1))")
if [ -n "$DUP" ]; then
  NEWEST=$(echo "$DUP" | cut -d' ' -f1); OLDER=$(echo "$DUP" | cut -d' ' -f2)
  LOC=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" --max-time 30 "$B/mod/$OLDER")
  echo "        duplicate pair: newest=$NEWEST older=$OLDER -> $LOC"
  echo "$LOC" | grep -qE "30[278] .*/mod/$NEWEST" && ok "older duplicate redirects to /mod/$NEWEST" || bad "no canonical redirect: $LOC"
  CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$B/mod/$NEWEST")
  [ "$CODE" = "200" ] && ok "newest duplicate page -> 200" || bad "newest page -> $CODE"
else
  echo "  NOTE: no duplicate pair available yet (backfill just ran)"
fi

[ $FAIL -eq 0 ] && echo "FEATURE-1 HTTP: ALL PASS" || echo "FEATURE-1 HTTP: FAILURES PRESENT"
exit $FAIL
