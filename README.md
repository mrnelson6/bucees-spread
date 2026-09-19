# The Spread of Buc-ee's (and Culver's)

An interactive map of every Buc-ee's location from 1982 to a projected 2032.
Drag the timeline scrubber (or press play) to watch the chain spread from a
single convenience store in Lake Jackson, Texas into a multi-state network of
giant travel centers — including officially announced future sites and a
clearly-labeled speculative projection tier.

A switcher in the header adds **Culver's**: every one of its ~1,100 restaurants,
from Sauk City, Wisconsin in 1984, placed at its official opening date. **Both**
overlays the two chains on one timeline. Modes are linkable: `#culvers`, `#both`.

Plain HTML/CSS/JS. No build step, no framework, no API keys.

## Run it

Either:

- **Open `index.html` directly** in a browser (works from `file://`), or
- Serve the folder: `npx serve .` and open the printed URL.

An internet connection is needed for the basemap tiles (standard OpenStreetMap
tiles, no API key, darkened with a CSS filter). Offline, the markers and timeline
still work on a plain dark background.

## Controls

| Control | Action |
|---|---|
| Scrubber / sparkline click | Seek to any month, 1982-01 → 2032-12 |
| ▶ / Space | Play/pause (from today or the end, play restarts at 1982) |
| 1× / 2× / 4× | Playback speed (1× = 12 months per second) |
| ← / → / Home / End | Step one month / jump to ends |
| Legend rows | Click "Announced" or "Speculative" to show/hide those tiers |
| Buc-ee's / Culver's / Both | Switch chain (also `#culvers`, `#both` in the URL) |

## Data

`data/locations.js` is a hand-compiled dataset (strict JSON wrapped in a
`window.BUCEES_DATA = …;` assignment so it loads from `file://` without CORS
issues). Three tiers:

- **open** — operating locations with sourced opening dates
- **announced** — officially announced sites with publicly reported expected dates
- **speculative** — *editorial projection, not announced*; extrapolated growth
  2028–2032 with a per-entry rationale

Sources, cross-checking rules, and the projection methodology are documented in
[`data/METHODOLOGY.md`](data/METHODOLOGY.md).

Validate the dataset after editing it:

```
node scripts/validate.mjs
```

### Culver's

`data/culvers.js` (`window.CULVERS_DATA`, same location schema, `kind:
"restaurant"`) is generated, not hand-edited. Rebuild it from Culver's own
restaurant locator — every restaurant's opening date and restaurant number — with:

```
python scripts/build_culvers.py
```

The script (standard library only) crawls the locator, marks restaurants with a
future opening date as `announced`, checks the result against independent
anchors, and refuses to write the file if any check fails. Details in
[`data/METHODOLOGY.md`](data/METHODOLOGY.md#culvers).

## Deploy

The repo is deployable as-is to any static host (GitHub Pages, Netlify, …).
`.nojekyll` is included so GitHub Pages serves files verbatim.

## Credits

Basemap © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors. Map rendering by
[Leaflet](https://leafletjs.com) 1.9.4 (vendored in `vendor/leaflet/`).

Fan-made visualization; not affiliated with or endorsed by Buc-ee's Ltd. or
Culver Franchising System, LLC.
