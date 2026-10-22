const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const IDS = [130, 145, 160, 175, 190, 205, 220, 235, 250, 265, 280, 295, 310, 325, 340, 355, 370, 385, 400, 415, 430, 445, 460, 475, 490, 505, 520, 535, 550, 565]
const FILE_HOST_RE = /modsfire\.com|mediafire\.com|pixeldrain\.com|drive\.google\.com\/file|dropbox\.com/
let found = 0
for (const id of IDS) {
  try {
    const res = await fetch(`https://beamfree.pro/mod/${id}`, { headers: { "User-Agent": UA } })
    if (!res.ok) continue
    const html = await res.text()
    const hrefs = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]).filter((u) => FILE_HOST_RE.test(u))
    if (hrefs.length) { console.log(`mod/${id}: ${[...new Set(hrefs)].join(" , ")}`); found++ }
  } catch {}
  await new Promise((r) => setTimeout(r, 850))
}
console.log(`done, ${found}/${IDS.length} with creator links`)
