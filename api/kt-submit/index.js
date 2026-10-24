// Công khai: chấm điểm bài làm và gửi email kết quả tự động cho thí sinh.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");
const device = require("../_lib/device");
const resultmail = require("../_lib/resultmail");
const advicelib = require("../_lib/advice");
const finalize = require("../_lib/finalize");

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
        compliancePoints: attempt.compliancePoints, already: true, mailOk: attempt.mailOk, advice: advicelib.ensureAnalysis(attempt.advice || advicelib.rulesAdvice(advicelib.facts(attempt, st, null)), attempt, st, null),
        passScore: quiz.passScoreOf(st), submittedAt: attempt.submittedAt, serverNow: Date.now(),
        startedAt: attempt.startedAt, wrong: attempt.wrong, blank: attempt.blank, proof: quiz.proofCode(attempt.id), verify: quiz.verifyToken(attempt.id),
        durationSec: Math.round(((attempt.submittedAt || 0) - (attempt.startedAt || 0)) / 1000),
        attempts: quiz.attemptsSummary(await quiz.getIndex(), attempt.code, attempt.period || "", st, attempt.id)
      });
    }

    const f = await finalize.finalizeAttempt(context, attempt, { req, deviceHint: b.device });
    const correct = f.correct, total = f.total, pct = f.pct, passed = f.passed, compliance = f.compliance, mailOk = f.mailOk, advice = f.advice, settings = f.settings;

    return reply(context, 200, {
      ok: true, score: correct, total, pct, passed, compliancePoints: compliance, mailOk, advice,
      passScore: quiz.passScoreOf(settings), submittedAt: attempt.submittedAt, serverNow: Date.now(),
      startedAt: attempt.startedAt, wrong: attempt.wrong, blank: attempt.blank, proof: quiz.proofCode(attempt.id), verify: quiz.verifyToken(attempt.id),
      durationSec: Math.round((attempt.submittedAt - (attempt.startedAt || attempt.submittedAt)) / 1000),
      attempts: await (async () => { try { return quiz.attemptsSummary(await quiz.getIndex(), attempt.code, attempt.period || "", settings, attempt.id); } catch (e) { return null; } })()
    });
  } catch (e) {
    context.log.error("kt-submit", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra." });
  }
};
