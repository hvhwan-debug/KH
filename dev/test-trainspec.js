// Đặc tả "AI lập kế hoạch đào tạo hàng tháng": khung năng lực do quản trị viên khai báo, 4 mức khoảng cách, ưu tiên 5 yếu tố, lịch theo tuần,
// nguồn lực, giải thích A–E, phiên bản, đánh giá hiệu quả.  node dev/test-trainspec.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory"; process.env.ADMIN_EMAILS = "admin@x.vn";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn"; process.env.APP_URL = "https://kh.test";
const quiz = require("../api/_lib/quiz"), llm = require("../api/_lib/llm"), TP = require("../api/_lib/trainplan"), P = require("../api/_lib/programs");
const session = require("../api/_lib/session"), admin = require("../api/kt-admin");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function call(method, query, body) {
  const ctx = { log: Object.assign(() => {}, { error: console.error, warn: () => {} }), res: null };
  await admin(ctx, { method, headers: { "x-requested-with": "livotec", "x-sr-token": session.sessionValue("admin@x.vn") }, query: query || {}, body }); return { s: ctx.res.status, j: ctx.res.body };
}
const q = (cat, good, n, text) => Array.from({ length: n }, (_, i) => ({ category: cat, ok: i < good ? 1 : 0, text: text ? text + " " + i : undefined }));
(async () => {
  const now = Date.now(), month = "2026-12", cands = []; await quiz.saveSettings({ examTitle: "K", passEnabled: true, passScore: 60 });
  const add = async (code, title, seg, sk, extra, when, hardText) => {
    cands.push({ code, name: "Người " + code, email: code.toLowerCase() + "@x.vn", phone: "0912345678", manager: "QL", segment: seg, title, province: "Hà Nội", region: "bac", profile: { namSinh: 1990 } });
    const paper = [].concat(q("Kỹ năng bán hàng", sk, hardText ? 4 : 5), q("Chính sách bán hàng", 5, 5), extra, hardText ? [{ category: "Kỹ năng bán hàng", ok: 0, text: hardText }] : []); // tổng 5 câu kỹ năng mỗi người
    await quiz.putAttempt({ id: "a" + code, code, status: "submitted", period: "k", paper });
    await quiz.upsertIndex({ id: "a" + code, code, status: "submitted", pct: 70, score: 7, total: 10, submittedAt: when || now, period: "k", flags: { blur: 0 } });
  };
  const HARD = "Khi khách chê giá đắt, nên làm gì đầu tiên";
  for (let i = 1; i <= 6; i++) await add("G" + i, "SR 1", "may_loc", 1, q("Máy lọc nước Karofi", 5, 5), null, HARD);                 // SR 1: kỹ năng 20%
  for (let i = 1; i <= 6; i++) await add("B" + i, "SR 2", "gia_dung", 3, q("Điều hòa, bếp từ gia dụng", 5, 5), now - 200 * 864e5);       // SR 2: kỹ năng 60%, bài làm cách đây 200 ngày
  for (let i = 1; i <= 6; i++) await add("C" + i, "PC", "may_loc", 4, q("Kiến thức sản phẩm", 5, 5));                                       // PC: kỹ năng 80%
  for (let i = 1; i <= 6; i++) await add("M" + i, "ASM", "both", i <= 3 ? 3 : 4, q("Thị trường đối thủ", 5, 5));                          // ASM: TB 70%, một nửa dưới ngưỡng
  await quiz.saveCandidates(cands);
  const aud = (r, k) => r.j.analysis.audiences.find((a) => a.key === k), req = (r, k, a) => aud(r, k).reqs.find((g) => g.area === a);

  // 1) CHƯA có khung năng lực: không tự đặt điểm yêu cầu
  let r = await call("GET", { op: "trainPlanAnalysis", month });
  ok(r.s === 200 && r.j.analysis.audiences.every((a) => a.framework === false && a.gaps === 0) && r.j.analysis.noFramework.length === 4, "chưa có khung năng lực: mọi vị trí 'chưa có yêu cầu', KHÔNG kết luận khoảng cách");
  ok(req(r, "GT1", "sk").status === "chưa có yêu cầu" && req(r, "GT1", "sk").min === null && req(r, "GT1", "sk").avg === 20, "vẫn hiện năng lực thực tế (SR 1 kỹ năng TB 20%) nhưng không có điểm yêu cầu");
  await call("POST", {}, { op: "trainPlanBizSave", month, goals: ["Đạt chỉ tiêu bán T12"] });
  r = await call("POST", {}, { op: "trainPlanGenerate", month, mode: "rules" });
  ok(r.s === 400 && r.j.code === "need_framework" && /không tự đặt điểm yêu cầu/.test(r.j.error), "lập kế hoạch khi chưa có khung: báo cần khai báo khung năng lực, không tự đặt");
  await call("POST", {}, { op: "trainPlanBizSave", month, goals: ["Đạt chỉ tiêu bán T12"], focus: "SR 1: M25" });
  r = await call("POST", {}, { op: "trainPlanGenerate", month, mode: "rules" });
  ok(r.s === 200 && r.j.rows.length === 1 && /Sản phẩm trọng tâm tháng: M25/.test(r.j.rows[0].tenChuongTrinh) && /chưa có khung năng lực/.test(r.j.warning), "chỉ đạo sản phẩm trọng tâm vẫn lập được chương trình riêng; cảnh báo vị trí chưa có khung");
  r = await call("POST", {}, { op: "trainFrameworkSave", min: { GT1: { sk: 70.4, n1: 75, zzz: 5 }, XYZ: { sk: 70 }, GT2: { sk: 70, n2: 0 }, PC: { sk: 75, sp: 101 }, ASM: { sk: 70, po: 65, mk: 70 } } });
  ok(r.s === 200 && r.j.framework.min.GT1.sk === 70 && r.j.framework.min.GT1.n1 === 75 && !r.j.framework.min.GT1.zzz && !r.j.framework.min.XYZ && !("n2" in r.j.framework.min.GT2) && !("sp" in r.j.framework.min.PC), "lưu khung năng lực: làm tròn, bỏ vị trí / mảng lạ và điểm ngoài 1–100");
  await call("POST", {}, { op: "trainPlanBizSave", month, goals: ["Đạt chỉ tiêu bán T12"] });

  // 2) 4 mức khoảng cách + nhãn ưu tiên (5 yếu tố)
  r = await call("GET", { op: "trainPlanAnalysis", month });
  const g1 = req(r, "GT1", "sk"), g2 = req(r, "GT2", "sk"), pc = req(r, "PC", "sk"), asm = req(r, "ASM", "sk");
  ok(g1.level === "Ưu tiên đào tạo" && g1.gap === 50 && g2.level === "Cần cải thiện" && g2.gap === 10 && pc.level === "Đáp ứng tốt" && pc.gap <= 0, "4 mức: SR 1 cách 50 điểm = Ưu tiên đào tạo; SR 2 cách 10 = Cần cải thiện; PC đạt = Đáp ứng tốt");
  ok(asm.avg === 70 && asm.gap === 0 && asm.share === 0.5 && asm.level === "Cần cải thiện" && asm.status === "cần đào tạo", "trung bình đạt nhưng 50% người dưới ngưỡng: nâng lên 'Cần cải thiện'");
  ok(g1.priorityLabel === "Ưu tiên rất cao" && g2.priorityLabel === "Ưu tiên trung bình" && asm.priorityLabel === "Theo dõi và bổ sung sau", "nhãn ưu tiên: rất cao / trung bình / theo dõi và bổ sung sau");
  ok(g1.factors.gap === 1 && g1.factors.biz === null && g1.factors.feas === null && g1.factors.urg === 0, "5 yếu tố: yếu tố chưa có dữ liệu (ảnh hưởng kinh doanh, khả năng tổ chức) là null — không giả định");
  ok(aud(r, "GT1").hard.length === 1 && aud(r, "GT1").hard[0].text === HARD, "câu hỏi sai nhiều của SR 1 được thống kê đúng nội dung câu hỏi");
  ok(aud(r, "GT1").hard[0].wrongPct === 100 && aud(r, "GT1").hard[0].n === 6 && aud(r, "GT1").hard[0].area === "sk", "…kèm tỷ lệ sai, số lượt và mảng năng lực");

  // 3) lập kế hoạch theo luật: cột mới, hình thức, giải thích, lịch theo tuần
  r = await call("POST", {}, { op: "trainPlanGenerate", month, mode: "rules" });
  const rows = r.j.rows, rg1 = rows.find((x) => x.doiTuong === "SR 1"), rg2 = rows.find((x) => x.doiTuong === "SR 2");
  ok(r.s === 200 && rows.length === 2 && rg1 && rg2 && !rows.some((x) => x.doiTuong === "ASM"), "chỉ lập SR 1 và SR 2; ASM (ưu tiên thấp) không xếp lịch");
  ok(r.j.watch.some((w) => /ASM/.test(w.audience) && /Mức ưu tiên thấp/.test(w.reason)), "ASM nằm trong danh sách 'theo dõi và bổ sung sau' kèm lý do");
  ok(rg1.uuTien === "Ưu tiên rất cao" && rg1.soHocVien === 6 && rg1.trangThai === "Dự kiến" && rg1.phuTrach === "ĐTKDGT" && rg2.uuTien === "Ưu tiên trung bình", "cột mới: mức ưu tiên, số học viên (6 người dưới ngưỡng), trạng thái 'Dự kiến', phụ trách mặc định");
  ok(rg1.hinhThuc === "Đào tạo trực tuyến + Coaching tại điểm bán" && rg2.hinhThuc === "Đào tạo trực tuyến", "hình thức theo mức thiếu hụt: kỹ năng thiếu hụt nặng → có coaching tại điểm bán");
  ok(rg1.noiDung.some((x) => /^Ôn các câu hay sai: Khi khách chê giá đắt/.test(x)), "nội dung có mục ôn các câu hỏi sai nhiều");
  ok(rg1.tuan === 1 && rg2.tuan === 2 && rg1.thoiGian < rg2.thoiGian, "lịch theo tuần: chương trình ưu tiên cao nhất ở Tuần 1, không dồn cuối tháng (2 chương trình → Tuần 1 và Tuần 2)");
  const ex = r.j.explanation;
  ok(ex && ex.overview.lines.length >= 4 && /Thiếu hụt: SR 1/.test(ex.overview.lines.join(" ")) && /Câu hỏi sai nhiều/.test(ex.overview.lines.join(" ")), "giải thích A: tổng quan nêu thiếu hụt và câu hỏi sai nhiều");
  ok(ex.gaps.length === 3 && ex.gaps[0].audience === "SR 1" && ex.gaps[0].level === "Ưu tiên đào tạo" && /yêu cầu ≥ 70%/.test(ex.gaps[0].evidence), "giải thích B: danh sách khoảng cách có mức, ưu tiên và bằng chứng");
  ok(ex.direction.why.some((x) => /^Mục tiêu kinh doanh: Đạt chỉ tiêu bán T12/.test(x)) && ex.direction.mandatory.length === 1 && ex.direction.supplementary.length === 1 && ex.direction.watch.length >= 1, "giải thích C: vì sao chọn, bắt buộc (1) / bổ sung (1) / theo dõi");
  ok(ex.rollout.length === 2 && ex.rollout[0].week === "Tuần 1" && ex.expected.length === 2 && /90%/.test(ex.expected[0].completion), "giải thích D, E: phân bổ theo tuần; kết quả kỳ vọng (điểm mục tiêu, tỷ lệ hoàn thành, ứng dụng)");
  ok(ex.missingData.some((x) => /Chưa có số bán/.test(x)) && ex.missingData.some((x) => /Chưa khai báo nguồn lực/.test(x)), "giải thích: nêu rõ dữ liệu còn thiếu (số bán, nguồn lực) thay vì giả định");

  // 4) nguồn lực + thông tin kinh doanh bổ sung
  r = await call("POST", {}, { op: "trainPlanBizSave", month, goals: ["Đạt chỉ tiêu bán T12"], promos: ["Khuyến mại cuối năm giảm 10% máy lọc nước"], difficulties: ["Đối thủ giảm giá mạnh"], direction: ["Tập trung đại lý lớn"], newProducts: "PC: X1", focus: "SR 2: BNN",
    resources: { trainers: ["GV A", "GV B"], formats: ["Đào tạo trực tuyến", "Micro-learning", "Kiểm tra củng cố kiến thức", "Hack"], maxMinutes: 90, sessionsPerWeek: 1, blockedDates: ["2026-12-08", "09/12/2026", "xx"], weekdays: [1, 2, 3, 4, 5, 9], budget: "20 triệu" } });
  const res = r.j.biz.resources; ok(r.s === 200 && res.trainers.length === 2 && res.formats.length === 3 && res.maxMinutes === 90 && res.sessionsPerWeek === 1 && res.blockedDates.join() === "2026-12-08,2026-12-09" && res.weekdays.join() === "1,2,3,4,5", "lưu nguồn lực: bỏ hình thức / ngày / thứ không hợp lệ");
  r = await call("GET", { op: "trainPlanGet", month }); ok(r.j.biz.promos.length === 1 && r.j.biz.newProducts[0].products[0] === "X1" && r.j.biz.difficulties.length === 1 && r.j.biz.direction.length === 1, "trainPlanGet trả đủ thông tin kinh doanh bổ sung");
  r = await call("POST", {}, { op: "trainPlanGenerate", month, mode: "rules" });
  const R4 = r.j.rows, wk = R4.map((x) => x.tuan);
  ok(R4.length >= 3 && wk.every((w, i) => wk.indexOf(w) === i) && R4.every((x) => ["2026-12-08", "2026-12-09"].indexOf(x.thoiGian) < 0), "lịch tôn trọng nguồn lực: tối đa 1 buổi/tuần, không rơi vào ngày không tổ chức");
  ok(R4.some((x) => /Triển khai sản phẩm mới: X1 · PC/.test(x.tenChuongTrinh) && ["Ưu tiên rất cao", "Ưu tiên cao"].indexOf(x.uuTien) >= 0) && R4.some((x) => /Sản phẩm trọng tâm tháng: BNN · SR 2/.test(x.tenChuongTrinh)), "sản phẩm mới và sản phẩm trọng tâm đều có chương trình riêng, ưu tiên ≥ cao");
  ok(R4.every((x) => ["GV A", "GV B"].indexOf(x.phuTrach) >= 0) && new Set(R4.map((x) => x.phuTrach)).size === 2, "phụ trách luân phiên theo giảng viên đã khai báo");
  ok(R4.every((x) => x.hinhThuc.split(" + ").every((p) => res.formats.indexOf(p) >= 0)), "hình thức chỉ nằm trong danh sách được phép");
  ok(R4.every((x) => x.hinhThuc && x.uuTien && x.soHocVien >= 0), "mọi dòng đủ hình thức, mức ưu tiên");
  r = await call("POST", {}, { op: "trainPlanBizSave", month, goals: ["Đạt chỉ tiêu bán T12"], focus: "SR 1: M1\nSR 2: M2\nPC: M3\nASM: M4", resources: { sessionsPerWeek: 1 } });
  r = await call("POST", {}, { op: "trainPlanGenerate", month, mode: "rules" });
  ok(r.j.rows.length === 5 && r.j.watch.some((w) => /Chưa xếp được lịch/.test(w.reason)) && new Set(r.j.rows.map((x) => x.tuan)).size === 5, "quá số buổi tối đa mỗi tuần: 5 buổi xếp được (5 tuần), phần vượt chuyển sang 'theo dõi' kèm lý do — không dồn lịch");

  // 5) AI: dữ liệu tổng hợp + nội dung kinh doanh, KHÔNG gửi tên giảng viên; máy chủ tự chấm ưu tiên / hình thức / lịch
  await call("POST", {}, { op: "trainPlanBizSave", month, goals: ["Đạt chỉ tiêu bán T12"], promos: ["Khuyến mại cuối năm"], difficulties: ["Đối thủ giảm giá mạnh"], direction: ["Tập trung đại lý lớn"], resources: { trainers: ["GV A"], blockedDates: ["2026-12-08"] } });
  let sent = ""; llm.chat = async (m) => { sent = m.map((x) => x.content).join("\n"); return JSON.stringify({ giai_thich: { tong_quan: "SR 1 yếu kỹ năng (20%).", dinh_huong: "Ưu tiên kỹ năng tư vấn." }, chuong_trinh: [
    { vi_tri: "GT1", mang: "sk", ten: "Kỹ năng tư vấn SR 1", noi_dung: ["Khai thác nhu cầu", "Xử lý từ chối"], muc_tieu: "Nâng điểm kỹ năng", hinh_thuc: "Hack + Đào tạo trực tuyến", ngay: 8, gio: "12:00", thoi_luong: "90 phút", uu_tien: "Theo dõi và bổ sung sau", so_hoc_vien: 999 }] }); };
  r = await call("POST", {}, { op: "trainPlanGenerate", month, mode: "ai" });
  const a1 = r.j.rows[0];
  ok(r.j.source === "ai" && /Khuyến mại cuối năm/.test(sent) && /Đối thủ giảm giá mạnh/.test(sent) && /Tập trung đại lý lớn/.test(sent) && /2026-12-08/.test(sent) && !/GV A/.test(sent) && !/Người [A-Z]\d|@x\.vn/.test(sent), "AI nhận khuyến mại, khó khăn, định hướng, ngày không tổ chức; KHÔNG nhận tên giảng viên / tên nhân sự");
  ok(/Khi khách chê giá đắt/.test(sent) && /cau_hoi_sai_nhieu/.test(sent), "AI nhận câu hỏi sai nhiều (nội dung câu hỏi + tỷ lệ sai)");
  ok(a1.uuTien === "Ưu tiên rất cao" && a1.soHocVien === 6 && a1.hinhThuc !== "" && a1.hinhThuc.split(" + ").every((p) => TP.FORMATS.indexOf(p) >= 0) && a1.thoiGian !== "2026-12-08", "máy chủ tự chấm ưu tiên / số học viên / hình thức hợp lệ / né ngày không tổ chức (không tin AI)");
  ok(r.j.explanation.narrative && /SR 1 yếu kỹ năng/.test(r.j.explanation.narrative.tongQuan), "nhận định của AI được đưa vào phần giải thích");
  llm.chat = async () => { throw new Error("down"); };

  // 6) lưu nháp / chính thức, phiên bản, khôi phục
  const body = (n, st) => ({ op: "trainPlanSave", month, status: st, rows: [{ tenChuongTrinh: "Bài " + n, noiDung: ["x"], thoiGian: "2026-12-10", gio: "08:00", thoiLuong: "90 phút" }], approval: { status: "draft" } });
  r = await call("POST", {}, body(1, "draft")); ok(r.s === 200 && r.j.plan.status === "draft" && r.j.plan.history.length === 0, "lưu NHÁP: trạng thái draft, chưa có phiên bản cũ");
  r = await call("POST", {}, body(1, "draft")); ok(r.j.plan.history.length === 0, "lưu lại y hệt: không sinh phiên bản trùng");
  r = await call("POST", {}, body(2, "final")); ok(r.j.plan.status === "final" && r.j.plan.history.length === 1 && r.j.plan.history[0].status === "draft", "lưu chính thức: phiên bản nháp trước đó được giữ lại");
  r = await call("GET", { op: "trainPlanHistory", month }); const at = r.j.history[0].at; ok(r.j.history.length === 1 && r.j.history[0].count === 1, "danh sách phiên bản");
  r = await call("GET", { op: "trainPlanRestore", month, at }); ok(r.s === 200 && r.j.rows[0].tenChuongTrinh === "Bài 1", "khôi phục: trả về nội dung phiên bản cũ để nạp vào bảng");
  r = await call("GET", { op: "trainPlanGet", month }); ok(r.j.plan.rows[0].tenChuongTrinh === "Bài 2" && r.j.plan.history.every((h) => !("rows" in h)), "khôi phục KHÔNG tự lưu (kế hoạch hiện tại vẫn là Bài 2); danh sách phiên bản không kèm nội dung nặng");
  r = await call("GET", { op: "trainPlanRestore", month, at: 1 }); ok(r.s === 404, "phiên bản không tồn tại: 404");
  for (let i = 3; i <= 16; i++) r = await call("POST", {}, body(i, "final")); ok(r.j.plan.history.length === 10, "giữ tối đa 10 phiên bản");
  ok(r.j.plan.baseline && r.j.plan.baseline.items.some((x) => x.key === "GT1" && x.area === "sk" && x.avg === 20), "chụp số liệu nền (SR 1 kỹ năng 20%) để đánh giá hiệu quả sau này");

  // 7) tạo luồng yêu cầu kế hoạch chính thức; đánh giá hiệu quả
  await call("POST", {}, body(17, "draft")); r = await call("POST", {}, { op: "trainFlowCreate", month }); ok(r.s === 400 && r.j.code === "draft_plan", "kế hoạch đang NHÁP: không tạo luồng");
  await call("POST", {}, { op: "trainPlanSave", month, status: "final", rows: [{ doiTuong: "SR 1", tenChuongTrinh: "Kỹ năng tư vấn SR 1", noiDung: ["a"], mucTieu: "m", thoiGian: "2026-12-10", gio: "08:00", thoiLuong: "90 phút" }], approval: { status: "pending" } });
  r = await call("POST", {}, { op: "trainFlowCreate", month }); const it = r.j.status.items[0]; ok(r.s === 200 && it.exam && it.program, "kế hoạch chính thức: tạo được luồng");
  const exId = "dt-" + month + "-1", progId = it.program.id;
  for (const c of ["G1", "G2", "G3"]) await quiz.upsertIndex({ id: "x" + c, code: c, status: "submitted", pct: c === "G3" ? 50 : 80, score: 8, total: 10, submittedAt: now, period: exId, flags: { blur: 0 } });
  await P.act(progId, "G1", "join", {}); await P.act(progId, "G2", "join", {});
  r = await call("GET", { op: "trainFlowEffect", month }); const e = r.j.items[0];
  ok(r.s === 200 && r.j.created && e.program.regs === 2 && e.exam.audience === 6 && e.exam.taken === 3 && e.exam.takenPct === 50 && e.exam.avgPct === 70 && e.exam.passRate === 67 && e.survey.responses === 0, "đánh giá hiệu quả: đăng ký 2, kiểm tra 3/6 người (50%), điểm TB 70, tỷ lệ đạt 67%, 0 phản hồi khảo sát");
  ok(r.j.hasBaseline && e.baseline.some((b) => b.area === "Kỹ năng bán hàng & tư vấn" && b.avg === 20) && /không kết luận nhân quả/.test(r.j.note), "đối chiếu số liệu nền trước đào tạo; ghi rõ không kết luận nhân quả");
  r = await call("GET", { op: "trainFlowEffect", month: "2027-03" }); ok(r.j.created === false && r.j.items.length === 0, "tháng chưa có luồng: không có số liệu hiệu quả (các tháng độc lập)");

  // 7b) kết quả đào tạo tháng trước được đưa vào phân tích tháng sau
  await call("POST", {}, { op: "trainPlanBizSave", month: "2027-01", goals: ["Đạt chỉ tiêu bán T1"] });
  r = await call("POST", {}, { op: "trainPlanGenerate", month: "2027-01", mode: "rules" });
  ok(r.s === 200 && r.j.explanation.overview.lines.some((x) => /Đào tạo tháng 12\/2026: 1 chương trình, 2 lượt đăng ký, 3\/6 người đã làm bài kiểm tra củng cố, điểm TB 70%/.test(x)), "tháng sau: phần giải thích có kết quả đào tạo tháng trước (đăng ký, tỷ lệ làm bài, điểm TB)");
  let sent2 = ""; llm.chat = async (m) => { sent2 = m.map((x) => x.content).join("\n"); return JSON.stringify({ chuong_trinh: [] }); };
  r = await call("POST", {}, { op: "trainPlanGenerate", month: "2027-01", mode: "ai" });
  ok(/dao_tao_thang_truoc/.test(sent2) && /Kỹ năng tư vấn SR 1/.test(sent2) && !/Người [A-Z]\d|@x\.vn/.test(sent2), "AI nhận kết quả đào tạo tháng trước (tổng hợp, không định danh)");
  llm.chat = async () => { throw new Error("down"); };
  r = await call("POST", {}, { op: "trainPlanGenerate", month: "2026-12", mode: "rules" });
  ok(r.j.explanation.overview.lines.some((x) => /Chưa có kết quả đào tạo tháng trước/.test(x)), "tháng chưa có luồng tháng trước: nói rõ chưa có dữ liệu để đối chiếu (các tháng độc lập)");

  // 8) nhóm đối tượng + phạm vi dữ liệu
  r = await call("GET", { op: "trainPlanAnalysis", month, aud: "GT1,PC" }); ok(r.j.analysis.audiences.length === 2 && r.j.analysis.audiences.every((a) => ["GT1", "PC"].indexOf(a.key) >= 0), "chọn nhóm đối tượng: chỉ phân tích SR 1 và PC");
  r = await call("GET", { op: "trainPlanAnalysis", month }); ok(aud(r, "GT2").tested === 6, "phạm vi 'tất cả': SR 2 có 6 người có bài");
  r = await call("GET", { op: "trainPlanAnalysis", month, months: "3" }); ok(aud(r, "GT2").tested === 0 && aud(r, "GT1").tested === 6 && r.j.analysis.scope === 3, "phạm vi 3 tháng gần nhất: bỏ bài làm cách đây 200 ngày (SR 2 còn 0 người), SR 1 giữ nguyên");
  r = await call("GET", { op: "trainPlanAnalysis", month, months: "12" }); ok(aud(r, "GT2").tested === 6, "phạm vi 12 tháng: SR 2 trở lại 6 người");
  console.log("\n" + pass + " pass, " + fail + " fail"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
