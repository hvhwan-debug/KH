// Công khai, không cần đăng nhập: thông tin hiển thị ngay khi thí sinh mở link bài kiểm tra (trước khi nhập mã).
// CHỈ trả tên đề, khung giờ mở/đóng, cờ thi thử, giờ máy chủ và tên các tài liệu ôn tập gắn với đề. KHÔNG trả danh sách mã nhân viên, nhóm thí sinh hay cấu trúc đề.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (!requireAjax(context, req)) return;
    const defaultSettings = await quiz.getSettings();
    const examId = String((req.query && req.query.exam) || "").trim();
    if (!examId) return reply(context, 400, { ok: false, needExam: true, error: "Vui lòng nhập mã đề thi hoặc mở đường link của đề.", serverNow: Date.now() });
    if (!(await quiz.examKnown(examId, defaultSettings))) {
      return reply(context, 404, { ok: false, error: "Không tìm thấy đề thi này. Hãy kiểm tra lại đường link hoặc liên hệ quản trị viên.", serverNow: Date.now() });
    }
    const s = await quiz.getExamSettings(examId);
    // Tài liệu ôn tập quản trị viên đã gắn vào đề này (chỉ tiêu đề + loại; mở xem vẫn qua trang Học liệu)
    let materials = [];
    try {
      const d = await require("../_lib/hoclieu").load();
      materials = d.items.filter((x) => x.status !== "draft" && (x.exams || []).indexOf(examId) >= 0)
        .map((x) => ({ id: x.id, title: x.title, type: x.type, dur: x.dur || 0, pages: x.pages || 0 })).slice(0, 12);
    } catch (e) { /* không có học liệu: bỏ qua */ }
    return reply(context, 200, {
      ok: true,
      exam: { id: examId, title: s.examTitle, practice: !!s.practice, openAt: s.openAt || 0, closeAt: s.closeAt || 0, materials },
      serverNow: Date.now()
    });
  } catch (e) {
    context.log.error(e);
    return reply(context, 500, { ok: false, error: "Lỗi máy chủ." });
  }
};
