// Email kết quả bài kiểm tra: dùng chung cho lúc nộp bài và khi thí sinh bấm "Gửi lại email xác nhận".
const mail = require("./mail");
const { layout } = require("./emails");
const quiz = require("./quiz");

const vn = (ms) => new Date(ms).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

// Gửi email kết quả tới địa chỉ của thí sinh. Ném lỗi nếu không gửi được.
async function send(attempt, settings, advice) {
  const practice = !!settings.practice;
  const title = (practice ? "[THI THỬ] " : "") + (settings.examTitle || "Bài kiểm tra");
  const compliance = attempt.compliancePoints;
  const ps = quiz.passState(attempt.pct, settings); // true/false, hoặc null nếu bài không có ngưỡng đạt
  const { html, text } = layout({
    brand: "Hệ thống kiểm tra", brandSub: "Bài kiểm tra nội bộ", brandLetter: "KT",
    tone: ps === false ? "warn" : "info",
    title: "Kết quả bài kiểm tra: " + title,
    tiles: [
      { n: attempt.score + "/" + attempt.total, l: "Số câu đúng" },
      { n: attempt.pct + "%", l: "Tỉ lệ đúng" }
    ].concat(ps === null ? [] : [{ n: ps ? "ĐẠT" : "CHƯA ĐẠT", l: "Kết quả" }]).concat(compliance != null ? [{ n: compliance + " điểm", l: practice ? "Điểm tuân thủ (nếu thi thật)" : "Điểm tuân thủ học tập" }] : []),
    sections: (practice ? [{ h: "Lưu ý", lines: ["Đây là bài THI THỬ, KHÔNG PHẢI thi chính thức.", compliance != null ? "Điểm tuân thủ ghi trên đây chỉ để bạn hình dung điểm của mình nếu thi thật, không được ghi nhận chính thức." : "Kết quả không được ghi nhận chính thức."] }] : []).concat([
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
      ...adviceSections(advice)
    ]),
    footer: "Đây là email tự động từ hệ thống kiểm tra. Nếu có thắc mắc về kết quả, vui lòng liên hệ quản trị viên phụ trách."
  });
  const sent = await mail.send({ to: attempt.email, subject: "Kết quả bài kiểm tra: " + title, html, text });
  if (sent === false) throw new Error("Chưa cấu hình SMTP trên máy chủ, email không được gửi");
}

// Mục "Lời khuyên để cải thiện": chỉ gồm nhận xét và việc nên làm; KHÔNG kèm nội dung câu hỏi hay đáp án
// (đề dùng trong nhiều ngày, gửi bản sao câu hỏi qua email là làm lộ ngân hàng đề).
function adviceSections(advice) {
  const a = advice || {};
  const head = [a.headline, a.summary].filter(Boolean).join(". ").replace(/\.\./g, ".");
  const out = [{ h: a.source === "ai" ? "Lời khuyên để cải thiện (gợi ý bởi AI)" : "Lời khuyên để cải thiện", lines: [head || "Hãy xem lại các mảng kiến thức còn yếu và trao đổi với quản lí để được hỗ trợ."] }];
  if (a.actions && a.actions.length) out.push({ h: "Việc nên làm", lines: a.actions.slice() }); // layout tự thêm gạch đầu dòng
  return out;
}

module.exports = { send };
