#!/bin/bash
# Feature 2 — fan-out trigger proof: force a sync that INSERTs a row
# (delete a newest-listing row first) while a fake FCM sub exists; the
# fan-out must attempt delivery to it, get 404, and prune it from the DB.
set -uo pipefail
cd /home/z/my-project
B="http://localhost:3000"
FAIL=0
ok()  { echo "  PASS: $1"; }
bad() { echo "  FAIL: $1"; FAIL=1; }

# self-contained bootstrap (harness reaps bg processes between calls)
if ! curl -s -o /dev/null --max-time 2 "$B/" 2>/dev/null; then
  echo "== bootstrapping dev server =="
  setsid nohup npm run dev > /dev/null 2>&1 &
  for i in $(seq 1 40); do sleep 2; curl -s -o /dev/null --max-time 3 "$B/" && break; done
  curl -s -o /dev/null --max-time 60 "$B/api/mods?limit=1"
fi

VICTIM=$(curl -s --max-time 30 "$B/api/mods?limit=1&source=BeamFree" | python3 -c "import json,sys; print(json.load(sys.stdin)['mods'][0]['id'])")
[ -n "$VICTIM" ] && ok "victim row: $VICTIM (newest BeamFree listing)" || { bad "no victim"; exit 1; }

# wait for the boot sync to finish so our forced sync doesn't bounce
# off the single-flight lock ("sync-already-running")
echo "--- waiting for boot sync to finish ---"
for i in $(seq 1 60); do
  STATE=$(curl -s --max-time 20 "$B/api/mods?limit=1" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['sync']['lastSyncAt'] or '')" 2>/dev/null)
  [ -n "$STATE" ] && break
  sleep 5
done
sleep 5
echo "        boot sync finished at $STATE"

FAKE_EP=$(grep -o "https://[^\"']*fake-prune-me[^\"']*" /tmp/f2_fake_ep.env 2>/dev/null | head -1)
if [ -z "$FAKE_EP" ]; then
  FAKE_EP=$(bun -e "
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
(async()=>{
  const sub=await db.pushSub.findFirst({where:{endpoint:{contains:'fake-prune-me'}},select:{endpoint:true}});
  console.log(sub?sub.endpoint:'');process.exit(0)})()")
fi
[ -n "$FAKE_EP" ] && ok "fake sub present: ${FAKE_EP:0:60}…" || bad "fake sub missing"

# delete the victim so the next sync re-INSERTs it (insertedCount > 0)
bun -e "
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
(async()=>{await db.mod.delete({where:{id:'$VICTIM'}});console.log('victim deleted');process.exit(0)})().catch(e=>{console.error(e.message);process.exit(1)})" || bad "delete failed"

echo "--- forcing sync (retry until the single-flight lock frees) ---"
SYNC=""
for i in $(seq 1 18); do
  SYNC=$(curl -s --max-time 180 -X POST "$B/api/sync")
  echo "$SYNC" | grep -q '"running":false' && break
  echo "        lock busy, retrying in 10s ($i)"
  sleep 10
done
echo "        sync: $(echo "$SYNC" | head -c 240)"
# NOTE: the fan-out proof below is what matters — it may fire from the
# background sync cycle while this POST is rate-limited (2/10s burst cap,
# by design). A 429 here actually exercises the sync limiter, not a bug.

sleep 3
REINSERTED=$(bun -e "
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
(async()=>{const m=await db.mod.findUnique({where:{id:'$VICTIM'},select:{id:true}});console.log(m?'yes':'no');process.exit(0)})()")
[ "$REINSERTED" = "yes" ] && ok "victim re-inserted by sync (insertedCount > 0 -> fan-out fired)" || bad "victim not re-inserted"

PRUNED=$(bun -e "
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
(async()=>{const sub=await db.pushSub.findUnique({where:{endpoint:'$FAKE_EP'}});console.log(sub?'still-there':'pruned');process.exit(0)})()")
[ "$PRUNED" = "pruned" ] && ok "fake FCM sub pruned by fan-out (404/410 handling works)" || bad "fake sub $PRUNED — fan-out did not reach it"

REMAINING=$(bun -e "
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
(async()=>{console.log(await db.pushSub.count());process.exit(0)})()")
[ "$REMAINING" = "0" ] && ok "PushSub table clean after tests" || echo "  NOTE: $REMAINING test sub(s) remain"

[ $FAIL -eq 0 ] && echo "FEATURE-2 FAN-OUT: ALL PASS" || echo "FEATURE-2 FAN-OUT: FAILURES PRESENT"
exit $FAIL
