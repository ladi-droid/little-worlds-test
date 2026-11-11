/* Little Worlds usage pings (test site only; A's World never loads this file).
   Sends small anonymous events to the same Google Sheet as the feedback form, on a tab called "Events".
   No names or emails: a random id for this browser, the game's link name, the device type and what happened.
   The admin page (admin.html) reads them back. */
(function () {
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbwbbqG4tg3LQxXu0mWkWmoInMumnrYscPdz3NKcc3wwZyCV2W4cjdMg4eBUlJ2EKEWw/exec';
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var dev = get('lw_dev');
  if (!dev) { dev = Date.now().toString(36) + Math.random().toString(36).slice(2, 8); set('lw_dev', dev); }
  // what it's played on: phone / tablet / computer, Apple / Android / other, and whether it was opened from the home screen
  var ua = navigator.userAgent || '', touch = navigator.maxTouchPoints > 1;
  var os = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch) ? 'Apple' : /Android/.test(ua) ? 'Android' : 'Other';
  var small = Math.min(screen.width, screen.height);
  var kind = !touch && !/Mobi|Android/.test(ua) ? 'Computer' : small >= 600 ? 'Tablet' : 'Phone';
  var home = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone ? 1 : 0;
  window.lwPing = function (ev, o) {
    if (!ENDPOINT) return;
    o = o || {};
    var body = JSON.stringify({
      kind: 'event', ev: ev, dev: dev, game: o.link || '', trip: o.trip || '',
      progress: o.progress == null ? '' : Math.round(Math.max(0, Math.min(1, o.progress)) * 100),
      secs: o.secs == null ? '' : Math.round(o.secs * 10) / 10,
      specials: o.specials == null ? '' : o.specials,
      extra: o.extra || '', device: kind + ' / ' + os, home: home, page: location.pathname.split('/').pop() || 'index.html',
      admin: get('lw_admin_key') ? 1 : 0          // Ladi's own browsers, so the dashboard can hide his test runs
    });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain;charset=utf-8' }))) return;
    } catch (e) {}
    try { fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body, keepalive: true }); } catch (e) {}
  };
})();
