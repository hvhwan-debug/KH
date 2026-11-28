// Quên mật khẩu dành riêng cho trang QUẢN LÍ (/kiemtra/quanli): chỉ gửi liên kết đặt lại khi email đã được
// quản trị viên cấp quyền quản lí (có trong danh sách quản lí hoặc là quản trị viên) VÀ đã có tài khoản/mật khẩu.
// Trả thông báo cụ thể (không có tài khoản / chưa cấp quyền / bị khoá / lỗi gửi mail...) để người dùng biết lý do.
// Bước đặt mật khẩu mới dùng lại /api/auth/reset-confirm (token ký HMAC, hiệu lực 1 giờ).
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const { validEmail, cfg, mailConfigured, isAdmin } = require("../_lib/config");
const { uidOf, resetToken } = require("../_lib/session");
const { layout } = require("../_lib/emails");
const store = require("../_lib/store");
const mail = require("../_lib/mail");
const quiz = require("../_lib/quiz");

const MAXREQ = 5; // mỗi giờ, theo từng tài khoản

module.exports = async function (context, req) {
  // Báo lỗi cụ thể cho từng trường hợp (theo yêu cầu quản trị): ok:false + message hiển thị cho người dùng.
  const fail = (message) => reply(context, 200, { ok: false, mail: mailConfigured(), message });
  try {
    if (guardConfigured(context) || !requireAjax(context, req)) return;
    const email = String((req.body && req.body.email) || "").trim().toLowerCase();
    if (!validEmail(email)) return fail("Email không hợp lệ.");

    const uid = uidOf(email), key = "user/" + uid + ".json";
    const ud = await store.get(key);
    if (!ud || !ud.pwd) return fail("Không tồn tại tài khoản với email này.");
    if (ud.disabled) return fail("Tài khoản đã bị khoá. Hãy liên hệ quản trị viên.");

    const granted = isAdmin(email) || !!(await quiz.findViewer(email));
    if (!granted) return fail("Email này chưa được cấp quyền quản lí hoặc quản trị.");

    if (!mailConfigured()) return fail("Hệ thống chưa cấu hình gửi email. Hãy liên hệ quản trị viên để đặt lại mật khẩu.");

    const now = Date.now();
    ud.resetTimes = (ud.resetTimes || []).filter((t) => now - t < 3600000);
    if (ud.resetTimes.length >= MAXREQ) return fail("Đã yêu cầu quá nhiều lần. Thử lại sau 1 giờ.");

    const link = cfg().appUrl + (isAdmin(email) ? "/kiemtra/admin" : "/kiemtra/quanli") + "?reset=" + encodeURIComponent(resetToken(uid));
    const L = layout({
      tone: "info",
      title: "Đặt lại mật khẩu quản lí",
      sections: [{ h: "Yêu cầu đặt lại mật khẩu", lines: ["Liên kết bên dưới có hiệu lực trong 1 giờ.", "Nếu không phải bạn yêu cầu, hãy bỏ qua email này."] }],
      cta: "Đặt mật khẩu mới",
      ctaUrl: link
    });
    let sent = false;
    try {
      sent = await mail.send({ fromName: mail.KT_NAME, to: ud.email || email, subject: "Đặt lại mật khẩu — Quản lí nhân viên", html: L.html, text: L.text });
    } catch (e) {
      context.log.error("kt-reset-request: gửi mail lỗi", e && e.message);
    }
    if (!sent) return fail("Không gửi được email (lỗi cấu hình SMTP trên máy chủ). Hãy liên hệ quản trị viên.");

    // Chỉ tính lượt khi đã gửi thành công
    ud.resetTimes.push(now);
    await store.put(key, ud);
    return reply(context, 200, { ok: true, mail: true, message: "Đã gửi liên kết đặt lại mật khẩu tới " + email + " (có hiệu lực 1 giờ). Nếu không thấy, hãy kiểm tra mục Spam." });
  } catch (e) {
    context.log.error("kt-reset-request", e && e.message);
    return fail("Có lỗi xảy ra. Thử lại sau.");
  }
};
