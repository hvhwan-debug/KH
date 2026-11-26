// Gọi phân tích nhân lực QUA API như trang Hồ sơ học tập (GET /api/kt-admin?op=hrAnalytics[&period=]) — bắt lỗi ở lớp API.  node dev/test-hranalytics-api.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory"; process.env.ADMIN_EMAILS = "admin@x.vn";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
const quiz = require("../api/_lib/quiz"), session = require("../api/_lib/session"), admin = require("../api/kt-admin");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function get(query) {
  const ctx = { log: Object.assign(() => {}, { error: console.error, warn: () => {} }), res: null };
  await admin(ctx, { method: "GET", headers: { "x-requested-with": "livotec", "x-sr-token": session.sessionValue("admin@x.vn") }, query }); return { s: ctx.res.status, j: ctx.res.body };
}
(async () => {
  await quiz.saveCandidates([{ code: "NV1", name: "A", email: "a@x.vn" }]);
  let r = await get({ op: "hrAnalytics" });
  ok(r.s === 200 && r.j.ok && r.j.analysis && r.j.summary, "không chọn kỳ: trả kết quả, không lỗi 500 (" + r.s + " " + (r.j.error || "") + ")");
  r = await get({ op: "hrAnalytics", period: "de-a" });
  ok(r.s === 200 && r.j.ok, "chọn kỳ cụ thể: trả kết quả");
  r = await get({ op: "hrDiscovery" });
  ok(r.s === 200 && r.j.ok, "rà soát dữ liệu: trả kết quả");
  console.log("\n" + pass + " pass, " + fail + " fail"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
