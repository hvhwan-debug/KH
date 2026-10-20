// Công khai, không cần đăng nhập: thí sinh nhập họ tên/mã nhân viên/email để vào bài kiểm tra.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return reply(context, 405, { ok: false, error: "Phương thức không hợp lệ." });
    if (!requireAjax(context, req)) return;
    const b = req.body || {};
    const code = quiz.normCode(b.code);
    const email = quiz.normEmail(b.email);
    if (!code || !email) return reply(context, 400, { ok: false, error: "Nhập đầy đủ mã nhân viên và email." });

    const candidates = await quiz.getCandidates();
    const found = candidates.find((c) => quiz.normCode(c.code) === code && quiz.normEmail(c.email) === email);
    if (!found) {
      return reply(context, 404, { ok: false, error: "Không tìm thấy thông tin khớp với mã nhân viên và email đã nhập. Kiểm tra lại hoặc liên hệ quản trị viên." });
    }

    const settings = await quiz.getSettings();
    if (!settings.allowRetake) {
      const idx = await quiz.getIndex();
      const prior = idx.find((a) => quiz.normCode(a.code) === code && a.status === "submitted");
      if (prior) {
        return reply(context, 200, {
          ok: true,
          candidate: { code: found.code, name: found.name, email: found.email, manager: found.manager || "" },
          alreadyDone: true,
          result: { score: prior.score, total: prior.total, pct: prior.pct, passed: prior.passed, compliancePoints: prior.compliancePoints }
        });
      }
    }
    return reply(context, 200, {
      ok: true,
      candidate: { code: found.code, name: found.name, email: found.email, manager: found.manager || "" },
      examTitle: settings.examTitle
    });
  } catch (e) {
    context.log.error("kt-check", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
