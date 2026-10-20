// Email kết quả bài kiểm tra: dùng chung cho lúc nộp bài và khi thí sinh bấm "Gửi lại email xác nhận".
const mail = require("./mail");
const { layout } = require("./emails");
const quiz = require("./quiz");

const vn = (ms) => new Date(ms).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

// Dựng lại bản sao câu trả lời từ ngân hàng đề (chỉ dùng cho bài cũ chưa lưu sẵn bản sao lúc nộp).
function rebuildDetail(attempt, byId) {
  const lines = [];
  attempt.questionIds.forEach((qid, idx) => {
    const q = byId[qid];
    if (!q) return;
    const ans = attempt.answers[qid];
    const order = attempt.orders[qid] || q.options.map((_, i) => i);
    const oi = ans && ans.answerIndex >= 0 ? order[ans.answerIndex] : -1;
    const ok = oi === q.correctIndex;
    lines.push(
      "Câu " + (idx + 1) + " [" + (ok ? "Đúng" : "Sai") + "]: " + q.text + " — Bạn chọn: " + (oi >= 0 ? q.options[oi] : "(không trả lời)") +
      (ok ? "" : " (Đáp án đúng: " + q.options[q.correctIndex] + ")")
    );
  });
  return lines;
}

// Gửi email kết quả tới địa chỉ của thí sinh. Ném lỗi nếu không gửi được.
async function send(attempt, settings, detailLines) {
  const title = settings.examTitle || "Bài kiểm tra";
  const compliance = attempt.compliancePoints;
  const ps = quiz.passState(attempt.pct, settings); // true/false, hoặc null nếu bài không có ngưỡng đạt
  const { html, text } = layout({
    brand: "Hệ thống kiểm tra", brandSub: "Bài kiểm tra nội bộ", brandLetter: "KT",
    tone: ps === false ? "warn" : "info",
    title: "Kết quả bài kiểm tra: " + title,
    tiles: [
      { n: attempt.score + "/" + attempt.total, l: "Số câu đúng" },
      { n: attempt.pct + "%", l: "Tỉ lệ đúng" }
    ].concat(ps === null ? [] : [{ n: ps ? "ĐẠT" : "CHƯA ĐẠT", l: "Kết quả" }]).concat(compliance != null ? [{ n: compliance + " điểm", l: "Điểm tuân thủ học tập" }] : []),
    sections: [
      {
        h: "Thông tin thí sinh",
        lines: [
          "Họ tên: " + (attempt.name || ""),
          "Mã nhân viên: " + (attempt.code || ""),
          "Quản lí: " + (attempt.manager || "(chưa rõ)"),
          "Thời điểm nộp bài: " + vn(attempt.submittedAt),
          "Mã minh chứng: " + quiz.proofCode(attempt.id)
        ]
      },
      { h: "Chi tiết bài làm (bản sao câu trả lời)", lines: detailLines }
    ],
    footer: "Đây là email tự động từ hệ thống kiểm tra. Nếu có thắc mắc về kết quả, vui lòng liên hệ quản trị viên phụ trách."
  });
  const sent = await mail.send({ to: attempt.email, subject: "Kết quả bài kiểm tra: " + title, html, text });
  if (sent === false) throw new Error("Chưa cấu hình SMTP trên máy chủ, email không được gửi");
}

module.exports = { send, rebuildDetail };
