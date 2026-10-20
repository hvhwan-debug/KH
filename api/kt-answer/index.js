// Công khai: ghi lại câu trả lời cho một câu hỏi trong bài làm đang diễn ra.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return reply(context, 405, { ok: false, error: "Phương thức không hợp lệ." });
    if (!requireAjax(context, req)) return;
    const b = req.body || {};
    const attemptId = String(b.attemptId || "").trim();
    const questionId = String(b.questionId || "").trim();
    const answerIndex = Number.isInteger(b.answerIndex) ? b.answerIndex : -1;

    const attempt = await quiz.getAttempt(attemptId);
    if (!attempt) return reply(context, 404, { ok: false, error: "Không tìm thấy bài làm." });
    if (attempt.status !== "in_progress") return reply(context, 409, { ok: false, error: "Bài làm đã kết thúc." });
    if (attempt.questionIds.indexOf(questionId) === -1) return reply(context, 400, { ok: false, error: "Câu hỏi không thuộc bài làm này." });
    if (Date.now() > attempt.deadlineAt) return reply(context, 409, { ok: false, error: "Đã hết thời gian làm bài." });

    attempt.answers[questionId] = { answerIndex, answeredAt: Date.now() };
    await quiz.putAttempt(attempt);
    return reply(context, 200, { ok: true });
  } catch (e) {
    context.log.error("kt-answer", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra." });
  }
};
