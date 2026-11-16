// The explanation view. In Utforska it explains the thing in focus: a plain explanation, the code
// it points at with the explained lines, and buttons to everything related. In Berättelsen it is
// one card that says what the scene is about.
// What the student asked for on the KK2 page, from the start here: the card's text FILLS its view
// ("take advantage of free space in window and scale everything within it to fill space because
// text is small and not readable", "the text fills all empty space on this window"): the text is
// made as large as fits, in one column, or title left and text right, or that with two text columns.
(function () {
  'use strict';
  var HM = window.HM, D = HM.data;

  // Removes n leading spaces from a coloured line (the spaces may sit inside the first colour span).
  function stripIndent(html, n) {
    var out = '', i = 0, left = n;
    while (i < html.length && left > 0) {
      if (html[i] === '<') { var end = html.indexOf('>', i); out += html.slice(i, end + 1); i = end + 1; }
      else if (html[i] === ' ') { i++; left--; }
      else break;
    }
    return out + html.slice(i);
  }
  function refHtml(r, ri) {
    var lines = D.files[r.file].lines.slice(r.from - 1, r.to), html = HM.fileHtml(r.file).slice(r.from - 1, r.to), marked = {};
    var indent = lines.reduce(function (m, l) { return l.trim() ? Math.min(m, l.length - l.replace(/^ +/, '').length) : m; }, 99);
    (r.points || []).forEach(function (p) { marked[p.line] = true; });
    var h = '<div class="ref" data-ref="' + ri + '" data-file="' + HM.esc(r.file) + '">';
    if (r.title) h += '<h3>' + HM.esc(r.title) + '</h3>';
    h += '<div class="where">' + HM.esc(r.file) + ', rad ' + r.from + (r.to > r.from ? '–' + r.to : '') + '</div>';
    if (r.what) h += '<p class="what">' + HM.esc(r.what) + '</p>';
    h += '<div class="code"><table>';
    html.forEach(function (ln, k) {
      var no = r.from + k;
      h += '<tr data-line="' + no + '"' + (marked[no] ? ' class="mark"' : '') + '><td class="n" title="Visa raden i koden">' + no + '</td><td>' + (stripIndent(ln, indent === 99 ? 0 : indent) || ' ') + '</td></tr>';
    });
    h += '</table></div>';
    if (r.points && r.points.length) {
      h += '<ul class="pts">';
      r.points.forEach(function (p) { h += '<li data-line="' + p.line + '" tabindex="0"><span class="ln-no">Rad ' + p.line + '</span><span>' + HM.esc(p.text) + '</span></li>'; });
      h += '</ul>';
    }
    return h + '</div>';
  }
  function chips(label, keys, name) {
    if (!keys.length) return '';
    return '<div class="chips"><span class="lk">' + label + '</span>' + keys.map(function (k) {
      return '<button type="button" class="chip" data-key="' + HM.esc(k) + '">' + HM.esc(name(k)) + '</button>';
    }).join('') + '</div>';
  }

  HM.views.panel = {
    mount: function (body) {
      var lastSource = '';
      function story() { return HM.mode === 'berattelse'; }

      // ---------------------------------------------------------------- Utforska: the full explanation
      function explain() {
        var t = HM.focus, L = HM.focusLinks;
        if (!L) {
          body.innerHTML = '<div class="expl empty"><h2>Holiday Maker</h2><p class="what">Klicka på en ruta i flödet, en tabell eller en kolumn i databasen, en rad i koden eller ett rum i kalendern. Då visas vad den gör, och allt som hör ihop med den lyser upp i de andra vyerna.</p>' +
            '<p class="what">Byt till <b>Berättelsen</b> högst upp för att få programmet berättat steg för steg.</p></div>';
          return;
        }
        var self = HM.thingKey(t);
        var h = '<div class="expl"><h2>' + HM.esc(L.title) + '</h2>';
        if (L.where) h += '<div class="dwhere">' + HM.esc(L.where) + '</div>';
        if (L.say) h += '<div class="say"><b>Enkelt förklarat</b>' + HM.esc(L.say) + '</div>';
        h += chips('Rutor i flödet:', L.flow.map(function (id) { return 'flow-' + id; }).filter(function (k) { return k !== self; }), function (k) { return D.flow.nodes[k.slice(5)].name; });
        h += chips('I databasen:', L.er.map(function (id) { return 'er-' + id; }).filter(function (k) { return k !== self; }), function (k) { return D.er.nodes[k.slice(3)].name; });
        h += chips('Programmet gör:', L.ops.map(function (id) { return 'op-' + id; }).filter(function (k) { return k !== self; }), function (k) { return D.ops[k.slice(3)].title; });
        L.refs.forEach(function (r, ri) { h += refHtml(r, ri); });
        body.innerHTML = h + '</div>';
        if (L.point) {
          var li = body.querySelector('.ref li[data-line="' + L.point + '"]');
          if (li) point(li, false);
        }
        body.scrollTop = 0;
      }
      // A point of the explanation marks its line in the code above it.
      function point(li, scroll) {
        var ref = li.closest('.ref'), line = li.getAttribute('data-line');
        Array.prototype.forEach.call(body.querySelectorAll('tr.hl'), function (e) { e.classList.remove('hl'); });
        Array.prototype.forEach.call(body.querySelectorAll('li.on'), function (e) { e.classList.remove('on'); });
        var tr = ref.querySelector('tr[data-line="' + line + '"]');
        if (tr) { tr.classList.add('hl'); if (scroll) tr.scrollIntoView({ block: 'nearest' }); }
        li.classList.add('on');
      }

      // ---------------------------------------------------------------- Berättelsen: the card
      function card() {
        var L = HM.focusLinks, scene = HM.story ? HM.story.scenes[HM.story.index] : null, fromStory = lastSource === 'story';
        var h = '<div class="dexp"><div class="dhead">';
        if (fromStory && scene) h += '<div class="dnow">♪ ' + HM.esc(scene.lyric) + '</div>';
        else h += '<div class="dnow">Du valde</div>';
        h += '<h2>' + HM.esc(L ? L.title : 'Holiday Maker') + '</h2>';
        if (L && L.where) h += '<div class="dwhere">' + HM.esc(L.where) + '</div>';
        h += '</div><div class="dbody">';
        if (fromStory && scene) h += '<p class="what lead">' + HM.esc(scene.sv) + '</p>';
        if (L && L.say && !(fromStory && scene && L.say === scene.sv)) h += '<p class="what">' + HM.esc(L.say) + '</p>';
        body.innerHTML = h + '</div></div>';
        body.scrollTop = 0;
      }
      // The largest size at which the whole card fits, in the arrangement that gives the biggest text.
      // The size sits on the card itself, so text put in the view later has the normal size.
      function zoomNow(c) {
        var lo = 0.4, hi = 4;
        for (var k = 0; k < 10; k++) {
          var mid = (lo + hi) / 2;
          c.style.zoom = mid;
          if (body.scrollHeight <= body.clientHeight + 1 && body.scrollWidth <= body.clientWidth + 1) lo = mid; else hi = mid;
        }
        return lo;
      }
      function fit(c, own) {
        c.classList.remove('two', 'cols');
        c.style.zoom = 1;
        var h1 = body.clientHeight;
        c.style.zoom = 2;
        // In a narrow window the view grows with its text, so there is no free space to fill.
        if (body.clientHeight > h1 + 1) { c.style.zoom = ''; return; }
        var best = { z: 0, m: [] };
        [[], ['two'], ['two', 'cols']].forEach(function (m) {
          c.classList.remove('two', 'cols');
          m.forEach(function (x) { c.classList.add(x); });
          var z = zoomNow(c);
          if (z > best.z * 1.04) best = { z: z, m: m };     // a simpler arrangement unless clearly better
        });
        c.classList.remove('two', 'cols');
        best.m.forEach(function (x) { c.classList.add(x); });
        c.style.zoom = best.z * 0.985 * own;                 // a hair under the limit, so rounding never brings a scrollbar
      }

      function render() { if (story()) card(); else explain(); if (HM.layout.panes.length) HM.layout.applyZoom('panel'); }
      HM.layout.setZoomer('panel', function (b, own, text) {
        var c = b.querySelector('.dexp');
        if (c && b.clientHeight) { b.style.zoom = text; fit(c, own); }
        else b.style.zoom = own * text;
      });
      HM.on('focus', function (e) { lastSource = e.source; render(); });
      HM.on('mode', render);
      HM.on('panesize', function (e) { if (e.pane === 'panel') HM.layout.applyZoom('panel'); });
      HM.on('paneshow', function (e) { if (e.pane === 'panel') HM.layout.applyZoom('panel'); });

      body.addEventListener('click', function (e) {
        var chip = e.target.closest('.chip');
        if (chip) { var t = HM.thingFromKey(chip.getAttribute('data-key')); if (t) HM.setFocus(t, { source: 'panel' }); return; }
        var li = e.target.closest('ul.pts li');
        if (li) { point(li, true); return; }
        var n = e.target.closest('.ref td.n');
        if (n) HM.setFocus({ kind: 'line', file: n.closest('.ref').getAttribute('data-file'), line: +n.parentNode.getAttribute('data-line') }, { source: 'panel' });
      });
      body.addEventListener('mouseover', function (e) { var li = e.target.closest('ul.pts li'); if (li) point(li, false); });
      body.addEventListener('keydown', function (e) { var li = e.target.closest('ul.pts li'); if (li && e.key === 'Enter') point(li, true); });
      render();
    }
  };
})();
