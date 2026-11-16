// The December calendar: every room of a city as a row, every night of December 2026 as a square,
// the bookings as bars, and the searched period as a band. It makes the heart of the program easy
// to SEE: a room is free when no booking of it clashes with the period, and a booking clashes when
// it starts before the period ends AND ends after the period starts.
// Everything here goes through the same operations as the program (HM.run): the search, booking,
// changing the number of guests and cancelling can all be tried, on the page's own copy of the data.
(function () {
  'use strict';
  var HM = window.HM, D = HM.data;
  var FIRST = '2026-12-01', LAST_IN = '2026-12-31', LAST_OUT = '2027-01-01';   // the program only books December 2026
  var REASON = { capacity: 'för litet', pool: 'ingen pool', restaurant: 'ingen restaurang', beach: 'för långt till stranden', center: 'för långt till centrum' };

  HM.views.cal = {
    mount: function (body) {
      var crit = { city: 'Malmö', checkIn: '2026-12-13', checkOut: '2026-12-16', guests: 2, requirePool: false, requireRestaurant: false, maxBeach: null, maxCenter: null, sortByPrice: true };
      var overview = false, marks = null, picked = null, why = [], hits = [];
      body.innerHTML =
        '<div class="calbar">' +
        '<label>Ort <select data-c="city"></select></label>' +
        '<label>Incheckning <input type="date" data-c="checkIn" min="' + FIRST + '" max="' + LAST_IN + '"></label>' +
        '<label>Utcheckning <input type="date" data-c="checkOut" min="2026-12-02" max="' + LAST_OUT + '"></label>' +
        '<label>Personer <input type="number" data-c="guests" min="1" max="6" step="1"></label>' +
        '<label class="chk"><input type="checkbox" data-c="requirePool"> Pool</label>' +
        '<label class="chk"><input type="checkbox" data-c="requireRestaurant"> Restaurang</label>' +
        '<label>Strand, högst m <input type="number" data-c="maxBeach" min="0" step="50" placeholder="alla"></label>' +
        '<label>Centrum, högst m <input type="number" data-c="maxCenter" min="0" step="50" placeholder="alla"></label>' +
        '<label>Sortera <select data-c="sortByPrice"><option value="1">pris, lägst först</option><option value="0">omdöme, högst först</option></select></label>' +
        '<button type="button" class="calreset" title="Lägger tillbaka testdatat: de 25 bokningarna">Återställ testdata</button>' +
        '</div><div class="calsum" aria-live="polite"></div><div class="cal"></div><div class="caldetail" aria-live="polite"></div>';
      var bar = body.querySelector('.calbar'), sum = body.querySelector('.calsum'), grid = body.querySelector('.cal'), detail = body.querySelector('.caldetail');
      function ctl(name) { return bar.querySelector('[data-c="' + name + '"]'); }
      function day(date) { return HM.dayNumber(date) - HM.dayNumber(FIRST) + 1; }          // 1 dec = 1 … 1 jan = 32
      function span(a, b) { return HM.dayText(a).replace(' dec', '') + '–' + HM.dayText(b); }
      function customerName(id) { var c = HM.db.tables.customer.filter(function (x) { return x.id === id; })[0]; return c ? c.first_name + ' ' + c.last_name : 'kund ' + id; }
      function roomOf(id) { return HM.db.tables.room.filter(function (r) { return r.id === id; })[0]; }
      function accOf(room) { return HM.db.tables.accommodation.filter(function (a) { return a.id === room.accommodation_id; })[0]; }

      // ---------------------------------------------------------------- the controls
      function fillControls() {
        var cities = HM.db.getCities().rows, sel = ctl('city');
        sel.innerHTML = cities.map(function (c) { return '<option>' + HM.esc(c) + '</option>'; }).join('');
        var known = cities.filter(function (c) { return HM.db.sameText(c, crit.city); })[0];
        if (known) sel.value = known;
        else { var o = document.createElement('option'); o.textContent = crit.city; sel.appendChild(o); sel.value = crit.city; }   // a text that is no city (the SQL-in-the-field demo)
        ctl('checkIn').value = crit.checkIn;
        ctl('checkOut').value = crit.checkOut;
        ctl('checkOut').min = HM.addDays(crit.checkIn, 1);
        ctl('guests').value = crit.guests;
        ctl('requirePool').checked = !!crit.requirePool;
        ctl('requireRestaurant').checked = !!crit.requireRestaurant;
        ctl('maxBeach').value = crit.maxBeach === null || crit.maxBeach === undefined ? '' : crit.maxBeach;
        ctl('maxCenter').value = crit.maxCenter === null || crit.maxCenter === undefined ? '' : crit.maxCenter;
        ctl('sortByPrice').value = crit.sortByPrice ? '1' : '0';
      }
      // The same limits as the program's own input: December 2026, at least one night, 1–6 guests.
      function readControls() {
        var a = ctl('checkIn').value || crit.checkIn, b = ctl('checkOut').value || crit.checkOut;
        if (a < FIRST) a = FIRST;
        if (a > LAST_IN) a = LAST_IN;
        if (b <= a) b = HM.addDays(a, 1);
        if (b > LAST_OUT) b = LAST_OUT;
        var num = function (name) { var v = ctl(name).value; return v === '' || isNaN(+v) ? null : Math.max(0, Math.round(+v)); };
        return { city: ctl('city').value, checkIn: a, checkOut: b, guests: HM.clamp(Math.round(+ctl('guests').value) || 1, 1, 6),
          requirePool: ctl('requirePool').checked, requireRestaurant: ctl('requireRestaurant').checked, maxBeach: num('maxBeach'), maxCenter: num('maxCenter'), sortByPrice: ctl('sortByPrice').value === '1' };
      }
      bar.addEventListener('change', function (e) {
        if (!e.target.closest('[data-c]')) return;
        overview = false; marks = null; picked = null;
        HM.run('search', readControls(), { source: 'cal' });          // the real search; its answer comes back as a 'trace'
      });
      bar.querySelector('.calreset').addEventListener('click', function () {
        HM.db.reset();
        picked = null; marks = null;
        HM.emit('db', { reason: 'reset' });
        say('Testdatat är tillbaka: 25 bokningar.');
      });

      // ---------------------------------------------------------------- the grid
      function verdict(w, room) {
        if (w.hit) { var n = HM.nights(crit.checkIn, crit.checkOut); return 'ledigt · ' + n + (n === 1 ? ' natt' : ' nätter') + ' × ' + HM.kr(room.price_per_night) + ' = ' + HM.kr(n * room.price_per_night); }
        var parts = [];
        w.fails.forEach(function (f) {
          if (f === 'clash') parts.push('krock: bokning ' + w.clashes.join(' och '));
          else if (f === 'capacity') parts.push('för litet: rymmer ' + room.capacity);
          else if (REASON[f]) parts.push(REASON[f]);
        });
        return parts.join(' · ');
      }
      function render() {
        var res = HM.db.searchAvailableRooms(crit), t = HM.db.tables, h = '';
        why = res.why; hits = res.rows;
        var accs = t.accommodation.filter(function (a) { return HM.db.sameText(a.city, crit.city); });
        var q0 = day(crit.checkIn), q1 = day(crit.checkOut);
        if (!accs.length) {
          sum.innerHTML = '<b>0 lediga rum.</b> Ingen ort heter <code>' + HM.esc(crit.city) + '</code>. Texten jämfördes med orterna som ett vanligt värde.';
          grid.innerHTML = '<p class="calnone">Inga boenden att visa. Alla ' + t.booking.length + ' bokningar finns kvar i tabellen booking.</p>';
          return;
        }
        h += '<div class="calrow calhead"><span class="calroom">Rum</span><div class="calnights">';
        for (var d = 1; d <= 31; d++) h += '<span class="calday' + (!overview && d >= q0 && d < q1 ? ' q' : '') + '" style="grid-column:' + d + '">' + d + '</span>';
        h += '</div><span class="calverdict">' + (overview ? '' : 'Svar på sökningen') + '</span></div>';
        accs.forEach(function (a) {
          h += '<div class="calacc"><b>' + HM.esc(a.name) + '</b> <span>' + '★'.repeat(a.rating) + ' · ' + (a.has_pool ? 'pool' : 'ingen pool') + ' · ' + (a.has_restaurant ? 'restaurang' : 'ingen restaurang') +
            ' · strand ' + a.beach_distance_m + ' m · centrum ' + a.center_distance_m + ' m</span></div>';
          t.room.filter(function (r) { return r.accommodation_id === a.id; }).forEach(function (r) {
            var w = why.filter(function (x) { return x.room_id === r.id; })[0], clash = w.fails.indexOf('clash') >= 0, other = w.fails.some(function (f) { return f !== 'clash'; });
            var cls = overview ? '' : (w.hit ? ' free' : '') + (clash ? ' clash' : '') + (other ? ' dim' : '');
            if (marks && marks.rooms && marks.rooms.indexOf(r.id) >= 0) cls += ' mark mark-' + marks.what;
            if (picked && picked.table === 'room' && picked.id === r.id) cls += ' picked';
            h += '<div class="calrow' + cls + '" data-room="' + r.id + '"><button type="button" class="calroom" data-room="' + r.id + '" title="Rum ' + HM.esc(r.room_number) + ': rymmer ' + r.capacity + ', ' + HM.kr(r.price_per_night) + ' per natt">' +
              '<b>' + HM.esc(r.room_number) + '</b><small>' + r.capacity + ' pers · ' + HM.kr(r.price_per_night) + '</small></button><div class="calnights">';
            for (var d2 = 1; d2 <= 31; d2++) h += '<span class="calcell' + (!overview && d2 >= q0 && d2 < q1 ? ' q' : '') + '" style="grid-column:' + d2 + '"></span>';
            t.booking.filter(function (b) { return b.room_id === r.id; }).forEach(function (b) {
              var c = 'calbk' + (!overview && w.clashes.indexOf(b.id) >= 0 ? ' clash' : '');
              if (marks && marks.bookings && marks.bookings.indexOf(b.id) >= 0) c += ' mark mark-' + marks.what;
              if (picked && picked.table === 'booking' && picked.id === b.id) c += ' picked';
              h += '<button type="button" class="' + c + '" data-booking="' + b.id + '" style="grid-column:' + HM.clamp(day(b.check_in), 1, 32) + ' / ' + HM.clamp(day(b.check_out), 1, 32) + '" title="Bokning ' + b.id + ': ' +
                span(b.check_in, b.check_out) + ', ' + b.guests + ' pers, ' + HM.esc(customerName(b.customer_id)) + '">' + b.id + '</button>';
            });
            h += '</div><span class="calverdict">' + (overview ? '' : HM.esc(verdict(w, r))) + (!overview && w.hit ? ' <button type="button" class="calbook" data-room="' + r.id + '">Boka</button>' : '') + '</span></div>';
          });
        });
        grid.innerHTML = h;
        var n = HM.nights(crit.checkIn, crit.checkOut);
        sum.innerHTML = overview
          ? '<b>' + HM.esc(accs[0].city) + ', december 2026.</b> Varje rad är ett rum, varje ruta en natt. Strecken är bokningarna (numret är bokningens id).'
          : '<b>' + HM.esc(accs[0].city) + ' ' + span(crit.checkIn, crit.checkOut) + ', ' + crit.guests + (crit.guests === 1 ? ' person' : ' personer') + ':</b> ' + hits.length + (hits.length === 1 ? ' ledigt rum' : ' lediga rum') +
            ' av ' + t.room.filter(function (r) { return accs.some(function (a) { return a.id === r.accommodation_id; }); }).length + ' · ' + n + (n === 1 ? ' natt' : ' nätter') +
            ' <span class="callegend"><i class="lq"></i>sökt period <i class="lfree"></i>ledigt <i class="lclash"></i>krock <i class="lbk"></i>bokning</span>';
      }
      function say(html) { detail.innerHTML = html ? '<div class="calmsg">' + html + '</div>' : ''; }

      // ---------------------------------------------------------------- a booking: the two comparisons
      function compare(b) {
        var s1 = b.check_in < crit.checkOut, s2 = b.check_out > crit.checkIn;
        return 'Jämfört med sökningen ' + span(crit.checkIn, crit.checkOut) + ': check_in ' + HM.dayText(b.check_in) + ' < @checkOut ' + HM.dayText(crit.checkOut) + (s1 ? ' stämmer' : ' stämmer inte') +
          ', och check_out ' + HM.dayText(b.check_out) + ' > @checkIn ' + HM.dayText(crit.checkIn) + (s2 ? ' stämmer' : ' stämmer inte') + '. ' +
          (s1 && s2 ? 'Båda stämmer, alltså krockar bokningen med perioden.' : 'Båda måste stämma för en krock, så bokningen krockar inte' + (b.check_out === crit.checkIn ? ': utcheckningsdagen är ledig för nästa gäst.' : '.'));
      }
      function showBooking(id, quiet) {
        var b = HM.db.tables.booking.filter(function (x) { return x.id === id; })[0];
        if (!b) return;
        var r = roomOf(b.room_id), a = accOf(r), n = HM.nights(b.check_in, b.check_out);
        var text = 'Rum ' + r.room_number + ' på ' + a.name + ', ' + span(b.check_in, b.check_out) + ', ' + b.guests + (b.guests === 1 ? ' person' : ' personer') + ', ' + customerName(b.customer_id) + '. ' +
          n + (n === 1 ? ' natt' : ' nätter') + ' × ' + HM.kr(r.price_per_night) + ' = ' + HM.kr(n * r.price_per_night) + '. ' + (overview ? '' : compare(b));
        picked = { table: 'booking', id: id };
        detail.innerHTML = '<div class="calmsg"><b>Bokning ' + id + '.</b> ' + HM.esc(text) + '<span class="calacts">' +
          '<label>Personer <input type="number" class="calguests" min="1" max="9" value="' + b.guests + '"></label><button type="button" class="calupd" data-booking="' + id + '">Ändra</button>' +
          '<button type="button" class="calcancel" data-booking="' + id + '">Avboka</button></span></div>';
        if (!quiet) HM.setFocus({ kind: 'row', table: 'booking', id: id, title: 'Bokning ' + id, say: text }, { source: 'cal' });
      }
      function showRoom(id) {
        var r = roomOf(id), a = accOf(r), w = why.filter(function (x) { return x.room_id === id; })[0];
        var text = 'Rum ' + r.room_number + ' på ' + a.name + ' i ' + a.city + ' rymmer ' + r.capacity + (r.capacity === 1 ? ' person' : ' personer') + ' och kostar ' + HM.kr(r.price_per_night) + ' per natt.' +
          (overview || !w ? '' : ' Sökningen ' + span(crit.checkIn, crit.checkOut) + ': ' + verdict(w, r) + '.');
        picked = { table: 'room', id: id };
        say('<b>Rum ' + HM.esc(r.room_number) + '.</b> ' + HM.esc(text));
        HM.setFocus({ kind: 'row', table: 'room', id: id, title: 'Rum ' + r.room_number + ', ' + a.name, say: text }, { source: 'cal' });
      }
      function bookForm(id) {
        var r = roomOf(id), cs = HM.db.getCustomers().rows;
        picked = { table: 'room', id: id };
        detail.innerHTML = '<div class="calmsg"><b>Boka rum ' + HM.esc(r.room_number) + ', ' + span(crit.checkIn, crit.checkOut) + '.</b> <span class="calacts"><label>Kund <select class="calcust">' +
          cs.map(function (c) { return '<option value="' + c.id + '">' + HM.esc(c.first_name + ' ' + c.last_name) + '</option>'; }).join('') + '</select></label>' +
          '<label>Personer <input type="number" class="calguests" min="1" max="9" value="' + crit.guests + '"></label><button type="button" class="caldo" data-room="' + id + '">Spara bokningen</button></span></div>';
      }
      var OUTCOME = { RoomTaken: 'Rummet har redan en bokning under perioden. Ingenting sparades.', TooManyGuests: 'Personerna ryms inte i rummet. Ingenting sparades.',
        RoomMissing: 'Rummet finns inte.', BookingMissing: 'Bokningen finns inte.', Error: 'Databasen sa nej. Ingenting sparades.' };
      body.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        var room = +b.getAttribute('data-room'), bk = +b.getAttribute('data-booking'), res;
        if (b.classList.contains('calbk')) showBooking(bk);
        else if (b.classList.contains('calroom')) showRoom(room);
        else if (b.classList.contains('calbook')) bookForm(room);
        else if (b.classList.contains('caldo')) {
          res = HM.run('book', { roomId: room, customerId: +detail.querySelector('.calcust').value, checkIn: crit.checkIn, checkOut: crit.checkOut, guests: Math.round(+detail.querySelector('.calguests').value) || 1 }, { source: 'cal' });
          picked = res.outcome === 'Created' ? { table: 'booking', id: res.bookingId } : picked;
          say(res.outcome === 'Created' ? '<b>Bokning ' + res.bookingId + ' sparad.</b> ' + res.nights + (res.nights === 1 ? ' natt' : ' nätter') + ' × ' + HM.kr(res.pricePerNight) + ' = ' + HM.kr(res.total) + '.' : HM.esc(OUTCOME[res.outcome]));
          render();
        } else if (b.classList.contains('calupd')) {
          res = HM.run('updateGuests', { bookingId: bk, guests: Math.round(+detail.querySelector('.calguests').value) || 1 }, { source: 'cal' });
          say(res.outcome === 'Updated' ? '<b>Bokning ' + bk + ' ändrad.</b>' : HM.esc(OUTCOME[res.outcome]) + ' Bokningen är oförändrad.');
          render();
        } else if (b.classList.contains('calcancel')) {
          res = HM.run('cancel', bk, { source: 'cal' });
          picked = null;
          say(res.deleted ? '<b>Bokning ' + bk + ' är avbokad.</b> Rummet är ledigt igen de nätterna.' : 'Bokningen fanns inte.');
          render();
        }
        if (b.classList.contains('calbk') || b.classList.contains('calroom') || b.classList.contains('calbook')) render();
      });

      // ---------------------------------------------------------------- events
      // A search run by anyone (these controls, the story, the SQL console) is shown here.
      HM.on('trace', function (e) {
        if (e.op !== 'search') return;
        crit = JSON.parse(JSON.stringify(e.args));
        overview = false;
        fillControls();
        render();
      });
      HM.on('db', function () { fillControls(); render(); });
      // Emphasis from the story: { what: 'free' | 'clash' | 'new', rooms, bookings } or { overview: city }; null takes it away.
      HM.on('calmark', function (m) {
        marks = m && m.what ? m : null;
        if (m && m.overview) { overview = true; crit.city = m.overview; fillControls(); say(''); }
        if (marks && marks.bookings && marks.bookings.length === 1) showBooking(marks.bookings[0], true);
        else if (m === null) { picked = null; say(''); }
        render();
      });
      HM.on('focus', function (e) {
        var rows = e.links ? e.links.rows : [];
        if (e.source === 'cal' || !rows.length) return;
        picked = rows[0];
        if (rows[0].table === 'booking') showBooking(rows[0].id, true);
        render();
      });
      HM.views.cal.criteria = function () { return JSON.parse(JSON.stringify(crit)); };
      fillControls();
      render();
    }
  };
})();
