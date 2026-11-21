// Kiểm thử lịch sử đăng nhập: ghi đúng cách đăng nhập (khuôn mặt / mã NV + email), không ghi trùng, trang quản trị đọc được.
// Chạy: node dev/test-loginlog.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory"; process.env.ADMIN_EMAILS = "admin@x.vn";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
const path = require("path");
const stub = (rel, exp) => { const p = require.resolve(path.join(__dirname, "../api/_lib", rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; };
stub("facecheck", { verify: async () => ({ allow: true, record: { status: "ok", by: "azure" } }) });
stub("facematch", { describe: async () => ({ n: 1, desc: new Array(128).fill(0.1) }), compare: async () => ({ ok: true, distance: 0.3, threshold: 0.55 }), dist: () => 0.3, MATCH_MAX: 0.55 });
stub("facegallery", { identify: async () => ({ ok: true, code: require("../api/_lib/quiz").normCode("NV1"), distance: 0.3, second: 0.6 }) });
stub("facelive", { mode: () => "off", verify: async () => ({ ok: true }) });
const quiz = require("../api/_lib/quiz"), session = require("../api/_lib/session");
const fn = { check: require("../api/kt-check"), face: require("../api/kt-facelogin"), hist: require("../api/kt-history"), admin: require("../api/kt-admin") };
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function call(name, body, method, query, admin) {
  const ctx = { log: Object.assign(() => {}, { error: console.error, warn: () => {} }), res: null };
  const headers = { "x-requested-with": "livotec" }; if (admin) headers["x-sr-token"] = session.sessionValue("admin@x.vn");
  await fn[name](ctx, { method: method || "POST", headers, body, query: query || {} }); return { s: ctx.res.status, j: ctx.res.body };
}
const PHOTO = "data:image/jpeg;base64," + Buffer.from("selfie").toString("base64");
(async () => {
  await quiz.saveCandidates([{ code: "NV1", name: "Nguyễn A", email: "a@x.vn", manager: "QL X", phone: "0912345678", province: "Hà Nội", region: "bac" }, { code: "NV2", name: "Trần B", email: "b@x.vn", phone: "0912345679", province: "Hà Nội", region: "bac" }]);
  await quiz.upsertExam({ id: "de-a", title: "Đề A" });
  let r = await call("check", { code: "NV2", email: "b@x.vn", examId: "de-a" });
  ok(r.s === 200, "NV2 nhập mã + email");
  r = await call("face", { photo: PHOTO, examId: "de-a" });
  ok(r.s === 200 && r.j.facePass, "NV1 đăng nhập bằng khuôn mặt")
  r = await call("check", { code: "NV1", email: "a@x.vn", examId: "de-a", facePass: r.j.facePass });
  ok(r.s === 200, "kt-check ngay sau đăng nhập khuôn mặt");
  await call("check", { code: "NV2", email: "b@x.vn", examId: "de-a", again: true });
  await call("check", { code: "NV2", email: "b@x.vn", examId: "de-a" }); // vào lại trong 10 phút: gộp
  const log = await require("../api/_lib/loginlog").read();
  const nv1 = log.filter((x) => x.code === "NV1"), nv2 = log.filter((x) => x.code === "NV2");
  ok(nv1.length === 1 && nv1[0].method === "face" && nv1[0].page === "exam" && nv1[0].exam === "de-a", "NV1: 1 dòng 'Khuôn mặt', không ghi trùng thành nhập tay");
  ok(nv2.length === 1 && nv2[0].method === "manual" && nv2[0].n === 2, "NV2: 'Mã NV + email', vào lại trong 10 phút gộp thành 2 lần; 'kiểm tra lại' không ghi");
  const idx = await quiz.getIndex(); idx.push({ id: "a1", code: "NV1", name: "Nguyễn A", email: "a@x.vn", status: "submitted", submittedAt: Date.now(), period: "de-a", pct: 80 }); await quiz.saveIndex(idx);
  await quiz.putAttempt({ id: "a1", code: "NV1", status: "submitted", photo: PHOTO });
  r = await call("hist", { photo: PHOTO });
  ok(r.s === 200, "NV1 tra cứu lịch sử chỉ bằng khuôn mặt");
  r = await call("admin", null, "GET", { op: "logins", days: "7" }, true);
  ok(r.s === 200 && r.j.ok && r.j.stat.face === 2 && r.j.stat.manual === 2 && r.j.people.length === 2, "trang quản trị: thống kê theo cách đăng nhập + theo nhân viên");
  const p1 = r.j.people.find((p) => p.code === "NV1");
  ok(p1 && p1.lastPage === "history" && p1.face === 2, "NV1: lần gần nhất ở 'Tra cứu lịch sử', 2 lần bằng khuôn mặt");
  r = await call("admin", null, "GET", { op: "logins", method: "manual" }, true);
  ok(r.j.items.length === 1 && r.j.items[0].code === "NV2", "lọc theo cách đăng nhập");
  r = await call("admin", null, "GET", { op: "logins" }, false);
  ok(r.s !== 200 || !r.j.ok, "không đăng nhập quản trị thì không xem được");
  console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
