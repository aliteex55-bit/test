// The SQL console: what the program sent to the database for the last operation, step by step:
// the real SQL text from Repository.cs, the parameters with their values and where in the C# code
// each one comes from, what the database answered, the checks the code makes between the
// statements, and what the method returned. It also lets the student try the classic attack:
// SQL written in the city field, which the parameters turn into plain text.
(function () {
  'use strict';
  var HM = window.HM, D = HM.data;
  var INJECT = "Malmö'; DROP TABLE booking; --";
  var SAYS = {
    Created: 'bokningen sparades', RoomTaken: 'rummet var redan bokat under perioden', TooManyGuests: 'personerna ryms inte i rummet', RoomMissing: 'rummet finns inte',
    Updated: 'antalet personer ändrades', BookingMissing: 'bokningen finns inte', 'true': 'en rad togs bort', 'false': 'ingen rad togs bort'
  };

  function literal(v) {                                       // a value as the database sees it
    if (v === null || v === undefined) return '<span class="t-kw">NULL</span>';
    if (typeof v === 'number') return '<span class="t-num">' + v + '</span>';
    return '<span class="t-str">\'' + HM.esc(String(v).replace(/'/g, "''")) + '\'</span>';
  }
  function cell(v) { return v === null || v === undefined ? 'NULL' : HM.esc(String(v)); }
  function rowsTable(rows) {
    if (!rows.length) return '<p class="sqlnone">0 rader</p>';
    var keys = Object.keys(rows[0]), max = 12;
    var h = '<table><thead><tr>' + keys.map(function (k) { return '<th>' + HM.esc(k) + '</th>'; }).join('') + '</tr></thead><tbody>';
    rows.slice(0, max).forEach(function (r) { h += '<tr>' + keys.map(function (k) { return '<td>' + cell(r[k]) + '</td>'; }).join('') + '</tr>'; });
    h += '</tbody></table>';
    return h + '<p class="sqlcount">' + rows.length + (rows.length === 1 ? ' rad' : ' rader') + (rows.length > max ? ', de första ' + max + ' visas' : '') + '</p>';
  }
  // One SQL statement: its text with the line numbers it has in Repository.cs, and its parameters.
  function statementHtml(st, params) {
    var h = '<div class="code sqltext" data-file="' + st.file + '"><table>';
    HM.highlight('sqlcs', st.text).forEach(function (ln, k) { h += '<tr data-line="' + (st.from + k) + '"><td class="n">' + (st.from + k) + '</td><td>' + (ln || ' ') + '</td></tr>'; });
    h += '</table></div>';
    if (st.params.length) {
      h += '<table class="sqlpars"><tbody>';
      st.binds.forEach(function (b) {
        h += '<tr data-line="' + b.line + '" title="Visa raden i koden"><td><span class="t-par">' + b.name + '</span></td><td>' + (params ? '= ' + literal(params[b.name]) : '') +
          '</td><td class="from">' + HM.esc(b.expr) + ' · rad ' + b.line + '</td></tr>';
      });
      h += '</tbody></table>';
    }
    return h;
  }

  HM.views.sql = {
    mount: function (body) {
      body.innerHTML = '<div class="sqlc"><div class="sqlrun"></div>' +
        '<div class="sqltry"><h3>Prova själv: SQL-kod i ortsfältet</h3><p>Skriv vad du vill som ort. Texten skickas som värdet på <span class="t-par">@city</span>, aldrig som en del av SQL-texten.</p>' +
        '<div class="sqltryrow"><input type="text" class="sqlcity" aria-label="Ort att söka på" value="' + HM.esc(INJECT) + '"><button type="button" class="sqlgo">Sök med den texten</button></div>' +
        '<div class="sqlnote" hidden></div></div></div>';
      var run = body.querySelector('.sqlrun'), note = body.querySelector('.sqlnote'), shown = null;

      // ---------------------------------------------------------------- an operation that was run
      function showRun(r) {
        var op = D.ops[r.op], h = '<div class="sqlhead"><b>' + HM.esc(op.title) + '</b><span>Repository.cs · ' + HM.esc(op.method) + '</span></div><ol class="sqlsteps">';
        r.result.trace.forEach(function (s) {
          if (s.kind === 'begin') h += '<li class="sqlstep tx"><b>BEGIN</b> – en transaktion börjar: allt eller inget sparas</li>';
          else if (s.kind === 'commit') h += '<li class="sqlstep tx ok"><b>COMMIT</b> – transaktionen bekräftas, nu är ändringen sparad</li>';
          else if (s.kind === 'rollback') h += '<li class="sqlstep tx no"><b>ROLLBACK</b> – allt rullas tillbaka, ingenting sparas</li>';
          else if (s.kind === 'check') {
            var vals = Object.keys(s.values).map(function (k) { return k + ' = ' + s.values[k]; }).join(', ');
            h += '<li class="sqlstep sqlcheck' + (s.pass ? ' no' : '') + '" data-line="' + s.line + '"><code>' + HM.esc(s.text) + '</code> med ' + HM.esc(vals) + ': ' + (s.pass ? 'ja, avbryt' : 'nej, fortsätt') + '<span class="from">rad ' + s.line + '</span></li>';
          } else if (s.kind === 'return') h += '<li class="sqlstep ret" data-line="' + s.line + '">Metoden svarar <b>' + HM.esc(s.value) + '</b>' + (SAYS[s.value] ? ': ' + SAYS[s.value] : '') + '<span class="from">rad ' + s.line + '</span></li>';
          else {
            var st = D.statements[s.statement], res = s.result;
            h += '<li class="sqlstep sql" data-statement="' + st.id + '">' + statementHtml(st, s.params) + '<div class="sqlres">';
            if (res.error) h += '<p class="sqlerr">Databasen säger nej (' + res.error.code + '): ' + HM.esc(res.error.message) + '</p>';
            else if (res.rows) h += rowsTable(res.rows);
            else h += '<p class="sqlcount">' + res.affected + (res.affected === 1 ? ' rad ändrad' : ' rader ändrade') + (res.lastInsertId ? ', den nya raden fick id ' + res.lastInsertId : '') + '</p>';
            h += '</div></li>';
          }
        });
        run.innerHTML = h + '</ol>';
        shown = { run: r };
        // The search with a text that is no city: say what happened, next to what gluing would have looked like.
        var odd = r.op === 'search' && !HM.db.tables.accommodation.some(function (a) { return HM.db.sameText(a.city, r.args.city); });
        note.hidden = !odd;
        if (odd) note.innerHTML = '<p><b>Texten kom fram som ett värde.</b> Databasen letade efter en ort som heter exakt <code>' + HM.esc(r.args.city) + '</code>, hittade ingen och svarade 0 rader. Tabellen booking har kvar sina ' +
          HM.db.tables.booking.length + ' rader.</p><p>Så här hade det sett ut om programmet klistrade in texten i SQL-strängen. <b>Det gör programmet inte.</b></p>' +
          '<div class="code sqlbad"><table><tr><td>' + HM.highlight('sql', "WHERE  a.city = '" + r.args.city + "'").join('') + '</td></tr></table></div>';
      }
      // ---------------------------------------------------------------- only the statements (nothing run yet)
      function showStatements(L) {
        var h = '<div class="sqlhead"><b>' + HM.esc(L.title) + '</b><span>SQL-satserna som hör hit. Kör en sökning eller bokning i kalendern för att se värdena.</span></div><ol class="sqlsteps">';
        L.statements.forEach(function (id) { var st = D.statements[id]; h += '<li class="sqlstep sql" data-statement="' + st.id + '"><div class="sqlwho">' + HM.esc(st.method) + '</div>' + statementHtml(st, null) + '</li>'; });
        run.innerHTML = h + '</ol>';
        shown = { statements: L.statements.join() };
        note.hidden = true;
      }
      function empty() {
        run.innerHTML = '<div class="sqlhead"><b>SQL-konsolen</b><span>Här visas vad programmet skickar till databasen. Ändra något i kalendern, eller klicka på en ruta som har SQL.</span></div>';
        shown = null;
        note.hidden = true;
      }

      HM.on('trace', showRun);
      HM.on('tracestep', function (e) {
        Array.prototype.forEach.call(run.querySelectorAll('.sqlstep.cur'), function (x) { x.classList.remove('cur'); });
        var li = run.querySelector('.sqlstep[data-statement="' + e.statement + '"]');
        if (li) { li.classList.add('cur'); li.scrollIntoView({ block: 'nearest' }); }
      });
      HM.on('focus', function (e) {
        var L = e.links;
        if (!L || !L.statements.length) return;
        // The last run stays as long as it is about the same thing; otherwise the statements themselves.
        if (shown && shown.run && L.ops.indexOf(shown.run.op) >= 0) return;
        if (!shown || shown.statements !== L.statements.join()) showStatements(L);
      });
      // The data was put back (the test data, or the story moved to another scene): what was shown is no longer true.
      HM.on('db', function (e) { if (e.reason === 'reset' || e.reason === 'story' || e.reason === 'story-off') empty(); });
      // A line of SQL or a parameter: show that line in the code.
      body.addEventListener('click', function (e) {
        if (e.target.closest('.sqlgo')) {
          var c = HM.views.cal && HM.views.cal.criteria ? HM.views.cal.criteria() : { checkIn: '2026-12-13', checkOut: '2026-12-16', guests: 2, requirePool: false, requireRestaurant: false, maxBeach: null, maxCenter: null, sortByPrice: true };
          c.city = body.querySelector('.sqlcity').value;
          HM.run('search', c, { source: 'sql' });
          return;
        }
        var tr = e.target.closest('.sqltext tr[data-line], .sqlpars tr[data-line], .sqlstep[data-line]');
        if (tr && !e.target.closest('.sqlbad') && !String(window.getSelection()).length) HM.setFocus({ kind: 'line', file: 'Repository.cs', line: +tr.getAttribute('data-line') }, { source: 'sql' });
      });
      body.querySelector('.sqlcity').addEventListener('keydown', function (e) { if (e.key === 'Enter') body.querySelector('.sqlgo').click(); });
      empty();
    }
  };
})();
