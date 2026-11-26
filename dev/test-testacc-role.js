// Tài khoản thử nghiệm: hệ thống hỏi vai trò (Thí sinh / Quản trị viên) và chức năng muốn bỏ qua, nhưng CHỈ khi trình duyệt đang đăng nhập quản trị viên.
// Người lạ nhập mã + email của tài khoản thử nghiệm, hoặc thí sinh thật, không bao giờ bỏ qua được quét mặt.  node dev/test-testacc-role.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn"; process.env.ADMIN_EMAILS = "admin@x.vn";
const quiz = require("../api/_lib/quiz");
const session = require("../api/_lib/session");
const H = { "x-requested-with": "livotec" };
const ADMIN = Object.assign({}, H, { "x-sr-token": session.sessionValue("admin@x.vn") });
const USER = Object.assign({}, H, { "x-sr-token": session.sessionValue("nhanvien@x.vn") });
const fn = { check: require("../api/kt-check"), start: require("../api/kt-start") };
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const PROF = { phone: "0912345678", province: "Hà Nội", region: "bac", birthDate: "1990-01-01", examId: "de-a" };
async function call(name, body, headers) { const ctx = { log: Object.assign(() => {}, { error: console.error }), res: null }; await fn[name](ctx, { method: "POST", headers: headers || H, body: Object.assign({}, PROF, body) }); return { s: ctx.res.status, j: ctx.res.body }; }
(async () => {
  const qs = []; for (let i = 0; i < 12; i++) qs.push({ id: "q" + i, text: "Câu " + i, category: i < 5 ? "Gia dụng" : "Máy lọc nước", options: ["Đúng", "Sai 1", "Sai 2", "Sai 3"], correctIndex: 0, period: "de-a" });
  await quiz.saveQuestions(qs);
  await quiz.saveCandidates([{ code: "NVR", name: "Thật", email: "r@x.vn", segment: "both" }]);
  await quiz.saveTestAccounts([{ code: "TS1", email: "t1@x.vn", name: "Thử 1", segment: "both" }]);
  await quiz.saveSettings({ examTitle: "Thi thử", questionCount: 5, bothGiaDungCount: 2, secondsPerQuestion: 30, allowRetake: true });
  await quiz.saveExams([{ id: "de-a", title: "Đề A", createdAt: 1 }]);
  let r = await call("check", { code: "TS1", email: "t1@x.vn" }, ADMIN);
  ok(r.s === 200 && r.j.candidate.testChoice === true, "check: tài khoản thử nghiệm + trình duyệt quản trị -> hiện lựa chọn vai trò");
  r = await call("check", { code: "TS1", email: "t1@x.vn" }, USER);
  ok(r.s === 200 && r.j.candidate.testChoice === false, "check: tài khoản thử nghiệm + người không phải quản trị -> không có lựa chọn (đi như thí sinh)");
  r = await call("check", { code: "TS1", email: "t1@x.vn" });
  ok(r.s === 200 && r.j.candidate.testChoice === false, "check: chưa đăng nhập -> không có lựa chọn");
  r = await call("check", { code: "NVR", email: "r@x.vn" }, ADMIN);
  ok(r.s === 200 && r.j.candidate.testChoice === false, "check: thí sinh thật dù quản trị mở -> không có lựa chọn");
  r = await call("start", { code: "TS1", email: "t1@x.vn", testSkip: { face: true } }, USER);
  ok(r.s === 400 && /ảnh/i.test(r.j.error || ""), "start: người không phải quản trị gửi testSkip -> vẫn bị đòi ảnh");
  r = await call("start", { code: "TS1", email: "t1@x.vn", testSkip: { face: true } });
  ok(r.s === 400 && /ảnh/i.test(r.j.error || ""), "start: chưa đăng nhập gửi testSkip -> vẫn bị đòi ảnh");
  r = await call("start", { code: "NVR", email: "r@x.vn", testSkip: { face: true } }, ADMIN);
  ok(r.s === 400 && /ảnh/i.test(r.j.error || ""), "start: thí sinh thật, dù quản trị mở -> không bỏ qua được");
  r = await call("start", { code: "TS1", email: "t1@x.vn" }, ADMIN);
  ok(r.s === 400 && /ảnh/i.test(r.j.error || ""), "start: quản trị chọn vai Thí sinh (không gửi testSkip) -> quét mặt đầy đủ như thật");
  r = await call("start", { code: "TS1", email: "t1@x.vn", testSkip: { face: true } }, ADMIN);
  ok(r.s === 200 && r.j.ok && r.j.attemptId, "start: quản trị chọn bỏ qua quét mặt -> vào bài không cần ảnh");
  const a = await quiz.getAttempt(r.j.attemptId);
  ok(a && a.test === true && a.faceCheck && a.faceCheck.status === "test_skip" && !a.photo, "bài làm ghi rõ test_skip, là bài thử, không có ảnh");
  console.log("\n" + pass + " pass, " + fail + " fail"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
