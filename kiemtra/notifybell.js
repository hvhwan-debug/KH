/* Chuông thông báo hệ thống (trang quản trị): báo khi nhân viên có yêu cầu hoặc thay đổi cần biết.
   Gồm: thắc mắc về điểm (cần xử lý), yêu cầu điều chỉnh thông tin (cần xử lý), nhân viên mới xác nhận điểm (chỉ để biết).
   Dùng các hàm có sẵn của trang quản trị: api(), esc(), switchTab(). Tự cập nhật mỗi phút khi đang mở trang. */
(function () {
  'use strict';
  var KIND = { dispute: ['#B45309', '#FFF1D6', 'Thắc mắc điểm'], request: ['#1559C4', '#E4EEFC', 'Yêu cầu điều chỉnh'], confirm: ['#17794A', '#E3F5EA', 'Xác nhận điểm'] };
  var N = { items: [], shown: false, open: false, busy: false };

  function seenGet() { try { var v = +localStorage.getItem('ntf.seen'); if (v) return v; v = Date.now(); localStorage.setItem('ntf.seen', String(v)); return v; } catch (e) { return N.seen || (N.seen = Date.now()); } }
  function seenSet(v) { N.seen = v; try { localStorage.setItem('ntf.seen', String(v)); } catch (e) { /* trình duyệt chặn lưu: bỏ qua */ } }
  function attr(v) { return esc(v).replace(/"/g, '&quot;'); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function when(ms) {
    if (!ms) return ''; var d = Date.now() - ms;
    if (d < 60e3) return 'vừa xong'; if (d < 3600e3) return Math.floor(d / 60e3) + ' phút trước'; if (d < 86400e3) return Math.floor(d / 3600e3) + ' giờ trước';
    var x = new Date(ms); return pad(x.getHours()) + ':' + pad(x.getMinutes()) + ' ' + pad(x.getDate()) + '/' + pad(x.getMonth() + 1);
  }
  function unread(it, seen) { return it.act || it.at > seen; }
  function count() { var s = seenGet(); return N.items.filter(function (i) { return unread(i, s); }).length; }

  function css() {
    if (document.getElementById('ntfCss')) return;
    var st = document.createElement('style'); st.id = 'ntfCss';
    st.textContent = '.ntf-bell{position:fixed;top:14px;right:22px;z-index:40;width:44px;height:44px;border-radius:14px;border:1px solid #D5E0F0;background:#fff;color:#1559C4;display:grid;place-items:center;cursor:pointer;box-shadow:0 8px 22px -12px rgba(10,40,100,.45)}' +
      '.ntf-bell:hover{background:#F2F7FF}.ntf-bell svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
      '.ntf-bell .ntf-n{position:absolute;top:-6px;right:-6px;min-width:20px;height:20px;padding:0 5px;border-radius:99px;background:#D92D20;color:#fff;font-size:12px;font-weight:800;display:grid;place-items:center;border:2px solid #fff}' +
      '.ntf-bell.ring svg{animation:ntfring .8s ease 2}@keyframes ntfring{0%,100%{transform:rotate(0)}20%{transform:rotate(14deg)}40%{transform:rotate(-12deg)}60%{transform:rotate(8deg)}80%{transform:rotate(-5deg)}}' +
      '.ntf-pn{position:fixed;top:66px;right:16px;z-index:41;width:min(420px,calc(100vw - 24px));max-height:min(74vh,640px);overflow:auto;background:#fff;border:1px solid #D5E0F0;border-radius:18px;box-shadow:0 24px 60px -20px rgba(10,40,100,.5);font-size:14px;color:#33425E}' +
      '.ntf-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid #E6EDF7;position:sticky;top:0;background:#fff;border-radius:18px 18px 0 0}.ntf-h b{font-size:15px;color:#0B2A6B}' +
      '.ntf-h button{border:0;background:none;color:#1559C4;font:inherit;font-size:13px;font-weight:700;cursor:pointer}' +
      '.ntf-it{display:flex;gap:10px;padding:12px 16px;border-bottom:1px solid #EEF3FA}.ntf-it.un{background:#F6FAFF}.ntf-it:last-child{border-bottom:0}' +
      '.ntf-dot{flex:none;width:10px;height:10px;border-radius:50%;margin-top:6px}.ntf-b{min-width:0;flex:1}.ntf-t{font-weight:700;color:#1C2B4A;line-height:1.4}' +
      '.ntf-d{margin-top:3px;line-height:1.45;white-space:pre-line;overflow-wrap:anywhere}.ntf-s{margin-top:4px;font-size:12px;color:#7C8AA5}' +
      '.ntf-tag{display:inline-block;margin-right:6px;padding:1px 8px;border-radius:99px;font-size:11px;font-weight:800}' +
      '.ntf-a{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.ntf-a button{height:32px;padding:0 12px;border-radius:10px;border:1px solid #CFE0FA;background:#fff;color:#1559C4;font:inherit;font-size:13px;font-weight:700;cursor:pointer}' +
      '.ntf-a button.pri{background:#1559C4;border-color:#1559C4;color:#fff}.ntf-a button:disabled{opacity:.55;cursor:default}' +
      '.ntf-e{padding:30px 16px;text-align:center;color:#7C8AA5}' +
      '@media(max-width:760px){.ntf-bell{top:max(10px,env(safe-area-inset-top));right:60px;width:40px;height:40px;border-radius:12px}.ntf-pn{top:calc(max(10px,env(safe-area-inset-top)) + 50px);right:10px}}';
    document.head.appendChild(st);
  }
  function build() {
    if (document.getElementById('ntfBell')) return;
    css();
    var b = document.createElement('button'); b.type = 'button'; b.id = 'ntfBell'; b.className = 'ntf-bell'; b.hidden = true;
    b.setAttribute('aria-label', 'Thông báo hệ thống'); b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false'); b.title = 'Thông báo hệ thống';
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg><span class="ntf-n" id="ntfN" hidden></span>';
    document.body.appendChild(b);
    var p = document.createElement('div'); p.id = 'ntfPn'; p.className = 'ntf-pn'; p.hidden = true; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Thông báo hệ thống'); p.tabIndex = -1;
    document.body.appendChild(p);
    b.onclick = function () { toggle(); };
    p.addEventListener('click', onPanelClick);
    document.addEventListener('click', function (e) { if (N.open && !p.contains(e.target) && !b.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && N.open) { close(); b.focus(); } });
  }
  function badge() {
    var n = count(), el = document.getElementById('ntfN'), b = document.getElementById('ntfBell'); if (!el || !b) return;
    el.hidden = !n; el.textContent = n > 99 ? '99+' : String(n);
    b.setAttribute('aria-label', 'Thông báo hệ thống' + (n ? ', ' + n + ' thông báo mới' : ''));
  }
  function render() {
    var p = document.getElementById('ntfPn'), s = N.panelSeen != null ? N.panelSeen : seenGet();
    var head = '<div class="ntf-h"><b>Thông báo hệ thống</b><button type="button" data-ntf="seen">Đánh dấu đã xem</button></div>';
    if (!N.items.length) { p.innerHTML = head + '<div class="ntf-e">Chưa có thông báo nào.<br>Khi nhân viên gửi thắc mắc, yêu cầu hoặc xác nhận điểm, bạn sẽ thấy ở đây.</div>'; return; }
    p.innerHTML = head + N.items.map(function (it) {
      var k = KIND[it.kind] || KIND.confirm, un = unread(it, s);
      var acts = it.kind === 'dispute' ? '<button type="button" class="pri" data-ntf="handle" data-id="' + attr(it.id) + '">Xử lý…</button><button type="button" data-ntf="view" data-id="' + attr(it.id) + '">Xem bảng theo dõi</button>'
        : it.kind === 'request' ? '<button type="button" class="pri" data-ntf="view" data-id="' + attr(it.id) + '">Xem yêu cầu</button>'
        : '<button type="button" data-ntf="view" data-id="' + attr(it.id) + '">Xem</button>';
      return '<div class="ntf-it' + (un ? ' un' : '') + '"><span class="ntf-dot" style="background:' + k[0] + '"></span><div class="ntf-b"><div class="ntf-t">' + esc(it.title) + '</div>' +
        (it.detail ? '<div class="ntf-d">' + esc(it.detail) + '</div>' : '') +
        '<div class="ntf-s"><span class="ntf-tag" style="background:' + k[1] + ';color:' + k[0] + '">' + k[2] + '</span>' + (it.sub ? esc(it.sub) + ' · ' : '') + esc(when(it.at)) + '</div>' +
        '<div class="ntf-a">' + acts + '</div></div></div>';
    }).join('');
  }
  function itemOf(id) { return N.items.filter(function (i) { return i.id === id; })[0]; }
  async function onPanelClick(e) {
    var b = e.target.closest('button[data-ntf]'); if (!b) return;
    var act = b.getAttribute('data-ntf'), it = itemOf(b.getAttribute('data-id'));
    if (act === 'seen') { markSeen(); render(); return; }
    if (!it) return;
    if (act === 'view') {
      close();
      if (it.kind === 'request') { switchTab('candidates'); setTimeout(function () { var c = document.getElementById('candReqCard'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 700); }
      else { switchTab('notify'); setTimeout(function () { if (window.scOpenStatus) window.scOpenStatus(it.batchId, it.kind === 'dispute' ? 'disputed' : 'all'); }, 250); }
      return;
    }
    if (act === 'handle') { close(); switchTab('notify'); setTimeout(function () { if (window.scHandle) window.scHandle(it.batchId, it.code); }, 250); }
  }
  function markSeen() { var m = Date.now(); N.items.forEach(function (i) { if (i.at > m) m = i.at; }); seenSet(m); N.panelSeen = m; badge(); }
  function open() { N.open = true; N.panelSeen = seenGet(); render(); var p = document.getElementById('ntfPn'); p.hidden = false; document.getElementById('ntfBell').setAttribute('aria-expanded', 'true'); markSeen(); p.focus(); }
  function close() { N.open = false; N.panelSeen = null; document.getElementById('ntfPn').hidden = true; document.getElementById('ntfBell').setAttribute('aria-expanded', 'false'); }
  function toggle() { N.open ? close() : open(); }

  async function refresh(force) {
    if (N.busy) return; N.busy = true;
    try {
      var r = await api('GET', '/api/kt-admin?op=notifications');
      if (!r.j || !r.j.ok) return;
      build();
      var before = count(), had = N.shown; N.items = r.j.items || [];
      var b = document.getElementById('ntfBell'); b.hidden = false; N.shown = true;
      badge();
      if (N.open) { var keep = N.panelSeen; render(); N.panelSeen = keep; }
      if (had && count() > before) { b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); }   // có thông báo mới: chuông rung
    } catch (e) { /* mất mạng: thử lại ở lần sau */ } finally { N.busy = false; }
  }
  window.ntfRefresh = function () { return refresh(true); };
  function start() {
    seenGet();
    setTimeout(refresh, 800);
    setInterval(function () { if (document.visibilityState !== 'hidden') refresh(); }, 60000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
