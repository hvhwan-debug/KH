// Công khai, không cần đăng nhập: thông tin hiển thị ngay khi thí sinh mở link bài kiểm tra (trước khi nhập mã).
// CHỈ trả tên đề, khung giờ mở/đóng, cờ thi thử và giờ máy chủ. KHÔNG trả danh sách mã nhân viên, nhóm thí sinh hay cấu trúc đề.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (!requireAjax(context, req)) return;
    const defaultSettings = await quiz.getSettings();
    const examId = String((req.query && req.query.exam) || defaultSettings.examPeriod || "");
    if (!(await quiz.examKnown(examId, defaultSettings))) {
      return reply(context, 404, { ok: false, error: "Không tìm thấy đề thi này. Hãy kiểm tra lại đường link hoặc liên hệ quản trị viên.", serverNow: Date.now() });
    }
    const s = await quiz.getExamSettings(examId);
    return reply(context, 200, {
      ok: true,
      exam: { id: examId, title: s.examTitle, practice: !!s.practice, openAt: s.openAt || 0, closeAt: s.closeAt || 0 },
      serverNow: Date.now()
    });
  } catch (e) {
    context.log.error(e);
    return reply(context, 500, { ok: false, error: "Lỗi máy chủ." });
  }
};
