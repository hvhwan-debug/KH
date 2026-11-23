// Kiểm thử: sửa Cài đặt mặc định KHÔNG làm đổi cài đặt các đề đã có; mỗi đề giữ cài đặt riêng.  node dev/test-exam-freeze.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
process.env.ADMIN_EMAILS = "admin@x.vn";
const quiz = require("../api/_lib/quiz"), session = require("../api/_lib/session"), admin = require("../api/kt-admin");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function call(method, query, body) {
  const ctx = { log: Object.assign(() => {}, { error: () => {} }), res: null };
  await admin(ctx, { method, headers: { "x-sr-token": session.sessionValue("admin@x.vn"), "x-requested-with": "livotec" }, query: query || {}, body });
  return ctx.res.body;
}
(async () => {
  const qs = []; for (let i = 0; i < 40; i++) qs.push({ id: "q" + i, text: "Câu " + i, category: "Gia dụng", options: ["A", "B"], correctIndex: 0, active: true, period: i < 20 ? "de-a" : "de-b" });
  await quiz.saveQuestions(qs);
  await quiz.saveCandidates([{ code: "NV1", name: "An", segment: "gia_dung", manager: "Bình" }, { code: "NV2", name: "Chi", segment: "may_loc", left: true }]);
  await quiz.saveSettings({ examTitle: "T", questionCount: 10, bothGiaDungCount: 0, secondsPerQuestion: 30, passEnabled: true, passScore: 60, allowRetake: false, segmentPlans: {} });
  // Đề cũ kiểu trước: chỉ có tên, mọi ô khác trống (đang "theo mặc định")
  await quiz.saveExams([{ id: "de-a", title: "Đề A", createdAt: 1 }]);
  let r = await call("POST", {}, { op: "saveExam", exam: { id: "de-b", title: "Đề B", questionCount: "", secondsPerQuestion: "45", passEnabled: true, passScore: "", allowRetake: false } });
  ok(r.ok, "lưu đề B");
  const b0 = await quiz.getExamSettings("de-b");
  ok(b0.questionCount === 10 && b0.secondsPerQuestion === 45 && b0.passScore === 60, "đề B: ô trống lấy mặc định lúc lưu (10 câu, 60%), ô có giá trị giữ riêng (45 giây)");
  r = await call("POST", {}, { op: "saveSettings", questionCount: "15", secondsPerQuestion: "20", passEnabled: true, passScore: "80", allowRetake: true, timeMode: "perQuestion" });
  ok(r.ok, "lưu cài đặt mặc định mới");
  const a1 = await quiz.getExamSettings("de-a"), b1 = await quiz.getExamSettings("de-b");
  ok(a1.questionCount === 10 && a1.secondsPerQuestion === 30 && a1.passScore === 60 && a1.allowRetake === false, "đề A cũ KHÔNG đổi theo mặc định mới");
  ok(b1.questionCount === 10 && b1.secondsPerQuestion === 45 && b1.passScore === 60, "đề B KHÔNG đổi theo mặc định mới");
  r = await call("POST", {}, { op: "saveExam", exam: { id: "de-c", title: "Đề C" } });
  const c1 = await quiz.getExamSettings("de-c");
  ok(c1.questionCount === 15 && c1.secondsPerQuestion === 20 && c1.passScore === 80, "đề tạo mới dùng mặc định mới");
  r = await call("POST", {}, { op: "saveExam", exam: { id: "de-a", title: "Đề A", secondsPerQuestion: "60" } });
  const a2 = await quiz.getExamSettings("de-a"), b2 = await quiz.getExamSettings("de-b");
  ok(a2.secondsPerQuestion === 60 && a2.questionCount === 10 && b2.secondsPerQuestion === 45, "sửa đề A chỉ đổi đề A, không ảnh hưởng đề B");
  r = await call("GET", { op: "people" });
  ok(r.ok && r.people.length === 2 && r.people[0].code === "NV1" && r.people[0].manager === "Bình" && r.people[1].left === true && !("email" in r.people[0]), "op=people trả danh sách gọn");
  // Chuyển đổi một lần: đề cũ chưa chốt được chốt ngay khi hệ thống chạy, không cần ai bấm Lưu cài đặt
  const store = require("../api/_lib/store");
  await store.put("kt/migrate-freeze-exams-v1.json", null);
  const ex0 = await quiz.getExams(); ex0.push({ id: "de-cu", title: "Đề cũ", createdAt: 2 }); await quiz.saveExams(ex0);
  await quiz.runMigrations();
  const old = (await quiz.getExams()).find((e) => e.id === "de-cu");
  ok(old.frozen && old.questionCount === 15 && old.secondsPerQuestion === 20 && old.passScore === 80, "chuyển đổi một lần: đề cũ được chốt đúng giá trị đang áp dụng");
  await call("POST", {}, { op: "saveSettings", questionCount: "7", secondsPerQuestion: "15", passEnabled: true, passScore: "50", timeMode: "perQuestion" });
  const old2 = await quiz.getExamSettings("de-cu");
  ok(old2.questionCount === 15 && old2.passScore === 80, "sau đó đổi mặc định: đề cũ vẫn giữ nguyên");
  console.log(pass + " PASS, " + fail + " FAIL"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
