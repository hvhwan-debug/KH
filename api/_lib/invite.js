// Quản trị viên tạo tài khoản quản lí: tạo tài khoản (nếu chưa có) với mật khẩu ngẫu nhiên không ai biết, rồi gửi email
// kèm liên kết để chính quản lí đặt mật khẩu (hiệu lực 7 ngày). Tài khoản đã có mật khẩu thì chỉ gửi thông báo + liên kết đăng nhập.
const crypto = require("crypto");
const { cfg, mailConfigured } = require("./config");
const { uidOf, resetToken } = require("./session");
const { layout } = require("./emails");
const store = require("./store");
const pwd = require("./pwd");
const mail = require("./mail");

const INVITE_MAX_AGE = 7 * 24 * 3600 * 1000;

// opts.forceLink = true: luôn gửi liên kết đặt mật khẩu (dùng cho "gửi lại link").
async function inviteManager(email, name, opts) {
  opts = opts || {};
  const uid = uidOf(email), key = "user/" + uid + ".json";
  let ud = await store.get(key), created = false;
  if (!ud) {
    // mật khẩu ngẫu nhiên không lưu ở đâu cả: chưa ai đăng nhập được cho tới khi quản lí tự đặt mật khẩu qua liên kết
    ud = { v: 1, uid, email, name: String(name || "").trim().slice(0, 80), rev: 0, state: null, digest: null, prefs: {}, sent: {}, pwd: pwd.hash(crypto.randomBytes(24).toString("hex")), verified: true, createdBy: "admin" };
    await store.put(key, ud); created = true;
  }
  if (ud.disabled) return { created, mailed: false, reason: "Tài khoản đang bị khoá." };
  if (!mailConfigured()) return { created, mailed: false, reason: "Máy chủ chưa cấu hình gửi email (SMTP), hãy dùng nút \"Đặt mật khẩu cho quản lí\" rồi gửi mật khẩu thủ công." };

  const base = cfg().appUrl + "/kiemtra/quanli";
  const needSet = created || !!opts.forceLink;
  const link = needSet ? base + "?reset=" + encodeURIComponent(resetToken(uid, INVITE_MAX_AGE)) : base;
  const L = layout({
    tone: "info",
    title: needSet ? "Tài khoản quản lí của bạn đã được tạo" : "Bạn đã được cấp quyền quản lí",
    sections: [{ h: needSet ? "Đặt mật khẩu để bắt đầu" : "Đăng nhập trang quản lí", lines: needSet
      ? ["Quản trị viên đã tạo tài khoản quản lí cho email này.", "Bấm nút bên dưới để tự đặt mật khẩu (liên kết có hiệu lực 7 ngày).", "Nếu không phải bạn, hãy bỏ qua email này."]
      : ["Quản trị viên đã cấp quyền quản lí cho email này.", "Bấm nút bên dưới và đăng nhập bằng mật khẩu hiện có."] }],
    cta: needSet ? "Đặt mật khẩu" : "Mở trang quản lí",
    ctaUrl: link
  });
  try {
    await mail.send({ fromName: mail.KT_NAME, to: ud.email || email, subject: needSet ? "Tài khoản quản lí của bạn — đặt mật khẩu" : "Bạn đã được cấp quyền quản lí", html: L.html, text: L.text });
  } catch (e) {
    return { created, mailed: false, reason: "Gửi email thất bại: " + String((e && e.message) || e).slice(0, 120) };
  }
  return { created, mailed: true, linkType: needSet ? "set-password" : "login" };
}
module.exports = { inviteManager };
