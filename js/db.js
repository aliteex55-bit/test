// The page's own copy of the database. It starts from the test data (sql/02_testdata.sql) and has
// the program's eight operations, one per method in Repository.cs, each doing the same steps in
// the same order as the C# code and the SQL it sends. Asked for: something that makes the program
// "jätteenkelt att förstå": here every search and booking can be tried on the page, and each
// operation also returns its steps (trace), so the SQL console can show what the program did.
//
// No page elements and no events here, so the file also runs in Node for tests.
// Asked for: "make sure its proper, thorough debugging". This copy is compared with a real MySQL
// 8.4 server (a separate test server, never the student's own database): 5 783 searches with every
// row and its order, the lists, the story's booking step by step, new customers, and what the
// database itself refuses, with its error numbers and texts. All of it gave the same answers
// (skola/hm-extra/test/db/mysql.mjs, 2026-11-16).
(function () {
  'use strict';
  var HM = window.HM, D = HM.data;
  var db = HM.db = { tables: null, nextId: null };

  // ------------------------------------------------------------------ text the database's way
  // The database compares and sorts text with utf8mb4_swedish_ci: upper and lower case are the same,
  // å ä ö are letters of their own after z, and spaces at the end do not count.
  var coll = (typeof Intl !== 'undefined' && Intl.Collator) ? new Intl.Collator('sv', { sensitivity: 'base' }) : null;
  function norm(s) { return String(s).replace(/ +$/, ''); }
  function cmp(a, b) {
    a = norm(a); b = norm(b);
    if (coll) return coll.compare(a, b);
    a = a.toLowerCase(); b = b.toLowerCase();
    return a < b ? -1 : a > b ? 1 : 0;
  }
  db.sameText = function (a, b) { return cmp(a, b) === 0; };
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function byId(table, id) { return db.tables[table].filter(function (r) { return r.id === id; })[0] || null; }

  // ------------------------------------------------------------------ the data
  db.reset = function () {
    db.tables = copy(D.db);
    db.nextId = {};
    ['customer', 'booking'].forEach(function (t) { db.nextId[t] = db.tables[t].reduce(function (m, r) { return Math.max(m, r.id); }, 0) + 1; });
  };
  db.snapshot = function () { return copy({ tables: db.tables, nextId: db.nextId }); };
  db.restore = function (s) { var c = copy(s); db.tables = c.tables; db.nextId = c.nextId; };
  db.reset();

  // ------------------------------------------------------------------ the trace
  // Line numbers of the checks and returns are looked up in Repository.cs itself, inside the method.
  var REPO = 'Repository.cs';
  function lineOf(method, text, nth) {
    var M = D.methods[method], L = D.files[REPO].lines, seen = 0;
    for (var i = M.from; i <= M.to; i++) if (L[i - 1].indexOf(text) >= 0 && ++seen === (nth || 1)) return i;
    return 0;
  }
  function sql(statement, params, result) { return { kind: 'sql', statement: statement, params: params, result: result }; }
  function check(line, text, values, pass) { return { kind: 'check', line: line, text: text, values: values, pass: pass }; }
  function ret(line, value) { return { kind: 'return', line: line, value: value }; }
  function refused(code, message) { return { error: { code: code, message: message } }; }

  // ------------------------------------------------------------------ 1. customers
  db.getCustomers = function () {
    var rows = db.tables.customer.map(function (c) { return { id: c.id, first_name: c.first_name, last_name: c.last_name, email: c.email, phone: c.phone }; });
    rows.sort(function (a, b) { return cmp(a.last_name, b.last_name) || cmp(a.first_name, b.first_name) || a.id - b.id; });
    return { rows: rows, trace: [sql('GetCustomersAsync.sql', {}, { rows: rows })] };
  };
  db.createCustomer = function (c) {
    var params = { '@firstName': c.firstName, '@lastName': c.lastName, '@email': c.email, '@phone': c.phone };
    var sizes = [['first_name', c.firstName, 60], ['last_name', c.lastName, 60], ['email', c.email, 120], ['phone', c.phone, 30]], bad = null;
    sizes.forEach(function (s) { if (!bad && String(s[1]).length > s[2]) bad = s; });
    var res;
    if (bad) res = refused(1406, "Data too long for column '" + bad[0] + "' at row 1");
    else if (db.tables.customer.some(function (x) { return db.sameText(x.email, c.email); })) {
      db.nextId.customer++;                                  // the database has already taken a number for the row it then refuses
      res = refused(1062, "Duplicate entry '" + c.email + "' for key 'customer.uq_customer_email'");
    }
    if (res) return { error: res.error, trace: [sql('CreateCustomerAsync.sql', params, res)], changed: false };
    var row = { id: db.nextId.customer++, first_name: c.firstName, last_name: c.lastName, email: c.email, phone: c.phone };
    db.tables.customer.push(row);
    return { customer: copy(row), changed: true,
      trace: [sql('CreateCustomerAsync.sql', params, { affected: 1, lastInsertId: row.id }), ret(lineOf('CreateCustomerAsync', 'return new Customer'), 'Customer ' + row.id)] };
  };

  // ------------------------------------------------------------------ 2. search available rooms
  // The conditions are the WHERE of the SQL, one by one, and the order is its ORDER BY. why says
  // for EVERY room which conditions it fails (all of them), so the calendar can show the reason.
  db.searchAvailableRooms = function (c) {
    var t = db.tables, rows = [], why = [];
    t.room.forEach(function (r) {
      var a = byId('accommodation', r.accommodation_id), fails = [];
      if (!db.sameText(a.city, c.city)) fails.push('city');
      if (!(r.capacity >= c.guests)) fails.push('capacity');
      if (c.requirePool && a.has_pool !== 1) fails.push('pool');
      if (c.requireRestaurant && a.has_restaurant !== 1) fails.push('restaurant');
      if (c.maxBeach !== null && c.maxBeach !== undefined && !(a.beach_distance_m <= c.maxBeach)) fails.push('beach');
      if (c.maxCenter !== null && c.maxCenter !== undefined && !(a.center_distance_m <= c.maxCenter)) fails.push('center');
      // NOT EXISTS: a booking of this room that starts before the period ends AND ends after it starts.
      var clashes = t.booking.filter(function (b) { return b.room_id === r.id && b.check_in < c.checkOut && b.check_out > c.checkIn; }).map(function (b) { return b.id; });
      if (clashes.length) fails.push('clash');
      why.push({ room_id: r.id, hit: !fails.length, fails: fails, clashes: clashes });
      if (!fails.length) rows.push({ id: r.id, accommodation_name: a.name, city: a.city, room_number: r.room_number, capacity: r.capacity, price_per_night: r.price_per_night,
        rating: a.rating, has_pool: a.has_pool, has_restaurant: a.has_restaurant, beach_distance_m: a.beach_distance_m, center_distance_m: a.center_distance_m });
    });
    rows.sort(function (x, y) {
      return (c.sortByPrice ? x.price_per_night - y.price_per_night : y.rating - x.rating) ||
        x.price_per_night - y.price_per_night || cmp(x.accommodation_name, y.accommodation_name) || cmp(x.room_number, y.room_number);
    });
    var params = { '@city': c.city, '@guests': c.guests, '@checkIn': c.checkIn, '@checkOut': c.checkOut, '@requirePool': c.requirePool ? 1 : 0, '@requireRestaurant': c.requireRestaurant ? 1 : 0,
      '@maxBeach': c.maxBeach === undefined ? null : c.maxBeach, '@maxCenter': c.maxCenter === undefined ? null : c.maxCenter, '@sortByPrice': c.sortByPrice ? 1 : 0 };
    return { rows: rows, why: why, trace: [sql('SearchAvailableRoomsAsync.sql', params, { rows: rows })] };
  };
  db.getCities = function () {
    var rows = [];
    db.tables.accommodation.forEach(function (a) { if (!rows.some(function (x) { return db.sameText(x, a.city); })) rows.push(a.city); });
    rows.sort(cmp);
    return { rows: rows, trace: [sql('GetCitiesAsync.sql', {}, { rows: rows.map(function (c) { return { city: c }; }) })] };
  };

  // ------------------------------------------------------------------ what the database itself refuses
  // The two triggers, the CHECKs and the foreign keys of the booking table, in the order the
  // database applies them. The program checks the same things first, so these only answer when
  // it is called with values it never sends itself.
  function refuse(row, selfId) {
    var room = byId('room', row.room_id);
    if (room && row.guests > room.capacity) return refused(1644, 'Antal personer ryms inte i rummet');
    if (db.tables.booking.some(function (b) { return b.room_id === row.room_id && b.id !== selfId && b.check_in < row.check_out && b.check_out > row.check_in; }))
      return refused(1644, 'Rummet har redan en bokning under perioden');
    if (!(row.check_out > row.check_in)) return refused(3819, "Check constraint 'chk_booking_dates' is violated.");
    if (!(row.guests >= 1)) return refused(3819, "Check constraint 'chk_booking_guests' is violated.");
    if (!room) return refused(1452, 'Cannot add or update a child row: a foreign key constraint fails (fk_booking_room)');
    if (!byId('customer', row.customer_id)) return refused(1452, 'Cannot add or update a child row: a foreign key constraint fails (fk_booking_customer)');
    return null;
  }

  // ------------------------------------------------------------------ 3. create booking
  db.createBooking = function (b) {
    var M = 'CreateBookingAsync', trace = [{ kind: 'begin' }];
    var room = byId('room', b.roomId);
    trace.push(sql(M + '.lockSql', { '@roomId': b.roomId }, { rows: room ? [{ capacity: room.capacity, price_per_night: room.price_per_night }] : [] }));
    trace.push(check(lineOf(M, 'if (!await reader.ReadAsync())'), 'rummet finns inte', { rader: room ? 1 : 0 }, !room));
    if (!room) {
      trace.push({ kind: 'rollback' }, ret(lineOf(M, 'BookingOutcome.RoomMissing'), 'RoomMissing'));
      return { outcome: 'RoomMissing', bookingId: 0, nights: 0, pricePerNight: 0, total: 0, trace: trace, changed: false };
    }
    trace.push(check(lineOf(M, 'if (guests > capacity)'), 'guests > capacity', { guests: b.guests, capacity: room.capacity }, b.guests > room.capacity));
    if (b.guests > room.capacity) {
      trace.push({ kind: 'rollback' }, ret(lineOf(M, 'BookingOutcome.TooManyGuests'), 'TooManyGuests'));
      return { outcome: 'TooManyGuests', bookingId: 0, nights: 0, pricePerNight: 0, total: 0, trace: trace, changed: false };
    }
    var conflicts = db.tables.booking.filter(function (x) { return x.room_id === b.roomId && x.check_in < b.checkOut && x.check_out > b.checkIn; }).length;
    trace.push(sql(M + '.conflictSql', { '@roomId': b.roomId, '@checkIn': b.checkIn, '@checkOut': b.checkOut }, { rows: [{ 'COUNT(*)': conflicts }] }));
    trace.push(check(lineOf(M, 'if (conflicts > 0)'), 'conflicts > 0', { conflicts: conflicts }, conflicts > 0));
    if (conflicts > 0) {
      trace.push({ kind: 'rollback' }, ret(lineOf(M, 'BookingOutcome.RoomTaken'), 'RoomTaken'));
      return { outcome: 'RoomTaken', bookingId: 0, nights: 0, pricePerNight: 0, total: 0, trace: trace, changed: false };
    }
    var row = { id: 0, room_id: b.roomId, customer_id: b.customerId, check_in: b.checkIn, check_out: b.checkOut, guests: b.guests };
    var params = { '@roomId': b.roomId, '@customerId': b.customerId, '@checkIn': b.checkIn, '@checkOut': b.checkOut, '@guests': b.guests };
    var no = refuse(row, 0);
    if (no) {
      trace.push(sql(M + '.insertSql', params, no), { kind: 'rollback' });
      return { outcome: 'Error', error: no.error, bookingId: 0, nights: 0, pricePerNight: 0, total: 0, trace: trace, changed: false };
    }
    row.id = db.nextId.booking++;
    db.tables.booking.push(row);
    var nights = HM.nights(b.checkIn, b.checkOut);
    trace.push(sql(M + '.insertSql', params, { affected: 1, lastInsertId: row.id }), { kind: 'commit' },
      ret(lineOf(M, 'BookingOutcome.Created'), 'Created'));
    return { outcome: 'Created', bookingId: row.id, nights: nights, pricePerNight: room.price_per_night, total: nights * room.price_per_night, trace: trace, changed: true };
  };

  // ------------------------------------------------------------------ 4. the customer's bookings
  db.getBookingsForCustomer = function (customerId) {
    var rows = db.tables.booking.filter(function (b) { return b.customer_id === customerId; }).map(function (b) {
      var r = byId('room', b.room_id), a = byId('accommodation', r.accommodation_id);
      return { id: b.id, accommodation_name: a.name, city: a.city, room_number: r.room_number, capacity: r.capacity, check_in: b.check_in, check_out: b.check_out, guests: b.guests, price_per_night: r.price_per_night };
    });
    rows.sort(function (x, y) { return (x.check_in < y.check_in ? -1 : x.check_in > y.check_in ? 1 : 0) || x.id - y.id; });
    // Nights and total are never stored: the program works them out from the dates and the price.
    var view = rows.map(function (r) { var n = HM.nights(r.check_in, r.check_out), v = copy(r); v.nights = n; v.total = n * r.price_per_night; return v; });
    return { rows: rows, view: view, trace: [sql('GetBookingsForCustomerAsync.sql', { '@customerId': customerId }, { rows: rows })] };
  };

  // ------------------------------------------------------------------ 5. change the number of guests
  db.updateGuests = function (u) {
    var M = 'UpdateGuestsAsync', trace = [{ kind: 'begin' }];
    var booking = byId('booking', u.bookingId), room = booking ? byId('room', booking.room_id) : null;
    trace.push(sql(M + '.capacitySql', { '@bookingId': u.bookingId }, { rows: room ? [{ capacity: room.capacity }] : [] }));
    trace.push(check(lineOf(M, 'if (value is null)'), 'bokningen finns inte', { rader: room ? 1 : 0 }, !room));
    if (!room) {
      trace.push({ kind: 'rollback' }, ret(lineOf(M, 'GuestUpdateOutcome.BookingMissing'), 'BookingMissing'));
      return { outcome: 'BookingMissing', trace: trace, changed: false };
    }
    trace.push(check(lineOf(M, 'if (guests > capacity)'), 'guests > capacity', { guests: u.guests, capacity: room.capacity }, u.guests > room.capacity));
    if (u.guests > room.capacity) {
      trace.push({ kind: 'rollback' }, ret(lineOf(M, 'GuestUpdateOutcome.TooManyGuests'), 'TooManyGuests'));
      return { outcome: 'TooManyGuests', trace: trace, changed: false };
    }
    var next = copy(booking);
    next.guests = u.guests;
    var params = { '@guests': u.guests, '@bookingId': u.bookingId }, no = refuse(next, booking.id);
    if (no) {
      trace.push(sql(M + '.updateSql', params, no), { kind: 'rollback' });
      return { outcome: 'Error', error: no.error, trace: trace, changed: false };
    }
    var was = booking.guests;
    booking.guests = u.guests;
    trace.push(sql(M + '.updateSql', params, { affected: 1 }), { kind: 'commit' }, ret(lineOf(M, 'GuestUpdateOutcome.Updated'), 'Updated'));
    return { outcome: 'Updated', trace: trace, changed: was !== u.guests };
  };

  // ------------------------------------------------------------------ 6. cancel
  db.cancelBooking = function (bookingId) {
    var before = db.tables.booking.length;
    db.tables.booking = db.tables.booking.filter(function (b) { return b.id !== bookingId; });
    var n = before - db.tables.booking.length;
    return { deleted: n === 1, changed: n > 0,
      trace: [sql('CancelBookingAsync.sql', { '@bookingId': bookingId }, { affected: n }), ret(lineOf('CancelBookingAsync', 'return await cmd.ExecuteNonQueryAsync() == 1'), n === 1 ? 'true' : 'false')] };
  };
})();
