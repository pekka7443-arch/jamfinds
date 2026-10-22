// Test the exact curlPostJson invocation used by the new scraper.
const { execFile } = require("node:child_process");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

const payload = { page: 1, limit: 1, sort: "newest" };
const url = "https://beamfinds.com/api/mods/list";
const args = [
  "-s",
  "--http1.1",
  "--max-time",
  "15",
  "-w",
  "\n%{http_code}",
  "-X",
  "POST",
  "-H",
  "Content-Type: application/json",
  "-H",
  "Accept: application/json",
  "-H",
  "Accept-Language: en-US,en;q=0.9",
  "-A",
  UA,
  "--data",
  JSON.stringify(payload),
  url,
];
execFile("curl", args, { timeout: 17000, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
  if (err) return console.error("ERR:", err.message, "stderr:", String(stderr).slice(0, 300));
  const idx = stdout.lastIndexOf("\n");
  const body = stdout.slice(0, idx);
  const status = stdout.slice(idx + 1).trim();
  console.log("status:", status, "body bytes:", body.length);
  try {
    const j = JSON.parse(body);
    console.log("parsed OK — total:", j.total, "mods:", (j.mods || []).length);
  } catch (e) {
    console.log("PARSE FAIL, first 200:", body.slice(0, 200));
  }
});
