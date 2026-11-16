// A drawing in a view (the flow chart, the database diagram). What the student asked for on the
// KK2 page, from the start here:
//   - "just make it so diagram and flow is fully visible and not cut out in the window": at 100 %
//     the WHOLE drawing fits its view, in width and in height; − and + zoom from there;
//   - dragging the background moves around in the drawing;
//   - "everything visible at the right timing and right view": in Berättelsen the view zooms in on
//     what is lit, with room around it, and glides there when the scene changes; with nothing lit
//     it shows the whole drawing. ⌖ Följ in the view's bar turns that off and on (kept in this
//     browser); dragging turns it off and keeps the zoom on screen; turning it on starts from 100 %.
(function () {
  'use strict';
  var HM = window.HM;
  HM.draw = {};

  // How thick a scrollbar is here (0 where scrollbars lie on top of the content). The follow zoom
  // counts with the view's size WITHOUT scrollbars, so a scrollbar that comes or goes never
  // changes the result (on the KK2 page that made the view flicker).
  function scrollbarSize() {
    var d = document.createElement('div');
    d.style.cssText = 'position:absolute;top:-999px;left:0;width:100px;height:100px;overflow:scroll;visibility:hidden';
    document.body.appendChild(d);
    var w = d.offsetWidth - d.clientWidth;
    d.parentNode.removeChild(d);
    return w;
  }

  // opts: targets() -> the elements to keep in view, pad, minW, minH (in the drawing's own units), max (screen pixels per unit),
  //       core(el) -> the part of a lit element that must be readable in a small view (a box in the drawing's units), or null for all of it
  HM.draw.attach = function (pane, body, svg, opts) {
    var d = { pane: pane, body: body, svg: svg, on: HM.store.get('folj-' + pane, true) !== false, anim: 0, glide: 0 };
    var pad = opts.pad || 60, minW = opts.minW || 400, minH = opts.minH || 280, maxScale = opts.max || 1.6;
    var READ = 0.9, TIGHT = 14;        // a small view: at least READ px per unit, with TIGHT units of room around
    var vb = svg.viewBox.baseVal;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'followbtn';
    btn.textContent = '⌖ Följ';
    function paintBtn() {
      btn.setAttribute('aria-pressed', String(d.on));
      btn.title = d.on ? 'Följer det som lyser (klicka för att visa hela ritningen)' : 'Följ det som lyser';
    }
    paintBtn();
    // The view's bar exists once the layout has been built.
    var off = HM.on('layout', function () { off(); HM.layout.addControl(pane, btn); });

    function following() { return d.on && HM.mode === 'berattelse' && HM.layout.isShown(pane); }
    function geo() {
      var cs = getComputedStyle(body);
      var w = body.offsetWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
      var h = body.offsetHeight - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
      var top = svg.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;     // text above the drawing
      var cw = w - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), ch = h - top - parseFloat(cs.paddingBottom) - 6;
      return { w: w, h: h, fit: Math.max(0.02, Math.min(cw / vb.width, ch > 40 ? ch / vb.height : Infinity)) };
    }
    function stop() { cancelAnimationFrame(d.anim); d.anim = 0; }
    // Shows the drawing at scale sc (screen pixels per unit) with the point c in the middle of the view.
    function put(sc, c) {
      svg.style.width = (sc * vb.width) + 'px';
      var b = body.getBoundingClientRect(), s = svg.getBoundingClientRect();
      body.scrollLeft += s.left - b.left + (c.x - vb.x) * sc - body.clientWidth / 2;
      body.scrollTop += s.top - b.top + (c.y - vb.y) * sc - body.clientHeight / 2;
    }
    function now() {                                         // the scale and the middle point on screen
      var b = body.getBoundingClientRect(), s = svg.getBoundingClientRect(), sc = s.width / vb.width || 1;
      return { sc: sc, c: { x: vb.x + (b.left + body.clientWidth / 2 - s.left) / sc, y: vb.y + (b.top + body.clientHeight / 2 - s.top) / sc } };
    }
    function target() {
      var els = (opts.targets() || []).filter(function (e) { return e.getClientRects().length; });
      if (!els.length) return null;
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      var k0 = 1e9, l0 = 1e9, k1 = -1e9, l1 = -1e9;                 // the same for the cores
      els.forEach(function (g) {
        var b = g.getBBox(), c = (opts.core && opts.core(g)) || b;
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
        k0 = Math.min(k0, c.x); l0 = Math.min(l0, c.y); k1 = Math.max(k1, c.x + c.width); l1 = Math.max(l1, c.y + c.height);
      });
      return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: Math.max(x1 - x0 + 2 * pad, minW), h: Math.max(y1 - y0 + 2 * pad, minH),
        core: { x: k0, y: l0, w: k1 - k0, h: l1 - l0 } };
    }

    // 100 % = the whole drawing. The middle of what is seen stays in the middle.
    d.fit = function () {
      if (!HM.layout.isShown(pane) || !body.clientWidth) return;
      if (following()) { d.show(false); return; }
      stop();
      var was = now(), g = geo();
      put(g.fit * HM.layout.zoom(pane), was.c);
    };
    // Following: zoom in on what is lit and glide there.
    d.show = function (animate) {
      if (!HM.layout.isShown(pane) || !body.clientWidth) return;
      if (!following()) { d.reveal(); return; }
      var g = geo(), sb = scrollbarSize(), t = target(), own = HM.layout.zoom(pane);
      var sc = t ? Math.min((g.w - sb) / t.w, (g.h - sb) / t.h, maxScale) : 0;
      // Asked for: the views side by side also in a narrow window. In a small view the usual room
      // around what is lit would make its text too small to read. There the room shrinks, down to
      // a thin edge, until the text has READ px per unit (never closer than that).
      // What must be readable is the core of what is lit (a column's type, name and key; a whole
      // box of the flow chart). It is put at the left of the view, so the rest of what is lit
      // follows it as far as the view reaches.
      var c1 = t ? { x: t.cx, y: t.cy } : { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2 };
      if (t && sc < READ) {
        var tight = Math.min((g.w - sb) / (t.core.w + 2 * TIGHT), (g.h - sb) / (t.core.h + 2 * TIGHT), READ);
        if (tight > sc) {
          sc = tight;
          var vw = (g.w - sb) / sc, vh = (g.h - sb) / sc;      // the view, in the drawing's units
          c1 = { x: t.w <= vw ? t.cx : t.core.x - TIGHT + vw / 2, y: t.h <= vh ? t.cy : t.core.y + t.core.h / 2 };
        }
      }
      var s1 = (t ? Math.max(g.fit, sc) : g.fit) * own;
      var from = now();
      stop();
      if (!animate || document.hidden || HM.reduced()) { put(s1, c1); return; }
      var start = performance.now(), size0 = body.offsetWidth + 'x' + body.offsetHeight, my = ++d.glide, got = false;
      // Where the browser gives no frames (a page that is not being drawn right now), the view
      // goes straight to its place instead of waiting for a glide that never starts.
      setTimeout(function () { if (!got && d.glide === my && d.anim) { stop(); put(s1, c1); } }, 250);
      function step(time) {
        got = true;
        var k = Math.min(1, (time - start) / 450), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        put(from.sc + (s1 - from.sc) * e, { x: from.c.x + (c1.x - from.c.x) * e, y: from.c.y + (c1.y - from.c.y) * e });
        if (k < 1) { d.anim = requestAnimationFrame(step); return; }
        d.anim = 0;
        if (body.offsetWidth + 'x' + body.offsetHeight !== size0) d.show(false);       // the view itself changed size meanwhile
      }
      d.anim = requestAnimationFrame(step);
    };
    // Utforska: no zooming, but what is lit is scrolled into view if it is outside.
    d.reveal = function () {
      var els = (opts.targets() || []).filter(function (e) { return e.getClientRects().length; });
      if (!els.length) return;
      var b = body.getBoundingClientRect(), r = els[0].getBoundingClientRect();
      if (r.top < b.top || r.bottom > b.top + body.clientHeight) body.scrollTop += r.top - b.top - body.clientHeight / 3;
      if (r.left < b.left || r.right > b.left + body.clientWidth) body.scrollLeft += r.left - b.left - body.clientWidth / 3;
    };
    function setFollow(on, keep) {
      var was = following();
      stop();
      d.on = on;
      HM.store.set('folj-' + pane, on);
      paintBtn();
      if (keep) {                                            // a drag: the zoom on screen becomes the view's zoom
        if (was) HM.layout.setZoom(pane, Math.round(now().sc / geo().fit * 100) / 100);
        return;
      }
      if (on) HM.layout.setZoom(pane, 1);                    // the follow view itself, without an earlier zoom
      if (following()) d.show(true); else d.fit();
    }
    btn.addEventListener('click', function () { setFollow(!d.on); });

    // Dragging the background moves around in the drawing; a drag of a few pixels is still a click.
    body.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('.node, button, a, select, input')) return;
      var x0 = e.clientX, y0 = e.clientY, sl = body.scrollLeft, st = body.scrollTop, moved = false;
      function move(ev) {
        var dx = ev.clientX - x0, dy = ev.clientY - y0;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
        if (!moved) {
          moved = true;
          body.classList.add('panning');
          if (following()) { setFollow(false, true); sl = body.scrollLeft + dx; st = body.scrollTop + dy; }   // go on from where the glide stopped
        }
        body.scrollLeft = sl - dx;
        body.scrollTop = st - dy;
      }
      function up() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', up);
        body.classList.remove('panning');
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
    });

    HM.layout.setZoomer(pane, function () { d.fit(); });
    HM.on('panesize', function (e) { if (e.pane === pane && !d.anim) d.fit(); });
    HM.on('paneshow', function (e) { if (e.pane === pane) d.fit(); });
    HM.on('mode', function () { stop(); d.fit(); });
    return d;
  };
})();
