/* Đối chiếu file "Báo cáo nhân viên tóm tắt" (xuất từ hệ thống HR, 1 sheet) với danh sách thí sinh của hệ thống.
   Chạy được ở trình duyệt (window.KTHrSync) và Node (để kiểm thử). Không gọi mạng, không lưu gì: chỉ tính ra danh sách thay đổi
   để người quản trị xem trước, chọn rồi mới áp dụng qua API quản trị.
   Quy tắc:
     - Chỉ SO SÁNH tên, quản lí, email. KHÔNG tự đổi chức danh / nhóm ngành của người đã có (ảnh hưởng đề thi họ nhận).
     - Email giả (@example.com), thiếu @ hoặc sai dạng: không dùng để thêm người mới và không ghi đè email đang có.
     - "Ngày làm việc cuối cùng": đã qua = nghỉ rồi; chưa tới = sắp nghỉ (đề xuất, mặc định không chọn).
     - Người có trong hệ thống nhưng không có trong file: chỉ ĐỀ XUẤT nghỉ việc (mặc định không chọn). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KTHrSync = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var RE_CODE = /^[A-Za-z]+\d{4,}$/;
  var RE_MAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var PERSONAL = /@(gmail|yahoo|ymail|hotmail|outlook|icloud|live|msn|me)\./;

  function fold(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
  }
  var key = function (c) { return String(c == null ? '' : c).trim().toLowerCase(); };
  var low = function (s) { return String(s == null ? '' : s).normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase(); };

  function isoDate(v) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v || '').trim());
    if (!m) return '';
    var d = +m[1], mo = +m[2], y = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1950 || y > 2100) return '';
    return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d;
  }
  var dmy = function (iso) { return String(iso || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1'); };

  // 'ok' | 'personal' (dùng được) | 'fake' | 'invalid' (không dùng được)
  function emailState(e) {
    e = String(e || '').trim().toLowerCase();
    if (!RE_MAIL.test(e)) return 'invalid';
    if (/@example\.(com|org|net)$/.test(e)) return 'fake';
    return PERSONAL.test(e) ? 'personal' : 'ok';
  }
  var usable = function (st) { return st === 'ok' || st === 'personal'; };

  // Tìm dòng tiêu đề (trong 15 dòng đầu) của báo cáo
  function headerOf(rows) {
    for (var i = 0; i < Math.min(rows.length, 15); i++) {
      var H = (rows[i] || []).map(fold);
      if (H.indexOf('ma nhan vien') >= 0 && H.indexOf('ten nhan vien') >= 0) {
        var f = function (name) { return H.indexOf(name); };
        return { row: i, col: {
          code: f('ma nhan vien'), name: f('ten nhan vien'), company: f('cong ty'), phong: f('phong ban'), dept: f('bo phan'), area: f('khu vuc lam viec'),
          place: f('dia diem lam viec'), title: f('chuc danh'), mgr: f('quan ly'), join: f('ngay vao cong ty'), mail: f('email cong viec'), last: f('ngay lam viec cuoi cung')
        } };
      }
    }
    return null;
  }

  function nganhOf(r) {
    var d = fold(r.dept), a = fold(r.area), c = fold(r.company);
    var m = /nganh\s*([12])\b/.exec(d); if (m) return +m[1];
    if (/gia dung/.test(d)) return 2;
    if (/^\[krf/.test(a)) return 1;
    if (/^\[livotec/.test(a)) return 2;
    if (/livotec/.test(c)) return 2;
    if (/karofi|puresys|aqualink/.test(c)) return 1;
    return 0;
  }
  // Chức danh dùng cho người MỚI (người đã có giữ nguyên): PC / SR 1 / SR 2; còn lại giữ chức danh gốc
  function titleOf(r) {
    var t = fold(r.title);
    if (/tu van san pham/.test(t) && !/truong nhom/.test(t)) return 'PC';
    if (/dai dien ban hang/.test(t)) { var n = nganhOf(r); return n ? 'SR ' + n : String(r.title || '').trim(); }
    return String(r.title || '').trim();
  }
  var segmentOf = function (title) { return title === 'SR 1' ? 'may_loc' : title === 'SR 2' ? 'gia_dung' : 'both'; };

  /* sheets: [{ name, rows }] → { records, problems, sheet } */
  function parseReport(sheets) {
    var problems = [];
    for (var s = 0; s < sheets.length; s++) {
      var h = headerOf(sheets[s].rows || []);
      if (!h) continue;
      var C = h.col, g = function (row, i) { return i >= 0 && row[i] != null ? String(row[i]).replace(/\s+/g, ' ').trim() : ''; };
      var records = [], seen = {};
      for (var i = h.row + 1; i < sheets[s].rows.length; i++) {
        var row = sheets[s].rows[i] || [], code = g(row, C.code), name = g(row, C.name);
        if (!code && !name) continue;
        if (!RE_CODE.test(code)) { if (name) problems.push({ row: i + 1, code: code, name: name, reason: 'không có mã nhân viên hợp lệ' }); continue; }
        if (seen[key(code)]) { problems.push({ row: i + 1, code: code, name: name, reason: 'mã nhân viên trùng trong file' }); continue; }
        seen[key(code)] = 1;
        var email = g(row, C.mail).toLowerCase();
        records.push({ code: code, name: name, title: g(row, C.title), manager: g(row, C.mgr), company: g(row, C.company), dept: g(row, C.dept), area: g(row, C.area),
          joinDate: isoDate(g(row, C.join)), email: email, emailState: emailState(email), lastDay: isoDate(g(row, C.last)), row: i + 1 });
      }
      return { records: records, problems: problems, sheet: sheets[s].name };
    }
    return { records: [], problems: [{ row: 0, code: '', name: '', reason: 'không thấy dòng tiêu đề "Mã nhân viên / Tên nhân viên" (đúng file "Báo cáo nhân viên tóm tắt" chưa?)' }], sheet: '' };
  }

  /* records: kết quả parseReport; existing: danh sách thí sinh của hệ thống; today: 'YYYY-MM-DD' (giờ Việt Nam) */
  function compare(records, existing, today) {
    var byCode = {}, hrBy = {};
    (existing || []).forEach(function (c) { byCode[key(c.code)] = c; });
    records.forEach(function (r) { hrBy[key(r.code)] = r; });
    var out = { added: [], changed: [], leaving: [], missing: [], alreadyLeftNotInSystem: [], same: 0, anomalies: { badEmail: [], noJoin: [], dupEmail: [], dupName: [], personalEmail: 0 }, total: records.length };

    records.forEach(function (r) {
      var c = byCode[key(r.code)], past = !!r.lastDay && r.lastDay <= today;
      if (!c) {
        if (past) { out.alreadyLeftNotInSystem.push({ code: r.code, name: r.name, lastDay: r.lastDay }); return; }
        var title = titleOf(r), ok = usable(r.emailState);
        out.added.push({ code: r.code, name: r.name, email: r.email, emailOk: ok, manager: r.manager, title: title, segment: segmentOf(title), nganh: nganhOf(r),
          lastDay: r.lastDay, blocked: ok ? '' : (r.emailState === 'fake' ? 'email giả (' + r.email + ')' : 'email không hợp lệ' + (r.email ? ' (' + r.email + ')' : ' (để trống)')) });
        return;
      }
      var diffs = [];
      if (r.name && low(c.name) !== low(r.name)) diffs.push({ field: 'name', label: 'Họ tên', from: c.name || '', to: r.name, on: true });
      if (r.manager && fold(c.manager) !== fold(r.manager)) diffs.push({ field: 'manager', label: 'Quản lí', from: c.manager || '', to: r.manager, on: true });
      if (usable(r.emailState) && String(c.email || '').trim().toLowerCase() !== r.email) diffs.push({ field: 'email', label: 'Email', from: c.email || '', to: r.email, on: false });
      if (diffs.length) out.changed.push({ code: c.code, name: c.name || r.name, diffs: diffs, left: !!c.left });
      else out.same++;
      if (r.lastDay && !c.left) out.leaving.push({ code: c.code, name: c.name || r.name, manager: c.manager || r.manager, lastDay: r.lastDay, state: past ? 'past' : 'future' });
    });
    (existing || []).forEach(function (c) {
      if (!hrBy[key(c.code)] && !c.left) out.missing.push({ code: c.code, name: c.name || '', manager: c.manager || '', title: c.title || '' });
    });

    var mailSeen = {}, nameSeen = {};
    records.forEach(function (r) {
      if (!usable(r.emailState)) out.anomalies.badEmail.push({ code: r.code, name: r.name, email: r.email, state: r.emailState });
      if (r.emailState === 'personal') out.anomalies.personalEmail++;
      if (!r.joinDate) out.anomalies.noJoin.push({ code: r.code, name: r.name });
      if (r.email) (mailSeen[r.email] = mailSeen[r.email] || []).push(r);
      var nk = fold(r.name); if (nk) (nameSeen[nk] = nameSeen[nk] || []).push(r);
    });
    Object.keys(mailSeen).forEach(function (e) { if (mailSeen[e].length > 1) out.anomalies.dupEmail.push({ email: e, people: mailSeen[e].map(function (r) { return r.code + ' ' + r.name; }) }); });
    Object.keys(nameSeen).forEach(function (n) { if (nameSeen[n].length > 1) out.anomalies.dupName.push({ name: nameSeen[n][0].name, people: nameSeen[n].map(function (r) { return r.code; }) }); });
    return out;
  }

  return { parseReport: parseReport, compare: compare, emailState: emailState, usable: usable, titleOf: titleOf, nganhOf: nganhOf, segmentOf: segmentOf, dmy: dmy, fold: fold };
});
