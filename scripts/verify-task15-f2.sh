#!/bin/bash
# Feature 2 HTTP checks: sw.js served, push config, subscribe/unsubscribe API.
set -uo pipefail
cd /home/z/my-project
B="http://localhost:3000"
FAIL=0
ok()  { echo "  PASS: $1"; }
bad() { echo "  FAIL: $1"; FAIL=1; }

echo "--- service worker ---"
CT=$(curl -s -o /tmp/f2_sw.js -w "%{http_code} %{content_type}" --max-time 30 "$B/sw.js")
echo "        /sw.js -> $CT"
echo "$CT" | grep -q "^200" && ok "sw.js served" || bad "sw.js status: $CT"
node --check public/sw.js && ok "sw.js syntax valid" || bad "sw.js syntax"
grep -q "addEventListener(\"push\"" public/sw.js && ok "sw.js has push handler" || bad "no push handler"
grep -q "notificationclick" public/sw.js && ok "sw.js has notificationclick handler" || bad "no click handler"

echo "--- push config ---"
PK=$(curl -s --max-time 30 "$B/api/push/subscribe")
echo "$PK" | grep -q "publicKey" && ok "GET /api/push/subscribe returns publicKey" || bad "no publicKey: $PK"

echo "--- subscribe API ---"
ENDPOINT="https://fcm.googleapis.com/fcm/send/test-endpoint-$(date +%s)"
# format-valid keys: 65-byte P-256 point + 16-byte auth (as browsers send)
PK="BFTuaMgsqPGAztUY8mFWCMsrahKqGc2dGfEQbTMnCSI-tb-zkTCJDFeT7SCm9QTaIofWmHDFk8oBu6UxClvnIJg"
AUTH="EoKnNLPnef4ZK6PkYTf1vw"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 -X POST "$B/api/push/subscribe" -H "Content-Type: application/json" \
  -d "{\"endpoint\":\"$ENDPOINT\",\"keys\":{\"p256dh\":\"$PK\",\"auth\":\"$AUTH\"}}")
[ "$CODE" = "200" ] && ok "POST /api/push/subscribe stores valid payload (200)" || bad "POST -> $CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 -X POST "$B/api/push/subscribe" -H "Content-Type: application/json" \
  -d "{\"endpoint\":\"$ENDPOINT\",\"keys\":{\"p256dh\":\"tooshort\",\"auth\":\"aXZlcnl0b2tlbg\"}}")
[ "$CODE" = "400" ] && ok "format-invalid keys rejected (400)" || bad "invalid keys -> $CODE"

# well-formed fake FCM endpoint + FORMAT-VALID keys (65B p256dh / 16B auth)
# so web-push actually POSTs and FCM answers 404 -> fan-out prune path
EP=$(cd /home/z/my-project && bun -e "
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
const c=require('crypto').createECDH('prime256v1');c.generateKeys();
const p256dh=c.getPublicKey('base64url');const auth=require('crypto').randomBytes(16).toString('base64url');
(async()=>{
  const ep='https://fcm.googleapis.com/fcm/send/fake-prune-me-'+Date.now();
  await db.pushSub.create({data:{endpoint:ep,keys:JSON.stringify({p256dh,auth})}});
  console.log(ep);process.exit(0);
})().catch(()=>process.exit(1))")
[ -n "$EP" ] && ok "fake FCM sub stored for prune test" || bad "could not store fake sub"
ROW=$(cd /home/z/my-project && bun -e "
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
(async()=>{const n=await db.pushSub.count();console.log(n);process.exit(0)})()")
[ "${ROW:-0}" -ge 1 ] && ok "PushSub rows in DB: $ROW" || bad "no PushSub rows"

echo "--- invalid payloads rejected ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 -X POST "$B/api/push/subscribe" -H "Content-Type: application/json" -d '{"endpoint":"http://insecure.example/x","keys":{}}')
[ "$CODE" = "400" ] && ok "http endpoint rejected (400)" || bad "http endpoint -> $CODE"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 -X POST "$B/api/push/subscribe" -H "Content-Type: application/json" -d 'not json')
[ "$CODE" = "400" ] && ok "garbage body rejected (400)" || bad "garbage body -> $CODE"

echo "--- unsubscribe ---"
CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 -X DELETE "$B/api/push/subscribe" -H "Content-Type: application/json" -d "{\"endpoint\":\"$ENDPOINT\"}")
[ "$CODE" = "200" ] && ok "DELETE accepted" || bad "DELETE -> $CODE"

echo "FAKE_EP=$EP" > /tmp/f2_fake_ep.env
[ $FAIL -eq 0 ] && echo "FEATURE-2 HTTP: ALL PASS" || echo "FEATURE-2 HTTP: FAILURES PRESENT"
exit $FAIL
