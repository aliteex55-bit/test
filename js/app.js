// Start-up of the page: the views are put in place, the layout is built, and the header's buttons
// (the two modes, light or dark) and the address (#…) are wired.
(function () {
  'use strict';
  var HM = window.HM, root = document.documentElement;
  var PANES = [
    { id: 'panel', title: 'Förklaring' }, { id: 'er', title: 'Databasen' }, { id: 'flow', title: 'Flöde' },
    { id: 'cal', title: 'December-kalendern' }, { id: 'code', title: 'Koden' }, { id: 'sql', title: 'SQL-konsolen' }
  ];

  // ------------------------------------------------------------------ light or dark
  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    HM.store.set('theme', theme);
    HM.emit('theme', { theme: theme });
  }
  setTheme(HM.store.get('theme', 'dark') === 'light' ? 'light' : 'dark');
  document.getElementById('theme').addEventListener('click', function () {
    setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });

  // ------------------------------------------------------------------ the views and the layout
  // The views fill their bodies first, so the layout can size them the first time it runs.
  PANES.forEach(function (p) {
    var v = HM.views[p.id];
    if (v && v.mount) v.mount(document.getElementById('body-' + p.id));
  });
  HM.layout.init({ panes: PANES });

  // ------------------------------------------------------------------ the two modes
  var modeButtons = Array.prototype.slice.call(document.querySelectorAll('.modebtn'));
  function showMode(mode) {
    document.body.classList.toggle('mode-berattelse', mode === 'berattelse');
    document.body.classList.toggle('mode-utforska', mode === 'utforska');
    modeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === mode)); });
  }
  modeButtons.forEach(function (b) { b.addEventListener('click', function () { HM.setMode(b.getAttribute('data-mode')); }); });
  HM.on('mode', function (e) {
    showMode(e.mode);
    // Something chosen through the address waits until Utforska is opened.
    if (e.mode === 'utforska' && waiting) { var t = waiting; waiting = null; HM.setFocus(t, { source: 'app' }); }
  });

  // ------------------------------------------------------------------ the address (#…)
  // #scen-12 is a scene of the story; #flow-c2d, #er-booking, #rad-Repository.cs-111 and #op-search
  // are things to explore. The address follows what is shown, so a link can be shared.
  var waiting = null;
  function setHash(key) { try { history.replaceState(null, '', location.pathname + location.search + (key ? '#' + key : '')); } catch (e) {} }
  HM.on('scene', function (e) { if (HM.mode === 'berattelse') setHash('scen-' + (e.index + 1)); });
  HM.on('focus', function (e) {
    if (HM.mode !== 'utforska') return;
    var key = e.thing && (e.thing.kind === 'row' || e.thing.kind === 'set') ? '' : HM.thingKey(e.thing);
    setHash(key);
  });
  // Escape takes the focus away in Utforska (unless a menu or a field is using the key).
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || HM.mode !== 'utforska' || !HM.focus) return;
    if (e.target && e.target.closest && e.target.closest('input, select, textarea, details[open]')) return;
    HM.setFocus(null, { source: 'app' });
  });

  // ------------------------------------------------------------------ start
  // Asked for (on the KK2 page): the page opens in the show directly, also when the address still
  // names something opened earlier. So the page always starts in Berättelsen; ?lage=utforska in the
  // address starts in Utforska instead.
  HM.story.init();
  var hash = decodeURIComponent(location.hash.slice(1)), m = /^scen-(\d+)$/.exec(hash);
  if (m) HM.story.index = HM.clamp(+m[1] - 1, 0, HM.story.scenes.length - 1);
  else waiting = HM.thingFromKey(hash);
  var asked = (location.search.match(/[?&]lage=([a-z]+)/) || [])[1];
  HM.setMode(asked === 'utforska' ? 'utforska' : 'berattelse');
})();
