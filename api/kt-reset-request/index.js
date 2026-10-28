// Quên mật khẩu dành riêng cho trang QUẢN LÍ (/kiemtra/quanli): chỉ gửi liên kết đặt lại khi email đã được
// quản trị viên cấp quyền quản lí (có trong danh sách quản lí hoặc là quản trị viên) VÀ đã có tài khoản/mật khẩu.
// Luôn trả lời cùng một câu chung chung để không lộ email nào được cấp quyền / đã đăng ký.
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
  const generic = { ok: true, mail: mailConfigured(), message: mailConfigured()
    ? "Nếu email này đã được cấp quyền quản lí và có tài khoản, một liên kết đặt lại mật khẩu đã được gửi tới hộp thư (có hiệu lực 1 giờ)."
    : "Chức năng gửi email chưa được cấu hình. Hãy liên hệ quản trị viên để đặt lại mật khẩu." };
  try {
    if (guardConfigured(context) || !requireAjax(context, req)) return;
    const email = String((req.body && req.body.email) || "").trim().toLowerCase();
    if (!validEmail(email)) return reply(context, 200, generic);

    const granted = isAdmin(email) || !!(await quiz.findViewer(email));
    if (!granted) return reply(context, 200, generic); // chưa được admin phân quyền quản lí: không gửi gì

    const uid = uidOf(email), key = "user/" + uid + ".json";
    const ud = await store.get(key);
    if (!ud || !ud.pwd || ud.disabled) return reply(context, 200, generic);

    const now = Date.now();
    ud.resetTimes = (ud.resetTimes || []).filter((t) => now - t < 3600000);
    if (ud.resetTimes.length >= MAXREQ) return reply(context, 200, generic);
    ud.resetTimes.push(now);
    await store.put(key, ud);

    if (mailConfigured()) {
      const link = cfg().appUrl + (isAdmin(email) ? "/kiemtra/admin" : "/kiemtra/quanli") + "?reset=" + encodeURIComponent(resetToken(uid));
      const L = layout({
        tone: "info",
        title: "Đặt lại mật khẩu quản lí",
        sections: [{ h: "Yêu cầu đặt lại mật khẩu", lines: ["Liên kết bên dưới có hiệu lực trong 1 giờ.", "Nếu không phải bạn yêu cầu, hãy bỏ qua email này."] }],
        cta: "Đặt mật khẩu mới",
        ctaUrl: link
      });
      await mail.send({ fromName: mail.KT_NAME, to: ud.email || email, subject: "Đặt lại mật khẩu — Quản lí nhân viên", html: L.html, text: L.text });
    }
    return reply(context, 200, generic);
  } catch (e) {
    context.log.error("kt-reset-request", e && e.message);
    return reply(context, 200, generic);
  }
};
