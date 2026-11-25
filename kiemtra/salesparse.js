/* Đọc file "BÁO CÁO KẾT QUẢ KINH DOANH" (Salerep GT, sheet KQ SM) thành dữ liệu số bán theo tháng.
 * Dùng chung cho trang quản trị (trình duyệt, cần JSZip) và kịch bản kiểm thử trên Node.
 * - Không phụ thuộc thứ tự cột: tìm dòng tiêu đề có "Mã NV"/"Họ tên" và dòng có "Chỉ tiêu", rồi ghép cột theo tên.
 * - Dòng trống (không có mã NV lẫn họ tên) bị bỏ qua; giá trị rác kiểu "KV1" ở cột Tuyến / Mã NPP / Tên NPP được bỏ.
 * - %HT tính lại = Thực đạt / Chỉ tiêu (không chặn ở 100%); %HT trong file (thường chặn ở 100%) lưu ở htFile để đối chiếu. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SalesParse = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function fold(s) {
    return String(s == null ? "" : s).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ");
  }
  function decode(x) {
    return String(x).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCodePoint(+n); })
      .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCodePoint(parseInt(n, 16)); })
      .replace(/&amp;/g, "&");
  }
  function texts(xml) { // nối mọi <t> (bỏ phần phiên âm <rPh>)
    var out = "", m, re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    xml = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
    while ((m = re.exec(xml))) out += decode(m[1]);
    return out;
  }
  function colIdx(ref) { var s = /^([A-Z]+)/.exec(ref)[1], n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64; return n - 1; }

  // ---------- xlsx -> lưới giá trị (mảng các dòng) ----------
  async function readXlsx(JSZip, data) {
    var zip = await JSZip.loadAsync(data);
    var f = function (p) { var e = zip.file(p); return e ? e.async("string") : Promise.resolve(""); };
    var wb = await f("xl/workbook.xml"), rels = await f("xl/_rels/workbook.xml.rels");
    var sheets = [], m, re = /<sheet\b([^>]*)\/?>/g;
    while ((m = re.exec(wb))) {
      var a = m[1], nm = /name="([^"]*)"/.exec(a), rid = /r:id="([^"]*)"/.exec(a);
      if (nm && rid) sheets.push({ name: decode(nm[1]), rid: rid[1] });
    }
    if (!sheets.length) throw new Error("Không đọc được danh sách sheet trong file.");
    var pick = sheets.find(function (s) { return fold(s.name) === "kq sm"; }) || sheets[0];
    var rm = new RegExp('<Relationship\\b[^>]*Id="' + pick.rid + '"[^>]*>').exec(rels), target = rm && /Target="([^"]*)"/.exec(rm[0]);
    var path = target ? target[1].replace(/^\/?xl\//, "").replace(/^\//, "") : "worksheets/sheet1.xml";
    var sheet = await f("xl/" + path);
    if (!sheet) throw new Error("Không đọc được sheet " + pick.name + ".");
    var ssx = await f("xl/sharedStrings.xml"), ss = [];
    re = /<si>([\s\S]*?)<\/si>/g; while ((m = re.exec(ssx))) ss.push(texts(m[1]));
    var grid = [];
    var rre = /<row\b([^>]*)>([\s\S]*?)<\/row>/g, rr;
    while ((rr = rre.exec(sheet))) {
      var rn = /\br="(\d+)"/.exec(rr[1]), ri = rn ? +rn[1] - 1 : grid.length, row = [];
      var cre = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, cc;
      while ((cc = cre.exec(rr[2]))) {
        var at = cc[1], body = cc[2] || "", r = /\br="([A-Z]+\d+)"/.exec(at), t = /\bt="([^"]*)"/.exec(at);
        if (!r) continue;
        var type = t ? t[1] : "n", vm = /<v>([\s\S]*?)<\/v>/.exec(body), val = null;
        if (type === "s") val = vm ? ss[+vm[1]] : null;
        else if (type === "inlineStr") val = texts(body);
        else if (type === "str" || type === "e") val = vm ? decode(vm[1]) : null;
        else if (type === "b") val = vm ? vm[1] === "1" : null;
        else val = vm && vm[1] !== "" ? Number(vm[1]) : null;
        row[colIdx(r[1])] = val;
      }
      grid[ri] = row;
    }
    for (var i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = [];
    return { grid: grid, sheet: pick.name };
  }

  // ---------- chuẩn hoá giá trị ----------
  function num(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return isFinite(v) ? v : null;
    var s = String(v).trim().replace(/\s/g, "");
    if (/^-?[\d.]+,\d+$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    var n = Number(s); return isFinite(n) ? n : null;
  }
  function str(v) { return v == null ? "" : String(v).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim(); }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function date(v) {
    if (v == null || v === "") return "";
    if (typeof v === "number" && v > 20000 && v < 80000) { // số seri ngày của Excel
      var d = new Date(Math.round((v - 25569) * 864e5)); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
    }
    var s = str(v), m;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s))) return m[1] + "-" + m[2] + "-" + m[3];
    if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/.exec(s))) return m[3] + "-" + pad(+m[2]) + "-" + pad(+m[1]);
    return "";
  }
  var junk = function (s) { return /^kv\d+[a-z]?$/i.test(s); };

  // ---------- lưới -> dữ liệu tháng ----------
  function parseGrid(grid, opts) {
    opts = opts || {};
    var warn = [], month = "", title = "", elapsed = null, i, j, row;
    for (i = 0; i < Math.min(grid.length, 12); i++) {
      row = grid[i] || [];
      for (j = 0; j < row.length; j++) {
        var cell = str(row[j]), m = /T\s*(\d{1,2})\s*[.\/-]\s*(\d{4})/i.exec(cell);
        if (!month && /ket qua kinh doanh/.test(fold(cell)) && m) { month = m[2] + "-" + pad(+m[1]); title = cell; }
        if (/thoi gian ban hang/.test(fold(cell))) {
          for (var k = j + 1; k < row.length; k++) { var n = num(row[k]); if (n != null && n >= 0 && n <= 1) { elapsed = n; break; } }
        }
      }
    }
    if (!month && opts.fileName) {
      var fm = /th[aá]ng[_\s-]*(\d{1,2})[_\s-]+(\d{4})/i.exec(opts.fileName.normalize("NFC"));
      if (fm) { month = fm[2] + "-" + pad(+fm[1]); warn.push("Không thấy tháng trong tiêu đề, lấy theo tên file: " + month + "."); }
    }
    if (!month) throw new Error("Không xác định được tháng báo cáo (cần dòng tiêu đề dạng \"BÁO CÁO KẾT QUẢ KINH DOANH T10.2026\").");

    var h = -1;
    for (i = 0; i < Math.min(grid.length, 30); i++) {
      var f = (grid[i] || []).map(fold);
      if (f.indexOf("ma nv") >= 0 && f.indexOf("ho ten") >= 0) { h = i; break; }
    }
    if (h < 0) throw new Error("Không tìm thấy dòng tiêu đề có cột \"Mã NV\" và \"Họ tên\".");
    var mrow = -1;
    for (i = h; i < Math.min(grid.length, h + 5); i++) if ((grid[i] || []).some(function (c) { return fold(c) === "chi tieu"; })) { mrow = i; break; }
    if (mrow < 0) throw new Error("Không tìm thấy cột \"Chỉ tiêu\".");

    var HEAD = { "stt": "stt", "ma asm": "asmCode", "ten asm": "asmName", "ma nv": "code", "ho ten": "name", "ngay nhan viec": "joinDate",
      "vi tri": "pos", "kv": "kv", "tuyen": "route", "ma npp": "nppCode", "ten npp": "nppName", "kenh": "channel" };
    var col = {}, extras = [];
    (grid[h] || []).forEach(function (c, idx) { var k = HEAD[fold(c)]; if (k && col[k] == null) col[k] = idx; });
    if (col.stt != null && col.asmCode != null && col.asmCode - col.stt === 2 && !str((grid[h] || [])[col.stt + 1])) col.mien = col.stt + 1;
    (grid[mrow] || []).forEach(function (c, idx) {
      var k = fold(c); if (!k) return;
      if (k === "chi tieu") col.target = idx;
      else if (k === "thuc dat") col.actual = idx;
      else if (k === "%ht" || k === "% ht") col.htFile = idx;
      else if (k === "thu viec") col.probation = idx;
      else if (idx > (col.channel || 0)) extras.push({ key: "x" + extras.length, label: str(c), idx: idx });
    });
    if (col.code == null || col.target == null || col.actual == null) throw new Error("Thiếu cột bắt buộc (Mã NV, Chỉ tiêu, Thực Đạt).");

    var rows = [], seen = {};
    for (i = mrow + 1; i < grid.length; i++) {
      row = grid[i] || [];
      var g = function (k) { return col[k] == null ? null : row[col[k]]; };
      var code = str(g("code")).toUpperCase(), name = str(g("name"));
      if (!code && !name) continue;
      if (fold(name) === "ty trong" || fold(name) === "tong") continue;
      var r = {
        stt: num(g("stt")), mien: str(g("mien")), asmCode: str(g("asmCode")).toUpperCase(), asmName: str(g("asmName")),
        code: code, name: name, joinDate: date(g("joinDate")), pos: str(g("pos")), kv: str(g("kv")),
        route: str(g("route")), nppCode: str(g("nppCode")), nppName: str(g("nppName")), channel: str(g("channel")),
        target: num(g("target")), actual: num(g("actual")) || 0, htFile: num(g("htFile")), probation: str(g("probation")), extra: {}
      };
      if (junk(r.route)) r.route = "";
      if (junk(r.nppCode) || (r.nppCode && !/^\d+$/.test(r.nppCode))) r.nppCode = "";
      if (junk(r.nppName)) r.nppName = "";
      extras.forEach(function (x) { var v = num(row[x.idx]); if (v != null) r.extra[x.key] = v; });
      if (!code) warn.push("Dòng " + (i + 1) + " (" + name + ") không có mã NV.");
      else if (seen[code]) warn.push("Mã NV " + code + " xuất hiện nhiều lần (dòng " + seen[code] + " và " + (i + 1) + ").");
      if (code) seen[code] = i + 1;
      rows.push(r);
    }
    if (!rows.length) throw new Error("File không có dòng nhân viên nào.");
    var noTarget = rows.filter(function (r) { return !r.target; }).length;
    if (noTarget) warn.push(noTarget + " nhân viên chưa có chỉ tiêu (không tính vào %HT).");
    return {
      month: month, title: title || ("BÁO CÁO KẾT QUẢ KINH DOANH T" + month.slice(5) + "." + month.slice(0, 4)),
      elapsed: elapsed, extras: extras.map(function (x) { return { key: x.key, label: x.label }; }), rows: rows, warnings: warn
    };
  }

  return { readXlsx: readXlsx, parseGrid: parseGrid, fold: fold };
});
