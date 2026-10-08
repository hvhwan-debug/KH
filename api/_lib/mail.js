// Gửi email qua SMTP (nodemailer). Chế độ "memory" chỉ để chạy thử trên máy.
const { cfg } = require("./config");

let transport = null;

async function send({ to, subject, html, text, headers }) {
  const c = cfg();
  if (c.mailMode === "memory") {
    (global.__mailbox = global.__mailbox || []).push({ to, subject, html, text, headers, at: Date.now() });
    return;
  }
  if (!transport) {
    const nodemailer = require("nodemailer"); // nạp khi cần
    transport = nodemailer.createTransport({
      host: c.smtp.host,
      port: c.smtp.port,
      secure: c.smtp.secure,
      auth: c.smtp.user ? { user: c.smtp.user, pass: c.smtp.pass } : undefined
    });
  }
  await transport.sendMail({ from: c.smtp.from, to, subject, html, text, headers });
}

module.exports = { send };
