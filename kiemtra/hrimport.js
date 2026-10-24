/* Đọc file "Danh sách nhân sự" (sheet GT1, GT2, ASM GT1, ASM GT2) và quy ra danh sách thí sinh cho hệ thống.
   Chạy được cả ở trình duyệt (window.KTHr) lẫn Node (để kiểm thử bằng chính file thật).
   Quy tắc chức danh:
     - Đại diện bán hàng (mọi cấp L1…L5): sheet GT1 → "SR 1", sheet GT2 → "SR 2"
     - Trưởng Kinh doanh Khu vực / ASM / Senior ASM: ngành 1 → "ASM 1", ngành 2 → "ASM 2"
     - Nhân viên Tư vấn Sản phẩm → "PC"
     - Chức danh khác (Task Force, Giám đốc, Trợ lý…) → nhóm "Khác", giữ nguyên chức danh gốc
   Bỏ qua: người đã có ngày thôi việc, dòng không có mã NV hợp lệ (vd. dòng ghi chú cuối bảng), sheet MT và Setup. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KTHr = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var GROUPS = ['SR 1', 'SR 2', 'ASM 1', 'ASM 2', 'PC', 'Khác'];

  function fold(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
  }
  function cellText(v) {
    if (v == null) return '';
    if (v instanceof Date) { if (isNaN(v.getTime())) return ''; var p2 = function (n) { return (n < 10 ? '0' : '') + n; }; return p2(v.getUTCDate()) + '/' + p2(v.getUTCMonth() + 1) + '/' + v.getUTCFullYear(); }
    if (typeof v === 'object') {
      if (Array.isArray(v.richText)) return v.richText.map(function (t) { return t.text; }).join('');
      if (v.result != null) return cellText(v.result);
      if (v.text != null) return cellText(v.text);
      if (v.hyperlink) return String(v.hyperlink).replace(/^mailto:/i, '');
      return '';
    }
    return String(v).replace(/\s+/g, ' ').trim();
  }
  // ExcelJS workbook → [{ name, rows: [[...text]] }]
  function sheetsFromExcelJS(wb) {
    var out = [];
    wb.eachSheet(function (ws) {
      var rows = [];
      ws.eachRow({ includeEmpty: true }, function (row, r) {
        var arr = [];
        for (var c = 1; c <= row.cellCount; c++) arr.push(cellText(row.getCell(c).value));
        rows[r - 1] = arr;
      });
      for (var i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
      out.push({ name: ws.name, rows: rows });
    });
    return out;
  }

  var RE_CODE = /^[A-Za-z]+\d{4,}$/;
  var RE_MAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  function normPhone(v) {
    var s = String(v == null ? '' : v).replace(/\D/g, '');
    if (/^84\d{9}$/.test(s)) s = '0' + s.slice(2);
    else if (/^\d{9}$/.test(s)) s = '0' + s; // Excel hay làm mất số 0 đầu của số điện thoại
    return /^0\d{9}$/.test(s) ? s : '';
  }
  function stripCode(s) { return String(s || '').replace(/^\s*[A-Za-z]*\d{4,}\s*-\s*/, '').trim(); }
  function nameKey(s) { return fold(s).replace(/[^a-z0-9 ]/g, ''); }

  function isoDate(v) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v || '').trim());
    if (!m) return '';
    var d = +m[1], mo = +m[2], y = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1950 || y > 2100) return '';
    return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d;
  }
  function profileOf(row, C, g, nganh, rawTitle, mgr) {
    var dm = /nganh\s*([12])\b/.exec(fold(g(row, C.dept))); if (dm) nganh = +dm[1]; // cột Bộ phận ghi rõ ngành thì theo đó
    var P = { nganh: nganh, chucDanhGoc: rawTitle, quanLy: mgr,
      donVi: g(row, C.donVi), khoi: g(row, C.khoi), phong: g(row, C.phong), boPhan: g(row, C.dept), toNhom: g(row, C.toNhom), khuVucCon: g(row, C.capBS),
      noiLamViec: g(row, C.noiLV), mien: g(row, C.mien), loaiNV: g(row, C.loaiNV),
      vaoCongTy: isoDate(g(row, C.vaoCT)), vaoLanDau: isoDate(g(row, C.vaoDau)), kyHDChinhThuc: isoDate(g(row, C.hdct)),
      trinhDo: g(row, C.trinhDo), bangCap: g(row, C.bangCap), chuyenNganh: g(row, C.chuyenNganh), truong: g(row, C.truong), tinhPhuTrach: g(row, C.tinh) };
    Object.keys(P).forEach(function (k) { if (P[k] === '' || P[k] == null) delete P[k]; });
    return P;
  }
  function sheetKind(name) {
    var k = fold(name).replace(/\s+/g, '');
    if (k === 'gt1') return { kind: 'gt', nganh: 1 };
    if (k === 'gt2') return { kind: 'gt', nganh: 2 };
    if (k === 'asmgt1') return { kind: 'asm', nganh: 1 };
    if (k === 'asmgt2') return { kind: 'asm', nganh: 2 };
    return null;
  }
  // Tìm dòng tiêu đề (trong 15 dòng đầu) và vị trí các cột cần dùng
  function headerOf(rows) {
    for (var i = 0; i < Math.min(rows.length, 15); i++) {
      var H = (rows[i] || []).map(fold);
      var has = function (re) { return H.some(function (h) { return re.test(h); }); };
      if (has(/^(msnv moi|ma nv)$/) || (has(/^ho va ten( day du)?$/) && has(/^(chuc vu|chuc danh)$/))) {
        var f = function () { var res = -1, re = Array.prototype.slice.call(arguments); H.forEach(function (h, j) { if (res < 0 && re.some(function (r) { return r.test(h); })) res = j; }); return res; };
        return { row: i, col: {
          code: f(/^(msnv moi|ma nv)$/), name: f(/^ho va ten day du$/, /^ho va ten$/), title: f(/^chuc danh$/, /^chuc vu$/),
          dept: f(/^bo phan$/), mgr: f(/^quan ly truc tiep$/), phone: f(/^(so di dong|sdt|so dien thoai)$/),
          mailC: f(/^email cong ty$/), mailP: f(/^email ca nhan$/), mail: f(/^email$/), resign: f(/^ngay thoi viec$/),
          // cột hồ sơ nhân sự (chỉ dữ liệu liên quan công việc; KHÔNG đọc ngày sinh, địa chỉ, quê quán, tôn giáo, dân tộc, hôn nhân, giới tính)
          donVi: f(/^don vi thanh vien$/), khoi: f(/^khoi( \/ khu vuc)?$/), phong: f(/^ban \/ phong$/), toNhom: f(/^to nhom$/), capBS: f(/^cap bo sung 1$/),
          loaiNV: f(/^loai nhan vien$/), noiLV: f(/^noi lam viec$/), mien: f(/^khu vuc lam viec$/, /^khu vuc$/),
          vaoCT: f(/^ngay vao cong ty$/), vaoDau: f(/^ngay vao cong ty dau tien$/, /^ngay vao tap doan$/), hdct: f(/^ngay ky hop dong chinh thuc dau tien$/),
          trinhDo: f(/^trinh do$/), bangCap: f(/^bang cap$/), chuyenNganh: f(/^chuyen nganh$/), truong: f(/^truong tot nghiep$/), tinh: f(/^(cac tinh phu trach|provices|provinces)$/)
        } };
      }
    }
    return null;
  }
  function groupOf(rawTitle, nganh) {
    var t = fold(rawTitle);
    if (/dai dien ban hang|sales rep/.test(t)) return 'SR ' + nganh;
    if (/truong kinh doanh khu vuc|^asm$|senior asm|^asm\b/.test(t)) return 'ASM ' + nganh;
    if (/nhan vien tu van san pham/.test(t)) return 'PC';
    return 'Khác';
  }

  /* sheets: [{ name, rows }] → { records, problems, ignored, counts } */
  function parse(sheets) {
    var recs = {}, order = [], problems = [], ignored = [], noCode = [];
    var nameToCode = {}; // tên (không dấu) → mã NV, để dò mã cho sheet ASM GT1 không có cột mã
    function put(r, prio) {
      var k = r.code.toUpperCase(), old = recs[k];
      if (!old) { recs[k] = r; r._prio = prio; order.push(k); return; }
      // gộp: bản ưu tiên cao hơn quyết định chức danh; các trường còn thiếu lấy từ bản kia
      var hi = prio < old._prio ? r : old, lo = hi === r ? old : r;
      ['name', 'mailC', 'mailP', 'phone', 'manager'].forEach(function (f) { if (!hi[f] && lo[f]) hi[f] = lo[f]; });
      hi.profile = Object.assign({}, lo.profile || {}, hi.profile || {});
      hi._prio = Math.min(prio, old._prio); hi.sheets = (old.sheets || []).concat(r.sheets || []);
      recs[k] = hi;
    }
    sheets.forEach(function (sh) {
      var kind = sheetKind(sh.name);
      if (!kind) { ignored.push(sh.name); return; }
      var h = headerOf(sh.rows);
      if (!h) { problems.push({ sheet: sh.name, row: 0, code: '', name: '', reason: 'không thấy dòng tiêu đề' }); return; }
      var C = h.col, g = function (row, i) { return i >= 0 ? (row[i] == null ? '' : row[i]) : ''; };
      for (var i = h.row + 1; i < sh.rows.length; i++) {
        var row = sh.rows[i] || [], rowNo = i + 1;
        var name = g(row, C.name).replace(/\s+/g, ' ').trim(), code = g(row, C.code).trim(), rawTitle = g(row, C.title);
        if (!name && !code) continue; // dòng trống
        var mgr = stripCode(g(row, C.mgr));
        var mgrCode = (/^\s*([A-Za-z]*\d{4,})\s*-\s*(.+)$/.exec(g(row, C.mgr)) || [])[1];
        if (mgrCode && mgr) nameToCode[nameKey(mgr)] = mgrCode;

        if (kind.kind === 'asm' && C.code < 0) {
          // Sheet ASM kiểu "Họ và tên / Chức vụ" không có mã NV: chỉ lấy ASM / Senior ASM, mã dò theo tên ở bước sau
          if (groupOf(rawTitle, kind.nganh) !== 'ASM ' + kind.nganh) continue;
          noCode.push({ sheet: sh.name, row: rowNo, name: name, rawTitle: rawTitle, nganh: kind.nganh, mail: g(row, C.mail) || g(row, C.mailC), mgr: mgr, tinh: g(row, C.tinh), mien: g(row, C.mien) });
          continue;
        }
        if (!RE_CODE.test(code)) { if (name) problems.push({ sheet: sh.name, row: rowNo, code: code, name: name, reason: 'không có mã NV hợp lệ' }); continue; }
        var resign = g(row, C.resign);
        if (resign) { problems.push({ sheet: sh.name, row: rowNo, code: code, name: name, reason: 'đã thôi việc (' + resign + ')' }); continue; }
        var grp = kind.kind === 'asm' ? 'ASM ' + kind.nganh : groupOf(rawTitle, kind.nganh);
        // "Khác" ở sheet ASM (vd. dòng bị trống chức danh): vẫn là ASM của sheet đó
        var title = grp === 'Khác' ? rawTitle : grp;
        var r = { code: code, name: name, title: title, group: grp, rawTitle: rawTitle, nganh: kind.nganh, manager: mgr,
          phone: normPhone(g(row, C.phone)), mailC: g(row, C.mailC) || g(row, C.mail), mailP: g(row, C.mailP), sheets: [sh.name + ' d.' + rowNo],
          profile: profileOf(row, C, g, kind.nganh, rawTitle, mgr) };
        if (!RE_MAIL.test(r.mailC)) r.mailC = ''; if (!RE_MAIL.test(r.mailP)) r.mailP = '';
        nameToCode[nameKey(name)] = code;
        // sheet GT (đủ thông tin) ưu tiên hơn sheet ASM
        put(r, kind.kind === 'gt' ? 1 : 2);
      }
    });
    // ASM không có cột mã: dò mã theo tên từ các sheet khác
    noCode.forEach(function (x) {
      var code = nameToCode[nameKey(x.name)];
      if (!code) { problems.push({ sheet: x.sheet, row: x.row, code: '', name: x.name, reason: 'không dò được mã NV theo tên' }); return; }
      var k = code.toUpperCase(), old = recs[k];
      if (old) { if (old.group === 'Khác') { old.group = 'ASM ' + x.nganh; old.title = old.group; } if (!old.mailC && RE_MAIL.test(x.mail)) old.mailC = x.mail; old.profile = old.profile || {}; if (x.tinh && !old.profile.tinhPhuTrach) old.profile.tinhPhuTrach = x.tinh; return; }
      put({ code: code, name: x.name, title: 'ASM ' + x.nganh, group: 'ASM ' + x.nganh, rawTitle: x.rawTitle, nganh: x.nganh, manager: x.mgr, phone: '', mailC: RE_MAIL.test(x.mail) ? x.mail : '', mailP: '', sheets: [x.sheet + ' d.' + x.row], profile: (function () { var P = { nganh: x.nganh, chucDanhGoc: x.rawTitle, quanLy: x.mgr, mien: x.mien, tinhPhuTrach: x.tinh }; Object.keys(P).forEach(function (k) { if (!P[k]) delete P[k]; }); return P; })() }, 3);
    });
    var records = order.map(function (k) { var r = recs[k]; delete r._prio; return r; });
    var counts = {}; GROUPS.forEach(function (g) { counts[g] = 0; }); records.forEach(function (r) { counts[r.group]++; });
    return { records: records, problems: problems, ignored: ignored, counts: counts };
  }
  // Email dùng để đăng nhập: ưu tiên email công ty; thiếu thì (nếu cho phép) dùng email cá nhân
  function pickEmail(r, usePersonal) { return r.mailC || (usePersonal ? r.mailP : '') || ''; }

  return { GROUPS: GROUPS, parse: parse, pickEmail: pickEmail, sheetsFromExcelJS: sheetsFromExcelJS, normPhone: normPhone, fold: fold };
});
