// The views' frame: where each view sits, how big it is, its bar (zoom, full size, hide), the ready
// layouts and the text size. Built on what the student asked for on the KK2 page: views side by side
// that can be arranged and resized, each with its own zoom and full screen, a one-row header, and
// the arrangement remembered in this browser, one per mode.
// First version: the views are arranged with the ready layouts and resized by dragging the joints.
// Dragging a view onto another (tabs, docking) from the KK2 page is not carried over yet.
(function () {
  'use strict';
  var HM = window.HM;
  var ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  var TEXTS = [0.8, 0.9, 1, 1.1, 1.25, 1.5];
  var L = HM.layout = { panes: [], textScale: 1 };
  var hub, store, titles = {}, zoomers = {}, zooms = {}, trees = {}, sizes = {}, shown = {};

  // ------------------------------------------------------------------ the arrangement: a tree
  // { t: 's', d: 'row' | 'col', c: [nodes], w: [weights] } splits its place; { t: 'g', p: [view] } is a view.
  function G(p) { return { t: 'g', p: [p] }; }
  function S(d, c, w) { c = c.map(function (x) { return typeof x === 'string' ? G(x) : x; }); return { t: 's', d: d, c: c, w: w || c.map(function () { return 1; }) }; }
  var PRESETS = {
    start: { name: 'Startlayout', make: function () { return S('col', ['panel', S('row', ['er', 'flow', 'cal'], [30, 36, 34]), S('row', ['code', 'sql'], [60, 40])], [20, 42, 38]); } },
    '3x2': { name: '3 uppe, 3 nere', make: function () { return S('col', [S('row', ['er', 'flow', 'cal']), S('row', ['code', 'sql', 'panel'])]); } },
    '2x3': { name: '2, 2 och 2', make: function () { return S('col', [S('row', ['panel', 'er']), S('row', ['flow', 'cal']), S('row', ['code', 'sql'])]); } },
    sex: { name: '6 sida vid sida', make: function () { return S('row', ['panel', 'er', 'flow', 'cal', 'code', 'sql']); } },
    kod: { name: 'Koden stor', make: function () { return S('row', ['code', S('col', ['panel', 'sql'])], [60, 40]); } },
    data: { name: 'Databasen och kalendern', make: function () { return S('row', [S('col', ['er', 'cal'], [45, 55]), S('col', ['sql', 'panel'], [60, 40])], [55, 45]); } },
    staplat: { name: 'Allt staplat', make: function () { return S('col', ['panel', 'er', 'flow', 'cal', 'code', 'sql']); } }
  };
  function panesIn(n, out) { out = out || []; if (!n) return out; if (n.t === 'g') out.push(n.p[0]); else n.c.forEach(function (c) { panesIn(c, out); }); return out; }
  // A split with one part left is that part; an empty split is nothing.
  function tidy(n) {
    if (!n || n.t === 'g') return n;
    var c = [], w = [];
    n.c.forEach(function (x, i) { var t = tidy(x); if (t) { c.push(t); w.push(n.w[i]); } });
    if (!c.length) return null;
    if (c.length === 1) return c[0];
    return { t: 's', d: n.d, c: c, w: w };
  }
  function valid(n) {
    if (!n || typeof n !== 'object') return false;
    if (n.t === 'g') return Array.isArray(n.p) && n.p.length === 1 && L.panes.indexOf(n.p[0]) >= 0;
    return n.t === 's' && (n.d === 'row' || n.d === 'col') && Array.isArray(n.c) && n.c.length > 0 && Array.isArray(n.w) && n.w.length === n.c.length &&
      n.w.every(function (x) { return typeof x === 'number' && x > 0; }) && n.c.every(valid);
  }
  function tree() { return trees[HM.mode]; }
  function save() { HM.store.set('layout', { v: 1, trees: trees, zooms: zooms, text: L.textScale }); }

  // ------------------------------------------------------------------ drawing the arrangement
  function build(n) {
    var el = document.createElement('div');
    if (n.t === 'g') { el.className = 'pgroup'; el.appendChild(L.el(n.p[0])); return el; }
    el.className = 'psplit ' + n.d;
    n.c.forEach(function (c, i) {
      if (i) {
        var sp = document.createElement('div');
        sp.className = 'splitter';
        sp.tabIndex = 0;
        sp.setAttribute('role', 'separator');
        sp.setAttribute('aria-orientation', n.d === 'row' ? 'vertical' : 'horizontal');
        sp.setAttribute('aria-label', 'Ändra storlek (dra, eller piltangenterna)');
        sp._node = n; sp._i = i;
        el.appendChild(sp);
      }
      var part = build(c);
      part.style.flex = n.w[i] + ' 1 0';
      el.appendChild(part);
    });
    return el;
  }
  function scrollers(p) { return [L.body(p)].concat(Array.prototype.slice.call(L.el(p).querySelectorAll('[data-scroll]'))); }
  L.apply = function (reason) {
    var mem = {};
    L.panes.forEach(function (p) { if (L.isShown(p)) mem[p] = scrollers(p).map(function (b) { return [b.scrollTop, b.scrollLeft]; }); });
    L.panes.forEach(function (p) { store.appendChild(L.el(p)); });
    var old = hub.querySelector('.proot');
    if (old) hub.removeChild(old);
    var root = build(tree());
    root.classList.add('proot');
    hub.insertBefore(root, store);
    // Where each view was scrolled to is kept when the views move.
    L.panes.forEach(function (p) { if (mem[p] && L.isShown(p)) scrollers(p).forEach(function (b, k) { if (mem[p][k]) { b.scrollTop = mem[p][k][0]; b.scrollLeft = mem[p][k][1]; } }); });
    Array.prototype.forEach.call(document.querySelectorAll('.viewtoggle'), function (b) { b.setAttribute('aria-pressed', String(L.inLayout(b.getAttribute('data-pane')))); });
    L.panes.forEach(L.applyZoom);
    HM.emit('layout', { reason: reason || '' });
    L.panes.forEach(function (p) { var now = L.isShown(p); if (now && !shown[p]) HM.emit('paneshow', { pane: p }); shown[p] = now; });
  };

  // ------------------------------------------------------------------ the views
  L.el = function (p) { return document.getElementById('pane-' + p); };
  L.body = function (p) { return document.getElementById('body-' + p); };
  L.inLayout = function (p) { return panesIn(tree()).indexOf(p) >= 0; };
  L.isShown = function (p) { return L.inLayout(p) && L.el(p).getClientRects().length > 0; };
  L.activate = function (p) { if (!L.inLayout(p)) L.show(p, true); };
  L.show = function (p, on) {
    var t = tree();
    if (on === L.inLayout(p)) return;
    if (on) trees[HM.mode] = t ? (t.t === 's' && t.d === 'row' ? { t: 's', d: 'row', c: t.c.concat([G(p)]), w: t.w.concat([t.w.reduce(function (a, b) { return a + b; }, 0) / t.w.length]) } : S('row', [t, G(p)], [72, 28])) : G(p);
    else {
      (function drop(n) { if (n.t !== 's') return; n.c.forEach(function (c, i) { if (c.t === 'g' && c.p[0] === p) { n.c.splice(i, 1); n.w.splice(i, 1); } }); n.c.forEach(drop); })(t);
      trees[HM.mode] = tidy(t.t === 'g' && t.p[0] === p ? null : t) || G(L.panes.filter(function (x) { return x !== p; })[0]);
    }
    L.apply('show');
    save();
  };
  L.addControl = function (p, button) { var ctl = L.el(p).querySelector('.panectl'); ctl.insertBefore(button, ctl.firstChild); };

  // ------------------------------------------------------------------ zoom and text size
  L.zoom = function (p) { return zooms[p] || 1; };
  L.setZoomer = function (p, fn) { zoomers[p] = fn; };
  L.applyZoom = function (p) {
    var body = L.body(p), own = L.zoom(p);
    L.el(p).querySelector('.zoomval').textContent = Math.round(own * 100) + ' %';
    if (!L.isShown(p)) return;
    if (zoomers[p]) zoomers[p](body, own, L.textScale); else body.style.zoom = own * L.textScale;
  };
  L.setZoom = function (p, z) { zooms[p] = z; L.applyZoom(p); save(); };
  function stepZoom(p, dir) {
    var z = L.zoom(p), next = 1;
    if (dir > 0) next = ZOOMS.filter(function (x) { return x > z + 0.001; })[0] || z;
    if (dir < 0) next = ZOOMS.filter(function (x) { return x < z - 0.001; }).pop() || z;
    L.setZoom(p, next);
  }
  function setText(scale) {
    L.textScale = scale;
    document.getElementById('textval').textContent = Math.round(scale * 100) + ' %';
    L.panes.forEach(L.applyZoom);
    HM.emit('text', { scale: scale });
    save();
  }

  // ------------------------------------------------------------------ full size
  // A view can fill the whole window (⛶ in its bar, Esc goes back); the page button uses the
  // browser's full screen where it is allowed.
  function setMaxed(p) {
    L.panes.forEach(function (x) { L.el(x).classList.toggle('maxed', x === p); });
    document.body.classList.toggle('maxing', !!p);
    L.panes.forEach(function (x) {
      var b = L.el(x).querySelector('[data-act="full"]');
      b.setAttribute('aria-pressed', String(x === p));
      b.title = x === p ? 'Tillbaka (Esc)' : 'Vyn i helskärm (Esc avslutar)';
    });
    L.panes.forEach(L.applyZoom);
  }
  function maxed() { return L.panes.filter(function (p) { return L.el(p).classList.contains('maxed'); })[0] || null; }

  // ------------------------------------------------------------------ start
  L.init = function (cfg) {
    hub = document.getElementById('panes');
    store = document.createElement('div');
    store.hidden = true;
    store.id = 'panestore';
    hub.appendChild(store);
    cfg.panes.forEach(function (p) {
      L.panes.push(p.id);
      titles[p.id] = p.title;
      var bar = document.createElement('div');
      bar.className = 'panebar';
      bar.innerHTML = '<span class="panetitle">' + HM.esc(p.title) + '</span><span class="panectl">' +
        '<button type="button" data-act="zoomout" title="Zooma ut (Ctrl + mushjul)" aria-label="Zooma ut ' + HM.esc(p.title) + '">−</button><span class="zoomval">100 %</span>' +
        '<button type="button" data-act="zoomin" title="Zooma in (Ctrl + mushjul)" aria-label="Zooma in ' + HM.esc(p.title) + '">+</button>' +
        '<button type="button" data-act="zoomreset" title="Tillbaka till 100 %" aria-label="Återställ zoomen för ' + HM.esc(p.title) + '">⟲</button>' +
        '<button type="button" data-act="full" aria-pressed="false" title="Vyn i helskärm (Esc avslutar)" aria-label="' + HM.esc(p.title) + ' i helskärm">⛶</button>' +
        '<button type="button" data-act="hide" title="Dölj vyn" aria-label="Dölj ' + HM.esc(p.title) + '">×</button></span>';
      L.el(p.id).insertBefore(bar, L.body(p.id));
    });
    // What was saved in this browser, if it still makes sense.
    var saved = HM.store.get('layout', null);
    ['utforska', 'berattelse'].forEach(function (m) {
      trees[m] = saved && saved.v === 1 && saved.trees && valid(saved.trees[m]) ? saved.trees[m] : PRESETS.start.make();
    });
    L.panes.forEach(function (p) { zooms[p] = saved && saved.zooms && ZOOMS.indexOf(saved.zooms[p]) >= 0 ? saved.zooms[p] : 1; });
    L.textScale = saved && TEXTS.indexOf(saved.text) >= 0 ? saved.text : 1;

    // The Layout menu: the ready layouts, one switch per view, and a reset.
    var pop = document.getElementById('laypop'), h = '<h4>Färdiga layouter</h4><div class="presets">';
    Object.keys(PRESETS).forEach(function (k) { h += '<button type="button" data-preset="' + k + '">' + HM.esc(PRESETS[k].name) + '</button>'; });
    h += '</div><h4>Vyer</h4><div class="vyer" role="group" aria-label="Vyer">';
    cfg.panes.forEach(function (p) { h += '<button type="button" class="viewtoggle" data-pane="' + p.id + '" aria-pressed="true">' + HM.esc(p.title) + '</button>'; });
    h += '</div><p>Dra i skarvarna mellan vyerna för att ändra storlek. Varje vy har egen zoom (− och +) och kan visas i helskärm (⛶). Berättelsen och Utforska har var sin layout, och valet sparas i webbläsaren.</p>' +
      '<button type="button" class="layreset" data-preset="aterstall">Återställ allt</button>';
    pop.innerHTML = h;
    var menu = document.getElementById('laymenu');
    pop.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var preset = b.getAttribute('data-preset'), pane = b.getAttribute('data-pane');
      if (preset === 'aterstall') {
        trees.utforska = PRESETS.start.make(); trees.berattelse = PRESETS.start.make();
        L.panes.forEach(function (p) { zooms[p] = 1; });
        setText(1);
        L.apply('reset');
      } else if (preset) { trees[HM.mode] = PRESETS[preset].make(); L.apply('preset'); }
      else if (pane) { L.show(pane, !L.inLayout(pane)); return; }
      save();
    });
    document.addEventListener('pointerdown', function (e) { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
      else if (maxed()) setMaxed(null);
    });

    // The buttons in a view's bar.
    hub.addEventListener('click', function (e) {
      var b = e.target.closest('.panebar button[data-act]');
      if (!b) return;
      var p = b.closest('.pane').getAttribute('data-pane'), act = b.getAttribute('data-act');
      if (act === 'zoomin') stepZoom(p, 1);
      else if (act === 'zoomout') stepZoom(p, -1);
      else if (act === 'zoomreset') stepZoom(p, 0);
      else if (act === 'full') setMaxed(maxed() === p ? null : p);
      else if (act === 'hide') { if (maxed() === p) setMaxed(null); L.show(p, false); }
    });
    // Ctrl + mouse wheel zooms the view under the mouse.
    hub.addEventListener('wheel', function (e) {
      var pane = e.ctrlKey && e.target.closest('.pane');
      if (!pane) return;
      e.preventDefault();
      stepZoom(pane.getAttribute('data-pane'), e.deltaY < 0 ? 1 : -1);
    }, { passive: false });

    // The joints: drag one, or use the arrow keys on it, and the two parts next to it share the room differently.
    function share(sp, deltaPx) {
      var n = sp._node, i = sp._i, a = sp.previousElementSibling, b = sp.nextElementSibling;
      var row = n.d === 'row', sa = row ? a.offsetWidth : a.offsetHeight, sb = row ? b.offsetWidth : b.offsetHeight, total = sa + sb, w = n.w[i - 1] + n.w[i];
      var na = HM.clamp(sa + deltaPx, Math.min(90, total / 2), total - Math.min(90, total / 2));
      n.w[i - 1] = w * na / total;
      n.w[i] = w - n.w[i - 1];
      a.style.flex = n.w[i - 1] + ' 1 0';
      b.style.flex = n.w[i] + ' 1 0';
    }
    hub.addEventListener('pointerdown', function (e) {
      var sp = e.target.closest('.splitter');
      if (!sp || e.button !== 0) return;
      e.preventDefault();
      var row = sp._node.d === 'row', last = row ? e.clientX : e.clientY;
      document.body.classList.add('splitting');
      function move(ev) { var now = row ? ev.clientX : ev.clientY; share(sp, now - last); last = now; }
      function up() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', up);
        document.body.classList.remove('splitting');
        save();
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
    });
    hub.addEventListener('keydown', function (e) {
      var sp = e.target.closest && e.target.closest('.splitter');
      if (!sp) return;
      var row = sp._node.d === 'row', d = { ArrowLeft: row ? -24 : 0, ArrowRight: row ? 24 : 0, ArrowUp: row ? 0 : -24, ArrowDown: row ? 0 : 24 }[e.key];
      if (!d) return;
      e.preventDefault();
      e.stopPropagation();
      share(sp, d);
      save();
    });

    // Text size and the page's full screen.
    document.getElementById('textminus').addEventListener('click', function () { setText(TEXTS[Math.max(0, TEXTS.indexOf(L.textScale) - 1)]); });
    document.getElementById('textplus').addEventListener('click', function () { setText(TEXTS[Math.min(TEXTS.length - 1, TEXTS.indexOf(L.textScale) + 1)]); });
    document.getElementById('textval').textContent = Math.round(L.textScale * 100) + ' %';
    var fullBtn = document.getElementById('fullbtn'), de = document.documentElement;
    if (!de.requestFullscreen || document.fullscreenEnabled === false) fullBtn.hidden = true;
    fullBtn.addEventListener('click', function () {
      var r = document.fullscreenElement ? document.exitFullscreen() : de.requestFullscreen();
      if (r && r.catch) r.catch(function () { fullBtn.hidden = true; });       // not allowed here (a page inside another app)
    });
    document.addEventListener('fullscreenchange', function () { fullBtn.setAttribute('aria-pressed', String(!!document.fullscreenElement)); });

    // A view that changes size tells the others ('panesize'), so each can fit its content again.
    if (window.ResizeObserver) L.panes.forEach(function (p) {
      new ResizeObserver(function () {
        var b = L.body(p), now = b.clientWidth + 'x' + b.clientHeight;
        if (now === sizes[p] || !L.isShown(p) || !b.clientWidth) return;
        sizes[p] = now;
        HM.emit('panesize', { pane: p });
      }).observe(L.body(p));
    });
    HM.on('mode', function () { L.apply('mode'); });
    L.apply('init');
  };
})();
