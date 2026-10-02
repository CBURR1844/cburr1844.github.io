/* ADHD (AI Driven Haptic Design) site effects.
 * 1. ASCII/binary aurora: a lava-lamp style fluid field of drifting metaballs,
 *    sampled on a character grid and drawn as 0/1 and terminal glyphs whose
 *    density and colour follow the field.
 * 2. Blade cut: dragging the pointer across the hero/background slices the lava.
 *    The fluid parts around the blade, piles up in glowing chromatic walls,
 *    a hot seam flashes down the middle and the channel then heals shut.
 * 3. Rotating 3D screenshot carousels.
 * Honours prefers-reduced-motion (renders a single still frame, no cutting,
 * carousels stay put).
 */
(function () {
  "use strict";
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- ASCII aurora ---------- */
  var canvas = document.getElementById("field");
  var ctx = canvas.getContext("2d");
  var RAMP = " .:-=+*01#%@";            // low -> high density
  var BIN = "01";
  var cell = 14, cw = 8.68, cols = 0, rows = 0, dpr = 1, vw = 0, vh = 0;

  // Palette stops (aurora): deep violet -> cyan -> magenta -> amber
  var STOPS = [
    [0.00, [20, 10, 60]],
    [0.30, [110, 70, 255]],
    [0.55, [62, 242, 224]],
    [0.78, [255, 63, 180]],
    [1.00, [255, 190, 90]]
  ];
  function palette(t) {
    t = Math.max(0, Math.min(1, t));
    for (var i = 1; i < STOPS.length; i++) {
      if (t <= STOPS[i][0]) {
        var a = STOPS[i - 1], b = STOPS[i];
        var k = (t - a[0]) / (b[0] - a[0]);
        return [
          Math.round(a[1][0] + (b[1][0] - a[1][0]) * k),
          Math.round(a[1][1] + (b[1][1] - a[1][1]) * k),
          Math.round(a[1][2] + (b[1][2] - a[1][2]) * k)
        ];
      }
    }
    return STOPS[STOPS.length - 1][1];
  }

  // The palette is sampled ~10k times a frame. Precompute it (and its CSS
  // strings) once so the hot loop does no colour maths or string building;
  // alpha goes through globalAlpha instead of an rgba() string per glyph.
  var PAL_N = 1024;
  var palR = new Uint8Array(PAL_N), palG = new Uint8Array(PAL_N), palB = new Uint8Array(PAL_N);
  var palCss = new Array(PAL_N);
  for (var p = 0; p < PAL_N; p++) {
    var pc = palette(p / (PAL_N - 1));
    palR[p] = pc[0]; palG[p] = pc[1]; palB[p] = pc[2];
    palCss[p] = "rgb(" + pc[0] + "," + pc[1] + "," + pc[2] + ")";
  }
  // Glyphs touched by the blade get tinted off-palette; cache those strings
  // too (5 bits per channel), filled lazily so steady state allocates nothing.
  var mixCss = new Array(32768);
  function css(r, g, b) {
    var k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    return mixCss[k] || (mixCss[k] = "rgb(" + (r & 248) + "," + (g & 248) + "," + (b & 248) + ")");
  }

  // Lava-lamp blobs moving on slow Lissajous paths. ox/oy/vx/vy is a spring
  // offset: the blade can shove a blob, which then wobbles back onto its path.
  var blobs = [];
  for (var b = 0; b < 7; b++) {
    blobs.push({
      ax: 0.25 + Math.random() * 0.25, ay: 0.25 + Math.random() * 0.25,
      fx: 0.05 + Math.random() * 0.09, fy: 0.04 + Math.random() * 0.08,
      px: Math.random() * 6.28, py: Math.random() * 6.28,
      r: 0.16 + Math.random() * 0.14, hue: Math.random(),
      ox: 0, oy: 0, vx: 0, vy: 0
    });
  }
  var NB = blobs.length;
  var cx = new Float64Array(NB), cy = new Float64Array(NB), rr = new Float64Array(NB), hh = new Float64Array(NB);

  /* ---------- Cut state ----------
   * One value per character cell, so the effect costs the same as the grid
   * and only cells inside the dirty box [bx0..bx1]x[by0..by1] are touched.
   *   carve  depth of the cut (can exceed 1: deep cuts take longer to heal). The
   *          channel is open wherever carve > OPEN, so as carve decays the open
   *          region narrows and the walls slide inward: the fluid closing over it
   *   rim    energy of the wake; lights the walls along the channel edge
   *   side   which wall a cell sits on (-1 left / +1 right of the blade) -> chromatic tint
   *   heat   the white-hot seam right behind the blade
   *   dX,dY  how far the fluid at this cell has been pushed (px), sprung by vX,vY
   */
  var carve, rim, side, heat, dX, dY, vX, vY;
  var bx0 = 1, by0 = 1, bx1 = 0, by1 = 0;   // empty box
  var bladeScale = 1;
  function boxEmpty() { return bx0 > bx1; }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth, h = window.innerHeight;
    vw = w; vh = h;
    cell = w < 700 ? 11 : 14;
    cw = cell * 0.62;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.ceil(w / cw);
    rows = Math.ceil(h / cell);
    ctx.font = "600 " + cell + "px ui-monospace, Menlo, monospace";
    ctx.textBaseline = "top";
    // a finger on a phone shouldn't carve a quarter of the screen away
    bladeScale = Math.max(0.65, Math.min(1, w / 1100));
    var n = cols * rows;
    carve = new Float32Array(n); rim = new Float32Array(n); side = new Float32Array(n);
    heat = new Float32Array(n);
    dX = new Float32Array(n); dY = new Float32Array(n); vX = new Float32Array(n); vY = new Float32Array(n);
    bx0 = by0 = 1; bx1 = by1 = 0;
  }

  /* ---------- Pointer trail ----------
   * A fixed ring of the last 40 pointer samples with timestamps. Input
   * handlers only record; the frame loop carves the new segments, so all
   * buffer writes happen in one place, once per frame.
   */
  var TRAIL = 40;
  var trX = new Float32Array(TRAIL), trY = new Float32Array(TRAIL), trT = new Float64Array(TRAIL);
  var trS = new Float32Array(TRAIL);      // smoothed speed at this sample (px/s)
  var trP = new Uint8Array(TRAIL);        // 1 = pressed (mouse button / touch)
  var trBrk = new Uint8Array(TRAIL);      // 1 = first point of a new stroke
  var trHead = -1, trLen = 0, trPending = 0;
  var stroke = false, lastSpeed = 0, lastMoveT = 0;

  function addPoint(x, y, pressed) {
    var now = performance.now();
    // a pause or a jump across a panel starts a fresh stroke, never a bridging line
    var brk = !stroke || now - lastMoveT > 120;
    var spd = 0;
    if (!brk) {
      var dx = x - trX[trHead], dy = y - trY[trHead];
      var inst = Math.sqrt(dx * dx + dy * dy) / Math.max(0.008, (now - trT[trHead]) / 1000);
      spd = lastSpeed * 0.55 + inst * 0.45;   // tame single-event spikes
      if (dx * dx + dy * dy < 1) { lastMoveT = now; return; }   // sub-pixel jitter
    }
    trHead = (trHead + 1) % TRAIL;
    trX[trHead] = x; trY[trHead] = y; trT[trHead] = now;
    trS[trHead] = spd; trP[trHead] = pressed ? 1 : 0; trBrk[trHead] = brk ? 1 : 0;
    if (trLen < TRAIL) trLen++;
    if (trPending < TRAIL - 1) trPending++;
    lastSpeed = spd; lastMoveT = now; stroke = true;
  }
  function endStroke() { stroke = false; lastSpeed = 0; }

  // Stamp one blade segment a->b into the cell buffers.
  function carveSegment(ax, ay, bx, by, speed, pressed) {
    var sx = bx - ax, sy = by - ay;
    var len = Math.sqrt(sx * sx + sy * sy);
    if (len < 0.01) return;
    var ux = sx / len, uy = sy / len;
    var s = Math.min(1, speed / 1600);                 // 0 = drifting, 1 = slash
    // channel half-width (px) and depth: faster and pressed cut wider/deeper/longer
    var R = (pressed ? 22 + 26 * s : 12 + 18 * s) * bladeScale;
    var depth = pressed ? 1.5 + 1.3 * s : 0.5 + 1.3 * s;
    var heatAmt = Math.min(1.2, 0.3 + 1.0 * s + (pressed ? 0.25 : 0));
    var rimAmt = (pressed ? 0.95 : 0.55) + 0.6 * s;
    var push = R * (0.8 + 0.9 * s);                    // how far the walls are shoved out
    var drag = R * 0.9 * s;                            // fluid dragged along with the blade
    var reach = R * 2.1;
    var invR = 1 / R, invL = 1 / len;
    var invSeam = 1 / Math.max(cw * 0.8, R * 0.24);

    var x0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach) / cw));
    var x1 = Math.min(cols - 1, Math.ceil((Math.max(ax, bx) + reach) / cw));
    var y0 = Math.max(0, Math.floor((Math.min(ay, by) - reach) / cell));
    var y1 = Math.min(rows - 1, Math.ceil((Math.max(ay, by) + reach) / cell));
    if (x0 > x1 || y0 > y1) return;

    for (var y = y0; y <= y1; y++) {
      var py = (y + 0.5) * cell;
      for (var x = x0; x <= x1; x++) {
        var px = (x + 0.5) * cw;
        var t = ((px - ax) * ux + (py - ay) * uy) * invL;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        var ddx = px - (ax + sx * t), ddy = py - (ay + sy * t);
        var d = Math.sqrt(ddx * ddx + ddy * ddy);
        if (d > reach) continue;
        var i = y * cols + x;
        var r = d * invR, r2 = r * r;

        // cut profile: gaussian across the blade. Thresholded at render time,
        // so its decay reads as the walls closing in, not as a fog filling up
        var g = Math.exp(-r2) * depth;
        if (g > carve[i]) carve[i] = g;

        // wake energy over the whole disturbed area
        var wv = Math.exp(-r2 * 0.15) * rimAmt;
        if (wv > rim[i]) {
          rim[i] = wv;
          // which side of the blade: drives the cyan / magenta chromatic split
          side[i] = d > 0.5 ? (ux * ddy - uy * ddx) / d : 0;
        }

        // seam: a line of heat right where the edge passed, never thinner than
        // a glyph so it reads as one continuous filament instead of dots
        var hq = d * invSeam;
        var hv = Math.exp(-hq * hq) * heatAmt;
        if (hv > heat[i]) heat[i] = hv;

        // displacement: outward from the blade, peaking at the wall, plus a
        // drag along the stroke. Blend toward it so repeated stamps don't pile up.
        var nX = d > 0.5 ? ddx / d : -uy, nY = d > 0.5 ? ddy / d : ux;
        var out = push * r * Math.exp(0.5 * (1 - r2));
        var along = drag * Math.exp(-r2);
        var wgt = Math.exp(-r2 * 0.3);
        dX[i] += (nX * out + ux * along - dX[i]) * wgt;
        dY[i] += (nY * out + uy * along - dY[i]) * wgt;
        vX[i] *= 1 - wgt; vY[i] *= 1 - wgt;
      }
    }
    if (boxEmpty()) { bx0 = x0; by0 = y0; bx1 = x1; by1 = y1; }
    else {
      if (x0 < bx0) bx0 = x0; if (y0 < by0) by0 = y0;
      if (x1 > bx1) bx1 = x1; if (y1 > by1) by1 = y1;
    }

    // shove nearby metaballs: along the stroke and away from the edge
    var aspectH = vh;
    for (var j = 0; j < NB; j++) {
      var bpx = cx[j] * aspectH, bpy = cy[j] * aspectH;
      var tt = ((bpx - ax) * ux + (bpy - ay) * uy) * invL;
      tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
      var ex = bpx - (ax + sx * tt), ey = bpy - (ay + sy * tt);
      var ed = Math.sqrt(ex * ex + ey * ey);
      var infl = rr[j] * aspectH * 1.4 + R;
      if (ed > infl) continue;
      var fall = 1 - ed / infl;
      fall *= fall * (pressed ? 1.7 : 1) * (0.25 + s);
      var o = blobs[j];
      var awayX = ed > 1 ? ex / ed : 0, awayY = ed > 1 ? ey / ed : 0;
      // impulse scales with distance travelled, so it's frame-rate independent
      var kick = fall * (len / aspectH) * 0.7;
      o.vx += (ux * 0.5 + awayX * 0.5) * kick;
      o.vy += (uy * 0.5 + awayY * 0.5) * kick;
    }
  }

  // Heal the cut: channel closes from its walls inward (uniform decay of a
  // flat-topped profile narrows it), heat cools fast, displaced fluid springs
  // back with a little overshoot. Also shrinks the dirty box to what's live.
  function relax(dt) {
    if (boxEmpty()) return;
    // walls stay lit a little longer than the channel takes to close
    var kc = Math.exp(-dt / 0.75), kr = Math.exp(-dt / 1.05), kh = Math.exp(-dt / 0.24);
    var K = 26, C = 6.2;                 // ~0.8 s period, underdamped: liquid wobble
    var nx0 = cols, ny0 = rows, nx1 = -1, ny1 = -1;
    for (var y = by0; y <= by1; y++) {
      var i = y * cols + bx0;
      for (var x = bx0; x <= bx1; x++, i++) {
        var c = carve[i] * kc, w = rim[i] * kr, h = heat[i] * kh;
        var ax = -K * dX[i] - C * vX[i], ay = -K * dY[i] - C * vY[i];
        var vx = vX[i] + ax * dt, vy = vY[i] + ay * dt;
        var ox = dX[i] + vx * dt, oy = dY[i] + vy * dt;
        // flush to exact zero so the idle field renders exactly as it did before
        if (c < 0.004) c = 0;
        if (w < 0.004) w = 0;
        if (h < 0.004) h = 0;
        if (ox * ox + oy * oy < 0.01 && vx * vx + vy * vy < 0.05) { ox = oy = vx = vy = 0; }
        carve[i] = c; rim[i] = w; heat[i] = h;
        dX[i] = ox; dY[i] = oy; vX[i] = vx; vY[i] = vy;
        if (c || w || h || ox || oy) {
          if (x < nx0) nx0 = x; if (x > nx1) nx1 = x;
          if (y < ny0) ny0 = y; if (y > ny1) ny1 = y;
        }
      }
    }
    if (nx1 < 0) { bx0 = by0 = 1; bx1 = by1 = 0; }
    else { bx0 = nx0; by0 = ny0; bx1 = nx1; by1 = ny1; }
  }

  // cheap per-cell hash for flicker (0..1), no allocation, no Math.random
  function hash(x, y, f) {
    var h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(f, 83492791);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) & 1023) / 1023;
  }

  var OPEN = 0.42;   // carve level at which the channel is open
  var lastMs = 0;
  function frame(ms) {
    var t = ms / 1000;
    var dt = lastMs ? Math.min(0.05, (ms - lastMs) / 1000) : 1 / 60;
    lastMs = ms;
    var w = vw, h = vh;
    var aspect = w / h;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#05060a";
    ctx.fillRect(0, 0, w, h);

    // blob centres for this frame (normalised coords), plus their sprung offsets
    var i, j;
    for (i = 0; i < NB; i++) {
      var o = blobs[i];
      if (o.vx || o.vy || o.ox || o.oy) {
        o.vx += (-3.2 * o.ox - 1.9 * o.vx) * dt;
        o.vy += (-3.2 * o.oy - 1.9 * o.vy) * dt;
        o.ox += o.vx * dt; o.oy += o.vy * dt;
        if (Math.abs(o.ox) + Math.abs(o.oy) + Math.abs(o.vx) + Math.abs(o.vy) < 1e-4) o.ox = o.oy = o.vx = o.vy = 0;
      }
      cx[i] = (0.5 + o.ax * Math.sin(t * o.fx * 6.28 + o.px)) * aspect + o.ox;
      cy[i] = 0.5 + o.ay * Math.cos(t * o.fy * 6.28 + o.py) + o.oy;
      rr[i] = o.r * (1 + 0.15 * Math.sin(t * 0.7 + i));
      hh[i] = o.hue;
    }

    // carve the segments recorded since the last frame
    while (trPending > 0) {
      var k = (trHead - trPending + 1 + TRAIL) % TRAIL;
      trPending--;
      if (trBrk[k]) continue;
      var pk = (k - 1 + TRAIL) % TRAIL;
      carveSegment(trX[pk], trY[pk], trX[k], trY[k], trS[k], trP[k] === 1);
    }
    relax(dt);

    var hasCut = !boxEmpty();
    var flick = Math.floor(t * 9), shimmer = Math.floor(t * 22);
    for (var y = 0; y < rows; y++) {
      var rowCut = hasCut && y >= by0 && y <= by1;
      for (var x = 0; x < cols; x++) {
        var nx = (x / cols) * aspect, ny = y / rows;
        var ci = 0, cv = 0, wv = 0, hv = 0, ox = 0, oy = 0;
        if (rowCut && x >= bx0 && x <= bx1) {
          ci = y * cols + x;
          cv = carve[ci]; wv = rim[ci]; hv = heat[ci]; ox = dX[ci]; oy = dY[ci];
          // sample the fluid from where it was pushed from
          nx -= ox / h; ny -= oy / h;
        }
        var f = 0, hue = 0;
        for (j = 0; j < NB; j++) {
          var dx = nx - cx[j], dy = ny - cy[j];
          var v = (rr[j] * rr[j]) / (dx * dx + dy * dy + 0.0008);
          f += v; hue += v * hh[j];
        }
        // aurora ribbons: slow sine curtains layered over the blobs
        var ribbon = 0.5 + 0.5 * Math.sin(nx * 3.1 + t * 0.35 + Math.sin(ny * 4.0 - t * 0.25) * 1.6);
        var field = f * 0.55 + ribbon * 0.35;

        if (cv || wv || hv) {
          // open channel: clean and dark, with a crisp edge at carve = OPEN
          var oq = (cv - OPEN + 0.05) * 10;
          var open = oq <= 0 ? 0 : oq >= 1 ? 1 : oq * oq * (3 - 2 * oq);
          // walls: a bright band riding that edge wherever it currently is
          var eq = (cv - OPEN) * 7;
          var edge = wv * Math.exp(-eq * eq);
          // parted lava piles up against the walls, brightest where there was most of it
          field = field * (1 - open) + edge * (0.6 + 1.0 * Math.min(1.5, field));
          if (field < 0.22 && hv < 0.14 && edge < 0.1) continue;
          drawCutCell(x, y, field, hue / f, nx, t, edge, side[ci], hv, ox, oy, shimmer, flick);
          continue;
        }

        if (field < 0.22) continue;
        var dens = Math.min(1, (field - 0.22) / 1.3);
        var ch;
        if (dens > 0.55) {
          // hot core: flickering binary
          ch = BIN.charAt(((x * 7 + y * 13 + flick) % 2 + 2) % 2);
        } else {
          ch = RAMP.charAt(Math.floor(dens * (RAMP.length - 1)));
        }
        if (ch === " ") continue;
        var pi = palette01((hue / f) * 0.55 + dens * 0.55 + 0.08 * Math.sin(t * 0.3 + nx));
        ctx.globalAlpha = Math.round((0.18 + dens * 0.8) * 100) / 100;   // same 2-decimal alpha as before
        ctx.fillStyle = palCss[pi];
        ctx.fillText(ch, x * cw, y * cell);
      }
    }
    ctx.globalAlpha = 1;
    drawBlade();
    if (!reduce) requestAnimationFrame(frame);
  }

  function palette01(tv) {
    tv = tv < 0 ? 0 : tv > 1 ? 1 : tv;
    return (tv * (PAL_N - 1) + 0.5) | 0;
  }

  // A glyph inside the wake. The seam is a filament of white-hot binary that
  // cools through cyan; the walls flare bright 0/1, tinted cyan on one side of
  // the blade and magenta on the other, and dissolve back into the lava.
  function drawCutCell(x, y, field, hueN, nx, t, wv, sd, hv, ox, oy, shimmer, flick) {
    var dens = field > 0.22 ? Math.min(1, (field - 0.22) / 1.3) : 0;
    var hot = hv > 1 ? 1 : hv, wall = wv > 1 ? 1 : wv;
    var rnd = hash(x, y, shimmer), ch;
    if (hot > 0.14 || rnd < wall * 1.4 - 0.15) {
      // energised: fast-flickering bits; the flicker thins out as the wall cools
      ch = BIN.charAt(hash(y, x, shimmer) < 0.5 ? 1 : 0);
    } else if (dens > 0.55) {
      ch = BIN.charAt(((x * 7 + y * 13 + flick) % 2 + 2) % 2);
    } else {
      ch = RAMP.charAt(Math.floor(dens * (RAMP.length - 1)));
      if (ch === " ") return;
    }
    var pi = palette01(hueN * 0.55 + dens * 0.55 + 0.08 * Math.sin(t * 0.3 + nx));
    var r = palR[pi], g = palG[pi], b = palB[pi];
    // chromatic wall tint: cyan left of the blade, magenta right
    var tint = Math.min(1, wall * 2.2) * Math.sqrt(sd < 0 ? -sd : sd);
    if (tint > 0.01) {
      var tr = sd < 0 ? 62 : 255, tg = sd < 0 ? 242 : 63, tb = sd < 0 ? 224 : 180;
      r += (tr - r) * tint; g += (tg - g) * tint; b += (tb - b) * tint;
    }
    // heat: white at the core, cooling through electric cyan rather than
    // fading to grey (a dim grey seam reads as dust, not as a cooling cut)
    if (hot > 0.01) {
      var hk = hot * 3 > 1 ? 1 : hot * 3, hc = hot * hot;
      r += (90 - r) * hk; g += (245 - g) * hk; b += (235 - b) * hk;
      r += (255 - r) * hc; g += (255 - g) * hc; b += (255 - b) * hc;
    }
    // the strongest walls flare toward white, so they read on any lava colour
    if (wall > 0.5) {
      var wf = (wall - 0.5) * 0.6;
      r += (255 - r) * wf; g += (255 - g) * wf; b += (255 - b) * wf;
    }
    var a = dens > 0 ? 0.18 + dens * 0.8 : 0;
    var lift = Math.max(wall * 1.5, hot * 1.4);
    if (lift > a) a = lift > 1 ? 1 : lift;
    // the glyph itself rides a little of the push, so the lava visibly moves
    var gx = x * cw + ox * 0.22, gy = y * cell + oy * 0.22;
    if (hot > 0.3) {
      // chromatic fringe on the hottest glyphs
      ctx.globalAlpha = a * 0.6 * hot;
      ctx.fillStyle = "#ff3fb4"; ctx.fillText(ch, gx - 1.8, gy);
      ctx.fillStyle = "#3ef2e0"; ctx.fillText(ch, gx + 1.8, gy);
    }
    ctx.globalAlpha = a;
    ctx.fillStyle = css(r | 0, g | 0, b | 0);
    ctx.fillText(ch, gx, gy);
  }

  // The blade itself: a hairline of light along the newest part of the trail,
  // drawn additively with a split cyan/magenta edge. It lives ~0.3 s, so it
  // reads as the instant of the cut while the glyph wake carries the aftermath.
  var BLADE_LIFE = 320;
  // Soft glow for the blade tip, rendered once so drawing it is one drawImage.
  var tip = document.createElement("canvas");
  tip.width = tip.height = 96;
  (function () {
    var g = tip.getContext("2d");
    var grad = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(0.12, "rgba(190,255,248,0.55)");
    grad.addColorStop(0.4, "rgba(62,242,224,0.16)");
    grad.addColorStop(1, "rgba(110,70,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 96, 96);
  })();
  function drawBlade() {
    if (trLen < 2) return;
    var now = performance.now();
    if (now - trT[trHead] > BLADE_LIFE) return;
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (var pass = 0; pass < 4; pass++) {
      for (var n = 0; n < trLen - 1; n++) {
        var k = (trHead - n + TRAIL) % TRAIL;
        if (trBrk[k]) continue;
        var age = now - trT[k];
        if (age > BLADE_LIFE) break;
        var pk = (k - 1 + TRAIL) % TRAIL;
        var fade = 1 - age / BLADE_LIFE;
        fade *= fade;
        var s = Math.min(1, trS[k] / 1600);
        var a = fade * (0.2 + 0.8 * s);
        if (a < 0.02) continue;
        var ax = trX[pk], ay = trY[pk], bx = trX[k], by = trY[k];
        var sx = bx - ax, sy = by - ay, l = Math.sqrt(sx * sx + sy * sy) || 1;
        var nx = -sy / l, ny = sx / l;
        var wide = trP[k] ? 1.5 : 1;
        var off = 0;
        if (pass === 0) { ctx.strokeStyle = "#6e46ff"; ctx.lineWidth = 12 * wide * fade; ctx.globalAlpha = a * 0.16; }
        else if (pass === 1) { ctx.strokeStyle = "#3ef2e0"; ctx.lineWidth = 1.6 * wide; ctx.globalAlpha = a * 0.55; off = -1.4 * wide; }
        else if (pass === 2) { ctx.strokeStyle = "#ff3fb4"; ctx.lineWidth = 1.6 * wide; ctx.globalAlpha = a * 0.55; off = 1.4 * wide; }
        else { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.1 * wide; ctx.globalAlpha = a * 0.9; }
        ctx.beginPath();
        ctx.moveTo(ax + nx * off, ay + ny * off);
        ctx.lineTo(bx + nx * off, by + ny * off);
        ctx.stroke();
      }
    }
    // the tip: brightest while the blade is actually moving
    var tipAge = now - trT[trHead];
    var ts = Math.min(1, trS[trHead] / 1600);
    var ta = (1 - tipAge / BLADE_LIFE) * (0.15 + 0.85 * ts);
    if (ta > 0.02) {
      var sz = (trP[trHead] ? 64 : 44) * (0.6 + 0.4 * ts);
      ctx.globalAlpha = ta;
      ctx.drawImage(tip, trX[trHead] - sz / 2, trY[trHead] - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);

  /* ---------- Pointer input for the cut ----------
   * The canvas sits underneath the page and never captures events; we listen
   * on window (passive, so scrolling is untouched) and only cut while the
   * pointer is over the hero or bare background, not over glass panels/nav.
   */
  function overBackground(el) {
    if (!el || !el.closest) return true;
    if (el.closest(".hero")) return !el.closest(".nav");
    return !el.closest(".glass");
  }
  var pressed = false, touchScroll = false;

  function onMove(e) {
    if (e.pointerType === "touch" && !pressed) return;
    if (!overBackground(e.target)) { endStroke(); return; }
    addPoint(e.clientX, e.clientY, pressed || (e.buttons & 1) === 1);
  }

  if (!reduce) {
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      pressed = true;
      touchScroll = false;
      if (!overBackground(e.target)) return;
      endStroke();                       // pressing starts a clean, deeper stroke
      addPoint(e.clientX, e.clientY, true);
    }, { passive: true });
    window.addEventListener("pointerup", function (e) {
      pressed = false;
      if (e.pointerType === "touch") endStroke();
    }, { passive: true });
    // On touch the browser takes the gesture over for scrolling and cancels the
    // pointer. Keep cutting from passive touchmoves so the finger still slices
    // the (fixed) background while the page scrolls under it.
    window.addEventListener("pointercancel", function (e) {
      if (e.pointerType === "touch") touchScroll = true;
      else { pressed = false; endStroke(); }
    }, { passive: true });
    window.addEventListener("touchmove", function (e) {
      if (!touchScroll || !e.touches.length) return;
      var tp = e.touches[0];
      if (!overBackground(document.elementFromPoint(tp.clientX, tp.clientY))) { endStroke(); return; }
      addPoint(tp.clientX, tp.clientY, true);
    }, { passive: true });
    window.addEventListener("touchend", function () { touchScroll = false; pressed = false; endStroke(); }, { passive: true });
    document.addEventListener("mouseleave", endStroke);
    window.addEventListener("blur", function () { pressed = false; endStroke(); });
    // A mouse drag that starts on empty background or the decorative wordmark
    // would otherwise paint a text selection across the hero; copy text
    // (lede, prompt, headings, links) stays selectable.
    document.addEventListener("mousedown", function (e) {
      if (e.button === 0 && overBackground(e.target) && !e.target.closest("p, h2, h3, a, li, figure, footer")) e.preventDefault();
    });
  }

  /* ---------- Video clips ----------
   * Clips are muted, looping and preload="none", so nothing downloads until a
   * clip first plays. Carousel clips play only while they face the front of a
   * ring that is on screen; other clips play while they're in view. With
   * prefers-reduced-motion nothing ever plays: the poster frames stand in.
   */
  function setPlaying(video, on) {
    if (on && video.paused) {
      var p = video.play();
      if (p && p.catch) p.catch(function () {});   // autoplay refusals just leave the poster
    } else if (!on && !video.paused) {
      video.pause();
    }
  }
  var observe = "IntersectionObserver" in window ? function (el, cb) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { cb(e.isIntersecting && e.intersectionRatio >= 0.25); });
    }, { threshold: [0, 0.25, 0.6] }).observe(el);
  } : function (el, cb) { cb(true); };

  /* ---------- Rotating carousels ---------- */
  var FRONT = 65;   // degrees either side of the viewer that count as "facing front"
  var carousels = Array.prototype.slice.call(document.querySelectorAll(".carousel"));
  var state = carousels.map(function (el, i) {
    var ring = el.querySelector(".ring");
    var items = Array.prototype.slice.call(ring.children);
    var n = items.length;
    var step = 360 / n;
    var radius = Math.round((172 / 2) / Math.tan(Math.PI / n)) + 36;
    var clips = [];
    items.forEach(function (it, k) {
      it.style.transform = "rotateY(" + (k * step) + "deg) translateZ(" + radius + "px)";
      var v = it.querySelector("video");
      if (v) clips.push({ el: v, base: k * step });
    });
    var s = { ring: ring, radius: radius, angle: i * 30, speed: i % 2 ? -14 : 14, paused: false, clips: clips, onScreen: false };
    el.addEventListener("mouseenter", function () { s.paused = true; });
    el.addEventListener("mouseleave", function () { s.paused = false; });
    if (clips.length && !reduce) observe(el, function (vis) { s.onScreen = vis; syncClips(s); });
    return s;
  });

  function syncClips(s) {
    for (var c = 0; c < s.clips.length; c++) {
      var a = ((s.clips[c].base + s.angle) % 360 + 540) % 360 - 180;   // -180..180, 0 = facing viewer
      setPlaying(s.clips[c].el, s.onScreen && !document.hidden && Math.abs(a) < FRONT);
    }
  }

  function place(s) {
    s.ring.style.transform = "translateZ(" + (-s.radius) + "px) rotateX(-6deg) rotateY(" + s.angle + "deg)";
  }
  state.forEach(place);

  var last = 0;
  function spin(ms) {
    var dt = last ? Math.min(0.05, (ms - last) / 1000) : 0;
    last = ms;
    state.forEach(function (s) {
      if (!s.paused) s.angle += s.speed * dt;
      place(s);
      if (s.clips.length) syncClips(s);
    });
    requestAnimationFrame(spin);
  }
  if (!reduce) requestAnimationFrame(spin);

  // Clips outside carousels (the app pages' hero and gallery)
  var loose = Array.prototype.slice.call(document.querySelectorAll("video")).filter(function (v) { return !v.closest(".carousel"); });
  if (!reduce) {
    loose.forEach(function (v) {
      observe(v, function (vis) { v._inView = vis; setPlaying(v, vis && !document.hidden); });
    });
  }
  document.addEventListener("visibilitychange", function () {
    loose.forEach(function (v) { setPlaying(v, !reduce && v._inView && !document.hidden); });
    state.forEach(function (s) { if (s.clips.length) syncClips(s); });
  });
})();
