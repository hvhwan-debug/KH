// Công khai: chấm điểm bài làm và gửi email kết quả tự động cho thí sinh.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");
const resultmail = require("../_lib/resultmail");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return reply(context, 405, { ok: false, error: "Phương thức không hợp lệ." });
    if (!requireAjax(context, req)) return;
    const b = req.body || {};
    const attemptId = String(b.attemptId || "").trim();

    const attempt = await quiz.getAttempt(attemptId);
    if (!attempt) return reply(context, 404, { ok: false, error: "Không tìm thấy bài làm." });
    if (attempt.status === "submitted") {
      const st = await quiz.getSettings();
      return reply(context, 200, {
        ok: true, score: attempt.score, total: attempt.total, pct: attempt.pct, passed: attempt.passed,
        compliancePoints: attempt.compliancePoints, already: true, mailOk: attempt.mailOk,
        passScore: st.passScore || 0, submittedAt: attempt.submittedAt, serverNow: Date.now(),
        startedAt: attempt.startedAt, wrong: attempt.wrong, blank: attempt.blank, proof: quiz.proofCode(attempt.id), verify: quiz.verifyToken(attempt.id),
        durationSec: Math.round(((attempt.submittedAt || 0) - (attempt.startedAt || 0)) / 1000)
      });
    }

    quiz.syncAttempt(attempt, Date.now()); // câu quá hạn chưa trả lời tính là bỏ trống

    const allQuestions = await quiz.getQuestions();
    const byId = {};
    allQuestions.forEach((q) => { byId[q.id] = q; });

    let correct = 0, wrongN = 0;
    const detailLines = [];
    attempt.questionIds.forEach((qid, idx) => {
      const q = byId[qid];
      if (!q) return;
      const ans = attempt.answers[qid];
      const order = attempt.orders[qid] || q.options.map((_, i) => i);
      // ans.answerIndex là vị trí hiển thị (đã xáo trộn) phía thí sinh; đưa về chỉ số gốc để so với đáp án đúng.
      const originalIndex = ans && ans.answerIndex >= 0 ? order[ans.answerIndex] : -1;
      const isCorrect = originalIndex === q.correctIndex;
      if (isCorrect) correct++; else if (originalIndex >= 0) wrongN++;
      const chosenText = originalIndex >= 0 ? q.options[originalIndex] : "(không trả lời)";
      const correctText = q.options[q.correctIndex];
      detailLines.push(
        "Câu " + (idx + 1) + " [" + (isCorrect ? "Đúng" : "Sai") + "]: " + q.text +
        " — Bạn chọn: " + chosenText + (isCorrect ? "" : " (Đáp án đúng: " + correctText + ")")
      );
    });

    const total = attempt.questionIds.length;
    const settings = await quiz.getSettings();
    const pct = total ? Math.round((correct / total) * 100) : 0;
    const passed = pct >= (settings.passScore || 0);
    const scoreOutOf10 = total ? (correct / total) * 10 : 0;
    const compliance = settings.complianceEnabled ? quiz.compliancePoints(scoreOutOf10, settings) : null;

    attempt.status = "submitted";
    attempt.submittedAt = Date.now();
    attempt.score = correct;
    attempt.total = total;
    attempt.pct = pct;
    attempt.passed = passed;
    attempt.scoreOutOf10 = Math.round(scoreOutOf10 * 100) / 100;
    attempt.compliancePoints = compliance;
    attempt.detailLines = detailLines; // bản sao câu trả lời, dùng khi gửi lại email
    attempt.wrong = wrongN;
    attempt.blank = Math.max(0, total - correct - wrongN);
    await quiz.putAttempt(attempt);

    await quiz.upsertIndex({
      id: attempt.id, code: attempt.code, name: attempt.name, email: attempt.email, manager: attempt.manager || "",
      score: correct, total, pct, passed, scoreOutOf10: attempt.scoreOutOf10, compliancePoints: compliance,
      submittedAt: attempt.submittedAt, status: "submitted", flags: attempt.flags || null, startedAt: attempt.startedAt, wrong: attempt.wrong, blank: attempt.blank, proof: quiz.proofCode(attempt.id), durationSec: Math.round((attempt.submittedAt - (attempt.startedAt || attempt.submittedAt)) / 1000)
    });

    let mailOk = false;
    try {
      await resultmail.send(attempt, settings, detailLines);
      mailOk = true;
    } catch (e) {
      context.log.error("kt-submit mail", e && e.message);
    }
    // Ghi lại việc gửi email có thành công không, để giao diện báo đúng sự thật (không luôn nói "đã gửi").
    try {
      attempt.mailOk = mailOk;
      await quiz.putAttempt(attempt);
      await quiz.upsertIndex({
        id: attempt.id, code: attempt.code, name: attempt.name, email: attempt.email, manager: attempt.manager || "",
        score: correct, total, pct, passed, scoreOutOf10: attempt.scoreOutOf10, compliancePoints: compliance,
        submittedAt: attempt.submittedAt, status: "submitted", flags: attempt.flags || null, startedAt: attempt.startedAt, wrong: attempt.wrong, blank: attempt.blank, proof: quiz.proofCode(attempt.id), durationSec: Math.round((attempt.submittedAt - (attempt.startedAt || attempt.submittedAt)) / 1000), mailOk
      });
    } catch (e) {
      context.log.error("kt-submit mailOk", e && e.message);
    }

    return reply(context, 200, {
      ok: true, score: correct, total, pct, passed, compliancePoints: compliance, mailOk,
      passScore: settings.passScore || 0, submittedAt: attempt.submittedAt, serverNow: Date.now(),
      startedAt: attempt.startedAt, wrong: attempt.wrong, blank: attempt.blank, proof: quiz.proofCode(attempt.id), verify: quiz.verifyToken(attempt.id),
      durationSec: Math.round((attempt.submittedAt - (attempt.startedAt || attempt.submittedAt)) / 1000)
    });
  } catch (e) {
    context.log.error("kt-submit", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra." });
  }
};
