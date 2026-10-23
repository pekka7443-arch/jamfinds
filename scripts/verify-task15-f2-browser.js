/**
 * Feature 2 — REAL end-to-end push subscription in headless Chromium
 * (global Playwright), then server-side web-push delivery to that REAL
 * subscription (expects 201 Created from FCM = accepted for delivery).
 *
 * Run inside the verify-task15 wrapper (dev server must be up):
 *   node scripts/verify-task15-f2-browser.js
 */
const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright")

const B = "http://localhost:3000"

async function main() {
  // Two test-env quirks, both Chromium-in-test only:
  //  1. headless chromium hard-denies Notification.permission -> run HEADED under Xvfb
  //  2. Push API is disabled in incognito -> launchPersistentContext (real profile),
  //     because Playwright's plain newContext() is incognito by design.
  const browser = await chromium.launchPersistentContext("/tmp/pw-push-profile", {
    headless: false,
    viewport: { width: 1280, height: 800 },
  })
  await browser.grantPermissions(["notifications"], { origin: B })
  const page = browser.pages()[0] ?? (await browser.newPage())
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") console.log("  [console]", msg.type(), msg.text().slice(0, 160))
  })
  page.on("pageerror", (err) => console.log("  [pageerror]", String(err).slice(0, 160)))

  const results = []
  const ok = (m) => { results.push(["PASS", m]); console.log("  PASS:", m) }
  const bad = (m) => { results.push(["FAIL", m]); console.log("  FAIL:", m) }

  try {
    await page.goto(B + "/", { waitUntil: "domcontentloaded", timeout: 60000 })
    await page.waitForSelector("header button", { timeout: 30000 })

    // 1. bell button present in the header
    const bell = page.locator('header button[title*="Notify me"]')
    if (await bell.count() > 0) ok("Notify-me bell visible in header")
    else bad("bell button not found in header")

    // 2. click -> permission (pre-granted) -> SW register -> subscribe -> POST
    await bell.first().click()
    // watch the flow: permission state + any toast error text
    await page.waitForFunction(() => localStorage.getItem("jamfinds:push-endpoint"), null, { timeout: 60000 }).catch(async () => {
      const perm = await page.evaluate(() => (window.Notification ? Notification.permission : "none"))
      const toasts = await page.evaluate(() => document.body.innerText.match(/[^\n]*(blocked|failed|Couldn|not configured|Not supported)[^\n]*/gi) || [])
      console.log("  [debug] permission:", perm, "| toast:", (toasts[0] || "none").slice(0, 120))
      throw new Error("subscribe did not complete in 60s")
    })
    const stored = await page.evaluate(() => localStorage.getItem("jamfinds:push-endpoint"))
    if (stored && stored.startsWith("https://")) ok("subscription persisted in localStorage (endpoint " + stored.slice(0, 48) + "…)")
    else bad("localStorage endpoint missing: " + stored)

    // bell now shows the subscribed state
    const on = page.locator('header button[title*="on"]')
    if (await on.count() > 0) ok("bell switched to subscribed state")
    else bad("bell did not switch to subscribed state")

    // 3. service worker actually controlling the page
    const swState = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      return reg.active ? reg.active.scriptURL : ""
    })
    if (swState.includes("/sw.js")) ok("service worker active: " + swState)
    else bad("sw not active: " + swState)

    // 4. server stored the REAL subscription
    const { PrismaClient } = require("@prisma/client")
    const db = new PrismaClient()
    const row = await db.pushSub.findUnique({ where: { endpoint: stored } })
    if (row) {
      const keys = JSON.parse(row.keys)
      if (keys.p256dh && keys.auth) ok("PushSub row stored with p256dh+auth keys")
      else bad("PushSub keys incomplete")
    } else bad("no PushSub row for the browser endpoint")

    // 5. REAL push delivery: web-push to the browser's endpoint (FCM 201)
    if (row) {
      const webpush = require("web-push")
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || "mailto:admin@jamfinds.space-z.ai",
        process.env.VAPID_PUBLIC,
        process.env.VAPID_PRIVATE,
      )
      const payload = JSON.stringify({ title: "🔥 1 new mod just dropped", body: "Task 15 delivery test", url: "/mod/" + (await db.mod.findFirst({ select: { id: true }, orderBy: { publishedAt: "desc" } })).id })
      try {
        const res = await webpush.sendNotification({ endpoint: row.endpoint, keys: JSON.parse(row.keys) }, payload)
        if (res.statusCode === 201) ok("web-push delivered to FCM (201 Created) — VAPID + payload encryption valid")
        else bad("unexpected push status " + res.statusCode)
      } catch (e) {
        bad("sendNotification threw: " + e.statusCode + " " + e.message)
      }
    }

    // 6. toggle off: click again -> unsubscribe + DELETE
    await on.first().click()
    await page.waitForFunction(() => !localStorage.getItem("jamfinds:push-endpoint"), null, { timeout: 15000 })
    ok("toggle off clears localStorage")
    const after = row ? await db.pushSub.findUnique({ where: { endpoint: stored } }) : null
    if (!after) ok("server row removed after unsubscribe")
    else bad("server row still present after unsubscribe")
    await db.$disconnect()
  } catch (e) {
    bad("exception: " + e.message.split("\n")[0])
  }

  await browser.close()
  const fails = results.filter((r) => r[0] === "FAIL").length
  console.log(fails === 0 ? "FEATURE-2 BROWSER: ALL PASS" : "FEATURE-2 BROWSER: FAILURES PRESENT")
  process.exit(fails === 0 ? 0 : 1)
}

main()
