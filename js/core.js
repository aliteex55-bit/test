// Asked for: a learning page for Holiday Maker, "something just as fun that makes it super easy to
// understand and learn", where everything maps to everything like on the KK2 page: whatever is
// chosen (a box in the flow chart, a table or a column in the database diagram, a line of code, a
// room or a booking in the calendar, an SQL statement) becomes the ONE thing in focus, and every
// view shows its own side of it.
//
// This file is the shared core that every view builds on:
//   - HM.data            the data built from the real project files (js/data.js)
//   - HM.on / HM.emit    a small event bus
//   - HM.setFocus        the thing in focus, and HM.links(thing): everything that belongs to it
//   - HM.highlight       code colouring for C#, SQL and .bat
//   - HM.run             runs one of the program's operations on the page's own copy of the data
// It touches no page elements, so it can also be loaded in Node for tests.
(function () {
  'use strict';
  var D = window.HM_DATA;
  var HM = window.HM = { data: D, views: {}, mode: 'utforska', focus: null, focusLinks: null, lastRun: null };

  // ------------------------------------------------------------------ small helpers
  HM.esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  HM.uniq = function (a) { var seen = {}, out = []; a.forEach(function (x) { if (!seen[x]) { seen[x] = true; out.push(x); } }); return out; };
  HM.clamp = function (x, lo, hi) { return Math.max(lo, Math.min(hi, x)); };
  HM.reduced = function () { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); };
  // Settings kept in this browser (hm-…). Reading and writing never throw.
  HM.store = {
    get: function (key, fallback) { try { var v = localStorage.getItem('hm-' + key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
    set: function (key, value) { try { localStorage.setItem('hm-' + key, JSON.stringify(value)); } catch (e) {} }
  };
  // Dates are 'YYYY-MM-DD' texts, as in the database. Days are counted in UTC so summer time never matters.
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  HM.dayNumber = function (date) { var p = date.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); };
  HM.addDays = function (date, n) { return new Date((HM.dayNumber(date) + n) * 86400000).toISOString().slice(0, 10); };
  HM.nights = function (checkIn, checkOut) { return HM.dayNumber(checkOut) - HM.dayNumber(checkIn); };
  HM.dayText = function (date) { var p = date.split('-'); return (+p[2]) + ' ' + MONTHS[+p[1] - 1]; };            // '5 dec'
  HM.kr = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' kr'; };    // '1 450 kr'

  // ------------------------------------------------------------------ event bus
  // Events: 'focus' { thing, links, source } · 'mode' { mode, was } · 'trace' { op, args, result }
  //         'db' { reason } (the data changed) · 'scene' { index, scene } (the story) · 'theme' { theme }
  var handlers = {};
  HM.on = function (type, fn) {
    (handlers[type] = handlers[type] || []).push(fn);
    return function () { handlers[type] = handlers[type].filter(function (f) { return f !== fn; }); };
  };
  HM.emit = function (type, payload) {
    (handlers[type] || []).slice().forEach(function (fn) {
      try { fn(payload); } catch (e) { if (window.console) console.error('HM ' + type + ':', e); }
    });
  };

  // ------------------------------------------------------------------ code colouring
  // The two pages the project already had coloured their code like this; the rules are the same.
  var CS_KW = ('abstract as async await base bool break case catch char class const continue decimal default do double else enum false finally for foreach if in int is namespace new not null object or out private protected public readonly record return sealed static string switch this throw true try using var void when while and').split(' ');
  var SQL_IN_CS = ('SELECT DISTINCT FROM JOIN ON WHERE AND OR NOT EXISTS ORDER BY CASE WHEN THEN END ASC DESC INSERT INTO VALUES UPDATE SET DELETE FOR IS NULL COUNT AS').split(' ');
  var SQL_KW = ('ADD AFTER ALTER AND AS ASC AUTO_INCREMENT BEFORE BEGIN BETWEEN BOOLEAN BY CASCADE CASE CHARACTER CHECK COLLATE CONSTRAINT COUNT CREATE CURRENT_TIMESTAMP DATABASE DATE DATEDIFF DATETIME DECIMAL DECLARE DEFAULT DELETE DELIMITER DESC DISTINCT DROP EACH ELSE END ENGINE EXISTS FALSE FOREIGN FOR FROM GRANT IDENTIFIED IF IN INDEX INSERT INT INTO IS JOIN KEY LIKE MESSAGE_TEXT NAMES NEW NOT NULL ON OR ORDER PRIMARY REFERENCES RESTRICT ROW SELECT SET SIGNAL SQLSTATE TABLE THEN TINYINT TO TRIGGER TRUE TRUNCATE UNION ALL UNIQUE UNSIGNED UPDATE USE USER VALUES VARCHAR WHEN WHERE FOREIGN_KEY_CHECKS').split(' ');
  function sqlInCs(text, out) {
    var re = /(@[A-Za-z_]+)|([A-Za-z_]+)|([\s\S])/g, m;
    while ((m = re.exec(text))) {
      if (m[1]) out.push(['t-par', m[1]]);
      else if (m[2]) out.push([SQL_IN_CS.indexOf(m[2]) >= 0 ? 't-sqlkw' : 't-sql', m[2]]);
      else out.push(['t-sql', m[3]]);
    }
  }
  function csTokens(code) {
    var out = [], i = 0, n = code.length;
    while (i < n) {
      var rest = code.slice(i), m;
      if (rest.slice(0, 3) === '"""') {                      // a raw string: the SQL texts in Repository.cs
        var end = code.indexOf('"""', i + 3);
        end = end < 0 ? n : end + 3;
        out.push(['t-str', '"""']);
        sqlInCs(code.slice(i + 3, end - 3), out);
        out.push(['t-str', '"""']);
        i = end; continue;
      }
      if (rest.slice(0, 2) === '//') { var nl = code.indexOf('\n', i); nl = nl < 0 ? n : nl; out.push(['t-com', code.slice(i, nl)]); i = nl; continue; }
      if ((m = /^\$?"(?:[^"\\\n]|\\.)*"/.exec(rest))) { out.push(['t-str', m[0]]); i += m[0].length; continue; }
      if ((m = /^'(?:[^'\\\n]|\\.)'/.exec(rest))) { out.push(['t-str', m[0]]); i += m[0].length; continue; }
      if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) { out.push([CS_KW.indexOf(m[0]) >= 0 ? 't-kw' : '', m[0]]); i += m[0].length; continue; }
      if ((m = /^[0-9][0-9_]*/.exec(rest))) { out.push(['t-num', m[0]]); i += m[0].length; continue; }
      out.push(['', code[i]]); i++;
    }
    return out;
  }
  function sqlTokens(code) {
    var out = [], re = /(--[^\n]*)|('(?:[^'\\\n]|\\.)*')|(@[A-Za-z_]+)|([A-Za-z_][A-Za-z0-9_]*)|([0-9]+(?:\.[0-9]+)?)|([\s\S])/g, m;
    while ((m = re.exec(code))) {
      if (m[1]) out.push(['t-com', m[1]]);
      else if (m[2]) out.push(['t-str', m[2]]);
      else if (m[3]) out.push(['t-par', m[3]]);
      else if (m[4]) out.push([SQL_KW.indexOf(m[4]) >= 0 ? 't-kw' : '', m[4]]);
      else if (m[5]) out.push(['t-num', m[5]]);
      else out.push(['', m[6]]);
    }
    return out;
  }
  function batTokens(code) {
    var out = [];
    code.split('\n').forEach(function (line, k) {
      if (k) out.push(['', '\n']);
      out.push([/^\s*(rem\b|::)/i.test(line) ? 't-com' : '', line]);
    });
    return out;
  }
  // HM.highlight(lang, code) -> one HTML string per line. lang: 'cs', 'sql', 'bat' ('sqlcs' = SQL
  // text taken out of a C# string, coloured as it is inside the string).
  HM.highlight = function (lang, code) {
    var toks;
    if (lang === 'cs') toks = csTokens(code);
    else if (lang === 'sql') toks = sqlTokens(code);
    else if (lang === 'sqlcs') { toks = []; sqlInCs(code, toks); }
    else toks = batTokens(code);
    // Pieces with the same colour that follow each other on a line become one piece.
    var lines = [], cur = [];
    function flush() {
      var h = '', k = 0;
      while (k < cur.length) {
        var cls = cur[k][0], text = cur[k][1];
        while (k + 1 < cur.length && cur[k + 1][0] === cls) { k++; text += cur[k][1]; }
        h += cls ? '<span class="' + cls + '">' + HM.esc(text) + '</span>' : HM.esc(text);
        k++;
      }
      lines.push(h);
      cur = [];
    }
    toks.forEach(function (t) {
      t[1].split('\n').forEach(function (p, k) {
        if (k > 0) flush();
        if (p.length) cur.push([t[0], p]);
      });
    });
    flush();
    return lines;
  };
  // A whole file, coloured once: HM.fileHtml(file)[line - 1].
  var fileHtml = {};
  HM.fileHtml = function (file) {
    if (!fileHtml[file]) fileHtml[file] = HM.highlight(D.files[file].lang, D.files[file].lines.join('\n'));
    return fileHtml[file];
  };
  HM.fileLines = function (file) { return D.files[file].lines; };

  // ------------------------------------------------------------------ looking things up in the data
  function covers(r, file, line) { return r.file === file && r.from <= line && line <= r.to; }
  HM.methodAt = function (file, line) {
    var hit = null;
    Object.keys(D.methods).forEach(function (k) { var m = D.methods[k]; if (m.file === file && m.from <= line && line <= m.to) hit = m; });
    return hit;
  };
  // The SQL statement a line of Repository.cs belongs to: a line of its text, or a line that binds
  // one of its parameters.
  HM.statementAt = function (file, line) {
    var hit = null;
    Object.keys(D.statements).forEach(function (k) {
      var s = D.statements[k];
      if (s.file !== file) return;
      if ((s.from <= line && line <= s.to) || s.binds.some(function (b) { return b.line === line; })) hit = s;
    });
    return hit;
  };
  HM.opOfMethod = function (name) { var hit = null; Object.keys(D.ops).forEach(function (k) { if (D.ops[k].method === name) hit = k; }); return hit; };
  HM.columnAt = function (line) {                             // a line of sql/01_create_database.sql
    var hit = null;
    D.tables.forEach(function (t) { D.schema[t].columns.forEach(function (c) { if (c.line === line) hit = { table: t, column: c }; }); });
    return hit;
  };
  HM.tableAt = function (line) {
    var hit = null;
    D.tables.forEach(function (t) { if (D.schema[t].from <= line && line <= D.schema[t].to) hit = t; });
    return hit;
  };
  function isTable(id) { return D.tables.indexOf(id) >= 0; }
  function relOf(id) { return D.rels.filter(function (r) { return r.id === id; })[0] || null; }
  // The relations between the tables in a set (drawn lines that should light up with them).
  function relsAmong(tables) { return D.rels.filter(function (r) { return tables.indexOf(r.from) >= 0 && tables.indexOf(r.to) >= 0; }).map(function (r) { return r.id; }); }
  function statementsUsing(test) { return Object.keys(D.statements).filter(function (k) { return test(D.statements[k]); }); }
  function flowOfStatements(ids) { return D.flow.order.filter(function (f) { return (D.flowSql[f] || []).some(function (s) { return ids.indexOf(s) >= 0; }); }); }
  function opsOfFlow(id) { return Object.keys(D.ops).filter(function (k) { return D.ops[k].flow.indexOf(id) >= 0; }); }
  // The tables and columns one line of an SQL text mentions.
  function sqlLineUse(st, lineText) {
    var tables = [], cols = [], m;
    var tr = /\b(?:FROM|JOIN|INTO|UPDATE)\s+([a-z_]+)/g;
    while ((m = tr.exec(lineText))) if (isTable(m[1])) tables.push(m[1]);
    var cr = /\b([a-z])\.([a-z_]+)\b/g;
    while ((m = cr.exec(lineText))) if (st.aliases[m[1]] && st.columns.indexOf(st.aliases[m[1]] + '.' + m[2]) >= 0) cols.push(st.aliases[m[1]] + '.' + m[2]);
    if (st.tables.length === 1 && !Object.keys(st.aliases).length) {
      (lineText.match(/\b[a-z_]+\b/g) || []).forEach(function (w) { if (st.columns.indexOf(st.tables[0] + '.' + w) >= 0) cols.push(st.tables[0] + '.' + w); });
    }
    cols = HM.uniq(cols);
    cols.forEach(function (c) { tables.push(c.split('.')[0]); });      // a column's table lights up with it
    return { tables: HM.uniq(tables), cols: cols };
  }

  // ------------------------------------------------------------------ the thing in focus
  // A thing is one of:
  //   { kind: 'flow', id }               a box in the flow chart
  //   { kind: 'er', id }                 a part of the database view: a table, a relation or an extra part
  //   { kind: 'er', id, line }           a column: the table id and the column's line in 01_create_database.sql
  //   { kind: 'line', file, line }       one line of code
  //   { kind: 'op', id, statement? }     one of the program's operations (search, book, …), or one of its SQL statements
  //   { kind: 'row', table, id }         a row of data: a room, a booking, a customer, an accommodation
  //   { kind: 'set', id, flow, er, cols, lines, statements, ops, rows, title, say }
  //                                      a scene of the story: it lists itself what belongs to it
  // A thing may carry its own title and say (texts for the explanation), which then win.
  HM.thingKey = function (t) {
    if (!t) return '';
    if (t.kind === 'flow') return 'flow-' + t.id;
    if (t.kind === 'er') return 'er-' + t.id + (t.line ? '-' + t.line : '');
    if (t.kind === 'line') return 'rad-' + t.file.replace(/\//g, '~') + '-' + t.line;
    if (t.kind === 'op') return 'op-' + t.id + (t.statement ? '-' + t.statement : '');
    if (t.kind === 'row') return 'row-' + t.table + '-' + t.id;
    if (t.kind === 'set') return 'set-' + t.id;
    return '';
  };
  // The address (#…) of a thing, and back. Rows are not kept in the address: they change.
  HM.thingFromKey = function (key) {
    var m;
    if ((m = /^flow-(\w+)$/.exec(key)) && D.flow.nodes[m[1]]) return { kind: 'flow', id: m[1] };
    if ((m = /^er-([\w-]+?)(?:-(\d+))?$/.exec(key)) && D.er.nodes[m[1]]) return m[2] ? { kind: 'er', id: m[1], line: +m[2] } : { kind: 'er', id: m[1] };
    if ((m = /^rad-(.+)-(\d+)$/.exec(key))) { var f = m[1].replace(/~/g, '/'); if (D.files[f] && +m[2] >= 1 && +m[2] <= D.files[f].lines.length) return { kind: 'line', file: f, line: +m[2] }; }
    if ((m = /^op-(\w+)$/.exec(key)) && D.ops[m[1]]) return { kind: 'op', id: m[1] };
    return null;
  };

  // Everything that belongs to a thing:
  //   flow        ids of the flow boxes to light
  //   er          ids of the database parts to light (tables, relations, extra parts)
  //   cols        'table.column' rows to light
  //   lines       { file: [[from, to], …] } code lines to light
  //   file        the file the code view should show
  //   statements  ids of the SQL statements it is about (HM.data.statements)
  //   ops         ids of the operations it is about (HM.data.ops)
  //   rows        [{ table, id }] rows of data it is about
  //   home        the view the thing lives in: 'flow', 'er', 'code', 'cal' or 'sql'
  //   title, where, say   texts for the explanation
  //   refs        the code references with their explained points (as in HM.data.flow/er nodes)
  //   point       a line inside refs[0] to point at (a column)
  HM.links = function (t) {
    var L = { flow: [], er: [], cols: [], lines: {}, file: null, statements: [], ops: [], rows: [], home: 'flow', title: '', where: '', say: '', refs: [], point: 0 };
    function range(file, from, to) { (L.lines[file] = L.lines[file] || []).push([from, to]); if (!L.file) L.file = file; }
    function refsOf(n) { n.refs.forEach(function (r) { range(r.file, r.from, r.to); }); L.refs = n.refs; }
    function whereOf(r) { return r ? r.file + ', rad ' + r.from + (r.to > r.from ? '–' + r.to : '') : ''; }
    function useStatements(ids) {
      var tables = [];
      ids.forEach(function (id) { var s = D.statements[id]; tables = tables.concat(s.tables); L.cols = L.cols.concat(s.columns); });
      tables = HM.uniq(tables);
      L.er = L.er.concat(tables, relsAmong(tables));
      L.statements = L.statements.concat(ids);
    }
    if (!t) return L;

    if (t.kind === 'flow') {
      var n = D.flow.nodes[t.id];
      L.home = 'flow';
      L.flow = [t.id];
      refsOf(n);
      useStatements(D.flowSql[t.id] || []);
      L.ops = opsOfFlow(t.id);
      L.ops.forEach(function (k) { L.er = L.er.concat(D.ops[k].er); });
      L.title = n.name; L.say = n.say; L.where = whereOf(n.refs[0]);

    } else if (t.kind === 'er') {
      var e = D.er.nodes[t.id], rel = relOf(t.id), using;
      L.home = 'er';
      refsOf(e);
      L.title = e.name; L.say = e.say; L.where = whereOf(e.refs[0]);
      if (isTable(t.id) && t.line) {                          // a column
        var c = HM.columnAt(t.line);
        if (c && c.table === t.id) {
          L.er = [t.id]; L.cols = [t.id + '.' + c.column.name];
          L.lines = {}; L.file = null; range('sql/01_create_database.sql', t.line, t.line);
          var pt = (e.refs[0].points || []).filter(function (p) { return p.line === t.line; })[0];
          L.title = t.id + '.' + c.column.name; L.where = 'sql/01_create_database.sql, rad ' + t.line; L.point = t.line;
          if (pt) L.say = pt.text;
          using = statementsUsing(function (s) { return s.columns.indexOf(t.id + '.' + c.column.name) >= 0; });
          L.statements = using; L.flow = flowOfStatements(using);
        }
      } else if (isTable(t.id)) {                             // a table
        L.er = [t.id];
        using = statementsUsing(function (s) { return s.tables.indexOf(t.id) >= 0; });
        L.statements = using; L.flow = flowOfStatements(using);
      } else if (rel) {                                       // a relation between two tables
        L.er = [t.id, rel.from, rel.to];
        L.cols = [rel.to + '.' + rel.column, rel.from + '.' + rel.refColumn];
        using = statementsUsing(function (s) { return s.tables.indexOf(rel.from) >= 0 && s.tables.indexOf(rel.to) >= 0; });
        L.statements = using; L.flow = flowOfStatements(using);
      } else {                                                // an extra part: a trigger, a test question, the user …
        L.er = [t.id];
        Object.keys(D.ops).forEach(function (k) {
          if (D.ops[k].er.indexOf(t.id) < 0) return;
          L.ops.push(k); L.flow = L.flow.concat(D.ops[k].flow); L.statements = L.statements.concat(D.ops[k].statements);
        });
      }
      L.ops = HM.uniq(L.ops.concat.apply(L.ops, L.flow.map(opsOfFlow)));

    } else if (t.kind === 'line') {
      L.home = 'code';
      range(t.file, t.line, t.line);
      L.flow = D.flow.order.filter(function (id) { return D.flow.nodes[id].refs.some(function (r) { return covers(r, t.file, t.line); }); });
      var erHit = D.er.order.filter(function (id) { return D.er.nodes[id].refs.some(function (r) { return covers(r, t.file, t.line); }); });
      L.er = erHit.slice();
      L.title = t.file + ', rad ' + t.line; L.where = '';
      // A point explained on exactly this line, in a box first, otherwise in a database part.
      var owner = null, text = '';
      L.flow.map(function (id) { return D.flow.nodes[id]; }).concat(erHit.map(function (id) { return D.er.nodes[id]; })).forEach(function (nn) {
        nn.refs.forEach(function (r) {
          if (!covers(r, t.file, t.line)) return;
          if (!owner) owner = nn;
          (r.points || []).forEach(function (p) { if (p.line === t.line && !text) { text = p.text; owner = nn; } });
        });
      });
      if (owner) { L.refs = owner.refs.filter(function (r) { return covers(r, t.file, t.line); }); L.say = text || owner.say; L.where = 'Hör till: ' + owner.name; L.point = text ? t.line : 0; }
      if (t.file === 'sql/01_create_database.sql') {
        var col = HM.columnAt(t.line), tab = HM.tableAt(t.line);
        if (col) { L.er = HM.uniq(L.er.concat([col.table])); L.cols = [col.table + '.' + col.column.name]; }
        else if (tab) {
          L.er = HM.uniq(L.er.concat([tab]));
          D.schema[tab].constraints.forEach(function (k) {     // a constraint lights the columns it names
            if (t.line < k.line || t.line > k.to) return;
            var inside = (k.text.match(/\(([^()]*)\)/g) || []).join(' ');
            D.schema[tab].columns.forEach(function (cc) { if (new RegExp('\\b' + cc.name + '\\b').test(inside)) L.cols.push(tab + '.' + cc.name); });
            D.rels.forEach(function (r) { if (r.to === tab && r.line <= t.line && t.line <= r.lineTo) { L.er.push(r.id, r.from); L.cols.push(r.from + '.' + r.refColumn); } });
          });
          L.er = HM.uniq(L.er); L.cols = HM.uniq(L.cols);
        }
      }
      if (t.file === 'sql/02_testdata.sql') {
        Object.keys(D.rowLines).forEach(function (tn) {
          Object.keys(D.rowLines[tn]).forEach(function (id) { if (D.rowLines[tn][id] === t.line) { L.rows.push({ table: tn, id: +id }); L.er = HM.uniq(L.er.concat([tn])); } });
        });
      }
      var st = HM.statementAt(t.file, t.line), M = HM.methodAt(t.file, t.line);
      if (st) {
        L.statements = [st.id];
        var bind = st.binds.filter(function (b) { return b.line === t.line; })[0];
        if (bind) {                                            // the line that binds @x: light where @x is used
          for (var k = st.from; k <= st.to; k++) if (new RegExp(bind.name + '\\b').test(D.files[st.file].lines[k - 1])) range(st.file, k, k);
        } else {
          var use = sqlLineUse(st, D.files[st.file].lines[t.line - 1]);
          L.er = HM.uniq(L.er.concat(use.tables, relsAmong(use.tables.length > 1 ? use.tables : [])));
          L.cols = HM.uniq(L.cols.concat(use.cols));
          (D.files[st.file].lines[t.line - 1].match(/@\w+/g) || []).forEach(function (p) {     // a line that uses @x: light where it is bound
            st.binds.forEach(function (b) { if (b.name === p) range(st.file, b.line, b.line); });
          });
        }
      }
      if (M) { var op = HM.opOfMethod(M.name); if (op) L.ops = [op]; }

    } else if (t.kind === 'op') {
      var o = D.ops[t.id], Me = D.methods[o.method], main = o.main ? D.flow.nodes[o.main] : null;
      L.home = 'sql';
      L.ops = [t.id];
      L.flow = o.flow.slice();
      if (t.statement && D.statements[t.statement]) {
        var s1 = D.statements[t.statement];
        range(s1.file, s1.from, s1.to);
        s1.binds.forEach(function (b) { range(s1.file, b.line, b.line); });
        useStatements([t.statement]);
      } else {
        range(Me.file, Me.from, Me.to);
        useStatements(o.statements);
      }
      L.er = L.er.concat(o.er);
      L.title = o.title; L.where = Me.file + ', rad ' + Me.from + '–' + Me.to + ' (' + o.method + ')';
      if (main) { L.say = main.say; L.refs = main.refs; }

    } else if (t.kind === 'set') {
      // A scene of the story says itself what belongs to it. Its code lines are also its references,
      // so the explanation can show the code.
      L.home = (t.lines && Object.keys(t.lines).length) ? 'code' : (t.er && t.er.length ? 'er' : 'flow');
      L.flow = (t.flow || []).slice(); L.er = (t.er || []).slice(); L.cols = (t.cols || []).slice();
      L.statements = (t.statements || []).slice(); L.ops = (t.ops || []).slice(); L.rows = (t.rows || []).slice();
      Object.keys(t.lines || {}).forEach(function (file) {
        t.lines[file].forEach(function (r) {
          range(file, r[0], r[1]);
          L.refs.push({ file: file, from: r[0], to: r[1], title: '', what: '', points: [] });
        });
      });
      L.where = L.refs.length ? whereOf(L.refs[0]) : '';

    } else if (t.kind === 'row') {
      L.home = 'cal';
      L.rows = [{ table: t.table, id: t.id }];
      L.er = [t.table];
      var ln = (D.rowLines[t.table] || {})[t.id];
      if (ln) range('sql/02_testdata.sql', ln, ln);
      L.title = t.table + ' ' + t.id;
      var e2 = D.er.nodes[t.table];
      if (e2) { L.say = e2.say; L.refs = e2.refs; }
    }

    L.flow = HM.uniq(L.flow); L.er = HM.uniq(L.er); L.cols = HM.uniq(L.cols); L.statements = HM.uniq(L.statements); L.ops = HM.uniq(L.ops);
    if (t.title) L.title = t.title;
    if (t.say) L.say = t.say;
    if (t.where) L.where = t.where;
    return L;
  };

  // Puts a thing in focus (null takes the focus away). opts.source says which view did it
  // ('flow', 'er', 'code', 'panel', 'cal', 'sql', 'story', 'app'), so a view can leave its own
  // scroll position alone when the choice was made in it.
  HM.setFocus = function (thing, opts) {
    opts = opts || {};
    HM.focus = thing || null;
    HM.focusLinks = thing ? HM.links(thing) : null;
    HM.emit('focus', { thing: HM.focus, links: HM.focusLinks, source: opts.source || '' });
  };

  // ------------------------------------------------------------------ modes
  // 'utforska': click around freely. 'berattelse': the story steps through the program scene by
  // scene and the views follow it (later the song drives the same scenes).
  HM.setMode = function (mode) {
    if (mode !== 'utforska' && mode !== 'berattelse') return;
    var was = HM.mode;
    HM.mode = mode;
    HM.store.set('mode', mode);
    HM.emit('mode', { mode: mode, was: was });
  };

  // ------------------------------------------------------------------ running the program's operations
  // HM.run('search', criteria) runs the operation on the page's own copy of the data (js/db.js),
  // tells the views what was run ('trace') and whether the data changed ('db'), and puts the
  // operation in focus. Returns the operation's result.
  var OPS = { customers: 'getCustomers', createCustomer: 'createCustomer', cities: 'getCities', search: 'searchAvailableRooms',
    book: 'createBooking', bookings: 'getBookingsForCustomer', updateGuests: 'updateGuests', cancel: 'cancelBooking' };
  HM.run = function (op, args, opts) {
    opts = opts || {};
    if (!OPS[op] || !HM.db) throw new Error('okänd operation: ' + op);
    var result = HM.db[OPS[op]](args);
    HM.lastRun = { op: op, args: args, result: result };
    if (result.changed) HM.emit('db', { reason: op });
    HM.emit('trace', HM.lastRun);
    if (!opts.keepFocus) HM.setFocus({ kind: 'op', id: op }, { source: opts.source || 'run' });
    return result;
  };
})();
