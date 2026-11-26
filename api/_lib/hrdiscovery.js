// RÀ SOÁT DỮ LIỆU NHÂN SỰ (Workforce Intelligence, giai đoạn 1-2): nguồn dữ liệu đã có, trường nào có / thiếu (tỉ lệ điền), chất lượng dữ liệu
// (trùng, sai định dạng), những phân tích làm được với cỡ mẫu thật, những trường nên bổ sung, và giới hạn.
// Nguyên tắc: chỉ ĐẾM dữ liệu thật có trong hệ thống; KHÔNG tự điền, KHÔNG suy đoán thông tin chưa xác minh; chỉ trả số tổng hợp (quản trị viên xem).
const quiz = require("./quiz");

const TOP = [
  ["name", "Họ và tên", "Cơ bản"], ["email", "Email", "Cơ bản"], ["phone", "Số điện thoại", "Cơ bản"], ["manager", "Quản lí trực tiếp", "Cơ bản"],
  ["title", "Chức danh (nhóm PC / SR / PG / ASM / RSM)", "Cơ bản"], ["segment", "Ngành (gia dụng / máy lọc nước)", "Cơ bản"],
  ["province", "Tỉnh / thành", "Khu vực"], ["region", "Miền", "Khu vực"], ["birthDate", "Ngày sinh (thí sinh tự xác nhận)", "Nhân khẩu học"]
];
const PF = [
  ["chucDanhGoc", "Chức danh gốc (theo hồ sơ nhân sự)", "Vị trí"], ["donVi", "Đơn vị", "Vị trí"], ["khoi", "Khối", "Vị trí"], ["phong", "Phòng ban", "Vị trí"], ["boPhan", "Bộ phận", "Vị trí"],
  ["toNhom", "Tổ / nhóm", "Vị trí"], ["loaiNV", "Loại nhân viên", "Vị trí"], ["quanLy", "Quản lí (theo hồ sơ nhân sự)", "Vị trí"],
  ["mien", "Miền (hồ sơ)", "Khu vực"], ["khuVucCon", "Khu vực con", "Khu vực"], ["noiLamViec", "Nơi làm việc", "Khu vực"], ["tinhPhuTrach", "Tỉnh phụ trách", "Khu vực"],
  ["trinhDo", "Trình độ học vấn", "Học vấn"], ["bangCap", "Bằng cấp", "Học vấn"], ["chuyenNganh", "Chuyên ngành đào tạo", "Học vấn"], ["truong", "Trường tốt nghiệp", "Học vấn"],
  ["vaoCongTy", "Ngày vào công ty", "Thâm niên"], ["vaoLanDau", "Ngày vào lần đầu", "Thâm niên"], ["kyHDChinhThuc", "Ngày ký hợp đồng chính thức", "Thâm niên"],
  ["namSinh", "Năm sinh", "Nhân khẩu học"], ["nganh", "Ngành (1 / 2)", "Vị trí"]
];
// Trường CHƯA có trong hệ thống nhưng cần cho phân tích đầy đủ: đề xuất bổ sung (người có thẩm quyền nhập / xác minh; hệ thống không tự điền)
const PROPOSED = [
  { key: "kinhNghiemTong", label: "Tổng số năm kinh nghiệm làm việc", why: "Kinh nghiệm và kết quả kinh doanh / đào tạo", how: "Cột Excel \"Tổng KN (năm)\"; chỉ nhập khi có hồ sơ xác minh" },
  { key: "kinhNghiemNganh", label: "Số năm kinh nghiệm trong ngành hàng", why: "Phân biệt người mới vào ngành với người đã có nền", how: "Cột Excel \"KN ngành hàng (năm)\"" },
  { key: "kinhNghiemKinhDoanh", label: "Số năm kinh nghiệm lĩnh vực kinh doanh / bán hàng", why: "Kỹ năng tư vấn, xử lý từ chối theo kinh nghiệm bán hàng", how: "Cột Excel \"KN bán hàng (năm)\"" },
  { key: "namViTri", label: "Thời gian đảm nhiệm vị trí hiện tại", why: "Độ thành thạo theo thời gian ở vị trí; phân biệt thâm niên công ty với thâm niên vị trí", how: "Cột Excel \"Ngày nhận vị trí\" (suy ra số năm)" },
  { key: "lichSuDieuChuyen", label: "Lịch sử điều chuyển, thăng tiến", why: "Phân tích lộ trình phát triển và nhóm có tiềm năng", how: "Bảng riêng: mã NV, ngày, từ vị trí, đến vị trí" },
  { key: "chungChi", label: "Chứng chỉ chuyên môn", why: "Năng lực đã được xác nhận bên ngoài hệ thống", how: "Cột Excel \"Chứng chỉ\" (liệt kê, có ngày cấp nếu có)" },
  { key: "soGioDaoTao", label: "Số giờ đào tạo đã tham gia", why: "Quan hệ giữa số giờ đào tạo và mức cải thiện năng lực", how: "Nhập từ phiếu điểm danh đào tạo; hệ thống chưa tự đo" },
  { key: "danhGiaNangLuc", label: "Đánh giá năng lực ngoài bài thi (tư vấn, xử lý từ chối, lập kế hoạch, quản lí đội)", why: "Bài thi chỉ đo kiến thức; cần thêm đánh giá thực hành để tách thiếu kiến thức với thiếu kỹ năng", how: "Phiếu đánh giá của quản lí theo thang cố định, theo kỳ" },
  { key: "capBacQuanLy", label: "Cấp bậc quản lí", why: "Phân tích riêng nhóm quản lí (ASM / RSM)", how: "Cột Excel \"Cấp bậc\"" }
];
const pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : 0);
const has = (v) => v != null && String(v).trim() !== "";
const dateOk = (s, now) => { const t = Date.parse(s); return !isNaN(t) && t > Date.parse("1970-01-01") && t <= now + 86400000; };

function build(input) {
  const now = input.now || Date.now(), yr = new Date(now).getFullYear();
  const cands = Array.isArray(input.cands) ? input.cands : [], index = Array.isArray(input.index) ? input.index : [], salesDocs = Array.isArray(input.sales) ? input.sales : [];
  const active = cands.filter((c) => !quiz.isLeft(c)), left = cands.length - active.length, N = active.length;
  const code = (c) => quiz.normCode(c.code);
  // --- kết quả kiểm tra chính thức: mỗi người lấy điểm cao nhất
  const scored = new Map();
  index.forEach((r) => { if (r && r.status === "submitted" && r.pct != null && isFinite(Number(r.pct))) { const k = quiz.normCode(r.code), v = Number(r.pct); if (!scored.has(k) || v > scored.get(k)) scored.set(k, v); } });
  const periods = new Set(index.filter((r) => r && r.status === "submitted").map((r) => r.period || ""));
  // --- số bán: mã NV có chỉ tiêu > 0
  const salesCodes = new Set(); let salesRows = 0;
  salesDocs.forEach((d) => (d.rows || []).forEach((r) => { salesRows++; if (r.code && r.target > 0) salesCodes.add(quiz.normCode(r.code)); }));

  const pf = (c) => c.profile || {};
  const fields = [];
  TOP.forEach(([k, label, group]) => { const n = active.filter((c) => has(c[k])).length; fields.push({ key: k, label, group, filled: n, pct: pct(n, N), where: "danh sách nhân sự" }); });
  PF.forEach(([k, label, group]) => { const n = active.filter((c) => has(pf(c)[k])).length; fields.push({ key: "profile." + k, label, group, filled: n, pct: pct(n, N), where: "hồ sơ nhân sự (Excel)" }); });
  const withProfile = active.filter((c) => c.profile && Object.keys(c.profile).length).length;

  const tenureOf = (c) => has(pf(c).vaoLanDau) ? pf(c).vaoLanDau : pf(c).vaoCongTy;
  const sets = {
    age: active.filter((c) => Number.isInteger(pf(c).namSinh)),
    tenure: active.filter((c) => has(tenureOf(c)) && dateOk(tenureOf(c), now)),
    edu: active.filter((c) => has(pf(c).trinhDo) || has(pf(c).bangCap)),
    role: active.filter((c) => has(pf(c).chucDanhGoc) || has(c.title)),
    region: active.filter((c) => has(c.region) || has(pf(c).mien))
  };
  const both = (list) => list.filter((c) => scored.has(code(c))).length;
  const nScored = active.filter((c) => scored.has(code(c))).length;
  const nSales = active.filter((c) => salesCodes.has(code(c))).length;
  const nSalesScored = active.filter((c) => salesCodes.has(code(c)) && scored.has(code(c))).length;
  const status = (n) => (n >= 30 ? "ok" : n >= 10 ? "low" : "no");
  const A = (name, n, need) => ({ name, n, status: status(n), need: need || "" });
  const analyses = [
    A("Cơ cấu nhân sự theo chức danh, ngành, khu vực", N),
    A("Cơ cấu theo độ tuổi (chỉ số liệu tổng hợp)", sets.age.length, "Năm sinh trong hồ sơ nhân sự"),
    A("Cơ cấu theo trình độ học vấn", sets.edu.length, "Trình độ / bằng cấp trong hồ sơ nhân sự"),
    A("Cơ cấu theo thâm niên", sets.tenure.length, "Ngày vào công ty trong hồ sơ nhân sự"),
    A("Bản đồ khoảng cách năng lực: mảng kiến thức × chức danh × khu vực", nScored, "Kết quả kiểm tra đã nộp"),
    A("Độ tuổi × điểm kiểm tra", both(sets.age), "Năm sinh và điểm kiểm tra"),
    A("Thâm niên × điểm kiểm tra", both(sets.tenure), "Ngày vào công ty và điểm kiểm tra"),
    A("Trình độ học vấn × điểm kiểm tra", both(sets.edu), "Trình độ và điểm kiểm tra"),
    A("Điểm kiểm tra × % hoàn thành chỉ tiêu bán hàng", nSalesScored, "Số bán theo tháng và điểm kiểm tra"),
    A("Kinh nghiệm ngành hàng × kết quả kinh doanh", 0, "Chưa có trường kinh nghiệm ngành hàng"),
    A("Số giờ đào tạo × mức cải thiện năng lực", 0, "Chưa có trường số giờ đào tạo")
  ];
  // --- chất lượng dữ liệu
  const dup = (arr) => { const m = new Map(); arr.forEach((x) => { if (x) m.set(x, (m.get(x) || 0) + 1); }); return Array.from(m.values()).filter((v) => v > 1).length; };
  const issues = [];
  const add = (label, n, note) => { if (n > 0) issues.push({ label, n, note: note || "" }); };
  add("Mã nhân viên bị trùng", dup(cands.map(code)), "Cần giữ một dòng cho mỗi mã");
  add("Email bị trùng giữa nhiều nhân viên", dup(cands.map((c) => quiz.normEmail(c.email))), "Có thể làm lẫn kết quả giữa các người");
  add("Email sai định dạng", cands.filter((c) => has(c.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(c.email).trim())).length);
  add("Đang làm việc nhưng không có email", active.filter((c) => !has(c.email)).length, "Không nhận được thư mời / kết quả");
  add("Năm sinh ngoài khoảng hợp lý (nhỏ hơn 1950 hoặc dưới 16 tuổi)", active.filter((c) => Number.isInteger(pf(c).namSinh) && (pf(c).namSinh < 1950 || pf(c).namSinh > yr - 16)).length);
  add("Ngày vào công ty sai hoặc ở tương lai", active.filter((c) => { const t = tenureOf(c); return has(t) && !dateOk(t, now); }).length);
  add("Đang làm việc nhưng chưa có kết quả kiểm tra nào", N - nScored, "Chưa đủ dữ liệu để đánh giá năng lực của nhóm này");
  const known = new Set(cands.map(code)); const orphan = new Set(); index.forEach((r) => { const k = quiz.normCode(r && r.code); if (k && !known.has(k)) orphan.add(k); });
  add("Có kết quả kiểm tra nhưng mã không còn trong danh sách nhân sự", orphan.size, "Có thể đã nghỉ hoặc sai mã");

  const sources = [
    { name: "Danh sách nhân sự", ok: cands.length > 0, n: cands.length, note: N + " đang làm việc, " + left + " đã nghỉ" },
    { name: "Hồ sơ nhân sự (Excel)", ok: withProfile > 0, n: withProfile, note: "có hồ sơ " + pct(withProfile, N) + "% số người đang làm việc" },
    { name: "Kết quả kiểm tra chính thức", ok: scored.size > 0, n: scored.size, note: scored.size + " nhân sự có điểm, " + periods.size + " đề/kỳ (không tính tài khoản thử nghiệm)" },
    { name: "Số bán theo tháng (Salerep GT)", ok: salesDocs.length > 0, n: salesDocs.length, note: salesDocs.length + " tháng, " + salesRows + " dòng; " + nSales + " nhân sự khớp mã và có chỉ tiêu" },
    { name: "Hành vi làm bài (rời màn hình, tốc độ)", ok: index.some((r) => r && r.flags), n: index.filter((r) => r && r.flags).length, note: "lưu trong từng bài làm" },
    { name: "Chương trình đào tạo / học liệu", ok: (input.programs || 0) + (input.hoclieu || 0) > 0, n: (input.programs || 0) + (input.hoclieu || 0), note: (input.programs || 0) + " chương trình, " + (input.hoclieu || 0) + " học liệu (chưa có lịch sử giờ học của từng người)" }
  ];
  const limits = [
    "Chỉ khai thác dữ liệu có trong hệ thống này; không có KPI ngoài số bán Salerep GT, không có đánh giá thực hành, không có giờ đào tạo của từng người.",
    "Giới tính cố ý KHÔNG được lưu. Năm sinh chỉ dùng cho thống kê tổng hợp, không dùng để xếp hạng hay quyết định nhân sự, và không gửi cho AI.",
    "Tương quan KHÔNG chứng minh nhân quả. Chỉ đưa ra kết luận khi nhóm có từ 30 người trở lên; từ 10 đến 29 người chỉ mô tả; dưới 10 người không phân tích.",
    "Điểm kiểm tra đo kiến thức tại một thời điểm, không phải toàn bộ năng lực công việc; bài có nhiều lần rời màn hình cần được xem là tín hiệu, không phải bằng chứng."
  ];
  return { generatedAt: now, population: { total: cands.length, active: N, left }, sources, fields, derived: { age: sets.age.length, tenure: sets.tenure.length, education: sets.edu.length, role: sets.role.length, region: sets.region.length, scored: nScored, sales: nSales }, proposed: PROPOSED.map((p) => Object.assign({ state: "chưa có trường" }, p)), analyses, issues, limits };
}

async function load() {
  const store = require("./store");
  const names = await store.list("kt/sales/").catch(() => []);
  const sales = (await Promise.all((names || []).filter((x) => /\d{4}-\d{2}\.json$/.test(x)).map((x) => store.get(x).catch(() => null)))).filter((d) => d && !d.deleted && Array.isArray(d.rows));
  let programs = 0, hoclieu = 0;
  try { const p = await store.get("kt/programs.json"); programs = Array.isArray(p) ? p.length : (p && Array.isArray(p.items) ? p.items.length : 0); } catch (e) { /* bỏ qua */ }
  try { const h = await require("./hoclieu").load(); hoclieu = h && Array.isArray(h.items) ? h.items.length : 0; } catch (e) { /* bỏ qua */ }
  return { cands: await quiz.getCandidates(), index: await quiz.getIndex(), sales, programs, hoclieu };
}
module.exports = { build, load, PROPOSED };
