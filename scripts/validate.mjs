/* Dev-only sanity checker for data/locations.js. Zero dependencies.
   Run: node scripts/validate.mjs */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "data", "locations.js"), "utf8");

let failures = 0;
let warnings = 0;
const fail = (msg) => { failures++; console.error("  FAIL  " + msg); };
const warn = (msg) => { warnings++; console.warn("  warn  " + msg); };
const pass = (msg) => console.log("  ok    " + msg);

/* ---- The file must be exactly `window.BUCEES_DATA = <strict JSON>;` ---- */
const PREFIX = "window.BUCEES_DATA = ";
if (!raw.startsWith(PREFIX)) {
  fail(`file must start with '${PREFIX}'`);
  process.exit(1);
}
const payload = raw.slice(PREFIX.length).trim().replace(/;$/, "");
let data;
try {
  data = JSON.parse(payload);
  pass("payload parses as strict JSON");
} catch (e) {
  fail("payload is not strict JSON: " + e.message);
  process.exit(1);
}

const { meta, locations } = data;
if (!meta || !meta.asOf || !Array.isArray(locations)) {
  fail("missing meta.asOf or locations array");
  process.exit(1);
}

/* ---- Helpers (same month math as the client) ---- */
const MIN_YEAR = 1982;
const DATE_RE = /^\d{4}(-(0[1-9]|1[0-2]))?$/;
const toIndex = (str) => {
  const [y, m] = String(str).split("-").map(Number);
  return (y - MIN_YEAR) * 12 + ((m || 7) - 1);
};

/* ---- Per-location schema checks ---- */
const STATUSES = new Set(["open", "announced", "speculative"]);
const KINDS = new Set(["store", "travel-center"]);
const DATE_PRECISIONS = new Set(["month", "year", "estimated"]);
const GEO_PRECISIONS = new Set(["store", "city", "metro"]);
const ids = new Set();

for (const loc of locations) {
  const tag = loc.id || loc.name || "<unnamed>";
  for (const f of ["id", "name", "city", "state", "lat", "lng", "geoPrecision",
                   "status", "kind", "date", "datePrecision"]) {
    if (loc[f] === undefined) fail(`${tag}: missing field '${f}'`);
  }
  if (ids.has(loc.id)) fail(`duplicate id: ${loc.id}`);
  ids.add(loc.id);
  if (loc.id && !/^[a-z]{2}-[a-z0-9-]+$/.test(loc.id)) fail(`${tag}: bad id format`);
  if (!STATUSES.has(loc.status)) fail(`${tag}: bad status '${loc.status}'`);
  if (!KINDS.has(loc.kind)) fail(`${tag}: bad kind '${loc.kind}'`);
  if (!DATE_PRECISIONS.has(loc.datePrecision)) fail(`${tag}: bad datePrecision`);
  if (!GEO_PRECISIONS.has(loc.geoPrecision)) fail(`${tag}: bad geoPrecision`);
  if (!DATE_RE.test(String(loc.date))) fail(`${tag}: bad date '${loc.date}'`);
  if (loc.closed !== undefined && !DATE_RE.test(String(loc.closed))) {
    fail(`${tag}: bad closed date`);
  }
  if (loc.datePrecision === "month" && !String(loc.date).includes("-")) {
    fail(`${tag}: datePrecision 'month' but date is year-only`);
  }
  if (typeof loc.lat !== "number" || typeof loc.lng !== "number" ||
      loc.lat < 24 || loc.lat > 50 || loc.lng < -125 || loc.lng > -66) {
    fail(`${tag}: lat/lng outside continental US (${loc.lat}, ${loc.lng})`);
  }
  if (loc.status === "speculative") {
    if (!loc.rationale) fail(`${tag}: speculative entry missing rationale`);
    if (loc.geoPrecision !== "metro") warn(`${tag}: speculative should be geoPrecision 'metro'`);
    const y = Number(String(loc.date).slice(0, 4));
    if (y < 2028 || y > 2032) fail(`${tag}: speculative date ${loc.date} outside 2028-2032`);
    if (loc.datePrecision !== "estimated") fail(`${tag}: speculative must be datePrecision 'estimated'`);
  } else {
    if (loc.rationale) fail(`${tag}: rationale is only for speculative entries`);
    if (!loc.source) fail(`${tag}: ${loc.status} entry missing source`);
    if (loc.geoPrecision === "metro") fail(`${tag}: geoPrecision 'metro' is speculative-only`);
  }
  if (loc.status === "announced") {
    const y = Number(String(loc.date).slice(0, 4));
    if (y < 2026 || y > 2029) fail(`${tag}: announced date ${loc.date} outside 2026-2029`);
    if (toIndex(loc.date) <= toIndex(meta.compiled.slice(0, 7))) {
      warn(`${tag}: announced but expected date ${loc.date} is in the past — review status`);
    }
  }
}
pass(`${locations.length} locations pass schema checks (pre-existing failures listed above, if any)`);

/* ---- Historical invariants ---- */
const asOfIdx = toIndex(meta.asOf.date);
const openAt = (t) => locations.filter((l) =>
  l.status === "open" && toIndex(l.date) <= t &&
  (l.closed === undefined || toIndex(l.closed) > t));

const atAsOf = openAt(asOfIdx);
const states = new Set(atAsOf.map((l) => l.state));
const check = (label, actual, expected) => {
  if (actual === expected) pass(`${label}: ${actual}`);
  else fail(`${label}: expected ${expected}, got ${actual}`);
};

check(`open locations as of ${meta.asOf.date}`, atAsOf.length, meta.asOf.openCount);
check(`states as of ${meta.asOf.date}`, states.size, meta.asOf.stateCount);
check(`Texas locations as of ${meta.asOf.date}`,
  atAsOf.filter((l) => l.state === "TX").length, meta.asOf.txCount);

const sorted = [...locations].sort((a, b) => toIndex(a.date) - toIndex(b.date));
const first = sorted[0];
if (first.city === "Lake Jackson" && first.date.startsWith("1982")) {
  pass("first location is 1982 Lake Jackson");
} else {
  fail(`first location is ${first.city} ${first.date}, expected Lake Jackson 1982`);
}

const firstTC = sorted.find((l) => l.kind === "travel-center");
if (firstTC && firstTC.city === "Luling" && firstTC.date.startsWith("2003")) {
  pass("first travel center is 2003 Luling");
} else {
  fail(`first travel center is ${firstTC && firstTC.city} ${firstTC && firstTC.date}, expected Luling 2003`);
}

const firstOOS = sorted.find((l) => l.status === "open" && l.state !== "TX");
if (firstOOS && firstOOS.state === "AL" && firstOOS.date.startsWith("2019")) {
  pass("first out-of-state is 2019 Alabama");
} else {
  fail(`first out-of-state is ${firstOOS && firstOOS.city}, ${firstOOS && firstOOS.state} ${firstOOS && firstOOS.date}, expected AL 2019`);
}

const nSpec = locations.filter((l) => l.status === "speculative").length;
if (nSpec >= 15 && nSpec <= 25) pass(`speculative entries: ${nSpec} (target 15-25)`);
else warn(`speculative entries: ${nSpec}, target was 15-25`);

console.log(`\n${failures} failure(s), ${warnings} warning(s), ${locations.length} locations` +
  ` (${locations.filter((l) => l.status === "open").length} open, ` +
  `${locations.filter((l) => l.status === "announced").length} announced, ${nSpec} speculative)`);
process.exit(failures ? 1 : 0);
