// Công khai: ghi câu trả lời cho câu hiện tại và nhận câu kế tiếp.
// Idempotent: gửi trùng / gửi câu đã quá hạn không làm hỏng bài; máy chủ luôn trả về trạng thái đúng hiện tại.
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

    const attempt = await quiz.getAttempt(attemptId);
    if (!attempt) return reply(context, 404, { ok: false, error: "Không tìm thấy bài làm." });
    if (attempt.status !== "in_progress") return reply(context, 200, { ok: true, done: true, total: attempt.questionIds.length });
    if (attempt.questionIds.indexOf(questionId) === -1) return reply(context, 400, { ok: false, error: "Câu hỏi không thuộc bài làm này." });

    const now = Date.now();
    quiz.syncAttempt(attempt, now); // câu quá hạn tự tính là bỏ trống, con trỏ nhảy tới câu hiện tại

    let accepted = false;
    if (attempt.cursor < attempt.questionIds.length && attempt.questionIds[attempt.cursor] === questionId) {
      const order = attempt.orders[questionId] || [];
      const ai = Number.isInteger(b.answerIndex) && b.answerIndex >= 0 && b.answerIndex < order.length ? b.answerIndex : -1;
      attempt.answers[questionId] = { answerIndex: ai, answeredAt: now };
      attempt.cursor++;
      attempt.qStartedAt = now;
      accepted = true;
    }

    const byId = {};
    (await quiz.getQuestions()).forEach((q) => { byId[q.id] = q; });
    const cs = quiz.clientState(attempt, byId, now);
    await quiz.putAttempt(attempt);
    return reply(context, 200, Object.assign({ ok: true, accepted }, cs.state));
  } catch (e) {
    context.log.error("kt-answer", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra." });
  }
};
