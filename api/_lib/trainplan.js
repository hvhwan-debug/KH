// KẾ HOẠCH ĐÀO TẠO THEO THÁNG: đối chiếu năng lực thực tế (hồ sơ năng lực toàn hệ thống) với yêu cầu năng lực của từng vị trí,
// tìm khoảng cách cần giải quyết, rồi lập bảng kế hoạch đào tạo của tháng (đối tượng, ngành, tên chương trình, nội dung, mục tiêu,
// phương pháp, thời lượng, phụ trách, thời gian, tần suất, ghi chú).
//  - Phân tích theo LUẬT, minh bạch: ngưỡng yêu cầu của từng vị trí nằm ở REQ bên dưới (sửa tại đây khi công ty đổi chuẩn).
//  - AI chỉ nhận số liệu tổng hợp ẩn danh theo vị trí (không tên, không mã nhân viên); kết quả được kiểm lại ở máy chủ.
//  - BÁM SÁT MỤC TIÊU KINH DOANH: kế hoạch chỉ lập khi đã nhập mục tiêu kinh doanh / chiến lược của tháng; kết quả bán (chỉ tiêu, thực đạt) làm tăng ưu tiên cho vị trí đang hụt chỉ tiêu,
//    mảng nằm trong chiến lược được ưu tiên hơn, và mỗi chương trình phải nêu góp phần vào mục tiêu nào và đo bằng chỉ số nào.
//  - Không có AI (hoặc AI lỗi): lập kế hoạch theo luật từ cùng bản phân tích.
//  - Mỗi tháng một tệp kt/trainplan/YYYY-MM.json trong kho lưu trữ (KHÔNG để số liệu nhân sự trong repo vì repo công khai).
const store = require("./store");
const CTX = require("./hrcontext");
const llm = require("./llm");

const PREFIX = "kt/trainplan/", BIZ = "kt/trainbiz/", MONTH = /^\d{4}-(0[1-9]|1[0-2])$/, MAX_ROWS = 60;
const DEFAULT_OWNER = "ĐTKDGT", DEFAULT_FREQ = "1 lần/tháng hoặc khi có yêu cầu", DEFAULT_METHOD = "Đào tạo trực tuyến + Giải case", DEFAULT_DURATION = "90 phút";
const s = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n || 200);
const r1 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 10) / 10);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pad = (n) => (n < 10 ? "0" + n : "" + n);

// Mảng năng lực (khớp hrcompetency.js): mk thị trường & đối thủ · po chính sách/quy trình · sk kỹ năng bán & tư vấn · n1 sản phẩm ngành 1 · n2 sản phẩm ngành 2 · sp sản phẩm chung
const AREA_NAME = { mk: "Thị trường & đối thủ", po: "Chính sách, quy trình & tiêu chuẩn", sk: "Kỹ năng bán hàng & tư vấn", n1: "Sản phẩm ngành 1 · Máy lọc nước", n2: "Sản phẩm ngành 2 · Điện gia dụng", sp: "Kiến thức sản phẩm (chung)" };
// Yêu cầu năng lực tối thiểu (% đúng trong mảng) theo vị trí để đạt mục tiêu công việc. Mảng chuyên sâu của ngành khác đã được loại ở hồ sơ năng lực (offScope).
const REQ = {
  GT1: { n1: 75, sk: 70, po: 65, mk: 65 },
  GT2: { n2: 75, sk: 70, po: 65, mk: 65 },
  SR: { sp: 70, sk: 70, po: 65 },
  PC: { sp: 75, sk: 75, po: 65, n1: 70, n2: 70 },
  PG: { sp: 65, sk: 60, po: 60, n1: 60, n2: 60 },
  ASM: { po: 75, mk: 70, sk: 70 },
  RSM: { mk: 75, po: 75 },
  OTHER: { sp: 65 }
};
const SHORT = { GT1: "SR 1", GT2: "SR 2", SR: "SR", PC: "PC", PG: "PG", ASM: "ASM", RSM: "RSM", OTHER: "Khác" };
const NGANH = { GT1: "1", GT2: "2", SR: "Chung", PC: "Gia dụng & Thiết bị gia đình", PG: "Chung", ASM: "Chung", RSM: "Chung", OTHER: "Chung" };
const keyOfLabel = (label) => Object.keys(CTX.AUD).find((k) => CTX.AUD[k] === label) || "OTHER";

// ---------- mục tiêu kinh doanh & chiến lược của tháng + kết quả bán ----------
function cleanList(v) { const a = Array.isArray(v) ? v : String(v || "").split(/\n+/); return a.map((x) => s(String(x).replace(/^[\s•\-–*]+/, ""), 240)).filter(Boolean).slice(0, 8); }
async function getBiz(month) {
  month = s(month, 7); const d = MONTH.test(month) ? await store.get(BIZ + month + ".json").catch(() => null) : null;
  return { month, goals: (d && d.goals) || [], strategy: (d && d.strategy) || [], updatedAt: (d && d.updatedAt) || 0, by: (d && d.by) || "" };
}
async function saveBiz(month, body, by) {
  month = s(month, 7); if (!MONTH.test(month)) throw new Error("Tháng không hợp lệ.");
  const d = { v: 1, month, goals: cleanList(body && body.goals), strategy: cleanList(body && body.strategy), updatedAt: Date.now(), by: String(by || "").toLowerCase() };
  await store.put(BIZ + month + ".json", d); return d;
}
// Kết quả bán toàn đội của tháng gần nhất có dữ liệu (không sau tháng lập kế hoạch nếu có), dùng làm bối cảnh mục tiêu kinh doanh
async function salesContext(month) {
  const names = (await store.list("kt/sales/").catch(() => [])).filter((x) => /\d{4}-\d{2}\.json$/.test(x));
  const docs = (await Promise.all(names.map((x) => store.get(x).catch(() => null)))).filter((d) => d && !d.deleted && Array.isArray(d.rows) && MONTH.test(d.month || "")).sort((a, b) => (a.month < b.month ? -1 : 1));
  if (!docs.length) return null;
  const d = docs.filter((x) => x.month <= month).pop() || docs[docs.length - 1]; let tg = 0, ac = 0; d.rows.forEach((r) => { tg += r.target || 0; ac += r.actual || 0; });
  return { month: d.month, target: Math.round(tg), actual: Math.round(ac), pct: tg > 0 ? r1(100 * ac / tg) : null, elapsed: d.elapsed == null ? null : d.elapsed, people: d.rows.length, sameMonth: d.month === month };
}
const areaOfText = (x) => require("./hrcompetency").areaOf(x);
function bizLink(biz, areaId) { const items = (biz.strategy || []).concat(biz.goals || []); return items.find((x) => areaOfText(x) === areaId) || (biz.goals || [])[0] || (biz.strategy || [])[0] || ""; }

// ---------- phân tích khoảng cách năng lực ----------
function analyse(data, month, ctx) {
  ctx = ctx || {}; const biz = ctx.biz || { goals: [], strategy: [] }, items = (biz.strategy || []).concat(biz.goals || []), by = {};
  data.people.forEach((p) => {
    const k = keyOfLabel(p.audience), A = by[k] = by[k] || { key: k, label: CTX.AUD[k], short: SHORT[k], people: 0, tested: 0, idx: [], req: {}, topics: {} };
    A.people++; if (!p.tests) return;
    A.tested++; if (p.index != null) A.idx.push(p.index);
    const req = REQ[k] || {};
    (p.areas || []).forEach((a) => {
      if (a.offScope || a.n < 4 || req[a.id] == null) return;
      const R = A.req[a.id] = A.req[a.id] || { pcts: [], gap: 0 };
      R.pcts.push(a.pct); if (a.pct < req[a.id]) R.gap++;
      (a.topics || []).forEach((t) => { const key = a.id + "|" + t.name, T = A.topics[key] = A.topics[key] || { area: a.id, name: t.name, sum: 0, n: 0 }; T.sum += t.pct; T.n++; });
    });
  });
  const cover = {}; ((data.system && data.system.coverage) || []).forEach((c) => { cover[c.area] = c; });
  const audiences = Object.keys(by).map((k) => {
    const A = by[k], grp = (data.audiences || []).find((g) => g.name === A.label) || {}, req = REQ[k] || {};
    const sw = grp.salesAvg == null ? 1 : Math.min(2, Math.max(1, 1 + (100 - grp.salesAvg) / 100)); // vị trí đang hụt chỉ tiêu bán thì ưu tiên cao hơn (tối đa gấp đôi)
    const reqs = Object.keys(req).map((id) => {
      const R = A.req[id], assessed = R ? R.pcts.length : 0, avg = R ? r1(mean(R.pcts)) : null, min = req[id];
      const status = assessed < 3 ? "thiếu dữ liệu" : (avg < min || R.gap / assessed >= 0.4) ? "cần đào tạo" : "đạt";
      const topics = Object.values(A.topics).filter((t) => t.area === id && t.n >= Math.min(2, assessed || 1)).map((t) => ({ name: t.name, pct: Math.round(t.sum / t.n), people: t.n }))
        .filter((t) => t.pct < 65).sort((a, b) => a.pct - b.pct).slice(0, 3);
      const cv = cover[AREA_NAME[id]] || {}, hits = items.filter((x) => areaOfText(x) === id); // mảng nằm trong chiến lược / mục tiêu của tháng
      return { area: id, areaName: AREA_NAME[id], min, avg, assessed, gapPeople: R ? R.gap : 0, status, topics, materials: cv.materials == null ? null : cv.materials, questions: cv.questions == null ? null : cv.questions,
        priority: status === "cần đào tạo" ? Math.round((R ? R.gap : 0) * Math.max(5, min - (avg || 0)) * sw * (hits.length ? 1.5 : 1)) : 0, strategyHits: hits };
    }).sort((a, b) => b.priority - a.priority);
    return { key: k, label: A.label, short: A.short, nganh: NGANH[k], people: A.people, tested: A.tested, index: r1(mean(A.idx)), salesAvg: grp.salesAvg == null ? null : grp.salesAvg, below60: grp.below60 || 0,
      needs: CTX.NEEDS[k] || [], reqs, gaps: reqs.filter((x) => x.status === "cần đào tạo").length, reliable: A.tested >= 10, salesWeight: Math.round(sw * 100) / 100,
      note: !reqs.some((x) => x.status === "cần đào tạo") && grp.salesAvg != null && grp.salesAvg < 85 ? "Năng lực đạt yêu cầu nhưng bán TB 3 tháng chỉ " + grp.salesAvg + "%: đào tạo kiến thức chưa phải đòn bẩy chính; nên rà yếu tố ngoài đào tạo (hàng, giá, điểm bán) và coaching tại điểm bán." : "" };
  }).sort((a, b) => b.gaps - a.gaps || b.people - a.people);
  return { month, generatedAt: Date.now(), meta: { population: (data.meta && data.meta.population) || data.people.length, tested: (data.meta && data.meta.tested) || 0 }, biz: { goals: biz.goals || [], strategy: biz.strategy || [] }, sales: ctx.sales || null, audiences };
}

// ---------- lịch: các ngày làm việc (T2–T6) rải đều trong tháng ----------
function workdays(month) {
  const y = +month.slice(0, 4), m = +month.slice(5), n = new Date(Date.UTC(y, m, 0)).getUTCDate(), out = [];
  for (let d = 1; d <= n; d++) { const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); if (w >= 1 && w <= 5) out.push(month + "-" + pad(d)); }
  return out;
}
function spread(month, k) { const W = workdays(month), out = []; for (let i = 0; i < k; i++) out.push(W[Math.min(W.length - 1, Math.floor((i + 0.5) * W.length / Math.max(1, k)))]); return out; }

// ---------- chuẩn hoá một dòng kế hoạch ----------
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function cleanRow(r, month) {
  r = r || {};
  const nd = Array.isArray(r.noiDung) ? r.noiDung : String(r.noiDung || "").split(/\n+/);
  let date = DATE.test(r.thoiGian || "") ? r.thoiGian : "";
  if (date && (!MONTH.test(date.slice(0, 7)) || isNaN(Date.parse(date)))) date = "";
  return {
    stt: 0, doiTuong: s(r.doiTuong, 40), nganh: s(r.nganh, 60), tenChuongTrinh: s(r.tenChuongTrinh, 160),
    noiDung: nd.map((x) => s(String(x).replace(/^[\s•\-–*]+/, ""), 240)).filter(Boolean).slice(0, 8),
    mucTieu: s(r.mucTieu, 400), phuongPhap: s(r.phuongPhap, 120), thoiLuong: s(r.thoiLuong, 40), phuTrach: s(r.phuTrach, 60),
    thoiGian: date, tanSuat: s(r.tanSuat, 100), ghiChu: s(r.ghiChu, 500), coSo: s(r.coSo, 400), mucTieuKd: s(r.mucTieuKd, 300), chiSoDo: s(r.chiSoDo, 300)
  };
}
function cleanRows(rows, month) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("Chưa có dòng kế hoạch nào.");
  if (rows.length > MAX_ROWS) throw new Error("Quá nhiều dòng (tối đa " + MAX_ROWS + ").");
  const out = rows.map((r) => cleanRow(r, month)).filter((r) => r.tenChuongTrinh);
  if (!out.length) throw new Error("Mỗi dòng cần có tên chương trình.");
  out.forEach((r, i) => { r.stt = i + 1; });
  return out;
}

// ---------- lập kế hoạch theo luật ----------
const TPL = {
  sk: { ten: "Kỹ năng tư vấn & xử lý từ chối", nd: ["Khai thác nhu cầu và nhận diện cơ hội bán", "Kỹ thuật tư vấn lợi ích và thuyết phục", "Xử lý các tình huống từ chối thường gặp", "Thực hành chốt đơn qua tình huống thực tế"], pp: "Đào tạo trực tuyến + Giải case" },
  po: { ten: "Chính sách, quy trình & tiêu chuẩn bán hàng", nd: ["Chính sách bán hàng, khuyến mãi và chiết khấu hiện hành", "Quy trình đặt hàng, giao nhận và bảo hành", "Tiêu chuẩn trưng bày và báo cáo tại điểm bán", "Bài tập tình huống áp dụng chính sách"], pp: "Đào tạo trực tuyến + Kiểm tra nhanh" },
  mk: { ten: "Thị trường & đối thủ cạnh tranh", nd: ["Cập nhật tình hình thị trường kênh GT", "So sánh sản phẩm với đối thủ chính", "Cách trình bày lợi thế cạnh tranh với đại lý", "Thảo luận tình huống bị so sánh với đối thủ"], pp: "Đào tạo trực tuyến + Thảo luận nhóm" },
  n1: { ten: "Kiến thức sản phẩm ngành 1 · Máy lọc nước", nd: ["Công nghệ lọc và thông số các dòng máy lọc nước", "Lợi ích sản phẩm theo nhu cầu khách hàng", "Câu hỏi thường gặp và cách trả lời", "Kiểm tra nhanh sau buổi học"], pp: "Đào tạo trực tuyến + Kiểm tra nhanh" },
  n2: { ten: "Kiến thức sản phẩm ngành 2 · Điện gia dụng", nd: ["Tính năng và thông số các nhóm sản phẩm điện gia dụng", "Lợi ích sản phẩm theo nhu cầu khách hàng", "Câu hỏi thường gặp và cách trả lời", "Kiểm tra nhanh sau buổi học"], pp: "Đào tạo trực tuyến + Kiểm tra nhanh" },
  sp: { ten: "Kiến thức sản phẩm", nd: ["Đặc tính, tính năng và lợi ích của nhóm sản phẩm phụ trách", "Phân biệt các dòng máy / model", "Câu hỏi thường gặp và cách trả lời", "Kiểm tra nhanh sau buổi học"], pp: "Đào tạo trực tuyến" }
};
function basis(a, g) { return a.short + " · " + g.areaName + ": TB " + (g.avg == null ? "?" : g.avg) + "% (yêu cầu ≥ " + g.min + "%), " + g.gapPeople + "/" + g.assessed + " người dưới ngưỡng."; }
function rulePlan(an, opt) {
  opt = opt || {}; const max = Math.min(opt.max || 8, 12), cand = [];
  an.audiences.forEach((a) => a.reqs.forEach((g) => { if (g.status === "cần đào tạo") cand.push({ a, g }); }));
  cand.sort((x, y) => y.g.priority - x.g.priority);
  const pick = cand.slice(0, max), dates = spread(an.month, pick.length);
  return pick.map((c, i) => {
    const t = TPL[c.g.area] || TPL.sp, a = c.a, g = c.g, link = bizLink(an.biz || {}, g.area), weak = g.topics.map((x) => "Củng cố chủ đề yếu: " + x.name + " (TB " + x.pct + "%)");
    return { doiTuong: a.short, nganh: a.nganh, tenChuongTrinh: t.ten + (a.key === "GT1" || a.key === "GT2" ? " · " + a.short : ""), noiDung: weak.concat(t.nd).slice(0, 6),
      mucTieu: "Nâng điểm " + g.areaName.toLowerCase() + " của " + a.short + " từ " + (g.avg == null ? "?" : g.avg) + "% lên tối thiểu " + g.min + "% ở kỳ kiểm tra kế tiếp.",
      phuongPhap: t.pp, thoiLuong: DEFAULT_DURATION, phuTrach: DEFAULT_OWNER, thoiGian: dates[i], tanSuat: DEFAULT_FREQ,
      mucTieuKd: link ? "Góp phần vào: " + link : "",
      chiSoDo: "Điểm mảng " + g.areaName.toLowerCase() + " của " + a.short + " ≥ " + g.min + "% ở kỳ kiểm tra kế tiếp" + (a.salesAvg != null ? "; % hoàn thành chỉ tiêu bán của " + a.short + " (hiện " + a.salesAvg + "%)" : ""),
      ghiChu: (g.strategyHits.length ? "Ưu tiên chiến lược. " : "") + (g.materials === 0 ? "Chưa có học liệu cho mảng này: cần bổ sung học liệu trước buổi học." : g.materials ? "Đã có " + g.materials + " học liệu liên quan để học viên ôn." : ""),
      coSo: basis(a, g) };
  });
}

// ---------- AI ----------
const RULES = [
  "Bạn là chuyên gia phát triển năng lực (L&D) cho đội ngũ kinh doanh kênh GT Karofi – Livotec. Viết tiếng Việt chuyên nghiệp, ngắn gọn.",
  "Nhiệm vụ: từ bản phân tích khoảng cách năng lực theo từng vị trí (so với yêu cầu tối thiểu của vị trí đó), lập KẾ HOẠCH ĐÀO TẠO cho đúng một tháng.",
  "CHỈ tạo chương trình cho cặp (vị trí, mảng năng lực) có trạng thái \"cần đào tạo\"; ưu tiên theo \"uu_tien\" giảm dần; tối đa 8 chương trình; gộp các mảng gần nhau của cùng vị trí nếu hợp lý.",
  "Nội dung phải bám vào mảng yếu và chủ đề yếu trong dữ liệu; đúng vị trí và đúng ngành hàng (không dạy sản phẩm chuyên sâu ngành khác). KHÔNG bịa thông số sản phẩm, giá, chính sách hay số liệu; chỉ nêu tên nội dung/kỹ năng cần học.",
  "Mỗi chương trình có mục tiêu đo được (gắn với con số hiện trạng và ngưỡng yêu cầu), phương pháp phù hợp, thời lượng thực tế (45–120 phút), và \"co_so\" ghi con số làm bằng chứng. Nếu mảng chưa có học liệu thì ghi chú cần bổ sung học liệu.",
  "BÁM SÁT MỤC TIÊU KINH DOANH: kế hoạch phải phục vụ \"muc_tieu_kinh_doanh\" và \"chien_luoc\" được cung cấp (và kết quả bán nếu có). Mỗi chương trình phải điền \"muc_tieu_kd\" (góp phần vào mục tiêu / ưu tiên chiến lược nào, nêu đúng theo dữ liệu, không thêm mục tiêu mới) và \"chi_so_do\" (chỉ số đo hiệu quả: điểm mảng năng lực và chỉ số kinh doanh như % hoàn thành chỉ tiêu của vị trí đó).",
  "Ưu tiên vị trí đang hụt chỉ tiêu bán và mảng nằm trong chiến lược (đã phản ánh ở \"uu_tien\"). Nếu một vị trí năng lực đã đạt mà bán vẫn thấp (\"nhan_xet\"), KHÔNG tạo thêm chương trình kiến thức; nêu nguyên nhân có thể nằm ngoài đào tạo ở ghi chú của chương trình liên quan hoặc bỏ qua. Không khẳng định đào tạo sẽ chắc chắn tăng doanh số: chỉ nói kỳ vọng góp phần.",
  "Không đề xuất quyết định bất lợi về nhân sự. Nhóm dưới 10 người có bài chỉ là tín hiệu: nói rõ trong ghi chú."
].join(" ") + " " + CTX.CONTEXT;
const FMT = " Chỉ trả về MỘT JSON: {\"chuong_trinh\":[{\"vi_tri\":string(khóa vị trí đúng như dữ liệu),\"ten\":string,\"noi_dung\":[string](3 đến 6 ý),\"muc_tieu\":string,\"phuong_phap\":string,\"thoi_luong\":string,\"ngay\":number(ngày trong tháng, ngày làm việc T2–T6),\"tan_suat\":string,\"ghi_chu\":string,\"co_so\":string,\"muc_tieu_kd\":string,\"chi_so_do\":string}]}.";
function parseJson(text) { const t = String(text || ""), a = t.indexOf("{"), b = t.lastIndexOf("}"); if (a < 0 || b < a) return null; try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; } }

async function aiPlan(an) {
  const payload = { thang: an.month, muc_tieu_kinh_doanh: an.biz.goals, chien_luoc: an.biz.strategy,
    ket_qua_ban_hang: an.sales ? { thang: an.sales.month, chi_tieu: an.sales.target, thuc_dat: an.sales.actual, ty_le_hoan_thanh: an.sales.pct, ty_le_thoi_gian_ban: an.sales.elapsed } : null, quy_mo: { nhan_su: an.meta.population, co_bai: an.meta.tested },
    vi_tri: an.audiences.filter((a) => a.tested > 0).map((a) => ({ khoa: a.key, ten: a.label, nganh: a.nganh, so_nguoi: a.people, co_bai: a.tested, chi_so_tb: a.index, ban_tb_3_thang: a.salesAvg, tin_cay: a.reliable ? "đủ" : "thấp (dưới 10 người có bài)",
      yeu_cau_cong_viec: a.needs, nhan_xet: a.note || undefined, nang_luc: a.reqs.map((g) => ({ mang: g.areaName, yeu_cau_toi_thieu: g.min, hien_trang_tb: g.avg, so_nguoi_do: g.assessed, so_nguoi_duoi_nguong: g.gapPeople, trang_thai: g.status, uu_tien: g.priority,
        chu_de_yeu: g.topics.map((t) => t.name + " " + t.pct + "%"), thuoc_chien_luoc: g.strategyHits, hoc_lieu_hien_co: g.materials, cau_hoi_kiem_tra: g.questions })) })) };
  const user = "Phân tích khoảng cách năng lực (JSON, ẩn danh):\n" + JSON.stringify(payload) + "\n\nLập kế hoạch đào tạo tháng " + an.month.slice(5) + "/" + an.month.slice(0, 4) + ".";
  const text = await llm.chat([{ role: "system", content: RULES + FMT }, { role: "user", content: user }], { temperature: 0.3, max_tokens: 3200, task: "train-plan", json: true, timeoutMs: 28000 });
  const o = parseJson(text); if (!o || !Array.isArray(o.chuong_trinh)) throw new Error("AI trả về kết quả không đọc được.");
  const keys = Object.fromEntries(an.audiences.map((a) => [a.key, a])), W = workdays(an.month);
  const rows = o.chuong_trinh.slice(0, 12).map((x, i) => {
    const a = keys[s(x && x.vi_tri, 10)]; if (!a) return null;
    const d = Math.round(Number(x.ngay)), iso = an.month + "-" + pad(d), fb = spread(an.month, 12)[i];
    return { doiTuong: a.short, nganh: a.nganh, tenChuongTrinh: s(x.ten, 160), noiDung: (Array.isArray(x.noi_dung) ? x.noi_dung : []).slice(0, 8), mucTieu: s(x.muc_tieu, 400), phuongPhap: s(x.phuong_phap, 120) || DEFAULT_METHOD,
      thoiLuong: s(x.thoi_luong, 40) || DEFAULT_DURATION, phuTrach: DEFAULT_OWNER, thoiGian: W.indexOf(iso) >= 0 ? iso : fb, tanSuat: s(x.tan_suat, 100) || DEFAULT_FREQ, ghiChu: s(x.ghi_chu, 500), coSo: s(x.co_so, 400),
      mucTieuKd: s(x.muc_tieu_kd, 300) || (bizLink(an.biz, "") ? "Góp phần vào: " + bizLink(an.biz, "") : ""), chiSoDo: s(x.chi_so_do, 300) || "Điểm mảng năng lực ≥ ngưỡng yêu cầu ở kỳ kiểm tra kế tiếp" };
  }).filter((r) => r && r.tenChuongTrinh && r.noiDung.length);
  if (!rows.length) throw new Error("AI chưa lập được chương trình nào.");
  return rows;
}

// Lập kế hoạch: mode "ai" thử AI trước, lỗi thì dùng luật (kèm cảnh báo); mode "rules" chỉ dùng luật. Không ghi vào kho: người quản trị xem, sửa rồi mới lưu.
async function generate(opt) {
  opt = opt || {}; const month = s(opt.month, 7); if (!MONTH.test(month)) return { ok: false, error: "Tháng không hợp lệ." };
  const biz = await getBiz(month);
  if (!biz.goals.length && !biz.strategy.length) return { ok: false, code: "need_biz", error: "Hãy nhập mục tiêu kinh doanh hoặc chiến lược của tháng trước khi lập kế hoạch đào tạo, để kế hoạch bám sát mục tiêu." };
  const an = analyse(await require("./hrcompetency").build({ refresh: opt.refresh === true }), month, { biz, sales: await salesContext(month) });
  const notes = an.audiences.filter((a) => a.note).map((a) => a.short + ": " + a.note);
  if (!an.audiences.some((a) => a.gaps > 0)) return { ok: true, source: "rules", rows: [], analysis: an, notes, warning: "Chưa phát hiện khoảng cách năng lực cần đào tạo (hoặc chưa đủ dữ liệu kiểm tra)." };
  let rows = null, source = "rules", warning = "";
  if (opt.mode !== "rules") { try { rows = await aiPlan(an); source = "ai"; } catch (e) { warning = "AI tạm thời không khả dụng nên kế hoạch được lập theo luật từ bản phân tích."; } }
  if (!rows) rows = rulePlan(an);
  try { rows = cleanRows(rows, month); } catch (e) { return { ok: false, error: e.message }; }
  return { ok: true, source, rows, analysis: an, notes, warning };
}

// ---------- lưu trữ theo tháng ----------
async function get(month) { month = s(month, 7); if (!MONTH.test(month)) return null; const d = await store.get(PREFIX + month + ".json").catch(() => null); return d && !d.deleted ? d : null; }
async function list() {
  const names = await store.list(PREFIX), docs = await Promise.all(names.filter((x) => /\d{4}-\d{2}\.json$/.test(x)).map((x) => store.get(x).catch(() => null)));
  return docs.filter((d) => d && !d.deleted && MONTH.test(d.month || "")).map((d) => ({ month: d.month, count: d.rows.length, status: d.status, source: d.source, updatedAt: d.updatedAt || 0, by: d.by || "" })).sort((a, b) => (a.month < b.month ? 1 : -1));
}
async function save(month, body, by) {
  month = s(month, 7); if (!MONTH.test(month)) throw new Error("Tháng không hợp lệ.");
  const doc = { v: 1, month, status: body && body.status === "final" ? "final" : "draft", source: ["ai", "rules", "manual"].indexOf(body && body.source) >= 0 ? body.source : "manual", rows: cleanRows(body && body.rows, month), updatedAt: Date.now(), by: String(by || "").toLowerCase() };
  const biz = await getBiz(month); doc.biz = { goals: biz.goals, strategy: biz.strategy };
  await store.put(PREFIX + month + ".json", doc); return doc;
}
async function remove(month, by) { month = s(month, 7); if (!MONTH.test(month)) throw new Error("Tháng không hợp lệ."); await store.put(PREFIX + month + ".json", { v: 1, month, deleted: true, updatedAt: Date.now(), by: String(by || "").toLowerCase() }); }

module.exports = { getBiz, saveBiz, salesContext, analyse, rulePlan, generate, get, list, save, remove, cleanRows, workdays, REQ, AREA_NAME };
