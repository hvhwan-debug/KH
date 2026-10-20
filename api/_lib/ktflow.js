// Chốt bài làm: chấm điểm, lưu, cập nhật chỉ mục và gửi email kết quả (dùng chung cho kt-answer, kt-submit, quản trị).
const quiz = require("./quiz");
const mail = require("./mail");
const { layout } = require("./emails");
const { mailConfigured } = require("./config");

function mailContent(a, settings) {
  const title = "Kết quả bài kiểm tra: " + (settings.examTitle || "Bài kiểm tra");
  const lines = a.items.map((it, i) => {
    const r = a.answers[it.id];
    const ok = r && r.a === it.correct;
    const chosen = r && r.a >= 0 ? it.options[r.a] : "(không trả lời)";
    return "Câu " + (i + 1) + " [" + (ok ? "Đúng" : "Sai") + "]: " + it.text + " — Bạn chọn: " + chosen + (ok ? "" : " (Đáp án đúng: " + it.options[it.correct] + ")");
  });
  const { html, text } = layout({
    brand: "Hệ thống kiểm tra", brandSub: "Bài kiểm tra nội bộ", brandLetter: "KT",
    tone: a.passed ? "info" : "warn", title,
    tiles: [
      { n: a.score + "/" + a.total, l: "Số câu đúng" },
      { n: a.pct + "%", l: "Tỉ lệ đúng" },
      { n: a.passed ? "ĐẠT" : "CHƯA ĐẠT", l: "Kết quả" }
    ].concat(a.compliancePoints != null ? [{ n: a.compliancePoints + " điểm", l: "Điểm tuân thủ học tập" }] : []),
    sections: [
      { h: "Thông tin thí sinh", lines: [
        "Họ tên: " + (a.name || ""), "Mã nhân viên: " + (a.code || ""), "Quản lí: " + (a.manager || "(chưa rõ)"),
        "Thời điểm nộp bài: " + new Date(a.submittedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })
      ] },
      { h: "Chi tiết bài làm (bản sao câu trả lời)", lines }
    ],
    footer: "Đây là email tự động từ hệ thống kiểm tra. Nếu có thắc mắc về kết quả, vui lòng liên hệ quản trị viên phụ trách."
  });
  return { to: a.email, subject: title, html, text };
}

async function sendResultMail(a, settings, log) {
  try {
    if (!mailConfigured()) throw new Error("Chưa cấu hình SMTP trên máy chủ");
    await mail.send(mailContent(a, settings));
    a.mail = { sent: true, at: Date.now() };
  } catch (e) {
    a.mail = { sent: false, error: String(e && e.message || e).slice(0, 200), at: Date.now() };
    if (log) log.error("kt mail", e && e.message);
  }
}

// Chấm và chốt bài (idempotent: bài đã nộp thì trả lại nguyên trạng).
async function finalize(a, settings, log) {
  if (a.status === "submitted") return a;
  quiz.grade(a, settings, Date.now());
  await quiz.putAttempt(a);
  await sendResultMail(a, settings, log);
  await quiz.putAttempt(a);
  await quiz.putIndex(a);
  return a;
}

function publicResult(a, settings) {
  const r = { score: a.score, total: a.total, pct: a.pct, passed: a.passed, compliancePoints: a.compliancePoints };
  if (settings && settings.showReview && a.items) {
    r.review = a.items.map((it) => { const x = a.answers[it.id]; return { text: it.text, options: it.options, correct: it.correct, chosen: x ? x.a : -1 }; });
  }
  return r;
}

module.exports = { finalize, sendResultMail, publicResult, mailContent };
