// Công khai, không cần đăng nhập: thí sinh nhập mã nhân viên + email để vào bài kiểm tra.
// Trả về: thông tin thí sinh, thể lệ bài thi, và trạng thái (chưa làm / đang làm dở / đã hoàn thành).
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
    const code = quiz.normCode(b.code);
    const email = quiz.normEmail(b.email);
    if (!code || !email) return reply(context, 400, { ok: false, error: "Nhập đầy đủ mã nhân viên và email." });

    const candidates = await quiz.getCandidates();
    const found = candidates.find((c) => quiz.normCode(c.code) === code && quiz.normEmail(c.email) === email);
    if (!found) {
      quiz.noteFail(req);
      return reply(context, 404, { ok: false, error: "Không tìm thấy thông tin khớp với mã nhân viên và email đã nhập. Kiểm tra lại hoặc liên hệ quản trị viên." });
    }

    const settings = await quiz.getSettings();
    const candidate = { code: found.code, name: found.name, email: found.email, manager: found.manager || "" };
    const exam = {
      title: settings.examTitle,
      shareTitle: String(settings.shareTitle || "").trim() || settings.examTitle,
      questionCount: settings.questionCount,
      secondsPerQuestion: Math.max(10, settings.secondsPerQuestion || 60),
      passScore: quiz.passScoreOf(settings)
    };

    if (!settings.allowRetake) {
      const idx = await quiz.getIndex();
      const prior = idx.find((a) => quiz.normCode(a.code) === code && a.status === "submitted");
      if (prior) {
        return reply(context, 200, {
          ok: true, candidate, exam, alreadyDone: true,
          result: {
            score: prior.score, total: prior.total, pct: prior.pct, passed: quiz.passState(prior.pct, settings),
            compliancePoints: prior.compliancePoints, submittedAt: prior.submittedAt,
            mailOk: prior.mailOk, passScore: exam.passScore, durationSec: prior.durationSec,
            startedAt: prior.startedAt, wrong: prior.wrong, blank: prior.blank, proof: quiz.proofCode(prior.id), verify: quiz.verifyToken(prior.id)
          },
          serverNow: Date.now()
        });
      }
    }

    // Bài làm đang dở: cho phép làm tiếp (thời gian vẫn tính theo máy chủ).
    let inProgress = null;
    const active = await quiz.getActive(found.code);
    if (active) {
      quiz.syncAttempt(active, Date.now());
      inProgress = { answered: Math.min(active.cursor, active.questionIds.length), total: active.questionIds.length };
    }
    return reply(context, 200, { ok: true, candidate, exam, inProgress, examTitle: settings.examTitle, serverNow: Date.now() });
  } catch (e) {
    context.log.error("kt-check", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
