import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
function curl(args: string[], timeoutMs = 20_000): Promise<{ status: number; headers: string; body: string }> {
  return new Promise((resolve, reject) => {
    execFile("curl", ["-i", ...args], { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && (err as any).killed) return reject(new Error("curl timeout"))
      if (err && !stdout) return reject(new Error(`curl failed: ${stderr.slice(0, 200)}`))
      const chunks = stdout.split(/\r?\n(?=HTTP\/[\d.]+\s+\d{3})/).filter((c: string) => c.trim())
      const last = chunks[chunks.length - 1] ?? ""
      const sep = last.match(/\r?\n\r?\n/)
      const idx = sep?.index ?? -1
      resolve({
        status: Number(last.match(/HTTP\/[\d.]+\s+(\d{3})/)?.[1] ?? 0),
        headers: idx >= 0 ? last.slice(0, idx) : last,
        body: idx >= 0 ? last.slice(idx + sep![0].length) : "",
      })
    })
  })
}
async function run(url: string) {
  const jar = `/tmp/dbg-${randomUUID()}.jar`
  const base = ["-s", "--http1.1", "-A", UA, "-b", jar, "-c", jar]
  const FOLLOW = ["--location", "--max-redirs", "4"]
  console.log("== step1", url)
  const s1 = await curl([...base, ...FOLLOW, url])
  console.log("status", s1.status, "len", s1.body.length)
  const dlPath = s1.body.match(/href="(\/download\/[A-Za-z0-9]+\/[a-z0-9]+)"/)?.[1]
  console.log("dlPath:", dlPath)
  if (!dlPath) { console.log("body head:", s1.body.slice(0, 300)); return }
  const s2 = await curl([...base, ...FOLLOW, "-e", url, `https://modsfire.com${dlPath}`])
  const dPath = s2.body.match(/href="(\/d\/[A-Za-z0-9]+)"/)?.[1]
  console.log("step2 status", s2.status, "dPath:", dPath)
  if (!dPath) { console.log("body head:", s2.body.slice(0, 300)); return }
  const s3 = await curl([...base, "-e", `https://modsfire.com${dlPath}`, "-D", "-", "-o", "/dev/null", `https://modsfire.com${dPath}`])
  const loc = s3.headers.match(/^[Ll]ocation:\s*(\S+)/m)?.[1]
  console.log("step3 status", s3.status, "loc:", loc?.slice(0, 100))
  if (!loc) return
  // probe the signed URL exactly like probeFileInfoFull does
  execFile("curl", ["-s", "--http1.1", "--max-time", "20", "--max-redirs", "4", "--proto", "=https", "--proto-redir", "=https", "-A", UA, "-e", url, "-r", "0-0", "-o", "/dev/null", "-D", "-", loc], (err, stdout) => {
    console.log("--- probe headers:"); console.log(String(stdout).split("\r\n").slice(0, 14).join("\n"))
  })
}
run(process.argv[2] ?? "https://modsfire.com/B6294i44Dq2Gf4h")
