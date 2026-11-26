// Hồ sơ năng lực toàn hệ thống: gom MỌI kỳ kiểm tra + số bán + KAI + học liệu + ngân hàng câu hỏi.  node dev/test-hrcompetency.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory"; process.env.ADMIN_EMAILS = "admin@x.vn";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
const quiz = require("../api/_lib/quiz"), store = require("../api/_lib/store"), llm = require("../api/_lib/llm"), C = require("../api/_lib/hrcompetency");
const session = require("../api/_lib/session"), admin = require("../api/kt-admin");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function call(method, query, body) { const ctx = { log: Object.assign(() => {}, { error: console.error, warn: () => {} }), res: null }; await admin(ctx, { method, headers: { "x-requested-with": "livotec", "x-sr-token": session.sessionValue("admin@x.vn") }, query: query || {}, body }); return { s: ctx.res.status, j: ctx.res.body }; }
(async () => {
  ok(C.areaOf("Máy lọc nước RO Karofi") === "n1" && C.areaOf("Bếp từ Livotec") === "n2" && C.areaOf("Kỹ năng xử lý từ chối") === "sk" && C.areaOf("Chính sách bảo hành") === "po" && C.areaOf("Đối thủ cạnh tranh") === "mk", "khung năng lực: nhận đúng mảng");
  const now = Date.now(), cands = [];
  for (let i = 1; i <= 12; i++) {
    cands.push({ code: "NV" + i, name: "Người " + i, email: "n" + i + "@x.vn", title: "SR", segment: i <= 6 ? "may_loc" : "gia_dung", manager: i % 2 ? "QL A" : "QL B", province: "Hà Nội" });
    for (const [k, per, age, good] of [[1, "k1", 200, 0], [2, "k2", 20, 1]]) {
      const id = "a" + i + "x" + k, paper = [{ category: "Máy lọc nước RO", ok: good }, { category: "Máy lọc nước RO", ok: good }, { category: "Máy lọc nước RO", ok: 1 }, { category: "Máy lọc nước RO", ok: good },
        { category: "Kỹ năng tư vấn", ok: 1 }, { category: "Kỹ năng tư vấn", ok: 1 }, { category: "Kỹ năng tư vấn", ok: 0 }, { category: "Kỹ năng tư vấn", ok: 1 }, { category: "Bếp từ", ok: 0 }, { category: "Bếp từ", ok: 0 }, { category: "Bếp từ", ok: 0 }, { category: "Bếp từ", ok: 0 }];
      await quiz.putAttempt({ id, code: "NV" + i, status: "submitted", period: per, paper });
      await quiz.upsertIndex({ id, code: "NV" + i, status: "submitted", pct: good ? 80 : 40, score: 1, total: 10, submittedAt: now - age * 864e5, period: per });
    }
  }
  await quiz.saveCandidates(cands);
  await store.put("kt/sales/2026-10.json", { rows: cands.map((c, i) => ({ code: c.code, target: 100, actual: 60 + i * 5 })) });
  await store.put("kai/log.json", [{ code: "NV1", question: "Lõi lọc RO thay bao lâu?", ts: now }, { code: "NV1", question: "Chính sách bảo hành bếp từ", ts: now }]);
  const r = await call("GET", { op: "hrCompetency", refresh: "1" });
  ok(r.s === 200 && r.j.ok, "API hrCompetency (" + r.s + " " + (r.j.error || "") + ")");
  const d = r.j, p1 = d.people.find((p) => p.code === "NV1"), p7 = d.people.find((p) => p.code === "NV7");
  ok(d.meta.attempts === 24 && d.meta.periods === 2 && p1.tests === 2, "gom MỌI kỳ (2 kỳ, 24 bài), không chỉ một kỳ");
  ok(p1.index > 60 && p1.index < 80, "chỉ số năng lực có trọng số thời gian: bài gần (80%) nặng hơn bài cũ (40%) → " + p1.index);
  ok(p1.areas.find((a) => a.id === "n2").offScope === true && !p1.areas.find((a) => a.id === "n1").offScope && p7.areas.find((a) => a.id === "n1").offScope === true, "mảng chuyên sâu của ngành kia đánh dấu ngoài ngành (GT1 không bị tính điện gia dụng, GT2 không bị tính máy lọc)");
  ok(p1.sales && p1.sales.latest === 60 && p1.kai.n90 === 2, "có số bán và số câu hỏi KAI của từng người");
  ok(d.system.areaMap.length >= 2 && d.system.trend.length >= 1 && d.system.coverage.length >= 5, "toàn hệ thống: bản đồ năng lực, xu hướng theo tháng, độ phủ sản phẩm / thị trường");
  ok(d.audiences.length === 2 && d.managers.length === 2, "nhóm theo đối tượng (SR GT1 / SR GT2) và quản lí");
  ok(/Tiến bộ \+40/.test(p1.rules.notes.join(" ")), "nhận định có tiến bộ qua các kỳ");
  const r2 = await call("GET", { op: "hrCompetency" }); ok(r2.j.cached === true, "lần sau dùng bản lưu tạm (nhanh)");
  let sent = ""; llm.chat = async (m) => { sent = m[1].content; if (/TOÀN HỆ THỐNG/.test(sent)) return JSON.stringify({ tom_tat: "Tóm tắt", phat_hien: [{ noi_dung: "a", bang_chung: "b", do_tin_cay: "vừa" }], khuyen_nghi_nang_luc: [{ doi_tuong: "SR GT1", nang_luc: "Kỹ năng", hien_trang: "x", loai: "Thiếu kỹ năng", de_xuat: "y", do_luong: "z" }], san_pham_thi_truong: ["c"], du_lieu_can_bo_sung: ["d"] });
    const ids = (sent.match(/"id":"([A-Z]+\d+)"/g) || []).map((x) => x.slice(6, -1)); return JSON.stringify({ items: ids.map((id) => ({ id, nhan_dinh: "N", diem_manh: [], can_cai_thien: [], de_xuat: ["x"], do_tin_cay: "vừa" })) }); };
  let a = await call("POST", {}, { op: "hrCompetencyAi", kind: "system" }); ok(a.s === 200 && a.j.report.tom_tat && a.j.report.khuyen_nghi_nang_luc.length === 1, "AI toàn hệ thống");
  ok(!/Người \d|@x\.vn/.test(sent), "AI toàn hệ thống: không có tên / email");
  a = await call("POST", {}, { op: "hrCompetencyAi", kind: "person", key: "NV1" }); ok(a.s === 200 && a.j.items[0].key === "NV1" && !/Người 1|n1@/.test(sent), "AI từng người: không gửi tên");
  a = await call("POST", {}, { op: "hrCompetencyAi", kind: "managers" }); ok(a.s === 200 && a.j.items.length === 2 && !/QL A/.test(sent), "AI theo quản lí: ẩn tên quản lí");
  console.log("\n" + pass + " pass, " + fail + " fail"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
