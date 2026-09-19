/* Live stats readout + cumulative-count sparkline.
   The sparkline is an overview of the active chains (redrawn when the chain
   mode changes) and ignores legend toggles; the stats text respects toggles.
   With two chains, each line is scaled to its own peak — the sparkline shows
   the shape of each chain's growth, not a shared axis. */
(function () {
  "use strict";
  window.BUCEES = window.BUCEES || {};

  var locations = [];
  var chainDefs = {};
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

  function cumulative(chain) {
    var max = BUCEES.time.MAX_INDEX;
    var opens = new Array(max + 1).fill(0);
    var closes = new Array(max + 1).fill(0);
    locations.forEach(function (loc) {
      if (loc.chain !== chain) return;
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

  function drawChain(chain) {
    var series = cumulative(chain);
    var maxN = Math.max.apply(null, series) || 1;
    var yOf = function (n) { return H - 2 - (n / maxN) * (H - 5); };
    var cls = " chain-" + chain;

    var lastAnnounced = 0;
    var lastAny = 0;
    locations.forEach(function (loc) {
      if (loc.chain !== chain) return;
      if (loc.status === "announced" && loc._idx > lastAnnounced) lastAnnounced = loc._idx;
      if (loc._idx > lastAny) lastAny = loc._idx;
    });
    if (lastAnnounced < todayIdx) lastAnnounced = todayIdx;

    function pts(from, to) {
      var out = [];
      for (var i = from; i <= to; i++) {
        out.push(xOf(i).toFixed(2) + "," + yOf(series[i]).toFixed(2));
      }
      return out.join(" ");
    }

    /* Soft fill under the historical segment. */
    var fillPts = "0," + H + " " + pts(0, todayIdx) + " " + xOf(todayIdx).toFixed(2) + "," + H;
    svg.appendChild(svgEl("polygon", { points: fillPts, "class": "spark-fill" + cls }));

    svg.appendChild(svgEl("polyline", { points: pts(0, todayIdx), "class": "spark-history" + cls }));
    if (lastAnnounced > todayIdx) {
      svg.appendChild(svgEl("polyline", { points: pts(todayIdx, lastAnnounced), "class": "spark-announced" + cls }));
    }
    /* Past the last dated entry the line is flat; only draw it where the
       chain has a projection tier to show. */
    if (lastAny > lastAnnounced) {
      svg.appendChild(svgEl("polyline", { points: pts(lastAnnounced, BUCEES.time.MAX_INDEX), "class": "spark-speculative" + cls }));
    }
  }

  function buildSparkline(chains) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);

    Object.keys(chainDefs).forEach(function (chain) {
      if (chains[chain]) drawChain(chain);
    });

    var tx = xOf(todayIdx).toFixed(2);
    svg.appendChild(svgEl("line", { x1: tx, y1: 0, x2: tx, y2: H, "class": "spark-today" }));

    cursor = svgEl("line", { x1: 0, y1: 0, x2: 0, y2: H, "class": "spark-cursor" });
    svg.appendChild(cursor);
  }

  function plural(n, one, many) {
    return n.toLocaleString("en-US") + " " + (n === 1 ? one : many);
  }

  BUCEES.stats = {
    /* chainDefs: { id: { short, unit, units } } in draw order. */
    init: function (locs, opts) {
      locations = locs;
      chainDefs = opts.chains;
      todayIdx = opts.todayIndex;
      statsEl = opts.statsEl;
      svg = opts.sparklineEl;
      svg.addEventListener("click", function (e) {
        var rect = svg.getBoundingClientRect();
        var frac = (e.clientX - rect.left) / rect.width;
        opts.onSeek(Math.round(frac * BUCEES.time.MAX_INDEX));
      });
    },

    setChains: function (chains) {
      buildSparkline(chains);
    },

    update: function (t, toggles) {
      var counts = {};
      var states = {};
      locations.forEach(function (loc) {
        if (!toggles.chains[loc.chain]) return;
        if (loc._idx > t) return;
        if (loc._closedIdx !== null && loc._closedIdx <= t) return;
        if (loc.status === "announced" && !toggles.announced) return;
        if (loc.status === "speculative" && !toggles.speculative) return;
        counts[loc.chain] = (counts[loc.chain] || 0) + 1;
        states[loc.state] = true;
      });
      var active = Object.keys(chainDefs).filter(function (c) { return toggles.chains[c]; });
      var nStates = Object.keys(states).length;
      var text;
      if (active.length === 1) {
        var def = chainDefs[active[0]];
        text = plural(counts[active[0]] || 0, def.unit, def.units) + " · " + plural(nStates, "state", "states");
      } else {
        text = active.map(function (c) {
          return (counts[c] || 0).toLocaleString("en-US") + " " + chainDefs[c].short;
        }).join(" · ");
      }
      statsEl.textContent = text + (t > todayIdx ? " (projected)" : "");
      cursor.setAttribute("x1", xOf(t).toFixed(2));
      cursor.setAttribute("x2", xOf(t).toFixed(2));
    }
  };
})();
