const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const IDS = [96, 2, 4, 7, 11, 15, 20, 27, 33, 41, 55, 62, 74, 88, 103, 120]
const FILE_HOST_RE = /modsfire\.com|mediafire\.com|pixeldrain\.com|drive\.google\.com\/file|dropbox\.com/
for (const id of IDS) {
  try {
    const html = await (await fetch(`https://beamfree.pro/mod/${id}`, { headers: { "User-Agent": UA } })).text()
    const hrefs = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]).filter((u) => FILE_HOST_RE.test(u) && !/beamfree/.test(u))
    if (hrefs.length) console.log(`mod/${id}: ${[...new Set(hrefs)].join(" , ")}`)
  } catch (e) { /* skip */ }
  await new Promise((r) => setTimeout(r, 900))
}
console.log("scan done")
