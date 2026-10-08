// Cấu hình đọc từ biến môi trường (Azure Static Web Apps > Configuration > Application settings).
const env = process.env;

function list(v) {
  return String(v || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function cfg() {
  return {
    appUrl: String(env.APP_URL || "https://kh.io.vn").replace(/\/$/, ""),
    secret: env.SESSION_SECRET || "",
    cronSecret: env.CRON_SECRET || "",
    storageMode: env.STORAGE_MODE || "blob", // "memory" chỉ dùng khi chạy thử trên máy
    mailMode: env.MAIL_MODE || "smtp", // "memory" chỉ dùng khi chạy thử trên máy
    conn: env.STORAGE_CONNECTION_STRING || "",
    allowDomains: list(env.ALLOWED_EMAIL_DOMAINS),
    allowEmails: list(env.ALLOWED_EMAILS),
    cookieInsecure: env.COOKIE_INSECURE === "1",
    smtp: {
      host: env.SMTP_HOST || "",
      port: Number(env.SMTP_PORT || 587),
      user: env.SMTP_USER || "",
      pass: env.SMTP_PASS || "",
      secure: env.SMTP_SECURE === "1",
      from: env.MAIL_FROM || env.SMTP_USER || ""
    }
  };
}

// Trả về danh sách mục còn thiếu; rỗng nghĩa là đã cấu hình đủ.
function missing() {
  const c = cfg(), m = [];
  if (c.secret.length < 32) m.push("SESSION_SECRET (tối thiểu 32 ký tự)");
  if (c.storageMode !== "memory" && !c.conn) m.push("STORAGE_CONNECTION_STRING");
  if (!c.allowDomains.length && !c.allowEmails.length) m.push("ALLOWED_EMAIL_DOMAINS hoặc ALLOWED_EMAILS");
  if (c.mailMode !== "memory" && (!c.smtp.host || !c.smtp.from)) m.push("SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM");
  return m;
}

function validEmail(e) {
  return typeof e === "string" && e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function emailAllowed(email) {
  const c = cfg(), e = String(email || "").toLowerCase();
  if (!validEmail(e)) return false;
  if (c.allowEmails.includes(e)) return true;
  const dom = e.split("@")[1];
  return c.allowDomains.includes(dom);
}

module.exports = { cfg, missing, emailAllowed, validEmail };
