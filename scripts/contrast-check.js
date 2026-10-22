// WCAG 2.x contrast check for the Violet Ink palette (oklch -> sRGB -> relative luminance)
function oklchToSrgb(L, C, H) {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr), b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const lin = [r, g, bb].map((v) => Math.max(0, Math.min(1, v)));
  return lin.map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
}
function srgbBlend(fg, alpha, bg) {
  return fg.map((f, i) => f * alpha + bg[i] * (1 - alpha));
}
function wcagLum(rgb) {
  const lin = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function ratio(fg, bg) {
  const [l1, l2] = [wcagLum(fg), wcagLum(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}
const bg = oklchToSrgb(0.148, 0.011, 293);
const card = oklchToSrgb(0.212, 0.016, 293);
const fg = oklchToSrgb(0.965, 0.008, 293);
const muted = oklchToSrgb(0.72, 0.022, 293);
const primary = oklchToSrgb(0.702, 0.183, 293.5);
const ink = oklchToSrgb(0.175, 0.045, 293);
const rows = [
  ["foreground on background", fg, bg, 4.5],
  ["muted-foreground on background", muted, bg, 4.5],
  ["foreground on card", fg, card, 4.5],
  ["muted-foreground on card", muted, card, 4.5],
  ["primary (accent text) on background", primary, bg, 4.5],
  ["primary (accent text) on card", primary, card, 4.5],
  ["primary-foreground (ink) on primary fill", ink, primary, 4.5],
  ["primary fill vs background (UI 3:1)", primary, bg, 3.0],
];
console.log("pair".padEnd(46), "ratio  AA?");
for (const [name, f, b, need] of rows) {
  const r = ratio(f, b);
  console.log(name.padEnd(46), r.toFixed(2).padStart(5), r >= need ? "PASS" : `FAIL (need ${need})`);
}
// badge text on its own tint (worst case: badge color text on badge bg over card)
const badgeText = oklchToSrgb(0.84, 0.11, 293);
const badgeBgOverCard = srgbBlend(oklchToSrgb(0.7, 0.11, 293), 0.13, card);
const r = ratio(badgeText, badgeBgOverCard);
console.log("badge text on badge tint (over card)".padEnd(46), r.toFixed(2).padStart(5), "(informational, small caps labels)");
