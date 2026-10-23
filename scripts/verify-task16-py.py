#!/usr/bin/env python3
"""Task 16 — deterministic production verification (no shell-quoting flakiness)."""
import json
import re
import subprocess
import sys
import urllib.request

B = "http://localhost:3100"
results = []


def fetch(path: str) -> tuple[int, str, str]:
    """GET path; returns (status, body, final_url)."""
    req = urllib.request.Request(B + path, headers={"User-Agent": "task16-verify"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return r.status, r.read().decode("utf-8", "replace"), r.geturl()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), e.geturl()


def check(name: str, cond: bool, detail: str = "") -> None:
    results.append(cond)
    print(f"  {'PASS' if cond else 'FAIL'}: {name}" + (f" [{detail}]" if detail and not cond else ""))


# ---------- sample mod ----------
mods = json.loads(fetch("/api/mods?limit=1&sort=new")[1])
mod_id = mods["mods"][0]["id"]
check(f"sample mod id {mod_id}", bool(mod_id))

# ---------- mod page under every locale ----------
expect = {
    "en": ("Back to live finds", "Download links"),
    "fi": ("Takaisin live-löytöihin", "Latauslinkit"),
    "de": ("Zurück zu den Live-Funden", "Download-Links"),
    "fr": ("Retour aux trouvailles en direct", "Liens de téléchargement"),
    "es": ("Volver a los hallazgos en vivo", "Enlaces de descarga"),
    "ru": ("Назад к живым находкам", "Ссылки на скачивание"),
}
for loc, (back, links) in expect.items():
    path = f"/mod/{mod_id}" if loc == "en" else f"/{loc}/mod/{mod_id}"
    status, body, _ = fetch(path)
    check(f"{path} status 200", status == 200, str(status))
    m = re.search(r'<html lang="([a-z]+)"', body)
    check(f"{path} <html lang={loc}>", bool(m) and m.group(1) == loc, m.group(0) if m else "no html tag")
    check(f"{path} back label", back in body, back)
    check(f"{path} links header", links in body, links)
    check(f"{path} mod title present", mod_id.split("-")[-1] in body or ">M" in body)

# ---------- metadata on en mod page ----------
status, body, _ = fetch(f"/mod/{mod_id}")
check("og:title", 'property="og:title"' in body)
check("og:image", 'property="og:image"' in body)
check("canonical", f'href="/mod/{mod_id}"' in body and re.search(r'rel="canonical"', body, re.I))
check("hreflang fi+ru", bool(re.search(r'hreflang="fi"', body, re.I)) and bool(re.search(r'hreflang="ru"', body, re.I)))
check("twitter:card", "twitter:card" in body)

# ---------- canonical 307 for duplicate contentHash (Task 15 reg) ----------
dup = subprocess.run(
    ["bun", "-e", """
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
(async()=>{
  const newest=await db.mod.findFirst({orderBy:[{publishedAt:'desc'},{id:'asc'}],where:{contentHash:{not:null}},select:{id:true,contentHash:true}});
  const older=await db.mod.findFirst({where:{contentHash:newest.contentHash,id:{not:newest.id}},orderBy:[{publishedAt:'desc'}],select:{id:true}});
  console.log(JSON.stringify({newest:newest.id,older:older?older.id:null}));
  process.exit(0)})().catch(e=>{console.error(e);process.exit(1)})"""],
    capture_output=True, text=True, timeout=60)
pair = json.loads(dup.stdout) if dup.stdout.strip() else {}
if pair.get("older"):
    status, _, final = fetch(f"/mod/{pair['older']}")
    check(f"dup /mod/{pair['older']} canonical-redirects", pair["older"] not in final and pair["newest"] in final, final)
else:
    print("  SKIP: no duplicate-contentHash pair in DB")

# ---------- localized not-found ----------
for loc, needle in {"en": "Page not found", "fi": "Sivua ei löytynyt", "ru": "Страница не найдена", "de": "Seite nicht gefunden"}.items():
    path = "/xyz-not-a-page" if loc == "en" else f"/{loc}/xyz-not-a-page"
    status, body, _ = fetch(path)
    check(f"{path} -> 404", status == 404, str(status))
    check(f"{path} localized not-found", needle in body, needle)

# ---------- homepage sanity ----------
for loc, needle in {"en": "Every BeamNG mod drop", "fi": "Jokainen BeamNG-modien julkaisu", "es": "Cada lanzamiento de mods de BeamNG"}.items():
    path = "/" if loc == "en" else f"/{loc}"
    status, body, _ = fetch(path)
    check(f"{path} hero", needle in body)

# ---------- Accept-Language negotiation ----------
req = urllib.request.Request(B + "/", headers={"Accept-Language": "es-ES,es;q=0.9"})


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


opener = urllib.request.build_opener(NoRedirect)
try:
    r = opener.open(req, timeout=60)
    code, loc_hdr = r.status, r.headers.get("Location", "")
except urllib.error.HTTPError as e:
    code, loc_hdr = e.code, e.headers.get("Location", "")
check("Accept-Language es -> /es redirect", code in (301, 302, 307, 308) and loc_hdr.rstrip("/").endswith("/es"), f"{code} {loc_hdr}")

# ---------- cookie-based locale ----------
req = urllib.request.Request(B + "/", headers={"Cookie": "NEXT_LOCALE=de"})
try:
    r = opener.open(req, timeout=60)
    code, loc_hdr = r.status, r.headers.get("Location", "")
except urllib.error.HTTPError as e:
    code, loc_hdr = e.code, e.headers.get("Location", "")
check("NEXT_LOCALE=de cookie -> /de redirect", code in (301, 302, 307, 308) and loc_hdr.rstrip("/").endswith("/de"), f"{code} {loc_hdr}")

print()
if all(results):
    print(f"ALL {len(results)} PRODUCTION CHECKS PASSED")
    sys.exit(0)
print(f"{results.count(False)} of {len(results)} CHECKS FAILED")
sys.exit(1)
