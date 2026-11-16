// The views' frame: where each view sits, how big it is, its bar (move, zoom, full size, hide),
// the ready layouts and the text size. Built on what the student asked for on the KK2 page, and
// then for this page ("Flyttbara vyer"): every view "kan synas o läggas var som helst i vyn".
//   - The arrangement is a tree: a split (a row or a column) of parts, where each part is a split
//     again or a group of views. A group with several views shows them as tabs.
//   - Drag a view by its handle (⠿) or its tab onto another view: near an edge the place is split
//     in that direction, in the middle the two views change places ("moving around must not force
//     them into tabs"), on the other view's bar it joins it as a tab ("so i can have them as
//     flikar inside each other").
//   - The joints between the views are dragged to resize, and only the two parts beside a joint
//     change ("resizing should only apply selected per window"). Where joints meet there is one
//     square that moves all of them at once ("en som gör lika uppe och nere så jag kan ändra i en
//     kvadrat", "bara en räcker").
//   - The keyboard does the same: the arrow keys on a handle change places with the neighbour, on
//     a tab they choose the tab beside it, on a joint or a square they resize.
//   - Each view has its own zoom and full size, the header its text size, and the arrangement is
//     remembered in this browser, one for Berättelsen and one for Utforska.
(function () {
  'use strict';
  var HM = window.HM;
  var ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  var TEXTS = [0.8, 0.9, 1, 1.1, 1.25, 1.5];
  var MODES = ['utforska', 'berattelse'];
  var L = HM.layout = { panes: [], textScale: 1 };
  var hub, store, titles = {}, zoomers = {}, zooms = {}, trees = {}, sizes = {}, shown = {}, splitRefs = [], scrollMem = {};
  // Asked for: the views side by side also in a narrow window ("Ja, gör det"). The views lie under
  // each other only in a window of STACK px or narrower (a phone). In a window narrower than NARROW
  // px the arrangement that nobody has changed is the compact one (the ready layout "Smalt fönster"),
  // in a wider window it is the starting layout. own says, per mode, whether the arrangement is the
  // user's own (moved, resized or chosen), which is then kept whatever the window's width.
  var STACK = 700, NARROW = 1000, own = {};
  L.stacked = function () { return !!(window.matchMedia && matchMedia('(max-width: ' + STACK + 'px)').matches); };
  function narrow() { return window.innerWidth < NARROW; }

  // ------------------------------------------------------------------ the arrangement: a tree
  // { t: 's', d: 'row' | 'col', c: [nodes], w: [weights] } splits its place (row: side by side,
  // col: above each other). { t: 'g', p: [views], a: view } is a group: one view, or several as
  // tabs with a as the one shown.
  function G(p) { return { t: 'g', p: [p], a: p }; }
  function T() { var ps = [].slice.call(arguments); return { t: 'g', p: ps, a: ps[0] }; }
  function S(d, c, w) { c = c.map(function (x) { return typeof x === 'string' ? G(x) : x; }); return { t: 's', d: d, c: c, w: w || c.map(function () { return 1; }) }; }
  var PRESETS = {
    start: { name: 'Startlayout', make: function () { return S('col', ['panel', S('row', ['er', 'flow', 'cal'], [30, 36, 34]), S('row', ['code', 'sql'], [60, 40])], [20, 42, 38]); } },
    smalt: { name: 'Smalt fönster', make: function () { return S('col', ['panel', S('row', ['er', 'flow', 'sql'], [34, 30, 36]), S('row', ['cal', 'code'], [56, 44])], [20, 36, 44]); } },
    '3x2': { name: '3 uppe, 3 nere', make: function () { return S('col', [S('row', ['er', 'flow', 'cal']), S('row', ['code', 'sql', 'panel'])]); } },
    '2x3': { name: '2, 2 och 2', make: function () { return S('col', [S('row', ['panel', 'er']), S('row', ['flow', 'cal']), S('row', ['code', 'sql'])]); } },
    sex: { name: '6 sida vid sida', make: function () { return S('row', ['panel', 'er', 'flow', 'cal', 'code', 'sql']); } },
    kod: { name: 'Koden stor', make: function () { return S('row', ['code', S('col', ['panel', 'sql'])], [60, 40]); } },
    data: { name: 'Databasen och kalendern', make: function () { return S('row', [S('col', ['er', 'cal'], [45, 55]), S('col', ['sql', 'panel'], [60, 40])], [55, 45]); } },
    flikar: { name: 'Flikar', make: function () { return S('col', ['panel', S('row', [T('flow', 'er'), T('code', 'sql'), 'cal'], [34, 36, 30])], [22, 78]); } },
    staplat: { name: 'Allt staplat', make: function () { return S('col', ['panel', 'er', 'flow', 'cal', 'code', 'sql']); } }
  };
  function standard() { return (narrow() ? PRESETS.smalt : PRESETS.start).make(); }
  // The standard arrangement follows the window: when the window has become narrower or wider
  // than NARROW px, a mode whose arrangement nobody has changed gets the other standard one.
  // Says whether the arrangement shown now was changed. It is asked when the window is resized
  // and every time the arrangement is drawn (a page that is not being drawn gets no resize event).
  var wasNarrow = null;
  function followWidth() {
    var n = narrow(), changed = false;
    if (wasNarrow === null || n === wasNarrow) { wasNarrow = n; return false; }
    wasNarrow = n;
    MODES.forEach(function (m) { if (!own[m]) { trees[m] = standard(); if (m === HM.mode) changed = true; } });
    return changed;
  }
  function panesIn(n, out) { out = out || []; if (!n) return out; if (n.t === 'g') n.p.forEach(function (p) { out.push(p); }); else n.c.forEach(function (c) { panesIn(c, out); }); return out; }
  // A saved arrangement is used only if it still makes sense: known views, each at most once, a
  // shown view in every group, weights above zero.
  function valid(n, seen) {
    seen = seen || {};
    if (!n || typeof n !== 'object') return false;
    if (n.t === 'g') {
      return Array.isArray(n.p) && n.p.length > 0 && n.p.indexOf(n.a) >= 0 &&
        n.p.every(function (p) { if (L.panes.indexOf(p) < 0 || seen[p]) return false; seen[p] = true; return true; });
    }
    return n.t === 's' && (n.d === 'row' || n.d === 'col') && Array.isArray(n.c) && n.c.length > 0 && Array.isArray(n.w) && n.w.length === n.c.length &&
      n.w.every(function (x) { return typeof x === 'number' && x > 0 && isFinite(x); }) && n.c.every(function (c) { return valid(c, seen); });
  }
  // An arrangement saved by the first version of the page had one view per group and no tab chosen.
  function withTabs(n) {
    if (!n || typeof n !== 'object') return n;
    if (n.t === 'g') { if (Array.isArray(n.p) && n.p.indexOf(n.a) < 0) n.a = n.p[0]; }
    else if (Array.isArray(n.c)) n.c.forEach(withTabs);
    return n;
  }
  // After a change: no empty groups, no split with one part, and a split inside a split of the
  // same direction becomes parts of it (each keeps its share of the room).
  function tidy(n) {
    if (!n) return null;
    if (n.t === 'g') { if (!n.p.length) return null; if (n.p.indexOf(n.a) < 0) n.a = n.p[0]; return n; }
    var c = [], w = [];
    n.c.forEach(function (x, i) {
      var y = tidy(x);
      if (!y) return;
      if (y.t === 's' && y.d === n.d) {
        var sum = y.w.reduce(function (s, v) { return s + v; }, 0);
        y.c.forEach(function (z, j) { c.push(z); w.push(n.w[i] * y.w[j] / sum); });
      } else { c.push(y); w.push(n.w[i]); }
    });
    if (!c.length) return null;
    if (c.length === 1) return c[0];
    n.c = c;
    n.w = w;
    return n;
  }
  // The group a view is in: { g, parent, i } (parent is the split the group is a part of, or null).
  function groupOf(n, p, parent, idx) {
    if (!n) return null;
    if (n.t === 'g') return n.p.indexOf(p) >= 0 ? { g: n, parent: parent || null, i: idx } : null;
    for (var i = 0; i < n.c.length; i++) { var r = groupOf(n.c[i], p, n, i); if (r) return r; }
    return null;
  }
  function tree() { return trees[HM.mode]; }
  function setTree(t) { trees[HM.mode] = t; }
  // Only an arrangement of the user's own is saved; the standard one is saved as "none", so it can
  // follow the window's width the next time too.
  function save() {
    var keep = {};
    MODES.forEach(function (m) { keep[m] = own[m] ? trees[m] : null; });
    HM.store.set('layout', { v: 3, trees: keep, zooms: zooms, text: L.textScale });
  }

  // ------------------------------------------------------------------ drawing the arrangement
  function build(n) {
    var el = document.createElement('div');
    if (n.t === 'g') {
      el.className = 'pgroup';
      el.setAttribute('data-active', n.a);
      n.p.forEach(function (p) { var s = L.el(p); s.hidden = p !== n.a; el.appendChild(s); });
      if (n.p.length > 1) {                                   // several views in one place: their names as tabs
        var tabs = document.createElement('span'), act = L.el(n.a);
        tabs.className = 'ptabs';
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', 'Vyer på samma plats');
        n.p.forEach(function (p) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'ptab';
          b.setAttribute('role', 'tab');
          b.setAttribute('aria-selected', String(p === n.a));
          b.setAttribute('data-tab', p);
          b.title = p === n.a ? 'Dra fliken för att flytta ' + titles[p] : 'Visa ' + titles[p] + ' (eller dra fliken)';
          b.textContent = titles[p];
          tabs.appendChild(b);
        });
        act.classList.add('intabs');
        act.querySelector('.panebar').insertBefore(tabs, act.querySelector('.panetitle').nextSibling);
      }
      return el;
    }
    el.className = 'psplit ' + n.d;
    n.c.forEach(function (c, i) {
      if (i) {
        var sp = document.createElement('div'), names = function (x) { return panesIn(x).filter(isActive).map(function (q) { return titles[q]; }).join(', '); };
        sp.className = 'splitter';
        sp.tabIndex = 0;
        sp.setAttribute('role', 'separator');
        sp.setAttribute('aria-orientation', n.d === 'row' ? 'vertical' : 'horizontal');
        sp.setAttribute('aria-label', (n.d === 'row' ? 'Ändra bredden mellan ' : 'Ändra höjden mellan ') + names(n.c[i - 1]) + ' och ' + names(c) +
          (n.d === 'row' ? ' (dra, eller pilarna vänster och höger)' : ' (dra, eller pilarna upp och ner)'));
        sp.setAttribute('aria-valuemin', '0');
        sp.setAttribute('aria-valuemax', '100');
        sp.setAttribute('aria-valuenow', String(Math.round(100 * n.w[i - 1] / (n.w[i - 1] + n.w[i]))));
        sp.setAttribute('data-split', splitRefs.length);
        splitRefs.push({ n: n, i: i - 1 });
        el.appendChild(sp);
      }
      var part = build(c);
      part.style.flex = n.w[i] + ' 1 0px';
      el.appendChild(part);
    });
    return el;
  }
  // A view that is narrow keeps its name readable: its zoom buttons step aside (Ctrl + wheel still zooms).
  function slim(p) { var w = L.el(p).offsetWidth; if (w > 0) L.el(p).classList.toggle('slim', w < 340); }
  // Where each view was scrolled to. A view that is not drawn forgets it, so it is kept here while
  // the view waits behind another tab or outside the arrangement.
  function scrollers(p) { return [L.body(p)].concat(Array.prototype.slice.call(L.el(p).querySelectorAll('[data-scroll]'))); }
  function drawn(p) { return L.el(p).getClientRects().length > 0; }
  L.apply = function (reason) {
    followWidth();
    if (!tree()) setTree(G(L.panes[0]));
    if (reason === 'tab' || reason === 'show' || reason === 'swap' || reason === 'dock' || reason === 'preset') own[HM.mode] = true;
    L.panes.forEach(function (p) { if (drawn(p)) scrollMem[p] = scrollers(p).map(function (b) { return [b.scrollTop, b.scrollLeft]; }); });
    Array.prototype.slice.call(hub.querySelectorAll('.ptabs')).forEach(function (t) { t.parentNode.removeChild(t); });
    L.panes.forEach(function (p) { var el = L.el(p); el.classList.remove('intabs'); el.hidden = false; store.appendChild(el); });
    var old = hub.querySelector('.proot');
    if (old) hub.removeChild(old);
    var root;
    try { splitRefs = []; root = build(tree()); }
    catch (e) {
      // An arrangement that cannot be drawn must never leave the page without its views: the views
      // go back to waiting, and the starting layout is drawn instead.
      if (window.console) console.error('HM layout:', e);
      L.panes.forEach(function (p) { var el = L.el(p); el.classList.remove('intabs'); el.hidden = false; store.appendChild(el); });
      setTree(PRESETS.start.make());
      splitRefs = [];
      root = build(tree());
    }
    root.classList.add('proot');
    hub.insertBefore(root, store);
    buildCorners();
    L.panes.forEach(function (p) {
      var m = scrollMem[p];
      if (m && drawn(p)) scrollers(p).forEach(function (b, k) { if (m[k]) { b.scrollTop = m[k][0]; b.scrollLeft = m[k][1]; } });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.viewtoggle'), function (b) { b.setAttribute('aria-pressed', String(L.inLayout(b.getAttribute('data-pane')))); });
    var mx = maxed();
    if (mx && !isActive(mx)) setMaxed(null);                 // the view in full size is no longer the one shown
    L.panes.forEach(slim);
    L.panes.forEach(L.applyZoom);
    save();
    HM.emit('layout', { reason: reason || '' });
    // Views that were not shown before (turned on, a tab chosen, the tab in front of them moved, a
    // ready layout, the other mode) are told, so they can bring themselves up to date.
    L.panes.forEach(function (p) { var now = L.isShown(p); if (now && !shown[p]) HM.emit('paneshow', { pane: p }); shown[p] = now; });
  };
  // One square at each place where joints meet, in the middle of them. Dragging it moves every
  // joint that meets there (where four views meet in a cross, all of them). Made again after the
  // arrangement, a joint or the window changes.
  function buildCorners() {
    Array.prototype.slice.call(hub.querySelectorAll('.corner')).forEach(function (c) { c.parentNode.removeChild(c); });
    var junctions = {}, order = [];
    Array.prototype.slice.call(hub.querySelectorAll('.proot .pgroup, .pgroup.proot')).forEach(function (g) {
      var side = {}, x = g, laidOut = g.getBoundingClientRect().height > 20;
      while (x.parentNode && x.parentNode.classList && x.parentNode.classList.contains('psplit')) {
        var par = x.parentNode, row = par.classList.contains('row'), nx = x.nextElementSibling, pv = x.previousElementSibling;
        if (nx && nx.classList.contains('splitter') && !side[row ? 'right' : 'bottom']) side[row ? 'right' : 'bottom'] = nx;
        if (pv && pv.classList.contains('splitter') && !side[row ? 'left' : 'top']) side[row ? 'left' : 'top'] = pv;
        x = par;
      }
      [['right', 'bottom'], ['left', 'bottom'], ['right', 'top'], ['left', 'top']].forEach(function (k) {
        var v = side[k[0]], h = side[k[1]];
        if (!v || !h) return;
        // The meeting point: the middle of the joint beside and of the joint above or under. Before
        // the page has its sizes every point looks the same, so then only the pair counts.
        var vr = v.getBoundingClientRect(), hr = h.getBoundingClientRect();
        var key = laidOut ? Math.round((vr.left + vr.width / 2) / 6) + ',' + Math.round((hr.top + hr.height / 2) / 6)
          : v.getAttribute('data-split') + '|' + h.getAttribute('data-split');
        var j = junctions[key];
        if (!j) { j = junctions[key] = { g: g, at: (k[1] === 'top' ? 't' : 'b') + (k[0] === 'left' ? 'l' : 'r'), sx: [], sy: [] }; order.push(j); }
        if (j.sx.indexOf(v) < 0) j.sx.push(v);
        if (j.sy.indexOf(h) < 0) j.sy.push(h);
      });
    });
    order.forEach(function (j) {
      var c = document.createElement('div');
      c.className = 'corner ' + j.at;
      c.tabIndex = 0;
      c.setAttribute('role', 'button');
      c.setAttribute('aria-label', 'Ändra bredd och höjd samtidigt där skarvarna möts (dra, eller pilarna åt alla håll)');
      c.title = 'Dra för att ändra bredd och höjd samtidigt';
      c.setAttribute('data-sx', j.sx.map(function (e) { return e.getAttribute('data-split'); }).join(','));
      c.setAttribute('data-sy', j.sy.map(function (e) { return e.getAttribute('data-split'); }).join(','));
      j.g.appendChild(c);
    });
  }

  // ------------------------------------------------------------------ the views
  // Each view's element is found once and kept: while the arrangement is drawn a view sits in a
  // part that is not on the page yet, where looking it up by its id would not find it.
  var els = {}, bodies = {};
  L.el = function (p) { return els[p] || (els[p] = document.getElementById('pane-' + p)); };
  L.body = function (p) { return bodies[p] || (bodies[p] = document.getElementById('body-' + p)); };
  // inLayout: the view is somewhere in the arrangement. isActive: it is also the tab shown in its
  // group. isShown: it is really drawn on the page right now.
  L.inLayout = function (p) { return !!groupOf(tree(), p); };
  function isActive(p) { var r = groupOf(tree(), p); return !!(r && r.g.a === p); }
  L.isShown = function (p) { return isActive(p) && drawn(p); };
  L.tree = function () { return JSON.parse(JSON.stringify(tree())); };
  function flash(p) { var el = L.el(p); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  // Brings a view to the front: chooses its tab, or turns the view on if it is not shown at all.
  L.activate = function (p) {
    var r = groupOf(tree(), p);
    if (!r) { L.show(p, true); return; }
    if (r.g.a === p) return;
    var wasFull = maxed() === r.g.a;
    r.g.a = p;
    L.apply('tab');
    if (wasFull) setMaxed(p);
  };
  // After a tab is chosen from the keyboard the focus stays on that tab (the tabs are drawn anew).
  function focusTab(p) {
    var t = hub.querySelector('.ptab[data-tab="' + p + '"]');
    if (!t) return;
    t.focus();
    if (t.scrollIntoView) t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  // A view that is turned on goes last in the row, or beside the whole arrangement.
  function addToTree(p) {
    var t = tree();
    if (!t) setTree(G(p));
    else if (t.t === 's' && t.d === 'row') {
      t.c.push(G(p));
      t.w.push(t.w.reduce(function (s, v) { return s + v; }, 0) / t.w.length);
    } else setTree(S('row', [t, G(p)], [Math.max(2, panesIn(t).length - 1), 1]));
  }
  L.show = function (p, on, quiet) {
    var r = groupOf(tree(), p);
    if (on) {
      if (r) r.g.a = p; else addToTree(p);
    } else if (r) {
      if (maxed() === p) setMaxed(null);
      r.g.p.splice(r.g.p.indexOf(p), 1);
      setTree(tidy(tree()));
      if (!tree()) setTree(G(L.panes.filter(function (x) { return x !== p; })[0]));     // always at least one view
    }
    L.apply('show');
    if (on && !quiet) flash(p);
  };
  // Two views change places (the arrow keys on a handle, or a view dropped in the middle of
  // another). Each place keeps showing a view: the moved one where the other was.
  L.swap = function (a, b) {
    var ra = groupOf(tree(), a), rb = groupOf(tree(), b);
    if (!ra || !rb || a === b) return;
    ra.g.p[ra.g.p.indexOf(a)] = b;
    rb.g.p[rb.g.p.indexOf(b)] = a;
    if (ra.g === rb.g) ra.g.a = a;
    else {
      if (ra.g.a === a) ra.g.a = b;
      if (rb.g.a === b) rb.g.a = a;
    }
    L.apply('swap');
    flash(a);
  };
  // Moves view p to the view target: side is left, right, top or bottom (that place is split),
  // swap (the two change places) or center (p joins target as a tab).
  L.dock = function (p, target, side) {
    if (p === target || !groupOf(tree(), target)) return;
    if (side === 'swap') { if (groupOf(tree(), p)) L.swap(p, target); return; }
    var r = groupOf(tree(), p);
    if (r) r.g.p.splice(r.g.p.indexOf(p), 1);
    setTree(tidy(tree()));
    var t = groupOf(tree(), target);
    if (!t) { L.show(p, true); return; }
    if (side === 'center') {
      t.g.p.push(p);
      t.g.a = p;
    } else {
      var dir = side === 'left' || side === 'right' ? 'row' : 'col', before = side === 'left' || side === 'top', ng = G(p);
      if (t.parent && t.parent.d === dir) {                   // one more part in the same row or column: it gets half the target's room
        var half = t.parent.w[t.i] / 2, at = before ? t.i : t.i + 1;
        t.parent.w[t.i] = half;
        t.parent.c.splice(at, 0, ng);
        t.parent.w.splice(at, 0, half);
      } else {
        var sp = S(dir, before ? [ng, t.g] : [t.g, ng]);
        if (t.parent) t.parent.c[t.i] = sp; else setTree(sp);
      }
    }
    setTree(tidy(tree()));
    L.apply('dock');
    flash(p);
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
      var bar = document.createElement('div'), name = HM.esc(p.title);
      bar.className = 'panebar';
      bar.innerHTML = '<button type="button" class="grip" data-act="drag" title="Dra vyn till en annan vy: mot en kant delas platsen, i mitten byter de plats, på namnlisten blir den en flik. Pilarna byter plats med grannen." aria-label="Flytta ' + name + ' (dra, eller pilarna)">⠿</button>' +
        '<span class="panetitle">' + name + '</span><span class="panectl">' +
        '<button type="button" data-act="zoomout" title="Zooma ut (Ctrl + mushjul)" aria-label="Zooma ut ' + name + '">−</button><span class="zoomval">100 %</span>' +
        '<button type="button" data-act="zoomin" title="Zooma in (Ctrl + mushjul)" aria-label="Zooma in ' + name + '">+</button>' +
        '<button type="button" data-act="zoomreset" title="Tillbaka till 100 %" aria-label="Återställ zoomen för ' + name + '">⟲</button>' +
        '<button type="button" data-act="full" aria-pressed="false" title="Vyn i helskärm (Esc avslutar)" aria-label="' + name + ' i helskärm">⛶</button>' +
        '<button type="button" data-act="hide" title="Dölj vyn" aria-label="Dölj ' + name + '">×</button></span>';
      L.el(p.id).insertBefore(bar, L.el(p.id).firstChild);      // first in the view, above anything a view has put over its body
    });
    // What was saved in this browser, if it still makes sense.
    var saved = HM.store.get('layout', null), startShape = JSON.stringify(PRESETS.start.make());
    MODES.forEach(function (m) {
      var t = saved && (saved.v === 1 || saved.v === 2 || saved.v === 3) && saved.trees ? withTabs(saved.trees[m]) : null;
      // An arrangement saved by an earlier version that is exactly the starting layout was never
      // changed by anyone: it counts as the standard one, which now follows the window's width.
      own[m] = valid(t) && !(saved.v < 3 && JSON.stringify(t) === startShape);
      trees[m] = own[m] ? t : standard();
    });
    L.panes.forEach(function (p) { zooms[p] = saved && saved.zooms && typeof saved.zooms[p] === 'number' && saved.zooms[p] >= 0.1 && saved.zooms[p] <= 8 ? saved.zooms[p] : 1; });
    L.textScale = saved && TEXTS.indexOf(saved.text) >= 0 ? saved.text : 1;

    // The Layout menu: the ready layouts, one switch per view, and a reset.
    var pop = document.getElementById('laypop'), h = '<h4>Färdiga layouter</h4><div class="presets">';
    Object.keys(PRESETS).forEach(function (k) { h += '<button type="button" data-preset="' + k + '">' + HM.esc(PRESETS[k].name) + '</button>'; });
    h += '</div><h4>Vyer</h4><div class="vyer" role="group" aria-label="Vyer">';
    cfg.panes.forEach(function (p) { h += '<button type="button" class="viewtoggle" data-pane="' + p.id + '" aria-pressed="true">' + HM.esc(p.title) + '</button>'; });
    h += '</div><p><b>Flytta en vy:</b> dra den i handtaget ⠿ till en annan vy. Mot en kant delas platsen, i mitten byter de två plats, och på den andra vyns namnlist blir den en flik där.</p>' +
      '<p><b>Ändra storlek:</b> dra i skarvarna mellan vyerna, eller i fyrkanten där skarvar möts. Varje vy har egen zoom (− och +) och kan visas i helskärm (⛶).</p>' +
      '<p>Berättelsen och Utforska har var sin layout, och valet sparas i webbläsaren. I ett smalt fönster börjar sidan i layouten Smalt fönster, i ett brett i Startlayout.</p>' +
      '<button type="button" class="layreset" data-preset="aterstall">Återställ allt</button>';
    pop.innerHTML = h;
    var menu = document.getElementById('laymenu');
    pop.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var preset = b.getAttribute('data-preset'), pane = b.getAttribute('data-pane');
      if (preset === 'aterstall') {
        MODES.forEach(function (m) { own[m] = false; trees[m] = standard(); });
        L.panes.forEach(function (p) { zooms[p] = 1; });
        setMaxed(null);
        setText(1);
        L.apply('reset');
      } else if (preset) { setTree(PRESETS[preset].make()); L.apply('preset'); }
      else if (pane) L.show(pane, !L.inLayout(pane));
    });
    document.addEventListener('pointerdown', function (e) { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (menu.open) { menu.open = false; menu.querySelector('summary').focus(); }
      else if (maxed() && !document.body.classList.contains('docking')) setMaxed(null);
    });

    // The tabs of a group, and the buttons in a view's bar.
    hub.addEventListener('click', function (e) {
      var tab = e.target.closest('.ptab');
      if (tab) {
        var tp = tab.getAttribute('data-tab'), had = document.activeElement === tab;
        L.activate(tp);
        if (had) focusTab(tp);
        return;
      }
      var b = e.target.closest('.panebar button[data-act]');
      if (!b) return;
      var p = b.closest('.pane').getAttribute('data-pane'), act = b.getAttribute('data-act');
      if (act === 'zoomin') stepZoom(p, 1);
      else if (act === 'zoomout') stepZoom(p, -1);
      else if (act === 'zoomreset') stepZoom(p, 0);
      else if (act === 'full') setMaxed(maxed() === p ? null : p);
      else if (act === 'hide') L.show(p, false);
    });
    // The keyboard way to move a view: the arrow keys on its handle change places with the view
    // before or after it. On a tab, left and right choose the tab beside it.
    hub.addEventListener('keydown', function (e) {
      var tb = e.target.closest && e.target.closest('.ptab');
      if (tb && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        e.stopPropagation();
        var sib = e.key === 'ArrowLeft' ? tb.previousElementSibling : tb.nextElementSibling;
        if (sib) { var sp = sib.getAttribute('data-tab'); L.activate(sp); focusTab(sp); }
        return;
      }
      var g = e.target.closest && e.target.closest('.panebar .grip');
      if (!g) return;
      var dir = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      e.stopPropagation();
      var p = g.closest('.pane').getAttribute('data-pane'), all = panesIn(tree()).filter(isActive), other = all[all.indexOf(p) + dir];
      if (!other) return;
      L.swap(p, other);
      L.el(p).querySelector('.grip').focus();
    });
    // Ctrl + mouse wheel zooms the view under the mouse.
    hub.addEventListener('wheel', function (e) {
      var pane = e.ctrlKey && e.target.closest('.pane');
      if (!pane) return;
      e.preventDefault();
      stepZoom(pane.getAttribute('data-pane'), e.deltaY < 0 ? 1 : -1);
    }, { passive: false });

    // The joints: dragging one (or the arrow keys on it) moves the room between the two parts
    // beside it. splitDrag starts one such drag and returns how to set the joint at a pointer position.
    function splitDrag(s, p0) {
      var ref = splitRefs[+s.getAttribute('data-split')], n = ref.n, i = ref.i, row = n.d === 'row';
      var a = s.previousElementSibling, b = s.nextElementSibling, ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      var la = row ? ra.width : ra.height, lb = row ? rb.width : rb.height, sum = n.w[i] + n.w[i + 1];
      return function (pos) {
        var m = Math.min(80, (la + lb) / 2), na = Math.max(m, Math.min(la + lb - m, la + pos - p0));
        n.w[i] = Math.max(sum * 0.02, Math.min(sum * 0.98, sum * na / Math.max(la + lb, 1)));
        n.w[i + 1] = sum - n.w[i];
        a.style.flex = n.w[i] + ' 1 0px';
        b.style.flex = n.w[i + 1] + ' 1 0px';
        s.setAttribute('aria-valuenow', String(Math.round(100 * n.w[i] / sum)));
      };
    }
    // The arrow keys move a joint by 5 % of the room of its two parts (dir -1 or 1).
    function splitKey(s, dir) {
      var ref = splitRefs[+s.getAttribute('data-split')], n = ref.n, i = ref.i, sum = n.w[i] + n.w[i + 1];
      n.w[i] = Math.max(sum * 0.15, Math.min(sum * 0.85, n.w[i] + dir * sum * 0.05));
      n.w[i + 1] = sum - n.w[i];
      s.previousElementSibling.style.flex = n.w[i] + ' 1 0px';
      s.nextElementSibling.style.flex = n.w[i + 1] + ' 1 0px';
      s.setAttribute('aria-valuenow', String(Math.round(100 * n.w[i] / sum)));
    }
    function splitsOf(c, axis) {
      return c.getAttribute('data-' + axis).split(',').map(function (i) { return hub.querySelector('.splitter[data-split="' + i + '"]'); }).filter(Boolean);
    }
    hub.addEventListener('pointerdown', function (e) {
      var s = e.target.closest('.splitter'), c = !s && e.target.closest('.corner');
      if ((!s && !c) || e.button !== 0) return;
      e.preventDefault();
      var moves = [], el = s || c;
      if (s) {
        var row = splitRefs[+s.getAttribute('data-split')].n.d === 'row';
        moves.push([splitDrag(s, row ? e.clientX : e.clientY), row]);
      } else {
        // The square: the joints beside it follow the pointer sideways and the joints above or
        // under it follow it up and down, all at once.
        splitsOf(c, 'sx').forEach(function (v) { moves.push([splitDrag(v, e.clientX), true]); });
        splitsOf(c, 'sy').forEach(function (h) { moves.push([splitDrag(h, e.clientY), false]); });
      }
      el.classList.add('drag');
      document.body.classList.add('splitting');
      function move(ev) { moves.forEach(function (m) { m[0](m[1] ? ev.clientX : ev.clientY); }); }
      function up() {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', up);
        el.classList.remove('drag');
        document.body.classList.remove('splitting');
        own[HM.mode] = true;
        save();
        buildCorners();
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
    });
    hub.addEventListener('keydown', function (e) {
      var s = e.target.closest && e.target.closest('.splitter'), c = !s && e.target.closest && e.target.closest('.corner'), d;
      if (s) {
        var k = (splitRefs[+s.getAttribute('data-split')].n.d === 'row' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']).indexOf(e.key);
        if (k < 0) return;
        d = [[s], k ? 1 : -1];
      } else if (c) {
        var m = { ArrowLeft: ['sx', -1], ArrowRight: ['sx', 1], ArrowUp: ['sy', -1], ArrowDown: ['sy', 1] }[e.key];
        if (!m) return;
        d = [splitsOf(c, m[0]), m[1]];
      } else return;
      e.preventDefault();
      e.stopPropagation();
      d[0].forEach(function (x) { splitKey(x, d[1]); });
      own[HM.mode] = true;
      save();
      if (s) buildCorners();                                 // the squares follow the joint (a square in use stays where the focus is)
    });
    addEventListener('resize', function () { if (followWidth()) L.apply('width'); });
    addEventListener('load', buildCorners);
    addEventListener('resize', buildCorners);

    // Dragging a view by its handle (⠿) or its tab: a frame shows where it will land, Esc cancels.
    var hint = document.createElement('div'), ghost = document.createElement('div');
    hint.className = 'dockhint';
    ghost.className = 'dragghost';
    hint.hidden = ghost.hidden = true;
    document.body.appendChild(hint);
    document.body.appendChild(ghost);
    var WORDS = { center: 'Som flik här', swap: 'Byt plats', left: 'Till vänster', right: 'Till höger', top: 'Ovanför', bottom: 'Under' };
    hub.addEventListener('mousedown', function (e) { if (e.target.closest('.panebar .grip, .ptab')) e.preventDefault(); });
    hub.addEventListener('pointerdown', function (e) {
      var grip = e.target.closest('.panebar .grip, .ptab');
      if (!grip || e.button !== 0) return;
      var p = grip.getAttribute('data-tab') || grip.closest('.pane').getAttribute('data-pane');
      var x0 = e.clientX, y0 = e.clientY, dragging = false, drop = null;
      function zoneAt(x, y) {
        var el = document.elementFromPoint(x, y), g = el && el.closest('.pgroup');
        if (!g || !hub.contains(g)) return null;
        var r = g.getBoundingClientRect(), fx = (x - r.left) / r.width, fy = (y - r.top) / r.height, side;
        var target = g.getAttribute('data-active');
        if (target === p) {
          var own = groupOf(tree(), p);
          if (!own || own.g.p.length < 2) return null;         // its own place: nothing to do
          target = own.g.p.filter(function (q) { return q !== p; })[0];
        }
        // The middle of a view changes the two views' places, its bar (name and tabs) makes a tab,
        // an edge splits the place.
        var d = { left: fx, right: 1 - fx, top: fy, bottom: 1 - fy }, near = Object.keys(d).sort(function (m, n) { return d[m] - d[n]; })[0];
        var bar = el.closest('.panebar');
        if (bar) side = 'center';
        else if (d[near] < 0.22) side = near;
        else side = 'swap';
        if (side === 'swap' && !groupOf(tree(), p)) side = 'center';
        var h = { left: r.left, top: r.top, width: r.width, height: r.height };
        if (bar) { var br = bar.getBoundingClientRect(); h = { left: br.left, top: br.top, width: br.width, height: Math.max(br.height, 40) }; }
        if (side === 'left' || side === 'right') { h.width = r.width / 2; if (side === 'right') h.left = r.left + r.width / 2; }
        if (side === 'top' || side === 'bottom') { h.height = r.height / 2; if (side === 'bottom') h.top = r.top + r.height / 2; }
        return { target: target, side: side, rect: h };
      }
      function move(ev) {
        if (!dragging) {
          if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < 8) return;
          dragging = true;
          ghost.textContent = '⠿ ' + titles[p];
          ghost.hidden = false;
          document.body.classList.add('docking');
        }
        ghost.style.left = (ev.clientX + 14) + 'px';
        ghost.style.top = (ev.clientY + 14) + 'px';
        drop = zoneAt(ev.clientX, ev.clientY);
        hint.hidden = !drop;
        if (drop) {
          hint.style.left = drop.rect.left + 'px';
          hint.style.top = drop.rect.top + 'px';
          hint.style.width = drop.rect.width + 'px';
          hint.style.height = drop.rect.height + 'px';
          hint.innerHTML = '<span>' + WORDS[drop.side] + '</span>';
        }
      }
      function end(apply) {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        document.removeEventListener('pointercancel', cancel);
        document.removeEventListener('keydown', key, true);
        hint.hidden = ghost.hidden = true;
        document.body.classList.remove('docking');
        if (apply && dragging && drop) L.dock(p, drop.target, drop.side);
      }
      function up() { end(true); }
      function cancel() { end(false); }
      function key(ev) { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(false); } }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', cancel);
      document.addEventListener('keydown', key, true);
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
        slim(p);
        if (now === sizes[p] || !L.isShown(p) || !b.clientWidth) return;
        sizes[p] = now;
        HM.emit('panesize', { pane: p });
      }).observe(L.body(p));
    });
    HM.on('mode', function () { L.apply('mode'); });
    L.apply('init');
  };
})();
