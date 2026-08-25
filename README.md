# The Spread of Buc-ee's

An interactive map of every Buc-ee's location from 1982 to a projected 2032.
Drag the timeline scrubber (or press play) to watch the chain spread from a
single convenience store in Lake Jackson, Texas into a multi-state network of
giant travel centers — including officially announced future sites and a
clearly-labeled speculative projection tier.

Plain HTML/CSS/JS. No build step, no framework, no API keys.

## Run it

Either:

- **Open `index.html` directly** in a browser (works from `file://`), or
- Serve the folder: `npx serve .` and open the printed URL.

An internet connection is needed for the basemap tiles (CARTO dark). Offline,
the markers and timeline still work on a plain dark background.

## Controls

| Control | Action |
|---|---|
| Scrubber / sparkline click | Seek to any month, 1982-01 → 2032-12 |
| ▶ / Space | Play/pause (from today or the end, play restarts at 1982) |
| 1× / 2× / 4× | Playback speed (1× = 12 months per second) |
| ← / → / Home / End | Step one month / jump to ends |
| Legend rows | Click "Announced" or "Speculative" to show/hide those tiers |

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

## Deploy

The repo is deployable as-is to any static host (GitHub Pages, Netlify, …).
`.nojekyll` is included so GitHub Pages serves files verbatim.

## Credits

Basemap © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
© [CARTO](https://carto.com/attributions). Map rendering by
[Leaflet](https://leafletjs.com) 1.9.4 (vendored in `vendor/leaflet/`).

Fan-made visualization; not affiliated with or endorsed by Buc-ee's Ltd.
