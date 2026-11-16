// The flow chart view: the program's steps as boxes. A click on a box puts it in focus, and every
// box that belongs to the thing in focus lights up, whoever chose it.
(function () {
  'use strict';
  var HM = window.HM, D = HM.data;
  HM.views.flow = {
    mount: function (body) {
      body.innerHTML = D.flow.svg;
      var svg = body.querySelector('svg');
      var nodes = Array.prototype.slice.call(svg.querySelectorAll('.node[data-id]'));
      var draw = HM.draw.attach('flow', body, svg, {
        targets: function () { return nodes.filter(function (g) { return g.classList.contains('multi') || g.classList.contains('sel'); }); },
        pad: 70, minW: 420, minH: 300
      });
      function choose(g) { HM.setFocus({ kind: 'flow', id: g.getAttribute('data-id') }, { source: 'flow' }); }
      nodes.forEach(function (g) {
        g.addEventListener('click', function () { choose(g); });
        g.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(g); return; }
          // ← and → step through the boxes in the program's order.
          var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          e.stopPropagation();
          var i = D.flow.order.indexOf(g.getAttribute('data-id')), next = D.flow.order[(i + step + D.flow.order.length) % D.flow.order.length];
          var el = svg.querySelector('.node[data-id="' + next + '"]');
          if (el) { el.focus(); choose(el); }
        });
      });
      HM.on('focus', function (e) {
        var lit = e.links ? e.links.flow : [], self = e.thing && e.thing.kind === 'flow' ? e.thing.id : null;
        nodes.forEach(function (g) {
          var id = g.getAttribute('data-id');
          g.classList.toggle('sel', id === self);
          g.classList.toggle('multi', id !== self && lit.indexOf(id) >= 0);
        });
        draw.show(true);
      });
    }
  };
})();
