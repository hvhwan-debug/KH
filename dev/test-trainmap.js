// Vì sao "thiếu dữ liệu": danh mục câu hỏi không khớp mảng năng lực; gắn thủ công danh mục vào mảng.  node dev/test-trainmap.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory"; process.env.ADMIN_EMAILS = "admin@x.vn";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
const quiz = require("../api/_lib/quiz"), session = require("../api/_lib/session"), admin = require("../api/kt-admin");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function call(method, query, body) {
  const ctx = { log: Object.assign(() => {}, { error: console.error, warn: () => {} }), res: null };
  await admin(ctx, { method, headers: { "x-requested-with": "livotec", "x-sr-token": session.sessionValue("admin@x.vn") }, query: query || {}, body }); return { s: ctx.res.status, j: ctx.res.body };
}
const q = (cat, good, n) => Array.from({ length: n }, (_, i) => ({ category: cat, ok: i < good ? 1 : 0 }));
(async () => {
  const now = Date.now(), cands = []; await quiz.saveSettings({ examTitle: "K", passEnabled: true, passScore: 60 });
  for (let i = 1; i <= 6; i++) {
    cands.push({ code: "G" + i, name: "Người " + i, email: "g" + i + "@x.vn", phone: "0912345678", manager: "QL", segment: "may_loc", title: "SR 1", province: "Hà Nội", region: "bac", profile: { namSinh: 1990 } });
    // "Phần A Ngành 1" không khớp từ khoá nào → bị xếp vào "Kiến thức chung" (mảng không dùng) → SR 1 thiếu dữ liệu sản phẩm ngành 1
    await quiz.putAttempt({ id: "a" + i, code: "G" + i, status: "submitted", period: "k", paper: [].concat(q("Kỹ năng bán hàng", 5, 5), q("Chính sách bán hàng", 5, 5), q("Phần A Ngành 1", 2, 5)) });
    await quiz.upsertIndex({ id: "a" + i, code: "G" + i, status: "submitted", pct: 80, score: 8, total: 10, submittedAt: now, period: "k", flags: { blur: 0 } });
  }
  await quiz.saveCandidates(cands);
  const month = "2026-12", gt1 = (r) => r.j.analysis.audiences.find((a) => a.key === "GT1"), n1 = (r) => gt1(r).reqs.find((g) => g.area === "n1");
  let r = await call("GET", { op: "trainPlanAnalysis", month });
  ok(r.s === 200 && n1(r).status === "thiếu dữ liệu" && n1(r).assessed === 0, "SR 1: mảng sản phẩm ngành 1 'thiếu dữ liệu' vì danh mục câu hỏi không khớp");
  ok(gt1(r).missing >= 1 && r.j.analysis.missingTotal >= 1 && gt1(r).gaps === 0, "đếm số mảng thiếu dữ liệu (gaps = 0 nhưng missing ≥ 1: KHÔNG được coi là 'đạt')");
  const cat = gt1(r).categories.find((c) => c.name === "Phần A Ngành 1");
  ok(cat && cat.n === 30 && cat.area === "gn" && /không dùng/.test(cat.areaName) && cat.manual === false, "liệt kê danh mục câu hỏi của vị trí: 'Phần A Ngành 1' (30 câu) đang bị xếp vào Kiến thức chung (không dùng)");
  ok(gt1(r).categories.find((c) => c.name === "Kỹ năng bán hàng").area === "sk", "danh mục khớp từ khoá được gắn đúng mảng (Kỹ năng bán hàng → kỹ năng)");
  ok(r.j.areas && r.j.areas.n1 && r.j.areas.sk, "API trả danh sách mảng năng lực để chọn");
  // gắn thủ công
  r = await call("POST", {}, { op: "trainAreaMapSave", map: { "Phần A Ngành 1": "zzz" } }); ok(r.s === 400, "mảng không hợp lệ bị từ chối");
  r = await call("POST", {}, { op: "trainAreaMapSave", map: { "Phần A Ngành 1": "n1" } }); ok(r.s === 200, "gắn danh mục 'Phần A Ngành 1' vào mảng sản phẩm ngành 1");
  r = await call("GET", { op: "trainPlanAnalysis", month }); // không refresh: bộ nhớ tạm đã bị xoá nên phải tính lại
  ok(n1(r).assessed === 6 && n1(r).avg === 40 && n1(r).status === "cần đào tạo", "sau khi gắn: sản phẩm ngành 1 có dữ liệu (TB 40%, 6 người) và được xếp 'cần đào tạo' — không cần chờ 20 phút");
  const c2 = gt1(r).categories.find((c) => c.name === "Phần A Ngành 1"); ok(c2.area === "n1" && c2.manual === true, "danh mục được đánh dấu là gắn thủ công");
  r = await call("POST", {}, { op: "trainAreaMapSave", map: { "Phần A Ngành 1": "" } }); r = await call("GET", { op: "trainPlanAnalysis", month });
  ok(n1(r).status === "thiếu dữ liệu" && gt1(r).categories.find((c) => c.name === "Phần A Ngành 1").manual === false, "bỏ gắn thủ công: quay về như cũ");
  // lập kế hoạch khi chưa có khoảng cách nhưng thiếu dữ liệu: phải nói rõ, không kết luận 'đạt'
  await call("POST", {}, { op: "trainPlanBizSave", month, goals: ["Đạt chỉ tiêu bán"] });
  r = await call("POST", {}, { op: "trainPlanGenerate", month, mode: "rules" });
  ok(r.s === 200 && r.j.rows.length === 0 && /CHƯA CÓ dữ liệu/.test(r.j.warning) && /\d+ mảng/.test(r.j.warning), "không có khoảng cách nhưng còn mảng thiếu dữ liệu: cảnh báo nói rõ chưa thể kết luận là đạt");
  console.log("\n" + pass + " pass, " + fail + " fail"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
