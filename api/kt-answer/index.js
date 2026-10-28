// Công khai: ghi câu trả lời cho câu hiện tại và nhận câu kế tiếp.
// Idempotent: gửi trùng / gửi câu đã quá hạn không làm hỏng bài; máy chủ luôn trả về trạng thái đúng hiện tại.
const { reply: __reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");

module.exports = async function (context, req) {
  const reply = require("../_lib/entrylog").wrap(req, "answer", __reply); // lỗi / lần vào không được -> nhật ký
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return reply(context, 405, { ok: false, error: "Phương thức không hợp lệ." });
    if (!requireAjax(context, req)) return;
    const b = req.body || {};
    const attemptId = String(b.attemptId || "").trim();
    const questionId = String(b.questionId || "").trim();

    const attempt = await quiz.getAttempt(attemptId);
    if (!attempt) return reply(context, 404, { ok: false, error: "Không tìm thấy bài làm." });
    if (attempt.status !== "in_progress") return reply(context, 200, { ok: true, done: true, total: attempt.questionIds.length });
    if (attempt.questionIds.indexOf(questionId) === -1) return reply(context, 400, { ok: false, error: "Câu hỏi không thuộc bài làm này." });

    const now = Date.now();
    // Số lần có dấu hiệu chụp màn hình / rời khỏi trang bài thi (do trình duyệt báo lên; chỉ tăng, không giảm).
    if (b.flags && typeof b.flags === "object") {
      const cl = (v) => Math.max(0, Math.min(999, Number.isInteger(v) ? v : 0));
      const old = attempt.flags || { blur: 0, shot: 0 };
      attempt.flags = { blur: Math.max(old.blur || 0, cl(b.flags.blur)), shot: Math.max(old.shot || 0, cl(b.flags.shot)) };
    }
    quiz.syncAttempt(attempt, now); // câu quá hạn tự tính là bỏ trống, con trỏ nhảy tới câu hiện tại

    const byId = {};
    (await quiz.getQuestions()).forEach((q) => { byId[q.id] = q; });

    let accepted = false;
    if (attempt.cursor < attempt.questionIds.length && attempt.questionIds[attempt.cursor] === questionId) {
      const order = attempt.orders[questionId] || [];
      const type = quiz.qType(byId[questionId]);
      const rec = { answeredAt: now };
      if (type === "fill") {
        rec.text = typeof b.text === "string" ? b.text.slice(0, 200) : "";
        rec.answerIndex = -1;
      } else if (type === "multi") {
        const arr = Array.isArray(b.answerIndexes) ? b.answerIndexes : [];
        rec.answerIndexes = arr.filter((v, i) => Number.isInteger(v) && v >= 0 && v < order.length && arr.indexOf(v) === i).slice(0, 8);
        rec.answerIndex = rec.answerIndexes.length ? rec.answerIndexes[0] : -1;
      } else {
        rec.answerIndex = Number.isInteger(b.answerIndex) && b.answerIndex >= 0 && b.answerIndex < order.length ? b.answerIndex : -1;
      }
      attempt.answers[questionId] = rec;
      attempt.cursor++;
      attempt.qStartedAt = now;
      accepted = true;
    }
    const cs = quiz.clientState(attempt, byId, now);
    await quiz.putAttempt(attempt);
    return reply(context, 200, Object.assign({ ok: true, accepted }, cs.state));
  } catch (e) {
    context.log.error("kt-answer", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra." });
  }
};
