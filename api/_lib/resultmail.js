// Email kết quả bài kiểm tra: dùng chung cho lúc nộp bài và khi thí sinh bấm "Gửi lại email xác nhận".
// Nội dung và giao diện do resultemail.js dựng (khung riêng, độc lập với email của các ứng dụng khác trong repo).
const mail = require("./mail");
const { build } = require("./resultemail");

// Gửi email kết quả tới địa chỉ của thí sinh. Ném lỗi nếu không gửi được.
async function send(attempt, settings, advice) {
  // Người đã nghỉ việc: không gửi (trả false = bỏ qua, không phải lỗi)
  try { const quiz = require("./quiz"), k = quiz.normCode(attempt.code); const c = (await quiz.getCandidates()).find((x) => quiz.normCode(x.code) === k); if (c && quiz.isLeft(c)) return false; } catch (e) { /* không tra được hồ sơ thì giữ hành vi cũ */ }
  // Đính kèm ẢNH THẺ KẾT QUẢ (PNG) giống thẻ trên trang kết quả. Dựng thẻ lỗi / quá lâu / thiếu thư viện thì vẫn gửi email bình thường, chỉ không kèm thẻ.
  let card = null;
  try {
    const sc = require("./sharecard");
    const png = await Promise.race([sc.renderPng(attempt, settings), new Promise((_, no) => setTimeout(() => no(new Error("dựng thẻ quá 10 giây")), 10000))]);
    card = { filename: sc.fileName(attempt), content: png, contentType: "image/png" };
  } catch (e) { console.error("resultmail card:", (e && e.message) || e); }
  const m = build(attempt, settings, advice, { card: !!card });
  const sent = await mail.send({ fromName: mail.KT_NAME, to: attempt.email, subject: m.subject, html: m.html, text: m.text, attachments: card ? [card] : undefined });
  if (sent === false) throw new Error("Chưa cấu hình SMTP trên máy chủ, email không được gửi");
  return true;
}

module.exports = { send };
