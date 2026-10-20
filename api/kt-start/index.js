// Công khai: bắt đầu bài làm mới hoặc làm tiếp bài đang dở. Đề được chụp tại máy chủ, phát từng câu một.
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
    if (!code || !email) return reply(context, 400, { ok: false, error: "Thiếu thông tin thí sinh." });

    const candidates = await quiz.getCandidates();
    const found = candidates.find((c) => quiz.normCode(c.code) === code && quiz.normEmail(c.email) === email);
    if (!found) return reply(context, 404, { ok: false, error: "Không tìm thấy thí sinh." });

    const settings = await quiz.getSettings();
    const now = Date.now();

    // Làm tiếp bài đang dở (tải lại trang, mất mạng...): thời gian vẫn trôi, không được đổi đề.
    const ptr = await quiz.getPointer(code);
    let att = ptr ? await quiz.getAttempt(ptr.attemptId) : null;
    if (att && att.status === "in_progress") {
      quiz.advanceByTime(att, now);
      if (att.idx >= att.items.length) {
        att = await flow.finalize(att, settings, context.log);
        return reply(context, 409, { ok: false, finished: true, error: "Thời gian làm bài đã kết thúc, bài của bạn đã được chấm.", result: flow.publicResult(att, null) });
      }
      await quiz.putAttempt(att);
      return reply(context, 200, Object.assign({ ok: true, attemptId: att.id, resumed: true }, quiz.stateFor(att, settings, now)));
    }
    if (!settings.allowRetake) {
      const done = (att && att.status === "submitted") || (!att && (await quiz.findLegacySubmitted(code)));
      if (done) return reply(context, 409, { ok: false, error: "Bạn đã hoàn thành bài kiểm tra này rồi." });
    }
    const gate = quiz.examGate(settings, now);
    if (gate) return reply(context, 403, { ok: false, error: gate });

    const segment = quiz.normSegment(found.segment);
    const sel = quiz.pickQuestions(await quiz.getQuestions(), segment, settings);
    if (sel.error) return reply(context, 503, { ok: false, error: sel.error });

    const attempt = quiz.newAttempt(found, segment, sel.picked, settings, now);
    await quiz.putAttempt(attempt);
    await quiz.putPointer(code, attempt.id);
    await quiz.putIndex(attempt);
    return reply(context, 200, Object.assign({ ok: true, attemptId: attempt.id, resumed: false }, quiz.stateFor(attempt, settings, now)));
  } catch (e) {
    context.log.error("kt-start", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
