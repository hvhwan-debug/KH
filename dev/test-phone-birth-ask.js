// Màn xác nhận: đã có số điện thoại thì không hỏi lại; chưa có ngày sinh thì hỏi (mặc định), có rồi thì bỏ qua.  node dev/test-phone-birth-ask.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory"; process.env.FACE_IDENTITY = "off";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
const quiz = require("../api/_lib/quiz");
const check = require("../api/kt-check");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const call = async (body) => { body = Object.assign({ examId: "de-a" }, body); const ctx = { log: Object.assign(() => {}, { error: console.error, warn() {} }), res: null }; await check(ctx, { method: "POST", headers: { "x-requested-with": "livotec" }, body, query: {} }); return ctx.res && ctx.res.body; };
(async () => {
  await quiz.saveQuestions([{ id: "q1", text: "Câu 1", category: "Gia dụng", options: ["A", "B"], correctIndex: 0, active: true }]);
  await quiz.saveSettings({ examTitle: "T", questionCount: 1 });
  await quiz.upsertExam({ id: "de-a", title: "Đề A", questionCount: 1 });
  await quiz.saveCandidates([
    { code: "P1", name: "Có SĐT, thiếu ngày sinh", email: "p1@x.vn", segment: "both", phone: "0912345678", province: "Hà Nội", region: "bac" },
    { code: "P2", name: "Đủ cả hai", email: "p2@x.vn", segment: "both", phone: "0912345679", birthDate: "1995-03-12", province: "Hà Nội", region: "bac" },
    { code: "P3", name: "Thiếu SĐT", email: "p3@x.vn", segment: "both", birthDate: "1990-01-01", province: "Hà Nội", region: "bac" }
  ]);
  const a = await call({ code: "P1", email: "p1@x.vn" }), b = await call({ code: "P2", email: "p2@x.vn" }), c = await call({ code: "P3", email: "p3@x.vn" });
  ok(a && a.candidate && a.candidate.name && a.candidate.code === "P1" && a.candidate.manager !== undefined, "kt-check trả đủ tên, mã NV, quản lí");
  ok(a.candidate.phone === "0912345678", "đã có SĐT -> trả về số, màn xác nhận không hỏi lại");
  ok(a.candidate.needBirth === true, "thiếu ngày sinh -> hỏi");
  ok(b.candidate.needBirth === false && !!b.candidate.phone, "đủ ngày sinh + SĐT -> không hỏi gì");
  ok(!c.candidate.phone, "thiếu SĐT -> màn xác nhận hỏi SĐT");
  console.log("\n" + pass + " pass, " + fail + " fail"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
