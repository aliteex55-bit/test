// Asked for: "låten sist det visuela först" (the song last, the visuals first). Berättelsen is the
// visual show without the song: it steps through the program scene by scene, one scene per line
// of the song text, and every view follows. When the song exists it will drive these same scenes.
//
// A scene (HM.data.story.scenes) has the sung line (lyric), one plain Swedish sentence (sv), the
// thing to put in focus, and actions: run one of the program's operations, point at one step of
// the last operation, or mark rooms and bookings in the calendar.
(function () {
  'use strict';
  var HM = window.HM, S = HM.data.story.scenes;
  var FN = { customers: 'getCustomers', createCustomer: 'createCustomer', cities: 'getCities', search: 'searchAvailableRooms',
    book: 'createBooking', bookings: 'getBookingsForCustomer', updateGuests: 'updateGuests', cancel: 'cancelBooking' };
  var CHANGES = { createCustomer: true, book: true, updateGuests: true, cancel: true };   // operations that change the data
  var story = HM.story = { scenes: S, index: 0, playing: false, hold: 6000, holdRun: 8000 };
  var active = false;        // true while the page is in Berättelsen
  var own = null;            // the student's own data, kept aside while the story runs on the test data
  var timer = 0;
  var el = {};

  function runsOf(scene) { return (scene.do || []).filter(function (a) { return a.run; }).map(function (a) { return a.run; }); }
  // Asked for: "map everything correctly". A run marked dry is shown (its steps and its answer) but
  // leaves the data as it was. The scenes about the transaction's first steps use it, so the new
  // booking comes into the calendar in the scene that sings INSERT and COMMIT, not two scenes before.
  function dryRun(r) {
    var before = HM.db.snapshot(), result = HM.db[FN[r.op]](r.args);
    HM.db.restore(before);
    return { op: r.op, args: r.args, result: result, dry: true };
  }

  // Brings the data to what it is when scene i starts: the test data plus every changing operation
  // of the scenes before it, without telling the views. Returns what those operations answered.
  function rewind(i) {
    var applied = [];
    HM.db.reset();
    for (var j = 0; j < i; j++) {
      runsOf(S[j]).forEach(function (r) {
        if (CHANGES[r.op] && !r.dry) applied.push({ scene: j, op: r.op, args: r.args, result: HM.db[FN[r.op]](r.args) });
      });
    }
    return applied;
  }
  // A scene that only points at a step ("the INSERT") shows the operation an earlier scene ran:
  // the latest earlier run that has that statement.
  function earlierRun(statement, i, applied) {
    for (var j = i - 1; j >= 0; j--) {
      var runs = runsOf(S[j]);
      for (var k = runs.length - 1; k >= 0; k--) {
        var r = runs[k];
        if (HM.data.ops[r.op].statements.indexOf(statement) < 0) continue;
        if (r.dry) return dryRun(r);                                                             // not saved yet: the same steps again
        if (!CHANGES[r.op]) return { op: r.op, args: r.args, result: HM.db[FN[r.op]](r.args) };     // only reads: ask again
        var hit = applied.filter(function (a) { return a.scene === j && a.op === r.op; }).pop();
        return hit ? { op: hit.op, args: hit.args, result: hit.result } : null;
      }
    }
    return null;
  }
  // What the calendar showed when the scene before ended: the latest search or overview of the
  // scenes so far. A scene that sets neither keeps it, whichever scene it is reached from (playing
  // on, stepping back, or an address like #scen-20); before this the calendar kept whatever the
  // scene shown last had left in it.
  function calendarBefore(i) {
    for (var j = i - 1; j >= 0; j--) {
      var acts = S[j].do || [];
      for (var k = acts.length - 1; k >= 0; k--) {
        if (acts[k].mark && acts[k].mark.overview) return { overview: acts[k].mark.overview };
        if (acts[k].run && acts[k].run.op === 'search') return { criteria: acts[k].run.args };
      }
    }
    return null;
  }

  function show() {
    var scene = S[story.index];
    if (el.no) el.no.textContent = (story.index + 1) + ' / ' + S.length;
    if (el.cap) { el.cap.textContent = '♪ ' + scene.lyric; el.cap.title = scene.sv; }
    if (el.play) {
      el.play.textContent = story.playing ? '⏸' : '▶';
      el.play.setAttribute('aria-pressed', String(story.playing));
      el.play.setAttribute('aria-label', story.playing ? 'Pausa' : 'Spela');
    }
  }
  function arm() {
    clearTimeout(timer);
    if (!story.playing) return;
    var scene = S[story.index];
    timer = setTimeout(function () {
      if (story.index >= S.length - 1) { story.pause(); return; }     // the story stops after its last scene
      story.go(story.index + 1);
    }, runsOf(scene).length ? story.holdRun : story.hold);
  }

  // Shows scene i. Outside Berättelsen only the place in the story is remembered.
  story.go = function (i) {
    i = HM.clamp(i, 0, S.length - 1);
    story.index = i;
    var scene = S[i];
    if (active) {
      var applied = rewind(i), sent = false;
      HM.emit('db', { reason: 'story' });
      HM.emit('calshow', calendarBefore(i));
      HM.emit('calmark', null);                               // the emphasis of the scene before is gone
      (scene.do || []).forEach(function (a) {
        if (a.run) {
          if (a.run.dry) { HM.lastRun = dryRun(a.run); HM.emit('trace', HM.lastRun); }
          else HM.run(a.run.op, a.run.args, { keepFocus: true, source: 'story' });
          sent = true;
        } else if (a.step) {
          if (!sent) {
            var prev = earlierRun(a.step, i, applied);
            if (prev) { HM.lastRun = prev; HM.emit('trace', prev); }
            sent = true;
          }
          HM.emit('tracestep', { statement: a.step });
        }
      });
      HM.setFocus(scene.focus, { source: 'story' });
      (scene.do || []).forEach(function (a) { if (a.mark) HM.emit('calmark', a.mark); });
    }
    show();
    HM.emit('scene', { index: i, scene: scene, playing: story.playing });
    arm();
  };
  story.next = function () { if (story.index < S.length - 1) story.go(story.index + 1); };
  story.prev = function () { if (story.index > 0) story.go(story.index - 1); };
  story.play = function () {
    if (!active) return;
    if (story.index >= S.length - 1) story.index = 0;         // played to the end: start again from the top
    story.playing = true;
    story.go(story.index);
  };
  story.pause = function () { story.playing = false; clearTimeout(timer); show(); HM.emit('scene', { index: story.index, scene: S[story.index], playing: false }); };
  story.toggle = function () { if (story.playing) story.pause(); else story.play(); };

  story.init = function () {
    el.prev = document.getElementById('storyprev');
    el.play = document.getElementById('storyplay');
    el.next = document.getElementById('storynext');
    el.no = document.getElementById('sceneno');
    el.cap = document.getElementById('scenecap');
    el.prev.addEventListener('click', story.prev);
    el.next.addEventListener('click', story.next);
    el.play.addEventListener('click', story.toggle);
    // Space plays or pauses and the arrows step, unless a button, a field or a part of a view that
    // uses the keys itself has the keyboard.
    document.addEventListener('keydown', function (e) {
      if (!active || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.target && e.target.closest && e.target.closest('input, select, textarea, button, a, summary, [tabindex], [contenteditable]')) return;
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); story.toggle(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); story.next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); story.prev(); }
    });
    HM.on('mode', function (ev) {
      if (ev.mode === 'berattelse') {
        if (!active) own = HM.db.snapshot();                  // the student's own bookings wait here meanwhile
        active = true;
        story.go(story.index);
      } else {
        story.playing = false;
        clearTimeout(timer);
        if (active && own) { HM.db.restore(own); own = null; HM.emit('db', { reason: 'story-off' }); }
        active = false;
        HM.emit('calmark', null);
        show();
      }
    });
    show();
  };
})();
