// Đề xuất khung năng lực SMART từ dữ liệu hệ thống (không tự ghi vào khung).  node dev/test-trainframe.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory"; process.env.ADMIN_EMAILS = "admin@x.vn";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
const quiz = require("../api/_lib/quiz"), store = require("../api/_lib/store");
const session = require("../api/_lib/session"), admin = require("../api/kt-admin");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function call(method, query, body) {
  const ctx = { log: Object.assign(() => {}, { error: console.error, warn: () => {} }), res: null };
  await admin(ctx, { method, headers: { "x-requested-with": "livotec", "x-sr-token": session.sessionValue("admin@x.vn") }, query: query || {}, body }); return { s: ctx.res.status, j: ctx.res.body };
}
const q = (cat, good, n) => Array.from({ length: n }, (_, i) => ({ category: cat, ok: i < good ? 1 : 0 }));
(async () => {
  const now = Date.now(), month = "2026-12", cands = [], sales = [];
  await quiz.saveSettings({ examTitle: "K", passEnabled: true, passScore: 60 });
  const add = async (code, title, seg, sk, pctSale) => {
    cands.push({ code, name: "Người " + code, email: code.toLowerCase() + "@x.vn", phone: "0912345678", manager: "QL", segment: seg, title, province: "Hà Nội", region: "bac", profile: { namSinh: 1990 } });
    await quiz.putAttempt({ id: "a" + code, code, status: "submitted", period: "k", paper: [].concat(q("Kỹ năng bán hàng", sk, 5), q("Chính sách bán hàng", 5, 5)) });
    await quiz.upsertIndex({ id: "a" + code, code, status: "submitted", pct: 70, score: 7, total: 10, submittedAt: now, period: "k", flags: { blur: 0 } });
    if (pctSale) sales.push({ code, target: 100e6, actual: pctSale * 1e6 });
  };
  for (let i = 1; i <= 10; i++) await add("G" + i, "SR 1", "may_loc", 4, 110);   // SR 1: nhóm đạt chỉ tiêu, kỹ năng 80%
  for (let i = 11; i <= 20; i++) await add("G" + i, "SR 1", "may_loc", 2, 70);   // SR 1: nhóm chưa đạt, kỹ năng 40%
  for (let i = 1; i <= 6; i++) await add("B" + i, "SR 2", "gia_dung", 3, 0);     // SR 2: không có số bán
  for (let i = 1; i <= 3; i++) await add("M" + i, "ASM", "both", 3, 0);          // ASM: chỉ 3 người
  for (let i = 1; i <= 6; i++) await add("C" + i, "PC", "may_loc", 5, 110);      // PC: đạt chỉ tiêu, kỹ năng 100%
  for (let i = 7; i <= 12; i++) await add("C" + i, "PC", "may_loc", 3, 70);      // PC: chưa đạt, kỹ năng 60%
  await quiz.saveCandidates(cands); await store.put("kt/sales/2026-11.json", { v: 1, month: "2026-11", elapsed: 1, rows: sales });
  await call("POST", {}, { op: "trainPlanBizSave", month, goals: ["Đạt chỉ tiêu bán T12"], strategy: ["Tăng cường kỹ năng tư vấn và chốt đơn"] });
  const P = (r, k, a) => r.j.proposals.find((x) => x.key === k && x.area === a);

  let r = await call("GET", { op: "trainFrameworkPropose", month });
  ok(r.s === 200 && r.j.ok && r.j.passScore === 80 && /ĐỀ XUẤT/.test(r.j.note) && /nhân quả/.test(r.j.note), "API đề xuất khung: trả mức đạt của đề thi (80% — chuẩn đã có trong hệ thống) và ghi rõ chỉ là đề xuất, tương quan không phải nhân quả");
  const g = P(r, "GT1", "sk");
  ok(g.basis === "sales" && g.min === 80 && g.sales.high === 10 && g.sales.low === 10 && g.sales.medHigh === 80 && g.sales.medLow === 40, "SR 1 · kỹ năng: lấy trung vị 80% của nhóm ĐẠT chỉ tiêu bán làm mức yêu cầu (nhóm chưa đạt chỉ 40%)");
  ok(g.sales.r > 0.9 && g.sales.relevance === "mạnh" && g.confidence === "vừa" && g.meeting === 50, "tương quan mạnh (r > 0,9); độ tin cậy 'vừa' (20 cặp < 30); 50% nhân sự hiện đã đạt mức này (khả thi)");
  ok(g.roadmap.length === 3 && g.roadmap.map((x) => x.target).join() === "67,73,80" && g.roadmap[0].month === "2026-12" && g.roadmap[2].month === "2027-02", "lộ trình 3 tháng từ TB hiện tại 60% tới 80%: 67% → 73% → 80% (12/2026, 01/2027, 02/2027)");
  ok(g.smart.S === "SR 1 · Kỹ năng bán hàng & tư vấn" && g.smart.M === "≥ 80% đúng trong mảng" && /50% nhân sự hiện đã đạt/.test(g.smart.A) && /r = 1 \(mạnh\)/.test(g.smart.R) && /Tăng cường kỹ năng tư vấn/.test(g.smart.R) && /12\/2026 ≥ 67%/.test(g.smart.T), "đủ 5 thuộc tính SMART (cụ thể, đo được, khả thi, liên quan: số bán + chiến lược tháng, thời hạn)");
  ok(g.hits.some((x) => /Tăng cường kỹ năng tư vấn/.test(x)) && g.evidence.length >= 1 && g.evidence.every((e) => /khach_hang|coaching/.test(e.topic)), "gắn chiến lược của tháng và bằng chứng thị trường / coaching từ thư viện benchmark");
  const po = P(r, "GT1", "po");
  ok(po.basis === "passScore" && po.min === 80 && po.confidence === "thấp" && /dùng mức đạt của đề thi \(80%\)/.test(po.smart.R), "mảng không phân biệt được nhóm đạt / chưa đạt chỉ tiêu (cùng 100%): chỉ dùng mức đạt đề thi 80%, độ tin cậy thấp");
  const b = P(r, "GT2", "sk");
  ok(b.sales === null && b.basis === "passScore" && b.min === 80 && /Chưa đủ dữ liệu số bán/.test(b.smart.R), "SR 2 không có số bán: không bịa mức cao hơn, dùng mức đạt đề thi và nói rõ thiếu số bán");
  ok(!r.j.proposals.some((x) => x.key === "ASM") && r.j.skipped.some((x) => x.key === "ASM" && x.n === 3 && /cần ≥ 5/.test(x.reason)), "ASM chỉ 3 người: không đề xuất, nêu rõ lý do");
  const c = P(r, "PC", "sk");
  ok(c.min === 95 && c.basis === "sales" && c.roadmap.map((x) => x.target).join() === "85,90,95", "PC: trung vị nhóm đạt 100% bị chặn trần 95%; lộ trình từ 80% lên 95% (85 → 90 → 95)");
  ok(r.j.proposals.every((x) => x.min == null || (x.min >= 80 && x.min <= 95)), "mọi mức đề xuất nằm giữa mức đạt đề thi và trần 95%");
  const fw = await call("GET", { op: "trainPlanGet", month }); ok(Object.keys(fw.j.framework.min).length === 0, "đề xuất KHÔNG tự ghi vào khung năng lực (khung vẫn trống)");
  // áp dụng có chủ ý: quản trị viên lưu → phân tích dùng ngay
  const min = {}; r.j.proposals.forEach((x) => { if (x.min != null) (min[x.key] = min[x.key] || {})[x.area] = x.min; });
  await call("POST", {}, { op: "trainFrameworkSave", min });
  const an = await call("GET", { op: "trainPlanAnalysis", month }), gk = an.j.analysis.audiences.find((a) => a.key === "GT1").reqs.find((x) => x.area === "sk");
  ok(gk.min === 80 && gk.avg === 60 && gk.gap === 20 && gk.level === "Thiếu hụt đáng kể", "sau khi quản trị viên lưu đề xuất: phân tích dùng mức 80% (TB 60% → khoảng cách 20 = Thiếu hụt đáng kể)");
  // không có mức đạt đề thi và chưa đủ số bán: không đề xuất
  await quiz.saveSettings({ examTitle: "K", passEnabled: false, passScore: 60 });
  r = await call("GET", { op: "trainFrameworkPropose", month }); const b2 = P(r, "GT2", "sk");
  ok(r.j.passScore === null && b2.min === null && b2.basis === "none" && /không đề xuất/.test(b2.smart.R) && b2.roadmap.length === 0, "không có mức đạt đề thi và không đủ số bán: không đề xuất (không tự đặt số)");
  r = await call("GET", { op: "trainFrameworkPropose", month: "2026-13" }); ok(r.s === 400, "tháng không hợp lệ bị từ chối");
  console.log("\n" + pass + " pass, " + fail + " fail"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
