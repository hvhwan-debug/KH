// Công khai, không cần đăng nhập: thí sinh nhập mã nhân viên + email để đối chiếu trước khi vào bài.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");
const flow = require("../_lib/ktflow");

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
    if (!found) return reply(context, 404, { ok: false, error: "Không tìm thấy thông tin khớp với mã nhân viên và email đã nhập. Kiểm tra lại hoặc liên hệ quản trị viên." });

    const settings = await quiz.getSettings();
    const cand = { code: found.code, name: found.name, email: found.email, manager: found.manager || "" };
    const base = { ok: true, candidate: cand, examTitle: settings.examTitle, secondsPerQuestion: settings.secondsPerQuestion };

    // Đã có bài làm?
    const ptr = await quiz.getPointer(code);
    let att = ptr ? await quiz.getAttempt(ptr.attemptId) : null;
    if (att && att.status === "in_progress") {
      quiz.advanceByTime(att, Date.now());
      if (att.idx >= att.items.length) att = await flow.finalize(att, settings, context.log); else await quiz.putAttempt(att);
    }
    if (att && att.status === "in_progress") {
      return reply(context, 200, Object.assign(base, { state: "resume", progress: { answered: att.idx, total: att.items.length } }));
    }
    if (!settings.allowRetake) {
      if (att && att.status === "submitted") return reply(context, 200, Object.assign(base, { state: "done", alreadyDone: true, result: flow.publicResult(att, null) }));
      if (!att) {
        const old = await quiz.findLegacySubmitted(code);
        if (old) return reply(context, 200, Object.assign(base, { state: "done", alreadyDone: true, result: { score: old.score, total: old.total, pct: old.pct, passed: old.passed, compliancePoints: old.compliancePoints } }));
      }
    }
    const gate = quiz.examGate(settings, Date.now());
    if (gate) return reply(context, 200, Object.assign(base, { state: "closed", message: gate }));
    return reply(context, 200, Object.assign(base, { state: "ready" }));
  } catch (e) {
    context.log.error("kt-check", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
