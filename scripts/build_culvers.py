"""Build data/culvers.js from the Culver's restaurant locator. Standard library only.

    python scripts/build_culvers.py              # crawl culvers.com, validate, write
    python scripts/build_culvers.py --cache F    # also save the raw crawl to F
    python scripts/build_culvers.py --from F     # rebuild from a saved crawl (no network)

The locator API returns at most 100 restaurants within 600 km per query, so the
continental US is covered by an adaptive quadtree: a cell whose query comes back
full is split in four. Every record carries Culver's own `openDate` and
`restaurantNumber`; restaurants with an opening date after today are "announced".
Validation checks the result against independent anchors (see METHODOLOGY.md)
and refuses to write the file if any fail.
"""
import argparse, datetime, json, math, os, re, sys, time, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "data", "culvers.js")
API = "https://www.culvers.com/api/locator/getLocations?lat={lat}&long={lng}&radius={r}&limit=100"
MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]


# ---------- Crawl ----------

def haversine(lat1, lng1, lat2, lng2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(a))


def fetch(lat, lng, radius):
    url = API.format(lat=round(lat, 4), lng=round(lng, 4), r=int(radius))
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = json.load(resp)
            time.sleep(0.3)  # be polite
            return body["data"]["geofences"]
        except Exception as e:  # noqa: BLE001 - retry anything transient
            print("  retry", url, e, file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError("locator request failed: " + url)


def crawl():
    seen = {}

    def cell(s, w, n, e):
        clat, clng = (s + n) / 2, (w + e) / 2
        radius = haversine(clat, clng, n, e) + 2000
        if radius <= 600000:
            found = fetch(clat, clng, radius)
            for g in found:
                seen[g["_id"]] = g
            if len(found) < 100:
                return
        mlat, mlng = clat, clng
        for box in [(s, w, mlat, mlng), (s, mlng, mlat, e), (mlat, w, n, mlng), (mlat, mlng, n, e)]:
            cell(*box)

    cell(24.0, -125.0, 50.0, -66.0)
    return list(seen.values())


# ---------- Transform ----------

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def parse_open_date(s):
    m, d, y = (int(x) for x in s.split("/"))
    return datetime.date(y, m, d)


def center(geofence):
    ring = geofence["geometry"]["coordinates"][0]
    lng = sum(p[0] for p in ring) / len(ring)
    lat = sum(p[1] for p in ring) / len(ring)
    return round(lat, 4), round(lng, 4)


def transform(raw, today):
    locations = []
    for g in raw:
        md = g["metadata"]
        opened = parse_open_date(md["openDate"])
        number = md["restaurantNumber"]
        lat, lng = center(g)
        announced = opened > today
        when = "%s %d, %d" % (MONTHS[opened.month - 1], opened.day, opened.year)
        note = "Restaurant #%d · %s · %s %s" % (
            int(number), md.get("street", "").strip(),
            "listed to open" if announced else "opened", when)
        if md.get("isTemporarilyClosed"):
            note += " · temporarily closed"
        branch = g["description"].split(" - ", 1)
        locations.append({
            "id": "%s-%s-%s" % (md["state"].lower(), slug(md["city"]), number),
            "name": "Culver's " + md["city"] + (" (" + branch[1] + ")" if len(branch) > 1 else ""),
            "city": md["city"],
            "state": md["state"],
            "lat": lat,
            "lng": lng,
            "geoPrecision": "store",
            "status": "announced" if announced else "open",
            "kind": "restaurant",
            "date": "%d-%02d" % (opened.year, opened.month),
            "datePrecision": "month",
            "note": note,
            "source": "culvers.com restaurant locator",
            "_opened": opened,
            "_number": int(number),
        })
    locations.sort(key=lambda l: (l["_opened"], l["_number"]))
    return locations


# ---------- Validate ----------

def validate(locations, today):
    failures = []

    def check(label, ok):
        print(("  ok    " if ok else "  FAIL  ") + label)
        if not ok:
            failures.append(label)

    ids = [l["id"] for l in locations]
    check("%d restaurants, ids unique" % len(ids), len(ids) == len(set(ids)))
    check("ids match ^[a-z]{2}-[a-z0-9-]+$", all(re.match(r"^[a-z]{2}-[a-z0-9-]+$", i) for i in ids))
    check("all coordinates inside the continental US",
          all(24 < l["lat"] < 50 and -125 < l["lng"] < -66 for l in locations))
    check("all dates within the 1982-2032 timeline",
          all(1982 <= l["_opened"].year <= 2032 for l in locations))

    by_num = {l["_number"]: l for l in locations}

    def at(num, city, ym):
        l = by_num.get(num)
        check("#%d is %s, opened %s" % (num, city, ym),
              bool(l) and l["city"] == city and l["date"] == ym)

    # Independently documented milestones (Wikipedia, QSR Magazine, Culver's
    # press release, Fort Wayne local news).
    at(1, "Sauk City", "1984-07")
    at(300, "Fond du Lac", "2005-10")
    at(500, "Cedar Falls", "2014-03")
    at(1000, "Fort Wayne", "2024-12")

    def open_by(year):
        return sum(1 for l in locations if l["_opened"] <= datetime.date(year, 12, 31))

    # The data holds only restaurants operating today, so historical totals may
    # run slightly under the franchise-disclosure counts (1-2 closures a year).
    fdd = {2022: 892, 2023: 944, 2024: 997, 2025: 1041}
    for year, official in fdd.items():
        n = open_by(year)
        check("open at end of %d: %d (FDD says %d, allow -10/+5)" % (year, n, official),
              official - 10 <= n <= official + 5)

    first_oos = next(l for l in locations if l["state"] != "WI")
    check("first restaurant outside Wisconsin is 1995 (got %s, %s %s)" % (
        first_oos["city"], first_oos["state"], first_oos["date"]), first_oos["date"].startswith("1995"))

    n_states = len({l["state"] for l in locations if l["status"] == "open"})
    check("open in at least 26 states (got %d)" % n_states, n_states >= 26)
    return failures


# ---------- Write ----------

def write(locations, today):
    open_locs = [l for l in locations if l["status"] == "open"]
    data = {
        "meta": {
            "title": "The Spread of Culver's",
            "compiled": today.isoformat(),
            "asOf": {
                "date": today.strftime("%Y-%m"),
                "openCount": len(open_locs),
                "stateCount": len({l["state"] for l in open_locs}),
                "announcedCount": len(locations) - len(open_locs),
            },
            "sources": [
                "https://www.culvers.com/locator (restaurant locator: opening date and restaurant number per location)",
                "Culver's Franchise Disclosure Document, 2026 (outlet counts used for cross-checking)",
                "https://en.wikipedia.org/wiki/Culver%27s",
            ],
        },
    }
    clean = [{k: v for k, v in l.items() if not k.startswith("_")} for l in locations]
    head = json.dumps(data, indent=2, ensure_ascii=False)[:-2]  # reopen the object
    body = ",\n".join("    " + json.dumps(l, ensure_ascii=False) for l in clean)
    text = "window.CULVERS_DATA = " + head + ',\n  "locations": [\n' + body + "\n  ]\n};\n"
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print("wrote %s: %d open, %d announced, %d bytes" % (
        os.path.relpath(OUT, ROOT), len(open_locs), len(locations) - len(open_locs), len(text)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="src", help="build from a saved crawl instead of fetching")
    ap.add_argument("--cache", help="save the raw crawl to this file")
    args = ap.parse_args()

    if args.src:
        with open(args.src, encoding="utf-8") as f:
            raw = json.load(f)
    else:
        print("crawling the Culver's locator...")
        raw = crawl()
        if args.cache:
            with open(args.cache, "w", encoding="utf-8") as f:
                json.dump(raw, f)
    print("%d restaurants in crawl" % len(raw))

    today = datetime.date.today()
    locations = transform(raw, today)
    failures = validate(locations, today)
    if failures:
        print("\n%d check(s) failed; data/culvers.js not written" % len(failures))
        sys.exit(1)
    write(locations, today)


if __name__ == "__main__":
    main()
