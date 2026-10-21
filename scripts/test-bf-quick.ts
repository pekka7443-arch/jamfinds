// Verify quick-mode fetchBeamfinds (POST endpoint, 2 pages) + total probe.
import { fetchBeamfinds, fetchBeamfindsTotal } from "@/lib/scrapers";

const total = await fetchBeamfindsTotal();
console.log("probe total:", total);

const entries = await fetchBeamfinds(2);
console.log("quick mode entries:", entries.length);
const first = entries[0];
console.log("first:", first.id, "|", first.title.slice(0, 50), "| catHint:", first.catHint, "| thumb:", first.thumbnail?.slice(0, 60));
const withText = entries.filter((e) => e.text.length > 0).length;
console.log("entries with rich text:", withText, "/", entries.length);
const hints = new Map<string, number>();
for (const e of entries) hints.set(e.catHint ?? "(none)", (hints.get(e.catHint ?? "(none)") ?? 0) + 1);
console.log("hints:", [...hints.entries()].map(([k, v]) => `${k}=${v}`).join(", "));
