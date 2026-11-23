// Công khai: tải lại "phiếu xác nhận" (thẻ kết quả PNG) của MỘT bài đã nộp, dùng đúng mã xác thực (?t=...) in trên
// thẻ/QR — giống hệt thẻ thí sinh thấy ngay sau khi nộp bài (kiemtra/index.html) và thẻ đính kèm trong email kết quả.
// Dùng khi thí sinh đã rời trang kết quả (ví dụ mở lại từ "Lịch sử làm bài") và muốn lấy lại ảnh thẻ đó.
const { guardConfigured } = require("../_lib/http");
const quiz = require("../_lib/quiz");
const sharecard = require("../_lib/sharecard");

function baseReply(context, status, body) {
  context.res = { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, body };
}

module.exports = async function (context, req) {
  const reply = require("../_lib/entrylog").wrap(req, "card", baseReply);
  try {
    if (guardConfigured(context)) return;
    if (quiz.tooManyFails(req, 20, 10 * 60 * 1000)) {
      return reply(context, 429, { ok: false, error: "Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại." });
    }
    const id = quiz.checkVerifyToken(req.query && req.query.t);
    const attempt = id ? await quiz.getAttempt(id) : null;
    if (!attempt || attempt.status !== "submitted") {
      quiz.noteFail(req);
      return reply(context, 404, { ok: false, error: "Không tìm thấy kết quả. Liên kết không hợp lệ hoặc đã bị chỉnh sửa." });
    }
    const settings = await quiz.getExamSettings(attempt.period || "");
    let png;
    try { png = await sharecard.renderPng(attempt, settings); }
    catch (e) { context.log.error("kt-card render", e && e.message); return reply(context, 500, { ok: false, error: "Không dựng được phiếu xác nhận, thử lại sau." }); }
    context.res = {
      status: 200, isRaw: true,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'attachment; filename="' + sharecard.fileName(attempt) + '"',
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff"
      },
      body: png
    };
  } catch (e) {
    context.log.error("kt-card", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
