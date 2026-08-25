/* Time model + playback engine.
   All date handling is string-split month math — `new Date("YYYY-MM")` is never
   used anywhere in this app (timezone traps). One timeline step = one month.
   monthIndex = (year - 1982) * 12 + (month - 1), range 0..611 (1982-01..2032-12). */
(function () {
  "use strict";
  window.BUCEES = window.BUCEES || {};

  var MIN_YEAR = 1982;
  var MAX_INDEX = (2032 - MIN_YEAR) * 12 + 11;
  var MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  /* "YYYY" or "YYYY-MM" -> { year, month|null } */
  function parseDate(str) {
    var parts = String(str).split("-");
    return {
      year: parseInt(parts[0], 10),
      month: parts.length > 1 ? parseInt(parts[1], 10) : null
    };
  }

  /* Year-only dates use the mid-year (July) convention for timeline placement. */
  function toIndex(str) {
    var d = parseDate(str);
    var month = d.month === null ? 7 : d.month;
    return (d.year - MIN_YEAR) * 12 + (month - 1);
  }

  function clampIndex(i) {
    return Math.max(0, Math.min(MAX_INDEX, i));
  }

  function formatIndex(i) {
    var year = MIN_YEAR + Math.floor(i / 12);
    return MONTHS[i % 12] + " " + year;
  }

  /* Popup-facing date text honoring precision: "March 2019", "1995", "~1985". */
  function formatLocDate(loc) {
    var d = parseDate(loc.date);
    if (loc.datePrecision === "month" && d.month !== null) {
      return MONTHS[d.month - 1] + " " + d.year;
    }
    return (loc.datePrecision === "estimated" ? "~" : "") + d.year;
  }

  /* Current month as an index, computed once at load, clamped to the timeline. */
  function todayIndex() {
    var now = new Date();
    return clampIndex((now.getFullYear() - MIN_YEAR) * 12 + now.getMonth());
  }

  BUCEES.time = {
    MIN_YEAR: MIN_YEAR,
    MAX_INDEX: MAX_INDEX,
    parseDate: parseDate,
    toIndex: toIndex,
    clampIndex: clampIndex,
    formatIndex: formatIndex,
    formatLocDate: formatLocDate,
    todayIndex: todayIndex
  };

  /* ---------- Playback engine ---------- */

  var SPEEDS = [1, 2, 4]; /* 1x = 12 months of timeline per real second */

  var state = {
    index: 0,
    playing: false,
    speedIdx: 0,
    floatIndex: 0,
    lastFrame: null,
    rafId: null,
    onTime: null,   /* function(index, { animate }) */
    onPlayState: null
  };

  function emit(animate) {
    if (state.onTime) state.onTime(state.index, { animate: animate });
  }

  /* External seek (scrubber, sparkline click, keyboard). Snap — no entry tween. */
  function setTime(i) {
    i = clampIndex(Math.round(i));
    if (i === state.index) return;
    state.index = i;
    state.floatIndex = i;
    emit(false);
  }

  function frame(ts) {
    if (!state.playing) return;
    if (state.lastFrame !== null) {
      var dt = Math.min(0.25, (ts - state.lastFrame) / 1000);
      state.floatIndex += dt * 12 * SPEEDS[state.speedIdx];
      var next = Math.floor(state.floatIndex);
      if (next !== state.index) {
        var delta = next - state.index;
        state.index = Math.min(next, MAX_INDEX);
        /* Animate marker entries only on small forward advances. */
        emit(delta > 0 && delta <= 6);
      }
      if (state.index >= MAX_INDEX) {
        pause();
        return;
      }
    }
    state.lastFrame = ts;
    state.rafId = requestAnimationFrame(frame);
  }

  function play() {
    if (state.playing) return;
    state.playing = true;
    state.lastFrame = null;
    state.floatIndex = state.index;
    if (state.onPlayState) state.onPlayState(true);
    state.rafId = requestAnimationFrame(frame);
  }

  function pause() {
    if (!state.playing) return;
    state.playing = false;
    if (state.rafId) cancelAnimationFrame(state.rafId);
    if (state.onPlayState) state.onPlayState(false);
  }

  BUCEES.timeline = {
    init: function (opts) {
      state.onTime = opts.onTime;
      state.onPlayState = opts.onPlayState;
      state.index = clampIndex(opts.startIndex || 0);
      state.floatIndex = state.index;
    },
    setTime: setTime,
    getTime: function () { return state.index; },
    isPlaying: function () { return state.playing; },
    play: play,
    pause: pause,
    toggle: function () { state.playing ? pause() : play(); },
    cycleSpeed: function () {
      state.speedIdx = (state.speedIdx + 1) % SPEEDS.length;
      return SPEEDS[state.speedIdx];
    },
    getSpeed: function () { return SPEEDS[state.speedIdx]; }
  };
})();
