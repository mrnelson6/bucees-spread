/* Entry point: wires data, map, timeline, and stats together. */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    if (!window.BUCEES_DATA || !BUCEES_DATA.locations) {
      document.body.innerHTML =
        '<p style="padding:2em;font-family:sans-serif">Failed to load data/locations.js</p>';
      return;
    }

    var time = BUCEES.time;

    /* Chains, in draw order (later chains draw on top). Culver's is optional
       so the Buc-ee's map still works if data/culvers.js fails to load. */
    var CHAINS = {
      culvers: { short: "Culver's", unit: "restaurant", units: "restaurants", data: window.CULVERS_DATA },
      bucees: { short: "Buc-ee's", unit: "store", units: "stores", data: BUCEES_DATA }
    };
    var MODES = {
      bucees: {
        chains: { bucees: true, culvers: false },
        title: "The Spread of Buc-ee’s",
        subtitle: "1982 → 2032, projected"
      },
      culvers: {
        chains: { bucees: false, culvers: true },
        title: "The Spread of Culver’s",
        subtitle: "1984 → today, every restaurant"
      },
      both: {
        chains: { bucees: true, culvers: true },
        title: "Buc-ee’s vs. Culver’s",
        subtitle: "Two chains, one timeline"
      }
    };
    var hasCulvers = !!(window.CULVERS_DATA && CULVERS_DATA.locations);
    if (!hasCulvers) delete CHAINS.culvers;

    var locations = [];
    Object.keys(CHAINS).forEach(function (chain) {
      CHAINS[chain].data.locations.forEach(function (loc) {
        loc.chain = chain;
        locations.push(loc);
      });
    });

    /* Derived, never stored in the dataset. */
    locations.forEach(function (loc) {
      loc._idx = time.toIndex(loc.date);
      loc._closedIdx = loc.closed ? time.toIndex(loc.closed) : null;
    });

    var todayIdx = time.todayIndex();
    var firstTravelCenterIdx = Infinity;
    locations.forEach(function (loc) {
      if (loc.chain === "bucees" && loc.kind === "travel-center" && loc._idx < firstTravelCenterIdx) {
        firstTravelCenterIdx = loc._idx;
      }
    });

    var mode = "bucees";
    var toggles = { announced: true, speculative: true, chains: MODES.bucees.chains };

    /* ---------- DOM ---------- */
    var scrubber = document.getElementById("scrubber");
    var dateDisplay = document.getElementById("dateDisplay");
    var dateLine = dateDisplay.parentElement;
    var projectedBadge = document.getElementById("projectedBadge");
    var eraCaption = document.getElementById("eraCaption");
    var playBtn = document.getElementById("playBtn");
    var speedBtn = document.getElementById("speedBtn");
    var toast = document.getElementById("toast");

    scrubber.max = String(time.MAX_INDEX);

    function showToast(msg) {
      toast.textContent = msg;
      toast.hidden = false;
      setTimeout(function () { toast.hidden = true; }, 6000);
    }

    /* ---------- Modules ---------- */
    BUCEES.mapview.init(locations, {
      onTileError: function () {
        showToast("Basemap tiles unavailable offline — markers still work.");
      }
    });

    BUCEES.stats.init(locations, {
      chains: CHAINS,
      todayIndex: todayIdx,
      statsEl: document.getElementById("statsDisplay"),
      sparklineEl: document.getElementById("sparkline"),
      onSeek: function (i) { BUCEES.timeline.setTime(i); }
    });

    function render(t, animate) {
      BUCEES.mapview.update(t, toggles, animate);
      BUCEES.stats.update(t, toggles);
      dateDisplay.textContent = time.formatIndex(t);
      scrubber.value = String(t);
      scrubber.style.setProperty("--fill", (t / time.MAX_INDEX * 100).toFixed(2) + "%");
      var projected = t > todayIdx;
      projectedBadge.hidden = !projected;
      dateLine.classList.toggle("projected", projected);
      eraCaption.hidden = !(mode === "bucees" && t < firstTravelCenterIdx);
    }

    /* ---------- Chain switcher ---------- */
    var titleEl = document.getElementById("title");
    var subtitleEl = document.getElementById("subtitle");
    var switchBtns = document.querySelectorAll(".chain-switch button");
    var chainScoped = document.querySelectorAll("[data-chains]");

    if (!hasCulvers) document.querySelector(".chain-switch").hidden = true;

    function modeFromHash() {
      var h = location.hash.replace("#", "");
      return hasCulvers && MODES[h] ? h : "bucees";
    }

    function setMode(m, fromLoad) {
      mode = m;
      var def = MODES[m];
      toggles.chains = def.chains;
      document.body.setAttribute("data-mode", m);
      titleEl.textContent = def.title;
      subtitleEl.textContent = def.subtitle;
      document.title = def.title;
      switchBtns.forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-mode") === m));
      });
      /* Legend rows, swatches, and About sections declare which chains they
         belong to; show them when any of those chains is active. */
      chainScoped.forEach(function (el) {
        el.hidden = !el.getAttribute("data-chains").split(" ").some(function (c) {
          return def.chains[c];
        });
      });
      BUCEES.stats.setChains(def.chains);
      BUCEES.mapview.fitChains(def.chains, !fromLoad);
      if (!fromLoad) render(BUCEES.timeline.getTime(), false);
    }

    switchBtns.forEach(function (b) {
      b.addEventListener("click", function () {
        var m = b.getAttribute("data-mode");
        history.replaceState(null, "", m === "bucees" ? location.pathname + location.search : "#" + m);
        setMode(m);
        b.blur();
      });
    });
    window.addEventListener("hashchange", function () { setMode(modeFromHash()); });

    BUCEES.timeline.init({
      startIndex: todayIdx,
      onTime: function (t, opts) { render(t, opts.animate); },
      onPlayState: function (playing) {
        playBtn.innerHTML = playing ? "&#10074;&#10074;" : "&#9654;";
        playBtn.classList.toggle("playing", playing);
        playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
      }
    });

    /* ---------- Controls ---------- */
    scrubber.addEventListener("input", function () {
      BUCEES.timeline.setTime(parseInt(scrubber.value, 10));
    });

    playBtn.addEventListener("click", function () {
      var t = BUCEES.timeline.getTime();
      /* From the initial "today" position or the end, Play tells the whole
         story from 1982; from anywhere else it continues forward. */
      if (!BUCEES.timeline.isPlaying() && (t === todayIdx || t >= time.MAX_INDEX)) {
        BUCEES.timeline.setTime(0);
      }
      BUCEES.timeline.toggle();
      playBtn.blur();
    });

    speedBtn.addEventListener("click", function () {
      speedBtn.textContent = BUCEES.timeline.cycleSpeed() + "×";
      speedBtn.blur();
    });

    /* ---------- Legend ---------- */
    document.querySelectorAll(".legend-row.toggleable").forEach(function (row) {
      var flip = function () {
        var tier = row.getAttribute("data-tier");
        toggles[tier] = !toggles[tier];
        row.classList.toggle("off", !toggles[tier]);
        row.setAttribute("aria-pressed", String(toggles[tier]));
        render(BUCEES.timeline.getTime(), false);
      };
      row.addEventListener("click", flip);
      row.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); }
      });
    });

    var legend = document.getElementById("legend");
    document.getElementById("legendToggle").addEventListener("click", function () {
      legend.classList.toggle("collapsed");
    });

    /* ---------- Keyboard ---------- */
    document.addEventListener("keydown", function (e) {
      var tag = (e.target.tagName || "").toLowerCase();
      var isField = tag === "input" || tag === "textarea" || tag === "select" || tag === "button";
      var isScrubber = e.target === scrubber;
      if (e.code === "Space" && (!isField || isScrubber)) {
        e.preventDefault();
        playBtn.click();
      } else if (!isField) {
        if (e.key === "Home") BUCEES.timeline.setTime(0);
        else if (e.key === "End") BUCEES.timeline.setTime(time.MAX_INDEX);
        else if (e.key === "ArrowLeft") BUCEES.timeline.setTime(BUCEES.timeline.getTime() - 1);
        else if (e.key === "ArrowRight") BUCEES.timeline.setTime(BUCEES.timeline.getTime() + 1);
      }
    });

    /* ---------- About modal ---------- */
    var modal = document.getElementById("aboutModal");
    var meta = BUCEES_DATA.meta || {};
    document.getElementById("aboutContent").innerHTML = buildAbout(meta) +
      (hasCulvers ? buildCulversAbout(CULVERS_DATA.meta || {}) : "");
    chainScoped = document.querySelectorAll("[data-chains]");
    document.getElementById("aboutBtn").addEventListener("click", function () {
      modal.hidden = false;
    });
    document.getElementById("aboutClose").addEventListener("click", function () {
      modal.hidden = true;
    });
    modal.addEventListener("click", function (e) {
      if (e.target === modal) modal.hidden = true;
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") modal.hidden = true;
    });

    function sourceList(meta) {
      return (meta.sources || []).map(function (s) {
        var safe = String(s).replace(/[&<>"]/g, function (c) {
          return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
        });
        return /^https?:\/\//.test(s)
          ? '<li><a href="' + safe + '" target="_blank" rel="noopener">' + safe + "</a></li>"
          : "<li>" + safe + "</li>";
      }).join("");
    }

    function buildAbout(meta) {
      var asOf = meta.asOf || {};
      var srcs = sourceList(meta);
      return (
        '<div data-chains="bucees">' +
        "<p>Every Buc-ee&rsquo;s location on one timeline: drag the scrubber or press play to " +
        "watch the chain spread from a single 1982 convenience store in Lake Jackson, Texas " +
        "to a multi-state network of giant travel centers.</p>" +
        "<h3>The three tiers</h3>" +
        "<ul>" +
        "<li><b>Open</b> (red) &mdash; operating locations with their actual opening dates. " +
        "Data compiled " + (meta.compiled || "") + "; verified against " + (asOf.openCount || "?") +
        " open locations in " + (asOf.stateCount || "?") + " states as of " + (asOf.date || "?") + ".</li>" +
        "<li><b>Announced</b> (yellow ring) &mdash; officially announced or under-construction " +
        "sites with their publicly reported expected opening dates. Dates shift; these are the " +
        "most recently reported ones.</li>" +
        "<li><b>Speculative</b> (dashed ghost) &mdash; <i>editorial projection, not announced.</i> " +
        "Educated guesses extrapolating the chain&rsquo;s announced growth rate (roughly 4&ndash;6 " +
        "openings/year beyond the announced pipeline, 2028&ndash;2032) along its favored patterns: " +
        "interstate-corridor infill, second sites in newly entered states, and adjacent unserved " +
        "states with strong road-trip traffic. Each ghost marker&rsquo;s popup carries its one-line " +
        "rationale. None of these are real projects.</li>" +
        "</ul>" +
        "<h3>Notes</h3>" +
        "<ul>" +
        "<li>Locations with year-only opening dates are placed mid-year on the timeline; " +
        "a &ldquo;~&rdquo; marks estimated dates.</li>" +
        "<li>The pre-2003 era shows the original Brazoria-County-area convenience stores &mdash; " +
        "small dots &mdash; before the first giant travel center (Luling, 2003). Records from " +
        "that era are incomplete; see METHODOLOGY.md in the repository.</li>" +
        "</ul>" +
        "<h3>Sources</h3><ul>" + srcs + "</ul>" +
        '<p class="fine">Fan-made visualization; not affiliated with or endorsed by Buc-ee&rsquo;s Ltd. ' +
        "Basemap &copy; OpenStreetMap contributors &copy; CARTO.</p>" +
        "</div>"
      );
    }

    function buildCulversAbout(meta) {
      var asOf = meta.asOf || {};
      return (
        '<div data-chains="culvers">' +
        '<h3 class="about-chain">Culver&rsquo;s</h3>' +
        "<p>Every Culver&rsquo;s restaurant open today, placed on the timeline at its official " +
        "opening date &mdash; from the first ButterBurger stand in Sauk City, Wisconsin (July 1984) " +
        "to " + (asOf.openCount ? asOf.openCount.toLocaleString("en-US") : "?") + " restaurants in " +
        (asOf.stateCount || "?") + " states as of " + (meta.compiled || "?") + ".</p>" +
        "<ul>" +
        "<li><b>Open</b> (blue dot) &mdash; opening dates are Culver&rsquo;s own, from the " +
        "restaurant locator on culvers.com.</li>" +
        "<li><b>Announced</b> (blue ring) &mdash; locations listed by Culver&rsquo;s with a future " +
        "opening date.</li>" +
        "<li>Only restaurants operating today are included. Culver&rsquo;s has closed very few " +
        "restaurants (one or two a year per its franchise disclosures), so historical counts run " +
        "only slightly low.</li>" +
        "<li>No speculative tier: Culver&rsquo;s opens 50+ restaurants a year, too many to project " +
        "site by site.</li>" +
        "</ul>" +
        "<h3>Sources</h3><ul>" + sourceList(meta) + "</ul>" +
        '<p class="fine">Fan-made visualization; not affiliated with or endorsed by Culver Franchising System, LLC.</p>' +
        "</div>"
      );
    }

    /* ---------- First paint ---------- */
    setMode(modeFromHash(), true);
    render(todayIdx, false);
  });
})();
