# Dataset methodology

`locations.js` was hand-compiled on **2026-08-25** from public sources. The file
is a strict-JSON payload wrapped in `window.BUCEES_DATA = …;` (so it loads from
`file://` without CORS issues). After any edit, run `node scripts/validate.mjs`
from the repo root — it enforces the schema and the historical invariants below.

## Sources and cross-checking

Compiled from, in order of precedence when sources conflicted:

1. Buc-ee's press releases and company statements (Newswire/PR Newswire)
2. Local news grand-opening / groundbreaking coverage (Victoria Advocate,
   Dayton Daily News, WRAL, KCTV5, AZFamily, Arkansas Democrat-Gazette, …)
3. Wikipedia ([Buc-ee's](https://en.wikipedia.org/wiki/Buc-ee%27s)) and
   long-form journalism (Texas Monthly "The Path to World Domination",
   Houston Historic Retail "A journey through Buc-ee's turbulent youth", 2021)
4. Fan/tracker sites (roadtripbeaver.com, buceeslocation.com, buceemenu.com)
   and the official buc-ees.com location list

Opening dates were cross-checked against at least two sources where possible.
`datePrecision` records how solid each date is: `month` (documented), `year`
(year documented, month not), `estimated` (best guess — rendered with `~` in
the UI). Dates are stored as `"YYYY"` or `"YYYY-MM"` strings; year-only dates
are placed mid-year (July) on the timeline.

## Coordinates

`geoPrecision: "store"` = the actual site/interstate exit; `"city"` = city-level
coordinates (fine at national zoom); `"metro"` = speculative entries only, a
metro-edge point nudged toward the relevant interstate. No paid geocoding APIs
were used.

## The three tiers (`status`)

- **`open`** — operating locations with sourced opening dates, including the
  pre-2003 small-format stores. Sourced closures carry a `closed` date and the
  marker disappears from the map (and the counts) past that date.
- **`announced`** — officially announced or under-construction sites with their
  most recently reported expected opening date. Expected dates shift
  constantly; several (New Kent VA, Hardeeville SC) are years out because they
  wait on state highway-interchange projects.
- **`speculative`** — **editorial projection, not announced.** See below.

## Early era (1982–2003) caveats

Texas Monthly reports roughly **20 small stores existed by 2003**, most in
Brazoria County; per-store records are thin. The dataset carries the 14
early-era stores that are actually documented (plus later "baby Buc-ee's"
mid-size stores like the three Angleton and two Pearland locations). Several
opening years are `estimated` from store numbering; a few sourced closures have
estimated closing years, disclosed in each entry's `note`. One non-store
venture (the 1991 Uncle Buck's icehouse in Lake Jackson) was excluded as not a
convenience store.

## Reconciliation with Wikipedia's count

Wikipedia (July 2026) says **56 active locations in 14 states, 36 in Texas**.
This dataset counts **55 open in 13 states (35 TX) at 2026-07**, because
store #12 in Port Lavaca closed April 17, 2026 (Victoria Advocate) yet
lingered on the official location list Wikipedia tallies. By the compile date
(2026-08-25), Benton AR (Aug 17) and San Marcos TX (Aug 12) had opened:
**57 open in 14 states (36 TX)** — the `meta.asOf` anchor. Both snapshots are
enforced by `scripts/validate.mjs`.

## Speculative-tier methodology

18 hand-authored entries for 2028–2032. Method:

1. **Rate.** The announced pipeline implies ~8–9 openings/year through 2028.
   The speculative tier continues at a deliberately conservative 4–6/year
   beyond the announced list (2 in 2028, then 3–5/year through 2032).
2. **Site selection**, in priority order:
   - *Interstate corridor infill* between existing/announced stores
     (I-10 Tucson and Las Cruces; I-40 Albuquerque; I-30 Texarkana; I-75
     Chattanooga; I-20 Augusta and Midland–Odessa)
   - *Second sites in newly entered states* (Charlotte NC, Tulsa OK,
     Colorado Springs CO, St. Louis MO)
   - *Adjacent unserved states with strong road-trip demographics*
     (Oklahoma, New Mexico, Iowa, Pennsylvania) — skipping poor fits like
     dense Northeast urban cores and the West Coast
3. Each entry gets a metro-edge coordinate on its interstate, a year-only
   `estimated` date, and a one-sentence `rationale` shown in its map popup.
   None of these are real projects; entries that later become real announcements
   should be replaced by the announced version (that already happened during
   compilation for Ocala FL, Springville UT, Greenwood IN, Kansas City KS,
   Gretna NE, and Amarillo TX — originally drafted as speculative, found to be
   announced or already open).

## Known limitations

- Early-era store list is incomplete (documented 14 of ~20).
- Expected dates for announced sites are snapshots of a moving target.
- A handful of `estimated` closing years for legacy stores (disclosed per entry).
