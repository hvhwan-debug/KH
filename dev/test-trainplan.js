// Kế hoạch đào tạo tháng: phân tích khoảng cách năng lực theo vị trí, AI / luật lập kế hoạch, lưu theo tháng.  node dev/test-trainplan.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory"; process.env.ADMIN_EMAILS = "admin@x.vn";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
const quiz = require("../api/_lib/quiz"), llm = require("../api/_lib/llm"), TP = require("../api/_lib/trainplan");
const session = require("../api/_lib/session"), admin = require("../api/kt-admin");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function call(method, query, body) {
  const ctx = { log: Object.assign(() => {}, { error: console.error, warn: () => {} }), res: null };
  await admin(ctx, { method, headers: { "x-requested-with": "livotec", "x-sr-token": session.sessionValue("admin@x.vn") }, query: query || {}, body }); return { s: ctx.res.status, j: ctx.res.body };
}
const q = (cat, good, n) => Array.from({ length: n }, (_, i) => ({ category: cat, ok: i < good ? 1 : 0 }));
(async () => {
  const now = Date.now(), cands = [];
  await quiz.saveSettings({ examTitle: "Kiểm tra định kì", passEnabled: true, passScore: 60 });
  for (let i = 1; i <= 36; i++) {
    const gt1 = i <= 12, gt2 = i > 12 && i <= 24, seg = gt1 ? "may_loc" : gt2 ? "gia_dung" : "may_loc", title = i <= 24 ? "SR" : "PC";
    cands.push({ code: "NV" + i, name: "Người " + i, email: "n" + i + "@x.vn", phone: "0912345678", manager: "QL Một", segment: seg, title, province: "Hà Nội", region: "bac", profile: { namSinh: 1990 } });
    // GT1: kỹ năng bán yếu (1/5), sản phẩm ngành 1 tốt (5/5), chính sách tốt; GT2: sản phẩm ngành 2 yếu (2/5); PC: mọi mảng tốt
    const paper = [].concat(
      q("Kỹ năng bán hàng", gt1 ? 1 : 5, 5), q(gt1 ? "Máy lọc nước Karofi" : gt2 ? "Điều hòa, bếp từ gia dụng" : "Sản phẩm máy lọc nước", gt2 ? 2 : 5, 5), q("Chính sách bán hàng", 5, 5));
    await quiz.putAttempt({ id: "a" + i, code: "NV" + i, status: "submitted", period: "k2", paper });
    await quiz.upsertIndex({ id: "a" + i, code: "NV" + i, status: "submitted", pct: gt1 ? 70 : gt2 ? 68 : 95, score: 7, total: 10, submittedAt: now, period: "k2", flags: { blur: 0 } });
  }
  await quiz.saveCandidates(cands);

  // 1) phân tích khoảng cách
  const month = "2026-12";
  let r = await call("GET", { op: "trainPlanAnalysis", month });
  ok(r.s === 200 && r.j.ok && r.j.analysis.audiences.length >= 2, "API trainPlanAnalysis trả kết quả (" + r.s + " " + (r.j.error || "") + ")");
  const A = r.j.analysis, gt1 = A.audiences.find((a) => a.key === "GT1"), gt2 = A.audiences.find((a) => a.key === "GT2"), pc = A.audiences.find((a) => a.key === "PC");
  ok(gt1 && gt1.reqs.find((g) => g.area === "sk").status === "cần đào tạo" && gt1.reqs.find((g) => g.area === "n1").status === "đạt", "SR 1: kỹ năng bán cần đào tạo, sản phẩm ngành 1 đạt");
  ok(gt2 && gt2.reqs.find((g) => g.area === "n2").status === "cần đào tạo" && !gt2.reqs.some((g) => g.area === "n1"), "SR 2: sản phẩm ngành 2 cần đào tạo, không xét sản phẩm ngành 1");
  ok(pc && pc.gaps === 0, "PC đạt mọi yêu cầu: không có khoảng cách");
  ok(JSON.stringify(A).indexOf("Người 1") < 0 && JSON.stringify(A).indexOf("n1@x.vn") < 0, "bản phân tích không chứa tên / email");
  r = await call("GET", { op: "trainPlanAnalysis", month: "2026-13" }); ok(r.s === 400, "tháng không hợp lệ bị từ chối");

  // 2) lập theo luật
  r = await call("POST", {}, { op: "trainPlanGenerate", month, mode: "rules" });
  ok(r.s === 200 && r.j.source === "rules" && r.j.rows.length >= 2, "lập kế hoạch theo luật: " + (r.j.rows ? r.j.rows.length : 0) + " chương trình");
  const rows = r.j.rows;
  ok(rows.every((x, i) => x.stt === i + 1 && x.tenChuongTrinh && x.noiDung.length && x.mucTieu && x.phuTrach && /^2026-12-\d\d$/.test(x.thoiGian)), "mỗi dòng đủ cột, đánh số STT, ngày trong tháng");
  ok(rows.every((x) => { const w = new Date(x.thoiGian + "T00:00:00Z").getUTCDay(); return w >= 1 && w <= 5; }), "ngày tổ chức rơi vào ngày làm việc (T2–T6)");
  ok(rows.some((x) => x.doiTuong === "SR 1" && /bán hàng|tư vấn/i.test(x.tenChuongTrinh)) && !rows.some((x) => x.doiTuong === "PC"), "chỉ lập cho vị trí có khoảng cách (SR 1 kỹ năng bán), không lập cho PC");
  ok(rows.every((x) => x.coSo && /yêu cầu ≥/.test(x.coSo)), "mỗi dòng ghi cơ sở số liệu");

  // 3) AI: gửi dữ liệu ẩn danh, kiểm lại kết quả ở máy chủ
  let sent = "";
  llm.chat = async (msgs) => { sent = msgs.map((m) => m.content).join("\n"); return JSON.stringify({ chuong_trinh: [
    { vi_tri: "GT1", ten: "Kỹ năng tư vấn & chốt đơn cho SR 1", noi_dung: ["• Khai thác nhu cầu", "- Xử lý từ chối", "Chốt đơn"], muc_tieu: "Nâng điểm kỹ năng lên 70%", phuong_phap: "Trực tuyến + giải case", thoi_luong: "90 phút", ngay: 16, tan_suat: "1 lần/tháng", ghi_chu: "Có học liệu", co_so: "SR 1 kỹ năng 20% < 70%" },
    { vi_tri: "GT2", ten: "Sản phẩm ngành 2", noi_dung: ["Nhóm điện gia dụng"], muc_tieu: "Nâng điểm lên 75%", ngay: 99, co_so: "SR 2 sản phẩm 40%" },
    { vi_tri: "KHONGCO", ten: "Chương trình ma", noi_dung: ["x"], muc_tieu: "x" }] }); };
  r = await call("POST", {}, { op: "trainPlanGenerate", month, mode: "ai" });
  ok(r.s === 200 && r.j.source === "ai" && r.j.rows.length === 2, "AI: giữ 2 chương trình hợp lệ, bỏ vị trí không có trong dữ liệu");
  ok(!/Người \d|NV\d|@x\.vn|0912345678/.test(sent) && /yeu_cau_toi_thieu/.test(sent), "AI chỉ nhận số liệu tổng hợp, không có tên / mã / email / điện thoại");
  ok(r.j.rows[0].thoiGian === "2026-12-16" && r.j.rows[0].noiDung[0] === "Khai thác nhu cầu" && r.j.rows[0].noiDung[1] === "Xử lý từ chối", "ngày hợp lệ được giữ, ký hiệu gạch đầu dòng được bỏ");
  ok(/^2026-12-\d\d$/.test(r.j.rows[1].thoiGian) && new Date(r.j.rows[1].thoiGian + "T00:00:00Z").getUTCDay() % 6 !== 0 && r.j.rows[1].phuTrach === "ĐTKDGT", "ngày AI trả sai (99) được sửa về ngày làm việc trong tháng; có mặc định người phụ trách");
  llm.chat = async () => { throw new Error("down"); };
  r = await call("POST", {}, { op: "trainPlanGenerate", month, mode: "ai" });
  ok(r.s === 200 && r.j.source === "rules" && r.j.warning && r.j.rows.length >= 2, "AI lỗi: tự chuyển sang lập theo luật, kèm cảnh báo");
  llm.chat = async () => "không phải JSON";
  r = await call("POST", {}, { op: "trainPlanGenerate", month, mode: "ai" });
  ok(r.s === 200 && r.j.source === "rules", "AI trả rác: dùng luật");

  // 4) lưu / đọc / liệt kê / xoá
  const save = await call("POST", {}, { op: "trainPlanSave", month, status: "final", source: "ai", rows: [{ tenChuongTrinh: "  Bài A  ", noiDung: "Ý 1\nÝ 2", thoiGian: "2026-12-05", doiTuong: "SR 1" }, { tenChuongTrinh: "", noiDung: ["bỏ"] }, { tenChuongTrinh: "Bài B", thoiGian: "30/11/2026" }, { tenChuongTrinh: "Bài C", thoiGian: "2026-11-30" }] });
  ok(save.s === 200 && save.j.plan.rows.length === 3 && save.j.plan.rows[0].stt === 1 && save.j.plan.rows[2].stt === 3 && save.j.plan.rows[0].noiDung.length === 2, "lưu: bỏ dòng không tên, đánh lại STT, tách nội dung theo dòng");
  ok(save.j.plan.rows[0].tenChuongTrinh === "Bài A" && save.j.plan.rows[1].thoiGian === "" && save.j.plan.rows[2].thoiGian === "2026-11-30", "lưu: cắt khoảng trắng; ngày sai định dạng bị bỏ, ngày hợp lệ do người dùng nhập được giữ nguyên");
  r = await call("GET", { op: "trainPlanGet", month }); ok(r.j.plan && r.j.plan.status === "final" && r.j.months.length === 1 && r.j.months[0].month === month && r.j.months[0].count === 3, "đọc lại + danh sách tháng");
  r = await call("POST", {}, { op: "trainPlanSave", month: "abc", rows: [{ tenChuongTrinh: "x" }] }); ok(r.s === 400, "lưu tháng không hợp lệ bị từ chối");
  r = await call("POST", {}, { op: "trainPlanSave", month, rows: [] }); ok(r.s === 400, "lưu không có dòng nào bị từ chối");
  r = await call("POST", {}, { op: "trainPlanDelete", month }); ok(r.s === 200, "xoá kế hoạch tháng");
  r = await call("GET", { op: "trainPlanGet", month }); ok(r.j.plan === null && r.j.months.length === 0, "sau khi xoá: không còn kế hoạch / không còn trong danh sách");
  console.log("\n" + pass + " pass, " + fail + " fail"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
