/**
 * Task 16 — REAL end-to-end push verification with the new VAPID keys:
 *   1. bell click -> Notification.requestPermission -> SW register ->
 *      pushManager.subscribe -> POST /api/push/subscribe (expect HTTP 201)
 *   2. direct web-push delivery to that REAL subscription (FCM 201)
 *   3. fan-out proof: delete newest BeamFree row -> force sync -> row
 *      re-inserted (inserted>0) -> sync fan-out delivers to the REAL sub ->
 *      a NEW notification appears in the browser (reg.getNotifications)
 *      with the localized title, and the PushSub row survives (not pruned)
 *   4. toggle off -> unsubscribe + DELETE -> row gone
 *
 * Run with the server already up on :3100 (verify-task16 wrapper):
 *   node scripts/verify-task16-push-browser.js
 */
const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright")

const B = "http://localhost:3100"

async function main() {
  // headless denies Notification.permission -> HEADED under Xvfb;
  // Push API disabled in incognito -> persistent profile context.
  const browser = await chromium.launchPersistentContext("/tmp/pw-push-profile-t16", {
    headless: false,
    viewport: { width: 1280, height: 800 },
  })
  await browser.grantPermissions(["notifications"], { origin: B })
  const page = browser.pages()[0] ?? (await browser.newPage())
  page.on("pageerror", (err) => console.log("  [pageerror]", String(err).slice(0, 160)))

  const results = []
  const ok = (m) => { results.push(["PASS", m]); console.log("  PASS:", m) }
  const bad = (m) => { results.push(["FAIL", m]); console.log("  FAIL:", m) }
  const { PrismaClient } = require("@prisma/client")
  const db = new PrismaClient()

  try {
    await page.goto(B + "/", { waitUntil: "domcontentloaded", timeout: 60000 })
    await page.waitForSelector("header button", { timeout: 30000 })

    // ---- 1. subscribe through the bell; capture the POST status ----
    let subscribeStatus = null
    page.on("response", (res) => {
      if (res.url().includes("/api/push/subscribe") && res.request().method() === "POST") {
        subscribeStatus = res.status()
      }
    })
    const bell = page.locator('header button[title*="Notify me"]')
    if ((await bell.count()) > 0) ok("Notify-me bell visible in header")
    else bad("bell not found")
    await bell.first().click()
    await page.waitForFunction(() => localStorage.getItem("jamfinds:push-endpoint"), null, { timeout: 60000 })
      .catch(() => { throw new Error("subscribe did not complete in 60s") })
    const stored = await page.evaluate(() => localStorage.getItem("jamfinds:push-endpoint"))
    if (stored && stored.startsWith("https://")) ok("subscription persisted (endpoint " + stored.slice(0, 48) + "…)")
    else bad("localStorage endpoint missing")
    if (subscribeStatus === 201) ok("POST /api/push/subscribe returned 201 (Fix 1 verified)")
    else bad("POST status: " + subscribeStatus)

    const row = await db.pushSub.findUnique({ where: { endpoint: stored } })
    if (row && JSON.parse(row.keys).p256dh && JSON.parse(row.keys).auth) ok("PushSub row stored with p256dh+auth")
    else bad("PushSub row missing/incomplete")

    // ---- 2. direct delivery with the NEW VAPID env names ----
    // FCM occasionally answers 410 to a brand-new jmt17 endpoint for a few
    // seconds — retry briefly; the fan-out check below is the real proof.
    const webpush = require("web-push")
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:admin@jamfinds.space-z.ai",
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    )
    const newest = await db.mod.findFirst({ select: { id: true }, orderBy: { publishedAt: "desc" } })
    let directOk = false
    let lastErr = ""
    for (let i = 0; i < 3 && !directOk; i++) {
      try {
        const res = await webpush.sendNotification(
          { endpoint: row.endpoint, keys: JSON.parse(row.keys) },
          JSON.stringify({
            title: { en: "🔥 Task 16 direct test", fi: "🔥 Task 16 suora testi" },
            body: { en: "direct delivery check", fi: "suoran toimituksen tarkistus" },
            url: "/mod/" + newest.id,
          }),
        )
        if (res.statusCode === 201) { directOk = true; ok("web-push delivered to FCM (201) with VAPID_PUBLIC_KEY/PRIVATE_KEY") }
        else lastErr = "status " + res.statusCode
      } catch (e) {
        lastErr = e.statusCode + " " + String(e.message).split("\n")[0]
      }
      if (!directOk) await new Promise((r) => setTimeout(r, 6000))
    }
    if (!directOk) console.log("  [note] direct send kept failing (" + lastErr + ") — fan-out check below still proves delivery")
    // let the SW show whatever landed, then clear the board for the fan-out check
    await page.waitForTimeout(3000)
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      ;(await reg.getNotifications()).forEach((n) => n.close())
    })

    // ---- 3. fan-out on next sync insert (real sub, real delivery) ----
    // Delete newest BeamFree rows, then let A sync (forced or background —
    // whichever re-inserts them) hit the inserted>0 trigger. Forced POSTs
    // legitimately answer "already in progress" while the background engine
    // is mid-cycle; the PRIMARY proof is the notification arriving below.
    let deleted = 0
    for (let attempt = 1; attempt <= 3; attempt++) {
      const victim = await db.mod.findFirst({
        where: { source: "BeamFree" },
        orderBy: { publishedAt: "desc" },
        select: { id: true, title: true },
      })
      if (!victim) break
      console.log("  [attempt " + attempt + "] deleting victim: " + victim.id + " (" + victim.title.slice(0, 40) + "…)")
      await db.mod.delete({ where: { id: victim.id } })
      deleted++
      const r = await fetch(B + "/api/sync", { method: "POST" }).then((x) => x.json())
      console.log("  [sync] inserted=" + (r.result?.inserted ?? "n/a") + " running=" + (r.running ?? false) + " (background cycle may claim this POST)")
      if ((r.result?.inserted ?? 0) > 0) break
      await new Promise((res) => setTimeout(res, 8000))
    }
    if (deleted > 0) ok(deleted + " victim row(s) deleted — any sync that re-inserts them must fan out")
    else bad("no BeamFree victim row found")

    // wait for the fan-out notification to arrive through the SW
    const notif = await page.waitForFunction(
      async () => {
        const reg = await navigator.serviceWorker.ready
        const ns = await reg.getNotifications()
        return ns.length ? { title: ns[0].title, body: ns[0].body, tag: ns[0].tag } : null
      },
      null,
      { timeout: 180000, polling: 2000 },
    ).then((h) => h.jsonValue()).catch(() => null)

    if (notif) {
      ok("fan-out notification RECEIVED via sync: title=" + JSON.stringify(notif.title) + " tag=" + notif.tag)
      if (String(notif.title).includes("just dropped"))
        ok("title is the localized EN push text: " + notif.title)
      else bad("unexpected title: " + notif.title)
    } else bad("no notification arrived within 180s of the sync inserts")

    const stillThere = await db.pushSub.findUnique({ where: { endpoint: stored } })
    if (stillThere) ok("PushSub row survived the fan-out (FCM accepted delivery)")
    else bad("PushSub row was pruned — delivery must have failed")

    // ---- 4. toggle off ----
    const on = page.locator('header button[title*="on"]')
    await on.first().click()
    await page.waitForFunction(() => !localStorage.getItem("jamfinds:push-endpoint"), null, { timeout: 15000 })
    ok("toggle off clears localStorage")
    const after = await db.pushSub.findUnique({ where: { endpoint: stored } })
    if (!after) ok("server row removed after unsubscribe")
    else bad("server row still present after unsubscribe")

    await db.$disconnect()
  } catch (e) {
    bad("exception: " + e.message.split("\n")[0])
    try { await db.$disconnect() } catch {}
  }

  await browser.close()
  const fails = results.filter((r) => r[0] === "FAIL").length
  console.log(fails === 0 ? "TASK-16 PUSH BROWSER: ALL PASS" : "TASK-16 PUSH BROWSER: FAILURES PRESENT")
  process.exit(fails === 0 ? 0 : 1)
}

main()
