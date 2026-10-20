// Công khai: ghi câu trả lời cho câu hiện tại và nhận câu kế tiếp. Máy chủ tự tính giờ từng câu.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return reply(context, 405, { ok: false, error: "Phương thức không hợp lệ." });
    if (!requireAjax(context, req)) return;
    const b = req.body || {};
    const attempt = await quiz.getAttempt(String(b.attemptId || "").trim());
    if (!attempt || attempt.v !== 2) return reply(context, 404, { ok: false, error: "Không tìm thấy bài làm." });
    if (attempt.status !== "in_progress") return reply(context, 409, { ok: false, finished: true, error: "Bài làm đã kết thúc." });

    const settings = await quiz.getSettings();
    const now = Date.now();
    quiz.advanceByTime(attempt, now); // câu quá hạn tự tính là bỏ trống
    const total = attempt.items.length;

    if (attempt.idx < total) {
      const cur = attempt.items[attempt.idx];
      if (String(b.questionId || "") !== cur.id) {
        // Máy khách lệch trạng thái (câu đã quá hạn hoặc mở 2 tab): đồng bộ lại thay vì ghi nhầm.
        await quiz.putAttempt(attempt);
        return reply(context, 200, Object.assign({ ok: true, synced: true }, quiz.stateFor(attempt, settings, now)));
      }
      const ai = Number.isInteger(b.answerIndex) && b.answerIndex >= 0 && b.answerIndex < cur.options.length ? b.answerIndex : -1;
      attempt.answers[cur.id] = ai >= 0 ? { a: ai, at: now } : { a: -1, timeout: true, at: now };
      attempt.idx++;
      attempt.qStartedAt = now;
    }
    await quiz.putAttempt(attempt);
    return reply(context, 200, Object.assign({ ok: true }, quiz.stateFor(attempt, settings, now)));
  } catch (e) {
    context.log.error("kt-answer", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra." });
  }
};
