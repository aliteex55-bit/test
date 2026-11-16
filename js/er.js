// The database view: the E/R diagram (four tables, three relations) and the other parts of the SQL
// files (triggers, test questions, the user). A click on a table, a column, a relation or one of
// the buttons puts it in focus; tables, relations and columns that belong to the thing in focus
// light up, whoever chose it (a line of SQL in the code lights the columns it uses).
(function () {
  'use strict';
  var HM = window.HM, D = HM.data;
  HM.views.er = {
    mount: function (body) {
      // The other parts of the SQL files are a line of buttons of its own under the view's bar,
      // outside the drawing. Asked for: the views side by side also in a narrow window, where the
      // drawing is zoomed and moved to what is lit: the buttons stay in view meanwhile, so a lit
      // one (a trigger, the user, the test data) is always seen.
      var pane = body.parentNode, strip = document.createElement('div');
      var h = '<span class="morelabel">Mer i SQL-filerna:</span>';
      D.er.more.forEach(function (m) { h += '<button type="button" class="more" data-id="' + m.id + '">' + HM.esc(m.label) + '</button>'; });
      strip.className = 'morelist';
      strip.setAttribute('role', 'group');
      strip.setAttribute('aria-label', 'Mer i SQL-filerna');
      strip.innerHTML = h;
      pane.insertBefore(strip, body);
      body.innerHTML = D.er.svg;
      var svg = body.querySelector('svg');
      var ents = Array.prototype.slice.call(svg.querySelectorAll('.ent[data-id]'));
      var rels = Array.prototype.slice.call(svg.querySelectorAll('.node.rel[data-id]'));
      var cols = Array.prototype.slice.call(svg.querySelectorAll('.node.col[data-id]'));
      var more = Array.prototype.slice.call(strip.querySelectorAll('.more[data-id]'));
      var draw = HM.draw.attach('er', body, svg, {
        targets: function () {
          var on = cols.filter(function (c) { return c.classList.contains('on'); });
          if (on.length) return on;                          // lit columns: zoom in on them
          return ents.concat(rels).filter(function (g) { return g.classList.contains('sel') || g.classList.contains('multi'); });
        },
        // The part of a column's row that must be readable in a small view: its type, its name and
        // its key (up to the third dividing line). The description after it may run out of view.
        core: function (el) {
          if (!el.classList.contains('col')) return null;
          var r = el.querySelector('rect'), seps = el.querySelectorAll('line.sep');
          if (!r || seps.length < 3) return null;
          var x0 = r.x.baseVal.value;
          return { x: x0, y: r.y.baseVal.value, width: seps[2].x1.baseVal.value - x0, height: r.height.baseVal.value };
        },
        pad: 40, minW: 380, minH: 260
      });
      // In a small view the buttons are one line that scrolls sideways (they wrapped into four or
      // five lines and took most of the height), and the lit one is brought into it. The view's own
      // size decides, not the drawing's room, which changes with the number of lines.
      function tight() { strip.classList.toggle('tight', pane.offsetHeight < 420 || pane.offsetWidth < 460); }
      function showLit() {
        var b = strip.querySelector('.more.sel, .more.multi');
        if (!b) { strip.scrollLeft = 0; return; }
        var l = strip.getBoundingClientRect(), r = b.getBoundingClientRect();
        if (r.left < l.left || r.right > l.right) strip.scrollLeft += r.left - l.left - 30;
      }
      HM.on('panesize', function (e) { if (e.pane === 'er') { tight(); showLit(); } });
      HM.on('paneshow', function (e) { if (e.pane === 'er') { tight(); showLit(); } });
      function choose(el) {
        var line = el.getAttribute('data-line');
        var thing = { kind: 'er', id: el.getAttribute('data-id') };
        if (line) thing.line = +line;
        HM.setFocus(thing, { source: 'er' });
      }
      Array.prototype.slice.call(svg.querySelectorAll('.node[data-id]')).concat(more).forEach(function (el) {
        el.addEventListener('click', function () { choose(el); });
        if (el.classList.contains('node')) el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(el); } });
      });
      HM.on('focus', function (e) {
        var L = e.links, lit = L ? L.er : [], self = e.thing && e.thing.kind === 'er' && !e.thing.line ? e.thing.id : null;
        function mark(el) {
          var id = el.getAttribute('data-id');
          el.classList.toggle('sel', id === self);
          el.classList.toggle('multi', id !== self && lit.indexOf(id) >= 0);
        }
        ents.forEach(mark); rels.forEach(mark); more.forEach(mark);
        // A column row is found by its table and its line in 01_create_database.sql.
        var want = {};
        (L ? L.cols : []).forEach(function (c) {
          var p = c.split('.'), col = D.schema[p[0]].columns.filter(function (x) { return x.name === p[1]; })[0];
          if (col) want[p[0] + ':' + col.line] = true;
        });
        cols.forEach(function (c) { c.classList.toggle('on', !!want[c.getAttribute('data-id') + ':' + c.getAttribute('data-line')]); });
        showLit();
        draw.show(true);
      });
    }
  };
})();
