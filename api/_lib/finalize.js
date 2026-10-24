// Chấm điểm + lưu + gửi mail kết quả cho một bài làm. Dùng chung cho thí sinh tự nộp (kt-submit) và hệ thống tự thu bài khi hết giờ.
const quiz = require("./quiz");
const device = require("./device");
const resultmail = require("./resultmail");
const advicelib = require("./advice");

async function finalizeAttempt(context, attempt, opts) {
  opts = opts || {};
  const req = opts.req || null, deviceHint = opts.deviceHint, auto = !!opts.auto;
  {
    quiz.syncAttempt(attempt, Date.now()); // câu quá hạn chưa trả lời tính là bỏ trống

    const allQuestions = await quiz.getQuestions();
    const byId = {};
    allQuestions.forEach((q) => { byId[q.id] = q; });

    const settings = await quiz.getExamSettings(attempt.period || "");
    const sc = quiz.scoreAttempt(attempt, byId, settings);
    const correct = sc.correct, wrongN = sc.wrongN, total = sc.total, pct = sc.pct, passed = sc.passed, compliance = sc.compliance;
    const scoreOutOf10 = sc.scoreOutOf10;

    try { if (req) device.record(attempt, device.capture(req, deviceHint, "submit")); } catch (e) { (context.log.warn || context.log)("kt-submit device", e && e.message); }
    const devBrief = device.brief(attempt);
    attempt.status = "submitted";
    if (auto) { attempt.autoSubmitted = true; attempt.autoReason = "Hết giờ làm bài, hệ thống tự thu bài"; }
    attempt.submittedAt = Date.now();
    attempt.score = correct;
    attempt.total = total;
    attempt.pct = pct;
    attempt.passed = passed;
    attempt.practice = !!settings.practice;
    attempt.examTitle = settings.examTitle || ""; // giữ đúng tên đề lúc nộp: đổi tên đề sau này không làm đổi phiếu kết quả cũ
    attempt.scoreOutOf10 = scoreOutOf10;
    attempt.compliancePoints = compliance;
    attempt.paper = quiz.buildPaper(attempt, byId); // bản sao bài làm có cấu trúc, dùng để quản lí xem lại
    attempt.wrong = wrongN;
    attempt.blank = sc.blank;
    await quiz.putAttempt(attempt);

    await quiz.upsertIndex({
      id: attempt.id, code: attempt.code, name: attempt.name, email: attempt.email, manager: attempt.manager || "", period: attempt.period || "",
      score: correct, total, pct, passed, scoreOutOf10: attempt.scoreOutOf10, compliancePoints: compliance,
      submittedAt: attempt.submittedAt, status: "submitted", auto: !!auto, practice: !!settings.practice, flags: attempt.flags || null, startedAt: attempt.startedAt, wrong: attempt.wrong, blank: attempt.blank, proof: quiz.proofCode(attempt.id), durationSec: Math.round((attempt.submittedAt - (attempt.startedAt || attempt.submittedAt)) / 1000), device: devBrief, face: attempt.faceCheck ? attempt.faceCheck.status : null
    });

    // Lời khuyên cải thiện (AI nếu kịp, không thì theo luật). Điểm đã được lưu ở trên nên lỗi ở bước này không ảnh hưởng kết quả.
    let advice;
    try {
      // Bối cảnh để cá nhân hoá: bảng chỉ số (so với đồng nghiệp cùng đề, lịch sử của chính người này) + bài kỳ trước (so từng mảng)
      const idxAll = await quiz.getIndex();
      const prevRow = idxAll.filter((x) => x.status === "submitted" && !x.practice && x.id !== attempt.id && quiz.normCode(x.code) === quiz.normCode(attempt.code) && (x.period || "") !== (attempt.period || ""))
        .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))[0];
      let prevAttempt = null;
      if (prevRow) { try { prevAttempt = await quiz.getAttempt(prevRow.id); } catch (e) { prevAttempt = null; } }
      const profile = await require("./profile").forCode(attempt.code); // hồ sơ công việc (nếu đã nhập) để lời khuyên đúng vị trí / thâm niên
      advice = await advicelib.build(attempt, settings, quiz.previousResult(idxAll, attempt.code, attempt.period, attempt.id), { ctx: { index: idxAll, prevAttempt, profile } });
    } catch (e) {
      (context.log.warn || context.log)("kt-submit advice", e && e.message);
      advice = advicelib.rulesAdvice(advicelib.facts(attempt, settings, null));
    }
    attempt.advice = advice;

    let mailOk = false;
    try {
      await resultmail.send(attempt, settings, advice);
      mailOk = true;
    } catch (e) {
      context.log.error("kt-submit mail", e && e.message);
    }
    // Ghi lại việc gửi email có thành công không, để giao diện báo đúng sự thật (không luôn nói "đã gửi").
    try {
      attempt.mailOk = mailOk;
      await quiz.putAttempt(attempt);
      await quiz.upsertIndex({
        id: attempt.id, code: attempt.code, name: attempt.name, email: attempt.email, manager: attempt.manager || "", period: attempt.period || "",
        score: correct, total, pct, passed, scoreOutOf10: attempt.scoreOutOf10, compliancePoints: compliance,
        submittedAt: attempt.submittedAt, status: "submitted", auto: !!auto, practice: !!settings.practice, flags: attempt.flags || null, startedAt: attempt.startedAt, wrong: attempt.wrong, blank: attempt.blank, proof: quiz.proofCode(attempt.id), durationSec: Math.round((attempt.submittedAt - (attempt.startedAt || attempt.submittedAt)) / 1000), device: devBrief, face: attempt.faceCheck ? attempt.faceCheck.status : null, mailOk, aiStatus: (advice && advice.aiStatus) || null
      });
    } catch (e) {
      context.log.error("kt-submit mailOk", e && e.message);
    }

    return { attempt, correct, total, pct, passed, compliance, mailOk, advice, settings, devBrief };
  }
}

const SWEEP_GRACE_MS = 60 * 1000; // chờ thêm 1 phút sau hạn để không tranh với chính thí sinh đang nộp
// Hạn chót của cả bài: câu hiện tại + các câu còn lại, mỗi câu secondsPerQuestion giây.
function deadlineOf(a) {
  const n = (a.questionIds || []).length, S = (a.secondsPerQuestion || 0) * 1000;
  if (typeof a.cursor !== "number") return (a.startedAt || 0) + n * S + quiz.GRACE_MS;
  return (a.qStartedAt || a.startedAt || 0) + Math.max(0, n - a.cursor) * S + quiz.GRACE_MS;
}
function isOverdue(a, now) { return !!a && a.status === "in_progress" && now > deadlineOf(a) + SWEEP_GRACE_MS; }

// Quét các bài đang làm dở đã quá hạn và thu bài. period rỗng = mọi đề. Trả về số bài đã thu.
async function sweepOverdue(context, opts) {
  opts = opts || {};
  const now = Date.now(), max = opts.max || 20;
  let n = 0;
  const names = await require("./store").list("kt/active/");
  for (const name of names) {
    if (n >= max) break;
    try {
      const p = await require("./store").get(name);
      const a = p && p.attemptId ? await quiz.getAttempt(p.attemptId) : null;
      if (!a || !isOverdue(a, now)) continue;
      if (opts.period != null && (a.period || "") !== opts.period) continue;
      await finalizeAttempt(context, a, { auto: true });
      n++;
    } catch (e) { (context.log.warn || context.log)("sweepOverdue", name, e && e.message); }
  }
  return n;
}

module.exports = { finalizeAttempt, sweepOverdue, isOverdue, deadlineOf };
