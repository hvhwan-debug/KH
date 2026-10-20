// Công khai: xem kết quả đã xác thực bằng mã trong QR trên thẻ kết quả.
// Chỉ trả những thông tin có sẵn trên thẻ (không có email, không có đáp án từng câu).
const { reply, guardConfigured } = require("../_lib/http");
const quiz = require("../_lib/quiz");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (quiz.tooManyFails(req, 20, 10 * 60 * 1000)) {
      return reply(context, 429, { ok: false, error: "Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại." });
    }
    const id = quiz.checkVerifyToken(req.query && req.query.t);
    const attempt = id ? await quiz.getAttempt(id) : null;
    if (!attempt || attempt.status !== "submitted") {
      quiz.noteFail(req);
      return reply(context, 404, { ok: false, error: "Không tìm thấy kết quả. Mã QR không hợp lệ hoặc đã bị chỉnh sửa." });
    }
    const settings = await quiz.getSettings();
    return reply(context, 200, {
      ok: true, serverNow: Date.now(),
      result: {
        title: settings.examTitle || "Bài kiểm tra",
        name: attempt.name || "", code: attempt.code || "",
        score: attempt.score, total: attempt.total, pct: attempt.pct, passed: quiz.passState(attempt.pct, settings),
        compliancePoints: attempt.compliancePoints, passScore: quiz.passScoreOf(settings),
        wrong: attempt.wrong, blank: attempt.blank,
        startedAt: attempt.startedAt, submittedAt: attempt.submittedAt,
        durationSec: Math.round(((attempt.submittedAt || 0) - (attempt.startedAt || attempt.submittedAt || 0)) / 1000),
        proof: quiz.proofCode(attempt.id)
      }
    });
  } catch (e) {
    context.log.error("kt-verify", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
