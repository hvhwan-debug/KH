// Công khai: chấm điểm bài làm và gửi email kết quả tự động cho thí sinh.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");
const mail = require("../_lib/mail");
const { layout } = require("../_lib/emails");

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
      return reply(context, 200, { ok: true, score: attempt.score, total: attempt.total, pct: attempt.pct, passed: attempt.passed, compliancePoints: attempt.compliancePoints, already: true });
    }

    const allQuestions = await quiz.getQuestions();
    const byId = {};
    allQuestions.forEach((q) => { byId[q.id] = q; });

    let correct = 0;
    const detailLines = [];
    attempt.questionIds.forEach((qid, idx) => {
      const q = byId[qid];
      if (!q) return;
      const ans = attempt.answers[qid];
      const order = attempt.orders[qid] || q.options.map((_, i) => i);
      // ans.answerIndex là vị trí hiển thị (đã xáo trộn) phía thí sinh; đưa về chỉ số gốc để so với đáp án đúng.
      const originalIndex = ans && ans.answerIndex >= 0 ? order[ans.answerIndex] : -1;
      const isCorrect = originalIndex === q.correctIndex;
      if (isCorrect) correct++;
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
    await quiz.putAttempt(attempt);

    await quiz.upsertIndex({
      id: attempt.id, code: attempt.code, name: attempt.name, email: attempt.email, manager: attempt.manager || "",
      score: correct, total, pct, passed, scoreOutOf10: attempt.scoreOutOf10, compliancePoints: compliance,
      submittedAt: attempt.submittedAt, status: "submitted"
    });

    try {
      const { html, text } = layout({
        brand: "Hệ thống kiểm tra", brandSub: "Bài kiểm tra nội bộ", brandLetter: "KT",
        tone: passed ? "info" : "warn",
        title: "Kết quả bài kiểm tra: " + (settings.examTitle || "Bài kiểm tra"),
        tiles: [
          { n: correct + "/" + total, l: "Số câu đúng" },
          { n: pct + "%", l: "Tỉ lệ đúng" },
          { n: passed ? "ĐẠT" : "CHƯA ĐẠT", l: "Kết quả" }
        ].concat(compliance != null ? [{ n: compliance + " điểm", l: "Điểm tuân thủ học tập" }] : []),
        sections: [
          {
            h: "Thông tin thí sinh",
            lines: [
              "Họ tên: " + (attempt.name || ""),
              "Mã nhân viên: " + (attempt.code || ""),
              "Quản lí: " + (attempt.manager || "(chưa rõ)"),
              "Thời điểm nộp bài: " + new Date(attempt.submittedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
            ]
          },
          { h: "Chi tiết bài làm (bản sao câu trả lời)", lines: detailLines }
        ],
        footer: "Đây là email tự động từ hệ thống kiểm tra. Nếu có thắc mắc về kết quả, vui lòng liên hệ quản trị viên phụ trách."
      });
      await mail.send({ to: attempt.email, subject: "Kết quả bài kiểm tra: " + (settings.examTitle || "Bài kiểm tra"), html, text });
    } catch (e) {
      context.log.error("kt-submit mail", e && e.message);
    }

    return reply(context, 200, { ok: true, score: correct, total, pct, passed, compliancePoints: compliance });
  } catch (e) {
    context.log.error("kt-submit", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra." });
  }
};
