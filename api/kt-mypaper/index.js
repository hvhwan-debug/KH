// Công khai nhưng có kiểm soát: thí sinh xem lại ĐÚNG đề mình đã làm, từ link/QR trên thẻ kết quả.
// Hai lớp bảo vệ: (1) phải đúng mã nhân viên + email của chính bài làm đó, (2) đề chỉ xem lại được
// SAU KHI đã đóng (có "Thời gian đóng" và đã qua) - tránh lộ đề/đáp án cho người khác khi kỳ thi còn mở.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return reply(context, 405, { ok: false, error: "Phương thức không hợp lệ." });
    if (!requireAjax(context, req)) return;
    if (quiz.tooManyFails(req, 8, 10 * 60 * 1000)) {
      return reply(context, 429, { ok: false, error: "Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại." });
    }
    const b = req.body || {};
    const id = quiz.checkVerifyToken(b.t);
    const attempt = id ? await quiz.getAttempt(id) : null;
    if (!attempt || attempt.status !== "submitted") { quiz.noteFail(req); return reply(context, 404, { ok: false, error: "Không tìm thấy kết quả. Mã QR không hợp lệ." }); }

    const code = quiz.normCode(b.code), email = quiz.normEmail(b.email);
    if (!code || !email || quiz.normCode(attempt.code) !== code || quiz.normEmail(attempt.email) !== email) {
      quiz.noteFail(req);
      return reply(context, 403, { ok: false, error: "Mã nhân viên hoặc email không khớp với bài làm này." });
    }

    const settings = await quiz.getExamSettings(attempt.period || "");
    if (!settings.closeAt || Date.now() <= settings.closeAt) {
      return reply(context, 403, { ok: false, error: "Đề chỉ xem lại được sau khi bài kiểm tra đã kết thúc" + (settings.closeAt ? " (dự kiến " + quiz.fmtVN(settings.closeAt) + ")" : "") + "." });
    }
    if (!Array.isArray(attempt.paper) || !attempt.paper.length) {
      return reply(context, 404, { ok: false, error: "Bài làm này chưa có bản lưu đề để xem lại." });
    }

    return reply(context, 200, {
      ok: true,
      title: attempt.examTitle || settings.examTitle || "Bài kiểm tra",
      name: attempt.name || "", code: attempt.code || "",
      score: attempt.score, total: attempt.total, pct: attempt.pct,
      paper: attempt.paper.map((q) => ({ n: q.n, text: q.text, category: q.category, options: q.options, chosen: q.chosen, correct: q.correct, chosenList: q.chosenList, correctList: q.correctList, ok: q.ok, answerText: q.answerText, chosenText: q.chosenText, type: q.type }))
    });
  } catch (e) {
    context.log.error("kt-mypaper", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
