// Kiểm thử luồng làm bài (chạy trực tiếp các hàm API với bộ nhớ tạm, không cần máy chủ):  node dev/test-kiemtra.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
const quiz = require("../api/_lib/quiz");
const H = { "x-requested-with": "livotec" };
const fn = { check: require("../api/kt-check"), start: require("../api/kt-start"), answer: require("../api/kt-answer"), submit: require("../api/kt-submit") };
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function call(name, body, headers) {
  const ctx = { log: Object.assign(() => {}, { error: console.error }), res: null };
  await fn[name](ctx, { method: "POST", headers: headers || H, body });
  return { s: ctx.res.status, j: ctx.res.body };
}
(async () => {
  const qs = [];
  for (let i = 0; i < 12; i++) qs.push({ id: "q" + i, text: "Câu hỏi " + i, category: i < 5 ? "Gia dụng" : "Máy lọc nước", options: ["Đúng", "Sai 1", "Sai 2", "Sai 3"], correctIndex: 0, active: true });
  await quiz.saveQuestions(qs);
  await quiz.saveCandidates([{ code: "NV1", name: "Nguyễn A", email: "a@x.vn", segment: "both" }]);
  await quiz.saveSettings({ examTitle: "Thi thử", questionCount: 5, bothGiaDungCount: 2, secondsPerQuestion: 30, passScore: 60, allowRetake: false, complianceEnabled: true, complianceHighMin: 9, complianceMidMin: 7, complianceLowMin: 6 });

  let r = await call("check", { code: "NV1", email: "a@x.vn" }, {}); ok(r.s === 400, "thiếu header chống CSRF bị từ chối");
  r = await call("check", { code: "NV1", email: "a@x.vn" });
  ok(r.s === 200 && r.j.exam.secondsPerQuestion === 30 && r.j.exam.passScore === 60 && !r.j.inProgress, "check đúng: trả thể lệ, chưa có bài dở");

  r = await call("start", { code: "NV1", email: "a@x.vn" });
  const att = r.j.attemptId;
  ok(r.s === 200 && r.j.index === 0 && r.j.total === 5 && r.j.question && !r.j.questions && r.j.resumed === false, "start: tạo đề, chỉ gửi MỘT câu, không lộ cả đề");
  ok(r.j.remainingMs > 29000 && r.j.remainingMs <= 30000, "start: thời gian còn lại ≈ 30s");
  const first = r.j.question;

  r = await call("start", { code: "nv1", email: "A@x.vn" });
  ok(r.j.resumed === true && r.j.attemptId === att && r.j.question.id === first.id && JSON.stringify(r.j.question.options) === JSON.stringify(first.options), "tải lại trang: làm tiếp đúng bài/câu cũ, KHÔNG tạo đề mới");
  r = await call("check", { code: "NV1", email: "a@x.vn" });
  ok(r.j.inProgress && r.j.inProgress.answered === 0 && r.j.inProgress.total === 5, "check: báo có bài đang dở");

  const correctIdx = async (qid, shown) => { const bank = (await quiz.getQuestions()).find((q) => q.id === qid); return shown.indexOf(bank.options[bank.correctIndex]); };
  let cur = first, step;
  r = await call("answer", { attemptId: att, questionId: cur.id, answerIndex: await correctIdx(cur.id, cur.options) });
  ok(r.j.ok && r.j.accepted && r.j.index === 1 && r.j.question.id !== cur.id, "answer: ghi nhận và trả câu kế tiếp");
  const second = r.j.question;
  r = await call("answer", { attemptId: att, questionId: cur.id, answerIndex: 0 });
  ok(r.j.ok && r.j.accepted === false && r.j.index === 1 && r.j.question.id === second.id, "gửi trùng câu cũ: bỏ qua, không hỏng bài (idempotent)");
  r = await call("answer", { attemptId: att, questionId: "khong-co", answerIndex: 0 }); ok(r.s === 400, "câu không thuộc bài: bị từ chối");

  // Giả lập thoát ra rất lâu: câu 2 quá hạn -> tự bỏ trống, nhảy sang câu 3 khi vào lại
  let a = await quiz.getAttempt(att); a.qStartedAt = Date.now() - (30 * 1000 + quiz.GRACE_MS + 500); await quiz.putAttempt(a);
  r = await call("start", { code: "NV1", email: "a@x.vn" });
  ok(r.j.resumed && r.j.index === 2 && r.j.remainingMs > 0 && r.j.remainingMs <= 30000, "vào lại sau khi quá hạn: câu bỏ lỡ tính trống, đồng hồ chạy tiếp");
  a = await quiz.getAttempt(att); ok(a.answers[second.id] && a.answers[second.id].answerIndex === -1 && a.answers[second.id].auto, "câu quá hạn được ghi là bỏ trống");

  // Trả lời muộn cho câu đã quá hạn: không nhận
  r = await call("answer", { attemptId: att, questionId: second.id, answerIndex: 0 });
  ok(r.j.accepted === false && r.j.index === 2, "trả lời câu đã quá hạn: không được nhận");

  cur = r.j.question;
  for (let i = 2; i < 5; i++) { r = await call("answer", { attemptId: att, questionId: cur.id, answerIndex: await correctIdx(cur.id, cur.options) }); if (!r.j.done) cur = r.j.question; }
  ok(r.j.done === true, "trả lời hết câu: done");
  r = await call("submit", { attemptId: att });
  ok(r.j.ok && r.j.total === 5 && r.j.score === 4 && r.j.pct === 80 && r.j.passed === true && r.j.mailOk === true && r.j.passScore === 60, "submit: chấm đúng 4/5 (1 câu bỏ lỡ), ĐẠT, đã gửi mail");
  ok(typeof r.j.durationSec === "number", "submit: có thời gian làm bài");
  const mb = global.__mailbox || []; ok(mb.length === 1 && mb[0].to === "a@x.vn", "chỉ gửi đúng 1 email kết quả");
  r = await call("submit", { attemptId: att }); ok(r.j.already === true && (global.__mailbox || []).length === 1, "nộp lần 2: idempotent, không gửi mail lần nữa");
  r = await call("answer", { attemptId: att, questionId: cur.id, answerIndex: 0 }); ok(r.j.done === true, "answer sau khi nộp: báo đã xong");
  r = await call("start", { code: "NV1", email: "a@x.vn" }); ok(r.s === 409, "đã nộp: không cho làm lại");
  r = await call("check", { code: "NV1", email: "a@x.vn" });
  ok(r.j.alreadyDone && r.j.result.score === 4 && r.j.result.mailOk === true && r.j.result.submittedAt > 0, "check sau khi nộp: trả kết quả cũ + trạng thái email");

  // Giới hạn dò mã
  let last; for (let i = 0; i < 9; i++) last = await call("check", { code: "X" + i, email: "z@x.vn" });
  ok(last.s === 429, "thử sai quá nhiều lần: bị chặn tạm thời (429)");
  console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
