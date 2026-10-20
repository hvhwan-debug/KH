// Công khai: chốt bài khi đã hết câu hỏi (hoặc hết giờ), chấm điểm và gửi email kết quả.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");
const flow = require("../_lib/ktflow");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return reply(context, 405, { ok: false, error: "Phương thức không hợp lệ." });
    if (!requireAjax(context, req)) return;
    const b = req.body || {};
    let attempt = await quiz.getAttempt(String(b.attemptId || "").trim());
    if (!attempt || attempt.v !== 2) return reply(context, 404, { ok: false, error: "Không tìm thấy bài làm." });
    const settings = await quiz.getSettings();
    if (attempt.status === "in_progress") {
      quiz.advanceByTime(attempt, Date.now());
      if (attempt.idx < attempt.items.length) {
        await quiz.putAttempt(attempt);
        return reply(context, 409, { ok: false, error: "Bạn chưa làm hết các câu hỏi." });
      }
      attempt = await require("../_lib/ktflow").finalize(attempt, settings, context.log);
    }
    return reply(context, 200, Object.assign({ ok: true }, flow.publicResult(attempt, settings), { mailSent: attempt.mail ? !!attempt.mail.sent : null }));
  } catch (e) {
    context.log.error("kt-submit", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra." });
  }
};
