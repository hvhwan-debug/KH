// Công khai: chấm điểm bài làm và gửi email kết quả tự động cho thí sinh.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");
const device = require("../_lib/device");
const resultmail = require("../_lib/resultmail");
const advicelib = require("../_lib/advice");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return reply(context, 405, { ok: false, error: "Phương thức không hợp lệ." });
    if (!requireAjax(context, req)) return;
    const b = req.body || {};
    const attemptId = String(b.attemptId || "").trim();

    const attempt = await quiz.getAttempt(attemptId);
    if (!attempt) return reply(context, 404, { ok: false, error: "Không tìm thấy bài làm." });
    if (attempt.status === "submitted") {
      const st = await quiz.getExamSettings(attempt.period || "");
      return reply(context, 200, {
        ok: true, score: attempt.score, total: attempt.total, pct: attempt.pct, passed: quiz.passState(attempt.pct, st),
        compliancePoints: attempt.compliancePoints, already: true, mailOk: attempt.mailOk, advice: attempt.advice || advicelib.rulesAdvice(advicelib.facts(attempt, st, null)),
        passScore: quiz.passScoreOf(st), submittedAt: attempt.submittedAt, serverNow: Date.now(),
        startedAt: attempt.startedAt, wrong: attempt.wrong, blank: attempt.blank, proof: quiz.proofCode(attempt.id), verify: quiz.verifyToken(attempt.id),
        durationSec: Math.round(((attempt.submittedAt || 0) - (attempt.startedAt || 0)) / 1000)
      });
    }

    quiz.syncAttempt(attempt, Date.now()); // câu quá hạn chưa trả lời tính là bỏ trống

    const allQuestions = await quiz.getQuestions();
    const byId = {};
    allQuestions.forEach((q) => { byId[q.id] = q; });

    const settings = await quiz.getExamSettings(attempt.period || "");
    const sc = quiz.scoreAttempt(attempt, byId, settings);
    const correct = sc.correct, wrongN = sc.wrongN, total = sc.total, pct = sc.pct, passed = sc.passed, compliance = sc.compliance;
    const scoreOutOf10 = sc.scoreOutOf10;

    try { device.record(attempt, device.capture(req, b.device, "submit")); } catch (e) { (context.log.warn || context.log)("kt-submit device", e && e.message); }
    const devBrief = device.brief(attempt);
    attempt.status = "submitted";
    attempt.submittedAt = Date.now();
    attempt.score = correct;
    attempt.total = total;
    attempt.pct = pct;
    attempt.passed = passed;
    attempt.practice = !!settings.practice;
    attempt.scoreOutOf10 = scoreOutOf10;
    attempt.compliancePoints = compliance;
    attempt.paper = quiz.buildPaper(attempt, byId); // bản sao bài làm có cấu trúc, dùng để quản lí xem lại
    attempt.wrong = wrongN;
    attempt.blank = sc.blank;
    await quiz.putAttempt(attempt);

    await quiz.upsertIndex({
      id: attempt.id, code: attempt.code, name: attempt.name, email: attempt.email, manager: attempt.manager || "", period: attempt.period || "",
      score: correct, total, pct, passed, scoreOutOf10: attempt.scoreOutOf10, compliancePoints: compliance,
      submittedAt: attempt.submittedAt, status: "submitted", practice: !!settings.practice, flags: attempt.flags || null, startedAt: attempt.startedAt, wrong: attempt.wrong, blank: attempt.blank, proof: quiz.proofCode(attempt.id), durationSec: Math.round((attempt.submittedAt - (attempt.startedAt || attempt.submittedAt)) / 1000), device: devBrief, face: attempt.faceCheck ? attempt.faceCheck.status : null
    });

    // Lời khuyên cải thiện (AI nếu kịp, không thì theo luật). Điểm đã được lưu ở trên nên lỗi ở bước này không ảnh hưởng kết quả.
    let advice;
    try {
      advice = await advicelib.build(attempt, settings, quiz.previousResult(await quiz.getIndex(), attempt.code, attempt.period, attempt.id));
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
        submittedAt: attempt.submittedAt, status: "submitted", practice: !!settings.practice, flags: attempt.flags || null, startedAt: attempt.startedAt, wrong: attempt.wrong, blank: attempt.blank, proof: quiz.proofCode(attempt.id), durationSec: Math.round((attempt.submittedAt - (attempt.startedAt || attempt.submittedAt)) / 1000), device: devBrief, face: attempt.faceCheck ? attempt.faceCheck.status : null, mailOk
      });
    } catch (e) {
      context.log.error("kt-submit mailOk", e && e.message);
    }

    return reply(context, 200, {
      ok: true, score: correct, total, pct, passed, compliancePoints: compliance, mailOk, advice,
      passScore: quiz.passScoreOf(settings), submittedAt: attempt.submittedAt, serverNow: Date.now(),
      startedAt: attempt.startedAt, wrong: attempt.wrong, blank: attempt.blank, proof: quiz.proofCode(attempt.id), verify: quiz.verifyToken(attempt.id),
      durationSec: Math.round((attempt.submittedAt - (attempt.startedAt || attempt.submittedAt)) / 1000)
    });
  } catch (e) {
    context.log.error("kt-submit", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra." });
  }
};
