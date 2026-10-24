// Gửi email qua SMTP (nodemailer). Chế độ "memory" chỉ để chạy thử trên máy.
const { cfg } = require("./config");

let transport = null;

async function send({ to, subject, html, text, headers }) {
  const c = cfg();
  if (c.mailMode === "memory") {
    (global.__mailbox = global.__mailbox || []).push({ to, subject, html, text, headers, at: Date.now() });
    return true;
  }
  if (!c.smtp.host) return false; // chưa cấu hình SMTP: email tự động là tuỳ chọn, bỏ qua thay vì báo lỗi (trả về false để nơi gọi biết là CHƯA gửi)
  if (!transport) {
    const nodemailer = require("nodemailer"); // nạp khi cần
    transport = nodemailer.createTransport({
      host: c.smtp.host,
      port: c.smtp.port,
      secure: c.smtp.secure,
      pool: true, maxConnections: 4, maxMessages: 100,
      auth: c.smtp.user ? { user: c.smtp.user, pass: c.smtp.pass } : undefined
    });
  }
  await transport.sendMail({ from: c.smtp.from, to, subject, html, text, headers });
  return true;
}

module.exports = { send };
