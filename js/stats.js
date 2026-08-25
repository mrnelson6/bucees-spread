/* Live stats readout + cumulative-count sparkline.
   The sparkline is drawn once at load from all tiers (it is an overview and
   ignores legend toggles); the stats text respects toggles. */
(function () {
  "use strict";
  window.BUCEES = window.BUCEES || {};

  var locations = [];
  var todayIdx = 0;
  var svg = null;
  var cursor = null;
  var statsEl = null;
  var W = 100, H = 36; /* viewBox units; svg stretches to fit */

  function svgEl(tag, attrs) {
    var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function cumulative() {
    var max = BUCEES.time.MAX_INDEX;
    var opens = new Array(max + 1).fill(0);
    var closes = new Array(max + 1).fill(0);
    locations.forEach(function (loc) {
      opens[loc._idx]++;
      if (loc._closedIdx !== null && loc._closedIdx <= max) closes[loc._closedIdx]++;
    });
    var series = new Array(max + 1);
    var n = 0;
    for (var i = 0; i <= max; i++) {
      n += opens[i] - closes[i];
      series[i] = n;
    }
    return series;
  }

  function xOf(i) { return (i / BUCEES.time.MAX_INDEX) * W; }

  function buildSparkline() {
    var series = cumulative();
    var maxN = series[series.length - 1] || 1;
    var yOf = function (n) { return H - 2 - (n / maxN) * (H - 5); };

    var lastAnnounced = 0;
    locations.forEach(function (loc) {
      if (loc.status === "announced" && loc._idx > lastAnnounced) lastAnnounced = loc._idx;
    });
    if (lastAnnounced < todayIdx) lastAnnounced = todayIdx;

    svg.setAttribute("viewBox", "0 0 " + W + " " + H);

    function pts(from, to) {
      var out = [];
      for (var i = from; i <= to; i++) {
        out.push(xOf(i).toFixed(2) + "," + yOf(series[i]).toFixed(2));
      }
      return out.join(" ");
    }

    /* Soft fill under the historical segment. */
    var fillPts = "0," + H + " " + pts(0, todayIdx) + " " + xOf(todayIdx).toFixed(2) + "," + H;
    svg.appendChild(svgEl("polygon", { points: fillPts, "class": "spark-fill" }));

    svg.appendChild(svgEl("polyline", { points: pts(0, todayIdx), "class": "spark-history" }));
    svg.appendChild(svgEl("polyline", { points: pts(todayIdx, lastAnnounced), "class": "spark-announced" }));
    if (lastAnnounced < BUCEES.time.MAX_INDEX) {
      svg.appendChild(svgEl("polyline", { points: pts(lastAnnounced, BUCEES.time.MAX_INDEX), "class": "spark-speculative" }));
    }

    var tx = xOf(todayIdx).toFixed(2);
    svg.appendChild(svgEl("line", { x1: tx, y1: 0, x2: tx, y2: H, "class": "spark-today" }));

    cursor = svgEl("line", { x1: 0, y1: 0, x2: 0, y2: H, "class": "spark-cursor" });
    svg.appendChild(cursor);
  }

  BUCEES.stats = {
    init: function (locs, opts) {
      locations = locs;
      todayIdx = opts.todayIndex;
      statsEl = opts.statsEl;
      svg = opts.sparklineEl;
      buildSparkline();
      svg.addEventListener("click", function (e) {
        var rect = svg.getBoundingClientRect();
        var frac = (e.clientX - rect.left) / rect.width;
        opts.onSeek(Math.round(frac * BUCEES.time.MAX_INDEX));
      });
    },

    update: function (t, toggles) {
      var stores = 0;
      var states = {};
      locations.forEach(function (loc) {
        if (loc._idx > t) return;
        if (loc._closedIdx !== null && loc._closedIdx <= t) return;
        if (loc.status === "announced" && !toggles.announced) return;
        if (loc.status === "speculative" && !toggles.speculative) return;
        stores++;
        states[loc.state] = true;
      });
      var nStates = Object.keys(states).length;
      statsEl.textContent = stores + (stores === 1 ? " store" : " stores") +
        " · " + nStates + (nStates === 1 ? " state" : " states") +
        (t > todayIdx ? " (projected)" : "");
      cursor.setAttribute("x1", xOf(t).toFixed(2));
      cursor.setAttribute("x2", xOf(t).toFixed(2));
    }
  };
})();
