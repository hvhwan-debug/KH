// Kế hoạch đào tạo tháng: phân tích khoảng cách năng lực theo vị trí, AI / luật lập kế hoạch, lưu theo tháng.  node dev/test-trainplan.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory"; process.env.ADMIN_EMAILS = "admin@x.vn";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
const store = require("../api/_lib/store"), CTX = require("../api/_lib/hrcontext"), quiz = require("../api/_lib/quiz"), llm = require("../api/_lib/llm"), TP = require("../api/_lib/trainplan");
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
  await call("POST", {}, { op: "trainFrameworkSave", min: TP.SUGGESTED }); // quản trị viên khai báo khung năng lực (hệ thống không tự đặt)

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

  // 1b) BẮT BUỘC có mục tiêu kinh doanh / chiến lược; kết quả bán và chiến lược làm đổi ưu tiên
  const baseSk = gt1.reqs.find((g) => g.area === "sk").priority;
  r = await call("POST", {}, { op: "trainPlanGenerate", month, mode: "rules" });
  ok(r.s === 400 && r.j.code === "need_biz" && /mục tiêu kinh doanh/.test(r.j.error), "chưa nhập mục tiêu kinh doanh / chiến lược: không lập kế hoạch (luật)");
  r = await call("POST", {}, { op: "trainPlanGenerate", month, mode: "ai" }); ok(r.s === 400 && r.j.code === "need_biz", "chưa nhập mục tiêu kinh doanh / chiến lược: không lập kế hoạch (AI)");
  r = await call("POST", {}, { op: "trainPlanBizSave", month: "abc", goals: ["x"] }); ok(r.s === 400, "lưu mục tiêu với tháng sai bị từ chối");
  await store.put("kt/sales/2026-11.json", { v: 1, month: "2026-11", elapsed: 1, rows: [{ code: "NV1", target: 100e6, actual: 60e6 }, { code: "NV2", target: 100e6, actual: 80e6 }] });
  r = await call("POST", {}, { op: "trainPlanBizSave", month, goals: "• Đạt chỉ tiêu bán T12: 4,4 tỷ\n- Tăng độ phủ điểm bán\n\n", strategy: ["Tăng cường kỹ năng tư vấn và chốt đơn tại điểm bán"] });
  ok(r.s === 200 && r.j.biz.goals.length === 2 && r.j.biz.goals[0] === "Đạt chỉ tiêu bán T12: 4,4 tỷ" && r.j.biz.strategy.length === 1, "lưu mục tiêu & chiến lược: tách theo dòng, bỏ ký hiệu đầu dòng và dòng trống");
  r = await call("GET", { op: "trainPlanGet", month }); ok(r.j.biz.goals.length === 2 && r.j.sales && r.j.sales.pct === 70 && r.j.sales.month === "2026-11" && r.j.sales.sameMonth === false, "trainPlanGet trả mục tiêu đã lưu + kết quả bán gần nhất (T11: 70%)");
  r = await call("GET", { op: "trainPlanAnalysis", month });
  const bsk = r.j.analysis.audiences.find((a) => a.key === "GT1").reqs.find((g) => g.area === "sk");
  ok(bsk.priority > baseSk && bsk.strategyHits.length >= 1 && r.j.analysis.biz.strategy.length === 1 && r.j.analysis.sales.pct === 70, "mảng nằm trong chiến lược được tăng ưu tiên (" + baseSk + " → " + bsk.priority + ")");
  // đơn vị: vị trí hụt chỉ tiêu bán được ưu tiên cao hơn; năng lực đạt mà bán thấp thì không bắt đào tạo kiến thức
  const fakePerson = (label, i) => ({ code: "F" + i, audience: label, tests: 1, index: 70, areas: [{ id: "sk", pct: 40, n: 5, offScope: false, topics: [] }] });
  const fk = { meta: { population: 8, tested: 8 }, system: { coverage: [] }, people: [1, 2, 3, 4].map((i) => fakePerson(CTX.AUD.GT1, i)).concat([5, 6, 7, 8].map((i) => fakePerson(CTX.AUD.SR, i))),
    audiences: [{ name: CTX.AUD.GT1, salesAvg: 60, below60: 0 }, { name: CTX.AUD.SR, salesAvg: 100, below60: 0 }] };
  const FWK = { min: { GT1: { sk: 70 }, SR: { sk: 70 } } }, fa = TP.analyse(fk, month, { biz: { goals: [], strategy: [] }, framework: FWK }), pSk = (k) => fa.audiences.find((a) => a.key === k).reqs.find((g) => g.area === "sk").priority;
  ok(pSk("GT1") > pSk("SR") && fa.audiences.find((a) => a.key === "GT1").bizImpact === 1 && fa.audiences.find((a) => a.key === "SR").bizImpact === 0, "cùng khoảng cách năng lực: vị trí bán chỉ đạt 60% được ưu tiên cao hơn (ảnh hưởng kinh doanh 1 so với 0)");
  fk.people.forEach((p) => { p.areas[0].pct = 90; }); fk.audiences[0].salesAvg = 70;
  const fb = TP.analyse(fk, month, { framework: FWK }), g1 = fb.audiences.find((a) => a.key === "GT1");
  ok(g1.gaps === 0 && /ngoài đào tạo/.test(g1.note) && !fb.audiences.find((a) => a.key === "SR").note, "năng lực đạt nhưng bán 70%: không bắt đào tạo thêm, ghi chú nguyên nhân ngoài đào tạo");

  // 2) lập theo luật
  r = await call("POST", {}, { op: "trainPlanGenerate", month, mode: "rules" });
  ok(r.s === 200 && r.j.source === "rules" && r.j.rows.length >= 2, "lập kế hoạch theo luật: " + (r.j.rows ? r.j.rows.length : 0) + " chương trình");
  const rows = r.j.rows;
  ok(rows.every((x, i) => x.stt === i + 1 && x.tenChuongTrinh && x.noiDung.length && x.mucTieu && x.phuTrach && /^2026-12-\d\d$/.test(x.thoiGian)), "mỗi dòng đủ cột, đánh số STT, ngày trong tháng");
  ok(rows.every((x) => { const w = new Date(x.thoiGian + "T00:00:00Z").getUTCDay(); return w >= 1 && w <= 5; }), "ngày tổ chức rơi vào ngày làm việc (T2–T6)");
  ok(rows.some((x) => x.doiTuong === "SR 1" && /bán hàng|tư vấn/i.test(x.tenChuongTrinh)) && !rows.some((x) => x.doiTuong === "PC"), "chỉ lập cho vị trí có khoảng cách (SR 1 kỹ năng bán), không lập cho PC");
  ok(rows.every((x) => x.coSo && /yêu cầu ≥/.test(x.coSo)), "mỗi dòng ghi cơ sở số liệu");
  const skRow = rows.find((x) => x.doiTuong === "SR 1" && /bán hàng|tư vấn/i.test(x.tenChuongTrinh));
  ok(rows.every((x) => /^Góp phần vào: /.test(x.mucTieuKd) && /Điểm mảng/.test(x.chiSoDo)), "mỗi chương trình nêu góp phần vào mục tiêu nào và đo bằng chỉ số nào");
  ok(skRow && /kỹ năng tư vấn/.test(skRow.mucTieuKd) && /Ưu tiên chiến lược/.test(skRow.ghiChu), "chương trình kỹ năng gắn đúng chiến lược 'kỹ năng tư vấn và chốt đơn' và được ghi chú ưu tiên chiến lược");

  // 3) AI: gửi dữ liệu ẩn danh, kiểm lại kết quả ở máy chủ
  let sent = "";
  llm.chat = async (msgs) => { sent = msgs.map((m) => m.content).join("\n"); return JSON.stringify({ chuong_trinh: [
    { vi_tri: "GT1", ten: "Kỹ năng tư vấn & chốt đơn cho SR 1", noi_dung: ["• Khai thác nhu cầu", "- Xử lý từ chối", "Chốt đơn"], muc_tieu: "Nâng điểm kỹ năng lên 70%", phuong_phap: "Trực tuyến + giải case", thoi_luong: "90 phút", ngay: 16, tan_suat: "1 lần/tháng", ghi_chu: "Có học liệu", co_so: "SR 1 kỹ năng 20% < 70%", muc_tieu_kd: "Đạt chỉ tiêu bán T12", chi_so_do: "% hoàn thành chỉ tiêu SR 1" },
    { vi_tri: "GT2", ten: "Sản phẩm ngành 2", noi_dung: ["Nhóm điện gia dụng"], muc_tieu: "Nâng điểm lên 75%", ngay: 99, co_so: "SR 2 sản phẩm 40%" },
    { vi_tri: "KHONGCO", ten: "Chương trình ma", noi_dung: ["x"], muc_tieu: "x" }] }); };
  r = await call("POST", {}, { op: "trainPlanGenerate", month, mode: "ai" });
  ok(r.s === 200 && r.j.source === "ai" && r.j.rows.length === 2, "AI: giữ 2 chương trình hợp lệ, bỏ vị trí không có trong dữ liệu");
  ok(!/Người \d|NV\d|@x\.vn|0912345678/.test(sent) && /yeu_cau_toi_thieu/.test(sent), "AI chỉ nhận số liệu tổng hợp, không có tên / mã / email / điện thoại");
  ok(/muc_tieu_kinh_doanh/.test(sent) && /Đạt chỉ tiêu bán T12/.test(sent) && /chien_luoc/.test(sent) && /ket_qua_ban_hang/.test(sent) && /BÁM SÁT MỤC TIÊU KINH DOANH/.test(sent), "AI nhận mục tiêu kinh doanh, chiến lược, kết quả bán và luật bám sát mục tiêu");
  ok(r.j.rows[0].mucTieuKd === "Đạt chỉ tiêu bán T12" && r.j.rows[0].chiSoDo === "% hoàn thành chỉ tiêu SR 1" && /^Góp phần vào: /.test(r.j.rows[1].mucTieuKd) && r.j.rows[1].chiSoDo, "AI: giữ liên kết mục tiêu của AI; dòng AI bỏ trống được điền mặc định từ mục tiêu đã nhập");
  ok(r.j.rows[0].thoiGian === "2026-12-16" && r.j.rows[0].noiDung[0] === "Khai thác nhu cầu" && r.j.rows[0].noiDung[1] === "Xử lý từ chối", "ngày hợp lệ được giữ, ký hiệu gạch đầu dòng được bỏ");
  ok(/^2026-12-\d\d$/.test(r.j.rows[1].thoiGian) && new Date(r.j.rows[1].thoiGian + "T00:00:00Z").getUTCDay() % 6 !== 0 && r.j.rows[1].phuTrach === "ĐTKDGT", "ngày AI trả sai (99) được sửa về ngày làm việc trong tháng; có mặc định người phụ trách");
  llm.chat = async () => { throw new Error("down"); };
  r = await call("POST", {}, { op: "trainPlanGenerate", month, mode: "ai" });
  ok(r.s === 200 && r.j.source === "rules" && r.j.warning && r.j.rows.length >= 2, "AI lỗi: tự chuyển sang lập theo luật, kèm cảnh báo");
  llm.chat = async () => "không phải JSON";
  r = await call("POST", {}, { op: "trainPlanGenerate", month, mode: "ai" });
  ok(r.s === 200 && r.j.source === "rules", "AI trả rác: dùng luật");

  // 3b) GÓP Ý PHÊ DUYỆT: khung giờ học, sản phẩm trọng tâm theo vị trí, hạn gửi nội dung
  ok(TP.durMin("90 phút") === 90 && TP.durMin("1,5 giờ") === 90 && TP.durMin("2h") === 120 && TP.durMin("") === 90, "đọc thời lượng: 90 phút / 1,5 giờ / 2h / trống");
  ok(TP.timeOk("08:00", 90) === true && TP.timeOk("08:30", 90) === false && TP.timeOk("17:00", 120) === true && TP.timeOk("12:00", 60) === false && TP.timeOk("07:30", 60) === false && TP.timeOk("", 90) === null, "khung giờ hợp lệ: đầu ngày 08:00–09:30 hoặc từ 17:00; còn lại sai");
  ok(TP.slotFor(90) === "08:00" && TP.slotFor(120) === "17:15", "buổi ≤ 90 phút xếp đầu ngày, dài hơn xếp cuối ngày");
  const pf = TP.parseFocus("PC: M25, BNN\n• SR 1: M25, kiềm\nSR GT1: m25; Kiềm\nSR 2: BNN, Bếp đôi\nxyz: abc\nkhông có dấu hai chấm");
  ok(pf.length === 3 && pf.find((f) => f.key === "PC").products.join() === "M25,BNN" && pf.find((f) => f.key === "GT1").products.join() === "M25,kiềm" && pf.find((f) => f.key === "GT2").products.join() === "BNN,Bếp đôi", "đọc sản phẩm trọng tâm theo vị trí: gộp trùng, bỏ vị trí lạ và dòng sai cú pháp");
  r = await call("POST", {}, { op: "trainPlanBizSave", month, goals: ["Đạt chỉ tiêu bán T12: 4,4 tỷ", "Tăng độ phủ điểm bán"], strategy: ["Tăng cường kỹ năng tư vấn và chốt đơn tại điểm bán"], focus: "PC: M25, BNN\nSR 1: M25, kiềm\nSR 2: BNN, Bếp đôi" });
  ok(r.s === 200 && r.j.biz.focus.length === 3 && r.j.biz.focus.find((f) => f.key === "GT2").short === "SR 2", "lưu sản phẩm trọng tâm theo vị trí");
  r = await call("GET", { op: "trainPlanAnalysis", month });
  const fg1 = r.j.analysis.audiences.find((a) => a.key === "GT1"), n1 = fg1.reqs.find((g) => g.area === "n1");
  ok(fg1.focus.join() === "M25,kiềm" && n1.strategyHits.indexOf("Sản phẩm trọng tâm: M25, kiềm") >= 0, "phân tích: mảng sản phẩm của SR 1 được đánh dấu trọng tâm (M25, kiềm)");
  r = await call("POST", {}, { op: "trainPlanGenerate", month, mode: "rules" });
  const fr = (k, p) => r.j.rows.find((x) => x.doiTuong === k && new RegExp(p).test(x.tenChuongTrinh));
  ok(r.s === 200 && fr("PC", "M25, BNN") && fr("SR 1", "M25, kiềm") && fr("SR 2", "BNN, Bếp đôi"), "lập theo luật: PC, SR 1, SR 2 đều có chương trình sản phẩm trọng tâm (kể cả PC không có khoảng cách năng lực)");
  ok(r.j.rows.every((x) => /^\d\d:\d\d$/.test(x.gio) && TP.timeOk(x.gio, TP.durMin(x.thoiLuong)) === true), "mọi buổi đều nằm trong khung giờ đầu ngày hoặc cuối ngày");
  ok(/Góp phần vào/.test(fr("PC", "M25").mucTieuKd) && /BNN/.test(fr("SR 2", "BNN").chiSoDo) && /thực tế/.test(fr("PC", "M25").noiDung.join(" ")) && /phê duyệt/.test(fr("PC", "M25").ghiChu), "chương trình trọng tâm: gắn mục tiêu kinh doanh, chỉ số đo, nội dung thực tế, nhắc gửi người phê duyệt");
  llm.chat = async () => JSON.stringify({ chuong_trinh: [
    { vi_tri: "GT1", ten: "Tư vấn M25 và máy lọc kiềm cho SR 1", noi_dung: ["Lợi ích M25", "Tình huống thực tế"], muc_tieu: "x", thoi_luong: "90 phút", gio: "12:00", ngay: 8 },
    { vi_tri: "GT2", ten: "Kỹ năng bán điện gia dụng", noi_dung: ["Tư vấn"], muc_tieu: "y", thoi_luong: "2 giờ", gio: "09:00", ngay: 9 }] });
  r = await call("POST", {}, { op: "trainPlanGenerate", month, mode: "ai" });
  const ai1 = r.j.rows.find((x) => /M25 và máy lọc kiềm/.test(x.tenChuongTrinh)), ai2 = r.j.rows.find((x) => /Kỹ năng bán điện gia dụng/.test(x.tenChuongTrinh));
  ok(r.j.source === "ai" && ai1.gio === "08:00" && ai2.gio === "17:15", "AI xếp giờ sai (12:00; 2 giờ lúc 09:00): máy chủ sửa về 08:00 và 17:15");
  ok(r.j.rows.length === 4 && r.j.rows.some((x) => x.doiTuong === "PC" && /M25, BNN/.test(x.tenChuongTrinh)) && r.j.rows.some((x) => x.doiTuong === "SR 2" && /BNN, Bếp đôi/.test(x.tenChuongTrinh)) && !r.j.rows.some((x) => x.doiTuong === "SR 1" && /Sản phẩm trọng tâm tháng/.test(x.tenChuongTrinh)), "AI bỏ sót sản phẩm trọng tâm của PC và SR 2: tự bổ sung; SR 1 đã có (nhắc M25, kiềm) nên không thêm trùng");
  ok(r.j.rows.every((x) => /^2026-12-\d\d$/.test(x.thoiGian) && x.gio), "mọi dòng (kể cả dòng bổ sung) đều có ngày và giờ");
  ok(/san_pham_trong_tam/.test(sent) && /LỊCH:/.test(sent) && /08:00/.test(sent) && /SẢN PHẨM TRỌNG TÂM \/ SẢN PHẨM MỚI THEO VỊ TRÍ/.test(sent), "AI nhận sản phẩm trọng tâm theo vị trí và luật lịch / khung giờ");
  llm.chat = async () => { throw new Error("down"); };

  // 4) lưu / đọc / liệt kê / xoá
  const save = await call("POST", {}, { op: "trainPlanSave", month, status: "final", source: "ai", rows: [{ tenChuongTrinh: "  Bài A  ", mucTieuKd: "Mục tiêu KD A", chiSoDo: "KPI A", noiDung: "Ý 1\nÝ 2", thoiGian: "2026-12-05", doiTuong: "SR 1" }, { tenChuongTrinh: "", noiDung: ["bỏ"] }, { tenChuongTrinh: "Bài B", thoiGian: "30/11/2026" }, { tenChuongTrinh: "Bài C", thoiGian: "2026-11-30" }] });
  ok(save.s === 200 && save.j.plan.rows.length === 3 && save.j.plan.rows[0].stt === 1 && save.j.plan.rows[2].stt === 3 && save.j.plan.rows[0].noiDung.length === 2, "lưu: bỏ dòng không tên, đánh lại STT, tách nội dung theo dòng");
  ok(save.j.plan.rows[0].tenChuongTrinh === "Bài A" && save.j.plan.rows[1].thoiGian === "" && save.j.plan.rows[2].thoiGian === "2026-11-30", "lưu: cắt khoảng trắng; ngày sai định dạng bị bỏ, ngày hợp lệ do người dùng nhập được giữ nguyên");
  ok(save.j.plan.rows[0].mucTieuKd === "Mục tiêu KD A" && save.j.plan.rows[0].chiSoDo === "KPI A" && save.j.plan.biz.goals.length === 2 && save.j.plan.biz.strategy.length === 1, "lưu: giữ cột mục tiêu kinh doanh / chỉ số đo, chụp lại mục tiêu & chiến lược đã dùng");
  r = await call("GET", { op: "trainPlanGet", month }); ok(r.j.plan && r.j.plan.status === "final" && r.j.months.length === 1 && r.j.months[0].month === month && r.j.months[0].count === 3, "đọc lại + danh sách tháng");
  // phê duyệt + hạn gửi nội dung
  const ap = (o) => call("POST", {}, Object.assign({ op: "trainPlanSave", month, rows: [{ tenChuongTrinh: "Bài A" }] }, o));
  r = await ap({ approval: { status: "approved", approver: "Phạm Đức", note: "Gửi nội dung trước để đánh giá chuẩn bị", }, sendBefore: 3 });
  const dAt = r.j.plan.approval.decidedAt;
  ok(r.s === 200 && r.j.plan.approval.status === "approved" && r.j.plan.approval.approver === "Phạm Đức" && typeof dAt === "number" && r.j.plan.sendBefore === 3 && r.j.plan.approval.recordedBy === "admin@x.vn", "lưu phê duyệt: người duyệt, ý kiến, ngày duyệt, người ghi nhận, hạn gửi 3 ngày");
  r = await ap({ approval: { status: "approved", approver: "Phạm Đức" }, sendBefore: 3 }); ok(r.j.plan.approval.decidedAt === dAt, "lưu lại cùng trạng thái đã duyệt: giữ nguyên ngày duyệt");
  r = await ap({ approval: { status: "pending" }, sendBefore: 99 }); ok(r.j.plan.approval.status === "pending" && r.j.plan.approval.decidedAt === null && r.j.plan.sendBefore === 15, "chuyển sang chờ duyệt: bỏ ngày duyệt; hạn gửi tối đa 15 ngày");
  r = await ap({ approval: { status: "hack" } }); ok(r.j.plan.approval.status === "draft" && r.j.plan.sendBefore === 3, "trạng thái lạ → nháp; không nhập hạn gửi → mặc định 3 ngày");
  r = await call("POST", {}, { op: "trainPlanSave", month: "abc", rows: [{ tenChuongTrinh: "x" }] }); ok(r.s === 400, "lưu tháng không hợp lệ bị từ chối");
  r = await call("POST", {}, { op: "trainPlanSave", month, rows: [] }); ok(r.s === 400, "lưu không có dòng nào bị từ chối");
  r = await call("POST", {}, { op: "trainPlanDelete", month }); ok(r.s === 200, "xoá kế hoạch tháng");
  r = await call("GET", { op: "trainPlanGet", month }); ok(r.j.plan === null && r.j.months.length === 0, "sau khi xoá: không còn kế hoạch / không còn trong danh sách");
  console.log("\n" + pass + " pass, " + fail + " fail"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
