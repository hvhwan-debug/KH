/* Xác nhận điểm qua email — giao diện quản trị (tab "Thông báo, thư mời").
   Luồng: dán bảng điểm / chọn file .xlsx -> tạo đợt -> XEM TRƯỚC email (đúng như nhân viên nhận) -> gửi theo đợt -> theo dõi ai đã xác nhận.
   Dùng các hàm có sẵn của trang quản trị: api(), esc(), msg(), $(), loadExcelJS(), switchTab(). */
(function () {
  'use strict';
  var SC = { ready: false, list: [], cur: null, st: null, parsed: null, filter: 'all', q: '' };
  var STATE = { pending: ['Chưa gửi', '#6B7690', '#EEF2F8'], sent: ['Đã gửi', '#1559C4', '#E8F2FF'], confirmed: ['Đã xác nhận', '#17794A', '#E3F5EA'], disputed: ['Có thắc mắc', '#B45309', '#FFF4DE'] };

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function vn(ms) { if (!ms) return ''; var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); }
  function call(op, body) { return api('POST', '/api/kt-admin', Object.assign({ op: op }, body || {})); }
  function badge(k) { var s = STATE[k] || STATE.pending; return '<span style="display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:700;color:' + s[1] + ';background:' + s[2] + '">' + s[0] + '</span>'; }
  function say(t, cls) { var el = $('scMsg'); if (el) msg('scMsg', t, cls); }

  // ---------- đọc bảng điểm ----------
  // Nhận mảng 2 chiều (dán từ Excel hoặc đọc từ .xlsx). Tự tìm dòng tiêu đề (có cột "Mã nhân viên"); dòng phía trên chỉ có 1 ô là tiêu đề bảng.
  function norm(s) { return String(s == null ? '' : s).normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function colLetter(k) { var t = ''; k++; while (k > 0) { var m = (k - 1) % 26; t = String.fromCharCode(65 + m) + t; k = Math.floor((k - 1) / 26); } return t; }
  function parseGrid(grid) {
    var h = -1, i;
    for (i = 0; i < grid.length && h < 0; i++) if (grid[i].some(function (c) { return /^(mã nhân viên|mã nv|mã số nhân viên)$/.test(norm(c)); })) h = i;
    if (h < 0) return { error: 'Không tìm thấy cột “Mã nhân viên”. Hãy dán cả dòng tiêu đề của bảng.' };
    var head = grid[h].map(norm), title = '';
    for (i = h - 1; i >= 0; i--) { var ne = grid[i].filter(function (c) { return String(c).trim(); }); if (ne.length === 1) { title = String(ne[0]).trim(); break; } }
    var find = function (re) { for (var k = 0; k < head.length; k++) if (re.test(head[k])) return k; return -1; };
    var ic = find(/^(mã nhân viên|mã nv|mã số nhân viên)$/), iname = find(/^(họ và tên|họ tên|tên nhân viên|tên)$/), imgr = find(/^quản l[ií]$/), istt = find(/^(stt|tt|#)$/);
    var txt = function (v) { return String(v == null ? '' : v).trim(); };
    // Tiêu đề 2 dòng (ô gộp): dòng ngay dưới không có mã nhân viên và chỉ toàn chữ (không có số) -> ghép tên cột "nhóm – chi tiết"
    var start = h + 1, labels = {}, sub = grid[h + 1], width = Math.max.apply(null, [head.length].concat(grid.slice(h, h + 2).map(function (r) { return r.length; })));
    var isSub = !!sub && !txt(sub[ic]) && sub.some(function (c, k) { return k !== ic && txt(c); }) && !sub.some(function (c) { return /^[\d.,\s%-]+$/.test(txt(c)) && txt(c); });
    if (isSub) start = h + 2;
    for (var k0 = 0; k0 < width; k0++) { var t0 = txt(grid[h][k0]), u0 = isSub ? txt(sub[k0]) : ''; labels[k0] = u0 ? (t0 && norm(t0) !== norm(u0) ? t0 + ' – ' + u0 : u0) : t0; }
    var special = function (k) { return k === ic || k === iname || k === imgr || k === istt; };
    var cols = [], skipped = [];
    for (var k = 0; k < width; k++) if (!special(k) && labels[k]) cols.push(k);
    var rows = [], seen = {}, dup = [];
    for (i = start; i < grid.length; i++) {
      var r = grid[i], code = txt(r[ic]); if (!code) continue;
      if (seen[code.toUpperCase()]) { dup.push(code); continue; } seen[code.toUpperCase()] = 1;
      rows.push({ code: code, name: iname >= 0 ? txt(r[iname]) : '', manager: imgr >= 0 ? txt(r[imgr]) : '', vals: cols.map(function (c) { return txt(r[c]); }) });
    }
    // Cột có dữ liệu nhưng không có tên ở dòng tiêu đề: không đưa vào email, nhưng phải báo để quản trị viên biết
    for (var k2 = 0; k2 < width; k2++) if (!special(k2) && !labels[k2] && grid.slice(start).some(function (r) { return txt(r[ic]) && txt(r[k2]); })) skipped.push(colLetter(k2));
    if (!cols.length) return { error: 'Không thấy cột điểm nào sau cột Mã nhân viên / Họ tên / Quản lí.' };
    if (!rows.length) return { error: 'Không có dòng dữ liệu nào bên dưới dòng tiêu đề.' };
    return { title: title, cols: cols.map(function (c) { return labels[c]; }), rows: rows, dup: dup, skipped: skipped, twoRow: isSub, hasName: iname >= 0, hasMgr: imgr >= 0 };
  }

  function parsePaste(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n').filter(function (l) { return l.trim(); });
    if (!lines.length) return { error: 'Chưa có dữ liệu. Hãy dán bảng điểm (copy từ Excel) vào ô.' };
    var tab = lines.some(function (l) { return l.indexOf('\t') >= 0; });
    return parseGrid(lines.map(function (l) { return tab ? l.split('\t') : l.split(/\s{2,}|;/); }));
  }
  async function readXlsx(ev) {
    var f = ev.target.files && ev.target.files[0]; ev.target.value = ''; if (!f) return;
    say('Đang đọc file…', 'ok');
    try {
      var X = await loadExcelJS(), wb = new X.Workbook(); await wb.xlsx.load(await f.arrayBuffer());
      var best = null, errs = [];
      wb.worksheets.forEach(function (ws) {
        var grid = [];
        ws.eachRow({ includeEmpty: false }, function (row) { var a = []; row.eachCell({ includeEmpty: true }, function (c, i) { a[i - 1] = c.text != null ? c.text : (c.value == null ? '' : String(c.value)); }); for (var k = 0; k < a.length; k++) if (a[k] == null) a[k] = ''; grid.push(a); });
        var p = parseGrid(grid);
        if (p.error) { errs.push(p.error); return; }
        p.sheet = ws.name;
        if (!best || p.cols.length > best.cols.length || (p.cols.length === best.cols.length && p.rows.length > best.rows.length)) best = p;
      });
      useParsed(best || { error: errs[0] || 'File không có dữ liệu.' }, f.name + (wb.worksheets.length > 1 && best ? ' · sheet “' + best.sheet + '”' : ''));
    } catch (e) { say('Không đọc được file. Hãy lưu lại dưới dạng .xlsx rồi thử lại.', 'err'); }
  }
  function useParsed(p, src) {
    SC.parsed = p.error ? null : p;
    if (p.error) { $('scPrev').innerHTML = ''; say(p.error, 'err'); return; }
    if (!$('scTitle').value.trim() && p.title) $('scTitle').value = p.title;
    say('', '');
    var warn = p.skipped && p.skipped.length ? '<div class="msg warn" style="margin-top:8px"><b>Chú ý:</b> cột ' + p.skipped.join(', ') + ' có dữ liệu nhưng <b>không có tên cột</b> ở dòng tiêu đề nên <b>chưa đưa vào email</b>. Hãy đặt tên cho cột đó trong file rồi nạp lại.</div>' : '';
    var head = '<tr>' + ['Mã nhân viên', 'Họ tên', 'Quản lí'].concat(p.cols).map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr>';
    var body = p.rows.slice(0, 5).map(function (r) { return '<tr><td>' + esc(r.code) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.manager) + '</td>' + r.vals.map(function (v) { return '<td>' + esc(v) + '</td>'; }).join('') + '</tr>'; }).join('');
    $('scPrev').innerHTML = '<div class="msg ok" style="margin-top:10px">Đã đọc <b>' + p.rows.length + '</b> nhân viên' + (src ? ' từ “' + esc(src) + '”' : '') + '. Cột điểm: ' + p.cols.map(function (c) { return '<b>' + esc(c) + '</b>'; }).join(', ') + '. Cột cuối (<b>' + esc(p.cols[p.cols.length - 1]) + '</b>) được hiện nổi bật trong email.' + (p.dup.length ? ' Bỏ qua ' + p.dup.length + ' dòng trùng mã.' : '') + (p.hasName ? '' : ' Bảng không có cột Họ tên: email sẽ lấy tên từ danh sách nhân sự.') + '</div>' +
      warn + (p.twoRow ? '<p class="small">Tiêu đề 2 dòng đã được ghép tên cột.</p>' : '') + '<div style="overflow-x:auto;margin-top:8px"><table class="dt"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' + (p.rows.length > 5 ? '<p class="small">Hiện 5 dòng đầu.</p>' : '');
  }

  // ---------- giao diện ----------
  function mount() {
    $('scMount').innerHTML =
      '<div id="scMsg"></div>' +
      '<div id="scNew"><div class="grid2">' +
      '<div><label for="scTitle">Tiêu đề bảng điểm</label><input type="text" id="scTitle" maxlength="150" placeholder="Ví dụ: ĐIỂM TUÂN THỦ HỌC TẬP PCs THÁNG 11/2026"></div>' +
      '<div><label for="scDue">Hạn xác nhận (không bắt buộc)</label><input type="datetime-local" id="scDue"></div>' +
      '<div><label for="scContact">Người liên hệ khi có thắc mắc</label><input type="text" id="scContact" maxlength="150" placeholder="Ví dụ: Đào tạo kinh doanh"></div>' +
      '<div><label for="scPhone">Số điện thoại / email liên hệ</label><input type="text" id="scPhone" maxlength="120" placeholder="Ví dụ: 0846 993 993 (được nhớ cho lần sau)"></div></div>' +
      '<label for="scPaste">Bảng điểm: dán từ Excel (gồm cả dòng tiêu đề) hoặc chọn file</label>' +
      '<textarea id="scPaste" rows="5" style="width:100%;font-family:inherit" placeholder="STT\tMã nhân viên\tHọ tên\tQuản lí\tKiểm tra định kỳ\t…\tĐiểm tuân thủ"></textarea>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button type="button" class="btn ghost sm" id="scRead">Đọc bảng đã dán</button>' +
      '<button type="button" class="btn ghost sm" id="scFileBtn">Chọn file .xlsx…</button><input type="file" id="scFile" accept=".xlsx" style="display:none">' +
      '<button type="button" class="btn sm" id="scCreate">Tạo đợt xác nhận</button></div>' +
      '<div id="scPrev"></div></div>' +
      '<h2 style="margin:22px 0 6px;font-size:16px">Các đợt đã tạo</h2><div id="scList"><p class="small">Đang tải…</p></div><div id="scDetail"></div>';
    $('scRead').onclick = function () { useParsed(parsePaste($('scPaste').value), ''); };
    $('scFileBtn').onclick = function () { $('scFile').click(); };
    $('scFile').onchange = readXlsx;
    $('scCreate').onclick = create;
    $('scContact').value = 'Đào tạo kinh doanh';
    try { $('scContact').value = localStorage.getItem('sc.contact') || $('scContact').value; $('scPhone').value = localStorage.getItem('sc.phone') || ''; } catch (e) { /* trình duyệt chặn lưu: bỏ qua */ }
    var tm; $('scPaste').addEventListener('input', function () { clearTimeout(tm); tm = setTimeout(function () { if ($('scPaste').value.trim()) useParsed(parsePaste($('scPaste').value), ''); }, 500); }); // dán xong tự đọc, không cần bấm thêm
  }
  async function create() {
    var p = SC.parsed || (function () { var q = parsePaste($('scPaste').value); if (!q.error) useParsed(q, ''); return q.error ? null : q; })();
    if (!p) { say('Hãy dán bảng điểm hoặc chọn file trước.', 'err'); return; }
    var title = $('scTitle').value.trim(); if (!title) { say('Vui lòng nhập tiêu đề bảng điểm.', 'err'); return; }
    var due = $('scDue').value ? new Date($('scDue').value).getTime() : 0, ph = $('scPhone').value.trim();
    try { localStorage.setItem('sc.contact', $('scContact').value.trim()); localStorage.setItem('sc.phone', ph); } catch (e) { /* bỏ qua */ }
    var btn = $('scCreate'); btn.disabled = true;
    var r = await call('scoreConfirmCreate', { title: title, cols: p.cols, rows: p.rows, deadline: due, contact: $('scContact').value.trim(), phone: /@/.test(ph) ? '' : ph, email: /@/.test(ph) ? ph : '' });
    btn.disabled = false;
    if (!r.j.ok) { say(r.j.error || 'Không tạo được đợt.', 'err'); return; }
    say('Đã tạo đợt với ' + r.j.rows + ' nhân viên. Chưa gửi email nào. Bấm “Xem trước & gửi” để xem email trước khi gửi.', 'ok');
    $('scPaste').value = ''; $('scTitle').value = ''; $('scPrev').innerHTML = ''; SC.parsed = null;
    await loadList(); openPreview(r.j.id);
  }
  async function loadList() {
    var r = await call('scoreConfirmList');
    if (!r.j.ok) { $('scList').innerHTML = '<p class="small">Không tải được danh sách.</p>'; return; }
    SC.list = r.j.list || [];
    $('scList').innerHTML = SC.list.length ? '<div style="overflow-x:auto"><table class="dt"><thead><tr><th>Tiêu đề</th><th>Số người</th><th>Tạo lúc</th><th></th></tr></thead><tbody>' + SC.list.map(function (x) {
      return '<tr><td>' + esc(x.title) + '</td><td>' + x.rows + '</td><td>' + vn(x.createdAt) + '</td><td style="white-space:nowrap"><button type="button" class="btn sm" data-sc="prev" data-id="' + esc(x.id) + '">Xem trước &amp; gửi</button> <button type="button" class="btn ghost sm" data-sc="stat" data-id="' + esc(x.id) + '">Theo dõi</button> <button type="button" class="btn ghost sm" data-sc="del" data-id="' + esc(x.id) + '">Xoá</button></td></tr>';
    }).join('') + '</tbody></table></div>' : '<p class="small">Chưa có đợt nào.</p>';
  }
  async function openPreview(id, code) {
    SC.cur = id; var box = $('scDetail'); box.innerHTML = '<p class="small" style="margin-top:14px">Đang dựng email xem trước…</p>';
    var r = await call('scoreConfirmPreview', { id: id, code: code || '' });
    if (!r.j.ok) { box.innerHTML = ''; say(r.j.error || 'Không xem trước được.', 'err'); return; }
    var s = r.j.stats, j = r.j;
    var opts = j.people.map(function (p) { return '<option value="' + esc(p.code) + '"' + (p.code === j.sample.code ? ' selected' : '') + '>' + esc(p.name || p.code) + ' (' + esc(p.code) + ')</option>'; }).join('');
    var miss = s.missing && s.missing.length ? '<details style="margin-top:8px"><summary class="small" style="cursor:pointer">Xem ' + s.noEmail + ' người sẽ KHÔNG nhận được email</summary><ul class="small" style="margin:6px 0 0;padding-left:18px">' + s.missing.map(function (m) { return '<li>' + esc(m.name || '') + ' (' + esc(m.code) + '): ' + esc(m.why) + '</li>'; }).join('') + (s.noEmail > s.missing.length ? '<li>…và ' + (s.noEmail - s.missing.length) + ' người khác</li>' : '') + '</ul></details>' : '';
    box.innerHTML = '<div class="card" style="margin-top:16px;border-color:#BBD3F6"><h2 style="margin:0 0 6px;font-size:16px">Xem trước email</h2>' +
      '<p class="small" style="margin:0 0 8px">Email gửi từng người một, mỗi người chỉ thấy điểm của mình. Đang xem thư của người được chọn bên dưới.</p>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px"><label style="margin:0">Xem thư của</label><select id="scWho" style="max-width:340px;margin:0">' + opts + '</select></div>' +
      '<div class="small" style="margin:0 0 8px"><b>Tiêu đề thư:</b> ' + esc(j.subject) + '<br><b>Gửi tới (người này):</b> ' + esc(j.to) + '<br><b>Cột điểm của đợt này (' + j.cols.length + '):</b> ' + j.cols.map(function (c) { return esc(c); }).join(' · ') + ' <span style="color:var(--muted)">(đợt tạo lúc ' + vn(j.createdAt) + ')</span></div>' +
      '<div class="msg warn" style="margin:0 0 10px">Thiếu cột điểm? Đợt đã tạo <b>không tự cập nhật</b>. Bấm <b>Xoá</b> ở đợt này, nạp lại file đầy đủ rồi tạo lại (mỗi cột điểm phải có tên ở dòng tiêu đề). Chưa gửi email nào thì xoá không ảnh hưởng ai.</div>' +
      '<iframe id="scFrame" sandbox="" title="Xem trước email" style="width:100%;height:820px;border:1px solid var(--line);border-radius:12px;background:#EEF3FA"></iframe>' +
      '<div class="msg ok" style="margin-top:12px"><b>' + s.total + '</b> nhân viên trong bảng · <b>' + s.withEmail + '</b> có email · <b>' + s.noEmail + '</b> chưa có email' + (s.notFound ? ' (' + s.notFound + ' mã không có trong danh sách nhân sự)' : '') + ' · đã gửi <b>' + s.alreadySent + '</b> · đã xác nhận <b>' + s.confirmed + '</b>' + (s.disputed ? ' · có thắc mắc <b>' + s.disputed + '</b>' : '') + miss + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button type="button" class="btn" id="scSend"' + (s.pending ? '' : ' disabled') + '>Gửi cho ' + s.pending + ' người chưa gửi</button>' +
      '<button type="button" class="btn ghost" id="scResend"' + (s.alreadySent ? '' : ' disabled') + '>Gửi lại cho người chưa xác nhận…</button></div>' +
      '<p class="small" style="margin-top:6px">Mỗi lượt gửi tối đa 25 thư. Còn người chưa gửi thì bấm nút lần nữa. Email đã gửi không thu hồi được.</p></div>';
    $('scFrame').srcdoc = j.html;
    $('scWho').onchange = function () { openPreview(id, this.value); };
    $('scSend').onclick = function () { doSend(id, s.pending, false); };
    $('scResend').onclick = async function () { var st = await call('scoreConfirmStatus', { id: id }); if (!st.j.ok) { say(st.j.error, 'err'); return; } var n = st.j.rows.filter(function (x) { return x.email && x.state !== 'confirmed'; }).length; if (!n) { say('Mọi người có email đều đã xác nhận.', 'ok'); return; } doSend(id, n, true); };
    $('scDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  async function doSend(id, n, resend) {
    if (!confirm((resend ? 'Gửi LẠI email xác nhận điểm cho ' : 'Gửi email xác nhận điểm cho ') + n + ' người?\n\nMỗi người nhận một email riêng chỉ chứa điểm của họ. Email đã gửi không thu hồi được.')) return;
    say('Đang gửi, vui lòng không đóng trang…', 'ok');
    var r = await call('scoreConfirmSend', { id: id, expect: n, resend: resend });
    if (!r.j.ok) { say(r.j.error || 'Không gửi được.', 'err'); return; }
    say('Đã gửi ' + r.j.sent + ' thư.' + (r.j.failed.length ? ' Lỗi ' + r.j.failed.length + ' thư.' : '') + (r.j.remaining ? ' Còn ' + r.j.remaining + ' người chưa gửi (do giới hạn mỗi lượt), bấm nút gửi lần nữa để gửi tiếp.' : ' Đã gửi hết.'), r.j.failed.length ? 'warn' : 'ok');
    openPreview(id);
  }
  async function openStatus(id) {
    SC.cur = id; var box = $('scDetail'); box.innerHTML = '<p class="small" style="margin-top:14px">Đang tải…</p>';
    var r = await call('scoreConfirmStatus', { id: id });
    if (!r.j.ok) { box.innerHTML = ''; say(r.j.error || 'Không tải được.', 'err'); return; }
    SC.st = r.j; renderStatus();
  }
  function renderStatus() {
    var d = SC.st, s = d.stats, f = SC.filter, q = norm(SC.q);
    var rows = d.rows.map(function (x) { return Object.assign({}, x, { k: x.state === 'pending' && x.sentAt ? 'sent' : x.state }); })
      .filter(function (x) { return (f === 'all' || x.k === f) && (!q || norm(x.code + ' ' + x.name + ' ' + x.manager).indexOf(q) >= 0); });
    var last = d.cols.length - 1;
    $('scDetail').innerHTML = '<div class="card" style="margin-top:16px;border-color:#BBD3F6"><h2 style="margin:0 0 6px;font-size:16px">Theo dõi: ' + esc(d.title) + '</h2>' +
      '<div class="msg ok">Đã xác nhận <b>' + s.confirmed + '/' + s.total + '</b> · đã gửi <b>' + s.alreadySent + '</b> · chưa gửi <b>' + s.pending + '</b> · có thắc mắc <b>' + s.disputed + '</b> · chưa có email <b>' + s.noEmail + '</b>' + (d.deadline ? ' · hạn xác nhận ' + vn(d.deadline) : '') + '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"><select id="scF" style="max-width:200px;margin:0"><option value="all">Tất cả</option><option value="pending">Chưa gửi</option><option value="sent">Đã gửi, chưa xác nhận</option><option value="confirmed">Đã xác nhận</option><option value="disputed">Có thắc mắc</option></select>' +
      '<input type="text" id="scQ" placeholder="Tìm theo mã, tên, quản lí…" style="max-width:260px;margin:0" value="' + esc(SC.q) + '"></div>' +
      '<div style="overflow-x:auto"><table class="dt"><thead><tr><th>Mã</th><th>Họ tên</th><th>Quản lí</th><th>' + esc(d.cols[last]) + '</th><th>Trạng thái</th><th>Thời điểm</th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (x) {
        var when = x.state === 'confirmed' ? vn(x.confirmedAt) : x.state === 'disputed' && x.dispute ? vn(x.dispute.at) : x.sentAt ? 'gửi ' + vn(x.sentAt) + (x.sentN > 1 ? ' (' + x.sentN + ' lần)' : '') : (x.email ? '' : 'chưa có email');
        return '<tr><td>' + esc(x.code) + '</td><td>' + esc(x.name) + '</td><td>' + esc(x.manager) + '</td><td><b>' + esc(x.vals[last]) + '</b></td><td>' + badge(x.k) + '</td><td class="small">' + esc(when) + '</td></tr>' +
          (x.dispute ? '<tr><td></td><td colspan="5" class="small" style="color:#B45309">Thắc mắc: ' + esc(x.dispute.text) + '</td></tr>' : '');
      }).join('') : '<tr><td colspan="6" class="small">Không có dòng nào khớp.</td></tr>') + '</tbody></table></div></div>';
    $('scF').value = f; $('scF').onchange = function () { SC.filter = this.value; renderStatus(); };
    var qi = $('scQ'); qi.oninput = function () { SC.q = this.value; var pos = this.selectionStart; renderStatus(); var n = $('scQ'); n.focus(); n.setSelectionRange(pos, pos); };
  }

  function init() {
    if (!$('scMount')) return;
    if (!SC.ready) { SC.ready = true; mount(); $('scMount').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-sc]'); if (!b) return; var id = b.getAttribute('data-id');
      if (b.getAttribute('data-sc') === 'prev') openPreview(id);
      else if (b.getAttribute('data-sc') === 'stat') openStatus(id);
      else if (confirm('Xoá đợt này? Dữ liệu xác nhận của nhân viên cũng mất, liên kết trong các email đã gửi sẽ không còn dùng được.')) call('scoreConfirmDelete', { id: id }).then(function (r) { if (!r.j.ok) say(r.j.error, 'err'); $('scDetail').innerHTML = ''; loadList(); });
    }); }
    loadList();
  }
  window.addEventListener('load', function () {
    var st = window.switchTab;
    if (typeof st === 'function') window.switchTab = function (t) { var r = st.apply(this, arguments); if (t === 'notify') init(); return r; };
    var pane = document.getElementById('tab-notify'); if (pane && !pane.classList.contains('hide')) init();
  });
})();
