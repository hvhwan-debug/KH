// Email kết quả bài kiểm tra: dùng chung cho lúc nộp bài và khi thí sinh bấm "Gửi lại email xác nhận".
// Nội dung và giao diện do resultemail.js dựng (khung riêng, độc lập với email của các ứng dụng khác trong repo).
const mail = require("./mail");
const { build } = require("./resultemail");

// Gửi email kết quả tới địa chỉ của thí sinh. Ném lỗi nếu không gửi được.
async function send(attempt, settings, advice) {
  const m = build(attempt, settings, advice);
  const sent = await mail.send({ to: attempt.email, subject: m.subject, html: m.html, text: m.text });
  if (sent === false) throw new Error("Chưa cấu hình SMTP trên máy chủ, email không được gửi");
}

module.exports = { send };
