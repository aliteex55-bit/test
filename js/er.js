// The database view: the E/R diagram (four tables, three relations) and the other parts of the SQL
// files (triggers, test questions, the user). A click on a table, a column, a relation or one of
// the buttons puts it in focus; tables, relations and columns that belong to the thing in focus
// light up, whoever chose it (a line of SQL in the code lights the columns it uses).
(function () {
  'use strict';
  var HM = window.HM, D = HM.data;
  HM.views.er = {
    mount: function (body) {
      var h = '<div class="morelist" role="group" aria-label="Mer i SQL-filerna"><span class="morelabel">Mer i SQL-filerna:</span>';
      D.er.more.forEach(function (m) { h += '<button type="button" class="more" data-id="' + m.id + '">' + HM.esc(m.label) + '</button>'; });
      body.innerHTML = h + '</div>' + D.er.svg;
      var svg = body.querySelector('svg');
      var ents = Array.prototype.slice.call(svg.querySelectorAll('.ent[data-id]'));
      var rels = Array.prototype.slice.call(svg.querySelectorAll('.node.rel[data-id]'));
      var cols = Array.prototype.slice.call(svg.querySelectorAll('.node.col[data-id]'));
      var more = Array.prototype.slice.call(body.querySelectorAll('.more[data-id]'));
      var draw = HM.draw.attach('er', body, svg, {
        targets: function () {
          var on = cols.filter(function (c) { return c.classList.contains('on'); });
          if (on.length) return on;                          // lit columns: zoom in on them
          return ents.concat(rels).filter(function (g) { return g.classList.contains('sel') || g.classList.contains('multi'); });
        },
        pad: 40, minW: 380, minH: 260
      });
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
        draw.show(true);
      });
    }
  };
})();
