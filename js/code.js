// The code view: every file of the program with line numbers. The lines that belong to the thing
// in focus are lit; a click on a line puts that line in focus.
// What the student asked for on the KK2 page, from the start here: in the show the view tracks
// what is going on ("koden window better tracking so i can se where we are", "when all code selected
// zoom out and make the whole thing more visible"): the lit lines are fitted into the view, a whole
// method zoomed out until all of it is seen, a single line zoomed in until it is easy to read; the
// view glides there. And the scenes' lines stay above the code they are about ("lyrics stannar kvar").
(function () {
  'use strict';
  var HM = window.HM, D = HM.data;
  var EMIN = 0.02, EMAX = 1.15;        // the smallest and largest text size the fit may choose (1 = normal size)
  var READ = 0.5;                      // under this size the text of lit lines far apart can no longer be read
  var WIDE = 0.62;                     // long lines never make the text smaller than this: they run out on the right instead

  HM.views.code = {
    mount: function (body) {
      var START = D.fileOrder[2], file = START, anim = 0, glide = 0, fc = null, tabs, sel;      // starts on Repository.cs
      body.innerHTML = '<div class="codesel" hidden></div><div class="codetabs" role="group" aria-label="Filer"></div><div class="codehost"></div>';
      sel = body.querySelector('.codesel');
      tabs = body.querySelector('.codetabs');
      var host = body.querySelector('.codehost');
      D.fileOrder.forEach(function (f) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'codetab';
        b.setAttribute('data-file', f);
        b.textContent = f.replace(/^sql\//, '');
        b.title = D.files[f].path;
        tabs.appendChild(b);
      });
      function story() { return HM.mode === 'berattelse'; }
      function lit() { return (HM.focusLinks && HM.focusLinks.lines) || {}; }

      // ---------------------------------------------------------------- drawing a file
      function draw(f) {
        file = f;
        var h = '<div class="code fullcode" data-file="' + HM.esc(f) + '"><table>';
        HM.fileHtml(f).forEach(function (ln, k) { h += '<tr data-line="' + (k + 1) + '"><td class="n">' + (k + 1) + '</td><td>' + (ln || ' ') + '</td></tr>'; });
        host.innerHTML = h + '</table></div>';
        fc = host.firstChild;
        body.scrollTop = 0;
        paint();
        captions();
      }
      function paint() {
        var L = lit(), on = {};
        (L[file] || []).forEach(function (r) { for (var i = r[0]; i <= r[1]; i++) on[i] = true; });
        Array.prototype.forEach.call(fc.querySelectorAll('tr[data-line]'), function (tr) { tr.classList.toggle('blk', !!on[tr.getAttribute('data-line')]); });
        Array.prototype.forEach.call(tabs.children, function (b) {
          var f = b.getAttribute('data-file');
          b.setAttribute('aria-pressed', String(f === file));
          b.classList.toggle('has', !!(L[f] && L[f].length));
        });
        // The tab of the file shown is brought into the line of tabs.
        var act = tabs.querySelector('[aria-pressed="true"]');
        if (act && tabs.scrollWidth > tabs.clientWidth) {
          var kz = body.offsetWidth ? body.getBoundingClientRect().width / body.offsetWidth : 1, tl = tabs.getBoundingClientRect(), ar = act.getBoundingClientRect();
          if (ar.left < tl.left || ar.right > tl.right) tabs.scrollLeft += (ar.left - tl.left) / kz - 30;
        }
        var F = HM.focusLinks;
        sel.hidden = !F;
        if (F) sel.innerHTML = '<b>Markerat:</b> ' + HM.esc(F.title) + (F.where ? ' <span>' + HM.esc(F.where) + '</span>' : '');
      }
      // The lines of the scenes so far stay above the code they are about, oldest first; the same
      // line said again about the same code is one row with all its scene numbers.
      function captions() {
        Array.prototype.slice.call(fc.querySelectorAll('tr.clens')).forEach(function (r) { r.parentNode.removeChild(r); });
        if (!story() || !HM.story) return;
        var at = {}, cur = HM.story.index;
        HM.story.scenes.slice(0, cur + 1).forEach(function (s, i) {
          var L = HM.links(s.focus).lines[file];
          if (!L || !L.length) return;
          var line = L[0][0];                                 // above the first place the scene names (the one the view shows)
          (at[line] = at[line] || []).push({ text: s.lyric, no: i + 1, now: i === cur });
        });
        Object.keys(at).forEach(function (line) {
          var tr = fc.querySelector('tr[data-line="' + line + '"]'), seen = {}, order = [];
          at[line].forEach(function (c) {
            if (!seen[c.text]) { seen[c.text] = { nos: [], now: false }; order.push(c.text); }
            seen[c.text].nos.push(c.no);
            if (c.now) seen[c.text].now = true;
          });
          order.sort(function (x, y) { return (seen[x].now ? 1 : 0) - (seen[y].now ? 1 : 0); });     // the current one closest to its code
          order.forEach(function (text) {
            var row = document.createElement('tr'), td = document.createElement('td'), div = document.createElement('div');
            row.className = 'clens' + (seen[text].now ? ' now' : '');
            td.colSpan = 2;
            div.textContent = '♪ “' + text + '” · scen ' + seen[text].nos.join(', ');
            td.appendChild(div);
            row.appendChild(td);
            tr.parentNode.insertBefore(row, tr);
          });
        });
      }

      // ---------------------------------------------------------------- places in the code
      // The view can be zoomed, and then positions on the screen and the view's own scroll position
      // use different pixels: k converts between them.
      function K() { var r = body.getBoundingClientRect(); return body.offsetHeight ? r.height / body.offsetHeight : 1; }
      function rows() { return fc.querySelectorAll('tr'); }
      function rowAt(R, y) {
        var lo = 0, hi = R.length - 1;
        while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (R[mid].getBoundingClientRect().top <= y) lo = mid; else hi = mid - 1; }
        var r = R[lo].getBoundingClientRect();
        return lo + (r.height ? HM.clamp((y - r.top) / r.height, 0, 1) : 0);
      }
      function yOf(R, c) { var i = HM.clamp(Math.floor(c), 0, R.length - 1), r = R[i].getBoundingClientRect(); return r.top + (c - i) * r.height; }
      function middle() { var b = body.getBoundingClientRect(), k = K(); return b.top + body.clientTop * k + body.clientHeight * k / 2; }
      function put(R, z, c) {
        fc.style.zoom = z;
        body.scrollTop += (yOf(R, c) - middle()) / K();
        fc.scrollLeft = 0;
      }
      // In a narrow window the views are under each other and this one grows with its code up to
      // its max-height, so the fit is measured against that.
      function viewH() {
        var mh = parseFloat(getComputedStyle(body).maxHeight);
        return HM.layout.stacked() && mh > 0 ? Math.max(body.clientHeight, mh) : body.clientHeight;
      }
      // Where to go: the zoom at which the lit lines (and the current scene's line above them) fit,
      // and the row to put in the middle. Too many lines even at the smallest size: the first one on top.
      function measure(R, L) {
        if (!L.length) return null;
        var z0 = parseFloat(fc.style.zoom) || 1, k = K(), own = HM.layout.zoom('code');
        var now = fc.querySelector('tr.clens.now'), a = L[0].getBoundingClientRect(), b = L[L.length - 1].getBoundingClientRect(), n = now ? now.getBoundingClientRect() : null;
        if (n && (n.bottom < a.top - a.height || n.top > b.bottom)) n = null;      // the scene's line stands somewhere else in the file
        var top = Math.min(a.top, n ? n.top : a.top), bottom = Math.max(b.bottom, n ? n.bottom : b.bottom), topEl = n && n.top < a.top ? now : L[0];
        var blockH = (bottom - top) / z0, rowH = a.height / z0, left = fc.getBoundingClientRect().left, w = 0, rg = document.createRange();
        Array.prototype.forEach.call(L, function (tr) { rg.selectNodeContents(tr.lastElementChild); var q = rg.getBoundingClientRect(); if (q.width) w = Math.max(w, q.right - left); });
        w = w / z0 + 16;
        var vh = viewH(), availH = vh * k - 24, availW = fc.getBoundingClientRect().width - 6;
        if (!(blockH > 0) || availH <= 0 || availW <= 0) return null;
        var fitH = availH / blockH, fitW = w > 16 ? availW / w : Infinity, fit = Math.min(fitH, fitW);
        // Asked for: the views side by side also in a narrow window. In a narrow code view long
        // lines made all the text tiny. Now the lines may run out of the view on the right (the
        // code scrolls sideways) so that the text keeps a size that can be read.
        if (fit * k < WIDE) fit = Math.min(fitH, Math.max(fitW, WIDE / k));
        var eff = HM.clamp(fit * k, EMIN, EMAX);
        var z = eff / k * own;
        var c = blockH * z <= availH + 0.5 ? rowAt(R, (top + bottom) / 2) : Array.prototype.indexOf.call(R, topEl) + (vh * k / 2 - 12) / (rowH * z);
        return { z: z, c: c, eff: eff };
      }
      // The lit rows of the first place the focus names in this file: its main code.
      function mainRows(all) {
        var L = lit()[file];
        if (!L || !L.length) return [];
        return all.filter(function (tr) { var no = +tr.getAttribute('data-line'); return no >= L[0][0] && no <= L[0][1]; });
      }
      // Asked for: "map everything correctly and make sure its proper". Everything lit is fitted
      // into the view (a whole method is zoomed out until all of it is seen, as asked for on the KK2
      // page). But when the lit lines stand far apart (a box with code in several places, the same
      // condition in two methods), fitting them all made the text a few pixels high. Then the view
      // fits the first place the focus names, at a size that can be read, and the other places stay
      // lit further down or up in the file.
      function target(R) {
        var all = Array.prototype.slice.call(fc.querySelectorAll('tr.blk'));
        var t = measure(R, all);
        if (t && t.eff < READ) {
          var main = mainRows(all);
          if (main.length && main.length < all.length) t = measure(R, main) || t;
        }
        return t;
      }
      function follow(animate) {
        cancelAnimationFrame(anim);
        anim = 0;
        if (!fc || !body.clientHeight || !HM.layout.isShown('code')) return;
        var R = rows(), t = R.length && target(R);
        if (!t) return;
        var from = { z: parseFloat(fc.style.zoom) || 1, c: rowAt(R, middle()) };
        if (Math.abs(from.z - t.z) < 0.005 && Math.abs(from.c - t.c) < 0.05) return;
        if (!animate || document.hidden || HM.reduced()) { put(R, t.z, t.c); return; }
        var start = performance.now(), size0 = body.clientWidth + 'x' + body.clientHeight, my = ++glide, got = false;
        // Where the browser gives no frames (a page that is not being drawn right now), the view
        // goes straight to its place instead of waiting for a glide that never starts.
        setTimeout(function () { if (!got && glide === my && anim) { cancelAnimationFrame(anim); anim = 0; put(R, t.z, t.c); } }, 250);
        function step(time) {
          got = true;
          var q = Math.min(1, (time - start) / 420), e = q < 0.5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2;
          put(R, from.z + (t.z - from.z) * e, from.c + (t.c - from.c) * e);
          if (q < 1) { anim = requestAnimationFrame(step); return; }
          anim = 0;
          if (body.clientWidth + 'x' + body.clientHeight !== size0) follow(false);
        }
        anim = requestAnimationFrame(step);
      }
      // Utforska: the first lit line is brought into view, at the normal size.
      function reveal() {
        var tr = fc.querySelector('tr.blk');
        if (!tr) return;
        var b = body.getBoundingClientRect(), r = tr.getBoundingClientRect(), k = K();
        if (r.top < b.top + 8 || r.bottom > b.bottom - 8) body.scrollTop += (r.top - b.top) / k - body.clientHeight / 4;
      }
      function settle(animate, source) {
        if (story()) follow(animate);
        else { cancelAnimationFrame(anim); anim = 0; if (fc.style.zoom) fc.style.zoom = ''; if (source !== 'code') reveal(); }
      }

      // ---------------------------------------------------------------- events
      HM.on('focus', function (e) {
        var L = e.links ? e.links.lines : {}, want = e.links && e.links.file;
        // The file with the lit lines, unless the file shown has lit lines itself. In the story the
        // scene's own file is always the one shown, so a scene looks the same whichever scene came
        // before it (it used to keep the file of the scene before when that file had lit lines too).
        // A scene without code keeps the file of the latest scene before it that has code.
        if (e.source === 'story' && !want && HM.story) {
          for (var j = HM.story.index - 1; j >= 0 && !want; j--) want = HM.links(HM.story.scenes[j].focus).file;
          want = want || START;
        }
        if (want && want !== file && (e.source === 'story' || !(L[file] && L[file].length))) draw(want);
        else { paint(); captions(); }
        settle(true, e.source);
      });
      HM.on('scene', function () { captions(); settle(true); });
      HM.on('mode', function () { captions(); HM.layout.applyZoom('code'); });
      HM.on('panesize', function (e) { if (e.pane === 'code' && !anim) settle(false, 'code'); });
      HM.on('paneshow', function (e) { if (e.pane === 'code') settle(false); });
      // In Berättelsen − and + make the code bigger or smaller than the fit (100 % = everything lit fits).
      HM.layout.setZoomer('code', function (b, own, text) {
        if (story()) { b.style.zoom = text; follow(false); }
        else { if (fc) fc.style.zoom = ''; b.style.zoom = own * text; }
      });
      tabs.addEventListener('click', function (e) {
        var b = e.target.closest('.codetab');
        if (b) { draw(b.getAttribute('data-file')); settle(false); }
      });
      host.addEventListener('click', function (e) {
        var tr = e.target.closest('tr[data-line]');
        if (!tr || String(window.getSelection()).length) return;
        HM.setFocus({ kind: 'line', file: file, line: +tr.getAttribute('data-line') }, { source: 'code' });
      });
      draw(file);
    }
  };
})();
