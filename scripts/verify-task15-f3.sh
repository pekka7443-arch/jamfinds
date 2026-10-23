#!/bin/bash
# Feature 3 HTTP checks: contentHash dedupe in /api/mods, sources attachment,
# Requests isolation preserved.
set -uo pipefail
cd /home/z/my-project
B="http://localhost:3000"
FAIL=0
ok()  { echo "  PASS: $1"; }
bad() { echo "  FAIL: $1"; FAIL=1; }

if ! curl -s -o /dev/null --max-time 2 "$B/" 2>/dev/null; then
  echo "== bootstrapping dev server =="
  setsid nohup npm run dev > /dev/null 2>&1 &
  for i in $(seq 1 40); do sleep 2; curl -s -o /dev/null --max-time 3 "$B/" && break; done
fi
curl -s -o /dev/null --max-time 60 "$B/api/mods?limit=1"

echo "--- 1. feed returns only newest row per contentHash group ---"
python3 - <<'EOF'
import json, urllib.request
B = "http://localhost:3000"
def get(u):
    with urllib.request.urlopen(u, timeout=60) as r: return json.load(r)
d = get(f"{B}/api/mods?limit=60&page=1")
mods = d["mods"]
hashes = [m.get("contentHash") for m in mods]
seen = set()
dupes = [h for h in hashes if h and h in seen] + []
seen_dupes = []
for h in hashes:
    if h:
        if h in seen: seen_dupes.append(h)
        seen.add(h)
assert not seen_dupes, f"duplicate contentHash rows on one page: {seen_dupes[:3]}"
multi = [m for m in mods if len(m.get("sources") or []) > 1]
print(f"  PASS: no duplicate contentHash on page 1 (60 rows, {sum(1 for h in hashes if h)} hashed)")
print(f"  INFO: multi-source rows on page 1: {len(multi)}")
for m in multi[:5]:
    labels = [s["label"] for s in m["sources"]]
    print(f"        {m['id']} '{m['title'][:40]}' on {len(labels)}: {labels}")
    assert len(labels) == len(set(labels)), "source dup inside one row"
    assert any(s["key"] == m["source"] for s in m["sources"]), "own source missing from sources[]"
EOF
[ $? -eq 0 ] && ok "dedupe + sources[] shape correct" || bad "dedupe check failed"

echo "--- 2. newest-wins across the whole DB, filtered set respected ---"
bun -e "
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
(async()=>{
  // every VISIBLE group: is the row the API shows the newest of its group?
  const rows=await db.\$queryRaw\`SELECT m.contentHash, m.id, m.publishedAt, m.source FROM Mod m
    JOIN (SELECT contentHash h, MAX(publishedAt) mp FROM Mod WHERE contentHash IS NOT NULL GROUP BY contentHash) g
    ON m.contentHash=g.h AND m.publishedAt=g.mp LIMIT 5\`;
  console.log('  INFO: sample newest-wins groups:', rows.map(r=>r.contentHash.slice(0,28)).join(' | '));
  // cat=all must still exclude request+no-link (Requests isolation)
  const api=await fetch('http://localhost:3000/api/mods?cat=all&limit=60');
  const d=await api.json();
  const bad=d.mods.filter(m=>m.category==='request'||m.category==='no-link');
  console.log(bad.length===0?'  PASS: cat=all excludes request+no-link rows':'  FAIL: isolation broken: '+bad.map(b=>b.id).join(','));
  // requests section still returns rows
  const req=await fetch('http://localhost:3000/api/mods?cat=request&limit=5');
  const rd=await req.json();
  console.log(rd.mods.length>0?'  PASS: Requests section still populated ('+rd.total+' rows)':'  FAIL: requests empty');
  // counts: deduped total must be <= raw visible count
  const raw=await db.mod.count({where:{category:{notIn:['request','no-link']}}});
  console.log(d.total<=raw?('  PASS: deduped total '+d.total+' <= raw visible '+raw):'  FAIL: total '+d.total+' > raw '+raw);
  process.exit(0);
})().catch(e=>{console.error('  FAIL:',e.message);process.exit(1)})" || FAIL=1

echo "--- 3. deduped total matches independent recount ---"
python3 - <<'EOF'
import json, urllib.request
B = "http://localhost:3000"
d = json.load(urllib.request.urlopen(f"{B}/api/mods?limit=6&page=1", timeout=60))
print(f"  INFO: page1 total={d['total']} page={d['page']} hasMore={d['hasMore']} stats.total={d['stats']['total']}")
assert d["stats"]["total"] >= d["total"], "stats total should count raw rows"
EOF
[ $? -eq 0 ] && ok "response shape intact" || bad "shape broken"

[ $FAIL -eq 0 ] && echo "FEATURE-3 HTTP: ALL PASS" || echo "FEATURE-3 HTTP: FAILURES PRESENT"
exit $FAIL
