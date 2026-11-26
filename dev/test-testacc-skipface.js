// Tài khoản thử nghiệm được quản trị bật "bỏ qua quét mặt": vào làm bài không cần ảnh. Thí sinh thật / tài khoản chưa bật vẫn phải có ảnh.  node dev/test-testacc-skipface.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
const quiz = require("../api/_lib/quiz");
const H = { "x-requested-with": "livotec" };
const fn = { check: require("../api/kt-check"), start: require("../api/kt-start") };
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const PROF = { phone: "0912345678", province: "Hà Nội", region: "bac", birthDate: "1990-01-01" };
async function call(name, body) { const ctx = { log: Object.assign(() => {}, { error: console.error }), res: null }; await fn[name](ctx, { method: "POST", headers: H, body: Object.assign({}, PROF, body) }); return { s: ctx.res.status, j: ctx.res.body }; }
(async () => {
  const qs = []; for (let i = 0; i < 12; i++) qs.push({ id: "q" + i, text: "Câu " + i, category: i < 5 ? "Gia dụng" : "Máy lọc nước", options: ["Đúng", "Sai 1", "Sai 2", "Sai 3"], correctIndex: 0, period: "de-a" });
  await quiz.saveQuestions(qs);
  // "NVF" là thí sinh thật nhưng dữ liệu có gắn nhầm skipFace: KHÔNG được hiệu lực
  await quiz.saveCandidates([{ code: "NVR", name: "Thật", email: "r@x.vn", segment: "both", skipFace: true }]);
  await quiz.saveTestAccounts([{ code: "TS1", email: "t1@x.vn", name: "Thử 1", segment: "both", skipFace: true }, { code: "TS2", email: "t2@x.vn", name: "Thử 2", segment: "both" }]);
  await quiz.saveSettings({ examTitle: "Thi thử", questionCount: 5, bothGiaDungCount: 2, secondsPerQuestion: 30, allowRetake: true });
  await quiz.saveExams([{ id: "de-a", title: "Đề A", createdAt: 1 }]);
  let r = await call("check", { code: "TS1", email: "t1@x.vn", examId: "de-a" });
  ok(r.s === 200 && r.j.candidate && r.j.candidate.faceSkip === true, "check: tài khoản thử nghiệm bật skipFace -> faceSkip = true");
  r = await call("check", { code: "TS2", email: "t2@x.vn", examId: "de-a" });
  ok(r.s === 200 && r.j.candidate && r.j.candidate.faceSkip === false, "check: tài khoản thử nghiệm chưa bật -> faceSkip = false");
  r = await call("check", { code: "NVR", email: "r@x.vn", examId: "de-a" });
  ok(r.s === 200 && r.j.candidate && r.j.candidate.faceSkip === false, "check: thí sinh thật luôn faceSkip = false (kể cả dữ liệu gắn nhầm)");
  r = await call("start", { code: "TS1", email: "t1@x.vn", examId: "de-a" });
  if (!(r.s === 200)) console.log("DBG", r.s, JSON.stringify(r.j).slice(0,300));
  ok(r.s === 200 && r.j.ok && r.j.attemptId, "start: skipFace vào bài không cần ảnh");
  const a = await quiz.getAttempt(r.j.attemptId);
  ok(a && a.test === true && a.faceCheck && a.faceCheck.status === "test_skip" && !a.photo, "bài làm ghi rõ test_skip, đánh dấu bài thử, không có ảnh");
  r = await call("start", { code: "TS2", email: "t2@x.vn", examId: "de-a" });
  ok(r.s === 400 && /ảnh/i.test(r.j.error || ""), "start: tài khoản thử nghiệm chưa bật vẫn bị đòi ảnh");
  r = await call("start", { code: "NVR", email: "r@x.vn", examId: "de-a" });
  ok(r.s === 400 && /ảnh/i.test(r.j.error || ""), "start: thí sinh thật không thể bỏ qua ảnh");
  console.log("\n" + pass + " pass, " + fail + " fail"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
