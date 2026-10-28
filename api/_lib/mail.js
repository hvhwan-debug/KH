// Gửi email qua SMTP (nodemailer). Chế độ "memory" chỉ để chạy thử trên máy.
const { cfg } = require("./config");

let transport = null;

// Tên hiển thị người gửi cho email của HỆ THỐNG KIỂM TRA (kết quả bài thi, thông báo, tài khoản quản lí...).
// Các ứng dụng khác dùng chung bộ gửi mail vẫn giữ nguyên người gửi mặc định (không truyền fromName).
const KT_NAME = process.env.MAIL_FROM_NAME_KT || "Hệ thống kiểm tra trực tuyến";
// Lấy địa chỉ email từ MAIL_FROM (dạng "a@b.vn" hoặc "Tên <a@b.vn>") rồi gắn tên hiển thị mới.
function fromOf(from, name) {
  if (!name) return from;
  const m = String(from || "").match(/<([^>]+)>/);
  const address = (m ? m[1] : String(from || "")).trim();
  return address ? { name: String(name).replace(/["<>\r\n]/g, " ").trim(), address } : from;
}

async function send({ to, subject, html, text, headers, fromName }) {
  const c = cfg();
  if (c.mailMode === "memory") {
    (global.__mailbox = global.__mailbox || []).push({ to, subject, html, text, headers, from: fromOf(c.smtp.from, fromName), at: Date.now() });
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
  await transport.sendMail({ from: fromOf(c.smtp.from, fromName), to, subject, html, text, headers });
  return true;
}

module.exports = { send, KT_NAME, fromOf };
