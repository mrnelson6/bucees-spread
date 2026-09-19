/* Leaflet map, tile layer, and the marker layer.
   All markers (every chain) are L.circleMarker on a shared canvas renderer, created once
   at startup. "Not yet open" = radius 0 + opacity 0 (which also removes them
   from canvas hit-testing). update() diffs visible sets and only touches
   markers whose visibility changed. */
(function () {
  "use strict";
  window.BUCEES = window.BUCEES || {};

  var COLORS = {
    red: "#e03a3e",
    redStroke: "#ff8a8c",
    yellow: "#f6c700",
    ghost: "#8d8464",
    blue: "#2f8fe0",
    blueStroke: "#a9d2f5"
  };

  var REDUCED_MOTION = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var map = null;
  var markers = [];        /* parallel to locations */
  var locations = [];
  var visibleSet = [];     /* bool per location, current rendered state */
  var zoomFactor = 1;
  var anims = {};          /* location idx -> animation start timestamp */
  var animRaf = null;
  var lastState = null;    /* { t, toggles } for re-render on zoom */

  function tierStyle(loc) {
    if (loc.chain === "culvers") {
      /* ~1,000 restaurants: smaller dots than Buc-ee's travel centers. */
      if (loc.status === "announced") {
        return { radius: 4.5, color: COLORS.blueStroke, weight: 1.5, fillColor: COLORS.blue, fillOpacity: 0, opacity: 1 };
      }
      return { radius: 3.5, color: COLORS.blueStroke, weight: 0.8, fillColor: COLORS.blue, fillOpacity: 0.85, opacity: 0.9 };
    }
    if (loc.status === "announced") {
      return { radius: 7, color: COLORS.yellow, weight: 2, fillColor: COLORS.yellow, fillOpacity: 0, opacity: 1 };
    }
    if (loc.status === "speculative") {
      return { radius: 7, color: COLORS.ghost, weight: 2, dashArray: "3 3", fillColor: COLORS.yellow, fillOpacity: 0.12, opacity: 1 };
    }
    if (loc.kind === "store") {
      return { radius: 4.5, color: COLORS.redStroke, weight: 1, fillColor: COLORS.red, fillOpacity: 0.85, opacity: 0.9 };
    }
    return { radius: 7, color: COLORS.redStroke, weight: 1, fillColor: COLORS.red, fillOpacity: 0.85, opacity: 0.9 };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function popupHtml(loc) {
    var fmt = BUCEES.time.formatLocDate;
    var cc = loc.chain === "culvers" ? " chain-culvers" : "";
    var html = '<div class="popup-name">' + escapeHtml(loc.name) + "</div>";
    html += '<div class="popup-place">' + escapeHtml(loc.city) + ", " + escapeHtml(loc.state) + "</div>";
    if (loc.status === "open") {
      html += '<div class="popup-status-open' + cc + '">Opened ' + fmt(loc) + "</div>";
      if (loc.closed) {
        html += '<div class="popup-status-speculative">Closed ' +
          escapeHtml(loc.closed.split("-")[0]) + "</div>";
      }
    } else if (loc.status === "announced") {
      html += '<div class="popup-status-announced' + cc + '">Expected ' + fmt(loc) + " &middot; announced</div>";
    } else {
      html += '<div class="popup-status-speculative">SPECULATIVE &middot; projected ' + fmt(loc) + "</div>";
    }
    if (loc.note) html += '<div class="popup-note">' + escapeHtml(loc.note) + "</div>";
    if (loc.rationale) html += '<div class="popup-rationale">' + escapeHtml(loc.rationale) + "</div>";
    if (loc.source) html += '<div class="popup-source">Source: ' + escapeHtml(loc.source) + "</div>";
    return html;
  }

  function zoomScale(z) {
    if (z <= 5) return 0.7;
    if (z <= 7) return 1;
    return 1.3;
  }

  function applyStyle(i, visible, radiusScale) {
    var loc = locations[i];
    var m = markers[i];
    var s = tierStyle(loc);
    if (!visible) {
      m.setStyle({ opacity: 0, fillOpacity: 0 });
      m.setRadius(0);
    } else {
      var scale = radiusScale === undefined ? 1 : radiusScale;
      m.setStyle({ opacity: s.opacity, fillOpacity: s.fillOpacity });
      m.setRadius(s.radius * zoomFactor * scale);
    }
  }

  /* Ease-out-back: pop to ~1.1x then settle. */
  function easeOutBack(t) {
    var c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function animFrame(ts) {
    var active = false;
    for (var key in anims) {
      var i = +key;
      var p = Math.min(1, (ts - anims[key]) / 300);
      applyStyle(i, true, easeOutBack(p));
      if (p >= 1) delete anims[key];
      else active = true;
    }
    animRaf = active ? requestAnimationFrame(animFrame) : null;
  }

  function startAnim(i) {
    anims[i] = performance.now();
    applyStyle(i, true, 0);
    if (!animRaf) animRaf = requestAnimationFrame(animFrame);
  }

  function isVisible(loc, t, toggles) {
    if (!toggles.chains[loc.chain]) return false;
    if (loc._idx > t) return false;
    if (loc._closedIdx !== null && loc._closedIdx <= t) return false;
    if (loc.status === "announced" && !toggles.announced) return false;
    if (loc.status === "speculative" && !toggles.speculative) return false;
    return true;
  }

  function keyParam() {
    var key = window.BUCEES_CONFIG && BUCEES_CONFIG.cartoKey;
    return key ? "?key=" + encodeURIComponent(key) : "";
  }

  /* Speculative entries never define the frame. */
  function fitWhere(pred, animate) {
    var bounds = [];
    for (var i = 0; i < locations.length; i++) {
      var loc = locations[i];
      if (loc.status !== "speculative" && pred(loc)) bounds.push([loc.lat, loc.lng]);
    }
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], animate: !!animate });
  }

  BUCEES.mapview = {
    /* Returns the Leaflet map instance. */
    init: function (locs, opts) {
      locations = locs;
      map = L.map("map", {
        preferCanvas: true,
        renderer: L.canvas(),
        zoomControl: true,
        worldCopyJump: false,
        attributionControl: true
      });
      map.zoomControl.setPosition("bottomright");

      var tiles = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" + keyParam(), {
          subdomains: "abcd",
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        });
      var tileFailed = false;
      tiles.on("tileerror", function () {
        if (tileFailed) return;
        tileFailed = true;
        if (opts && opts.onTileError) opts.onTileError();
      });
      tiles.addTo(map);

      /* Initial view (refined by fitChains once the chain mode is known).
         Locations arrive with Buc-ee's last so its larger markers draw on top. */
      fitWhere(function () { return true; }, false);

      for (var j = 0; j < locations.length; j++) {
        var m = L.circleMarker([locations[j].lat, locations[j].lng], tierStyle(locations[j]));
        m.bindPopup(popupHtml(locations[j]));
        m.addTo(map);
        markers.push(m);
        visibleSet.push(true); /* force initial diff below */
      }

      zoomFactor = zoomScale(map.getZoom());
      map.on("zoomend", function () {
        var zf = zoomScale(map.getZoom());
        if (zf === zoomFactor) return;
        zoomFactor = zf;
        for (var k = 0; k < markers.length; k++) {
          if (visibleSet[k] && !(k in anims)) applyStyle(k, true);
        }
      });

      return map;
    },

    /* Frame the non-speculative footprint of the given chains. */
    fitChains: function (chains, animate) {
      fitWhere(function (loc) { return chains[loc.chain]; }, animate);
    },

    /* Pure function of (t, toggles): show/hide markers, animating small
       forward advances during playback, snapping otherwise. */
    update: function (t, toggles, animate) {
      lastState = { t: t, toggles: toggles };
      for (var i = 0; i < locations.length; i++) {
        var vis = isVisible(locations[i], t, toggles);
        if (vis === visibleSet[i]) continue;
        visibleSet[i] = vis;
        if (vis && animate && !REDUCED_MOTION) {
          startAnim(i);
        } else {
          if (!vis && (i in anims)) delete anims[i];
          applyStyle(i, vis);
        }
      }
    }
  };
})();
