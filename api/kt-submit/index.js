// Công khai: chấm điểm bài làm và gửi email kết quả tự động cho thí sinh.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");
const device = require("../_lib/device");
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
      const st = await quiz.getExamSettings(attempt.period || "");
      return reply(context, 200, {
        ok: true, score: attempt.score, total: attempt.total, pct: attempt.pct, passed: quiz.passState(attempt.pct, st),
        compliancePoints: attempt.compliancePoints, already: true, mailOk: attempt.mailOk,
        passScore: quiz.passScoreOf(st), submittedAt: attempt.submittedAt, serverNow: Date.now(),
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
      // Chấm theo loại câu (một đáp án / nhiều đáp án / điền khuyết); câu trả lời lưu theo vị trí hiển thị đã xáo trộn.
      const g = quiz.gradeAnswer(q, attempt.answers[qid], attempt.orders[qid]);
      if (g.state === "correct") correct++; else if (g.state === "wrong") wrongN++;
      detailLines.push(
        "Câu " + (idx + 1) + " [" + (g.ok ? "Đúng" : "Sai") + "]: " + q.text +
        " — Bạn chọn: " + g.chosenText + (g.ok ? "" : " (Đáp án đúng: " + g.correctText + ")")
      );
    });

    const total = attempt.questionIds.length;
    const settings = await quiz.getExamSettings(attempt.period || "");
    const pct = total ? Math.round((correct / total) * 100) : 0;
    const passed = quiz.passState(pct, settings); // null nếu bài không có ngưỡng đạt
    const scoreOutOf10 = total ? (correct / total) * 10 : 0;
    const compliance = settings.complianceEnabled ? quiz.compliancePoints(scoreOutOf10, settings) : null; // thi thử vẫn quy đổi bình thường

    try { device.record(attempt, device.capture(req, b.device, "submit")); } catch (e) { (context.log.warn || context.log)("kt-submit device", e && e.message); }
    const devBrief = device.brief(attempt);
    attempt.status = "submitted";
    attempt.submittedAt = Date.now();
    attempt.score = correct;
    attempt.total = total;
    attempt.pct = pct;
    attempt.passed = passed;
    attempt.practice = !!settings.practice;
    attempt.scoreOutOf10 = Math.round(scoreOutOf10 * 100) / 100;
    attempt.compliancePoints = compliance;
    attempt.detailLines = detailLines; // bản sao câu trả lời, dùng khi gửi lại email
    attempt.paper = quiz.buildPaper(attempt, byId); // bản sao bài làm có cấu trúc, dùng để quản lí xem lại
    attempt.wrong = wrongN;
    attempt.blank = Math.max(0, total - correct - wrongN);
    await quiz.putAttempt(attempt);

    await quiz.upsertIndex({
      id: attempt.id, code: attempt.code, name: attempt.name, email: attempt.email, manager: attempt.manager || "", period: attempt.period || "",
      score: correct, total, pct, passed, scoreOutOf10: attempt.scoreOutOf10, compliancePoints: compliance,
      submittedAt: attempt.submittedAt, status: "submitted", practice: !!settings.practice, flags: attempt.flags || null, startedAt: attempt.startedAt, wrong: attempt.wrong, blank: attempt.blank, proof: quiz.proofCode(attempt.id), durationSec: Math.round((attempt.submittedAt - (attempt.startedAt || attempt.submittedAt)) / 1000), device: devBrief, face: attempt.faceCheck ? attempt.faceCheck.status : null
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
        id: attempt.id, code: attempt.code, name: attempt.name, email: attempt.email, manager: attempt.manager || "", period: attempt.period || "",
        score: correct, total, pct, passed, scoreOutOf10: attempt.scoreOutOf10, compliancePoints: compliance,
        submittedAt: attempt.submittedAt, status: "submitted", practice: !!settings.practice, flags: attempt.flags || null, startedAt: attempt.startedAt, wrong: attempt.wrong, blank: attempt.blank, proof: quiz.proofCode(attempt.id), durationSec: Math.round((attempt.submittedAt - (attempt.startedAt || attempt.submittedAt)) / 1000), device: devBrief, face: attempt.faceCheck ? attempt.faceCheck.status : null, mailOk
      });
    } catch (e) {
      context.log.error("kt-submit mailOk", e && e.message);
    }

    return reply(context, 200, {
      ok: true, score: correct, total, pct, passed, compliancePoints: compliance, mailOk,
      passScore: quiz.passScoreOf(settings), submittedAt: attempt.submittedAt, serverNow: Date.now(),
      startedAt: attempt.startedAt, wrong: attempt.wrong, blank: attempt.blank, proof: quiz.proofCode(attempt.id), verify: quiz.verifyToken(attempt.id),
      durationSec: Math.round((attempt.submittedAt - (attempt.startedAt || attempt.submittedAt)) / 1000)
    });
  } catch (e) {
    context.log.error("kt-submit", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra." });
  }
};
