// Công khai nhưng có kiểm soát: thí sinh xem lại ĐÚNG đề mình đã làm, từ link/QR trên thẻ kết quả.
// Hai lớp bảo vệ: (1) phải đúng mã nhân viên + email của chính bài làm đó, (2) đề chỉ xem lại được
// SAU KHI đã đóng (có "Thời gian đóng" và đã qua) - tránh lộ đề/đáp án cho người khác khi kỳ thi còn mở.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");
const { cleanText, cleanList } = require("../_lib/cleantext");
const { userFromReq } = require("../_lib/session");
const { isAdmin } = require("../_lib/config");
const auditlog = require("../_lib/auditlog");
const device = require("../_lib/device");

// Quản trị viên đang đăng nhập (cookie phiên) được xem mọi bài mà không cần mã NV + email của chủ bài.
function adminOf(req) {
  try { const u = userFromReq(req); return u && u.email && isAdmin(u.email) ? u : null; } catch (e) { return null; }
}

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return reply(context, 405, { ok: false, error: "Phương thức không hợp lệ." });
    if (!requireAjax(context, req)) return;
    if (quiz.tooManyFails(req, 8, 10 * 60 * 1000)) {
      return reply(context, 429, { ok: false, error: "Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại." });
    }
    const b = req.body || {};
    const adminU = adminOf(req);
    if (b.probe) return reply(context, 200, { ok: true, admin: !!adminU }); // trang kết quả hỏi: có phải quản trị viên không
    const id = quiz.checkVerifyToken(b.t);
    const attempt = id ? await quiz.getAttempt(id) : null;
    if (!attempt || attempt.status !== "submitted") { quiz.noteFail(req); return reply(context, 404, { ok: false, error: "Không tìm thấy kết quả. Mã QR không hợp lệ." }); }

    const code = quiz.normCode(b.code), email = quiz.normEmail(b.email);
    const master = !!(adminU && b.admin === true);
    if (!master && (!code || !email || quiz.normCode(attempt.code) !== code || quiz.normEmail(attempt.email) !== email)) {
      quiz.noteFail(req);
      return reply(context, 403, { ok: false, error: "Mã nhân viên hoặc email không khớp với bài làm này." });
    }

    const settings = await quiz.getExamSettings(attempt.period || "");
    if (!master && (!settings.closeAt || Date.now() <= settings.closeAt)) {
      return reply(context, 403, { ok: false, error: "Đề chỉ xem lại được sau khi bài kiểm tra đã kết thúc" + (settings.closeAt ? " (dự kiến " + quiz.fmtVN(settings.closeAt) + ")" : "") + "." });
    }
    let paper = Array.isArray(attempt.paper) ? attempt.paper : [];
    if (master && !paper.length) { // bài cũ chưa có bản lưu đề: dựng lại từ ngân hàng câu hỏi hiện tại
      try { const byId = {}; (await quiz.getQuestions()).forEach((q) => { byId[q.id] = q; }); paper = quiz.buildPaper(attempt, byId) || []; } catch (e) { paper = []; }
    }
    if (!paper.length) {
      return reply(context, 404, { ok: false, error: "Bài làm này chưa có bản lưu đề để xem lại." });
    }

    if (master) {
      await auditlog.write({ area: "admin", role: "admin", by: String(adminU.email).toLowerCase(), name: adminU.name || "", op: "viewPaper", label: "Xem đề như thí sinh", kind: "read", status: 200, ok: true,
        details: { code: attempt.code, name: attempt.name, attempt: attempt.id }, ip: device.ipOf(req) });
    }
    return reply(context, 200, {
      ok: true,
      title: attempt.examTitle || settings.examTitle || "Bài kiểm tra",
      name: attempt.name || "", code: attempt.code || "",
      score: attempt.score, total: attempt.total, pct: attempt.pct,
      paper: paper.map((q) => ({ n: q.n, text: cleanText(q.text), category: q.category, options: cleanList(q.options), chosen: q.chosen, correct: q.correct, chosenList: q.chosenList, correctList: q.correctList, ok: q.ok, answerText: cleanText(q.answerText), chosenText: cleanText(q.chosenText), type: q.type }))
    });
  } catch (e) {
    context.log.error("kt-mypaper", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
