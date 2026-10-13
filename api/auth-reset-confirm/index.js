// Xác nhận đặt lại mật khẩu bằng liên kết từ email (token ký HMAC, không lưu state riêng).
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const { resetVerify, sessionCookie, sessionValue } = require("../_lib/session");
const store = require("../_lib/store");
const pwd = require("../_lib/pwd");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context) || !requireAjax(context, req)) return;
    const token = String((req.body && req.body.token) || "");
    const password = String((req.body && req.body.password) || "");
    if (password.length < 6) return reply(context, 400, { ok: false, error: "Mật khẩu cần ít nhất 6 ký tự." });
    if (password.length > 200) return reply(context, 400, { ok: false, error: "Mật khẩu quá dài." });

    const uid = resetVerify(token);
    if (!uid) return reply(context, 400, { ok: false, error: "Liên kết đã hết hạn hoặc không hợp lệ. Hãy yêu cầu đặt lại mật khẩu lần nữa." });

    const key = "user/" + uid + ".json";
    const ud = await store.get(key);
    if (!ud) return reply(context, 400, { ok: false, error: "Không tìm thấy tài khoản tương ứng." });

    ud.pwd = pwd.hash(password);
    ud.failTimes = [];
    ud.resetTimes = [];
    await store.put(key, ud);
    return reply(context, 200, { ok: true, email: ud.email, token: sessionValue(ud.email) }, { "Set-Cookie": sessionCookie(ud.email) });
  } catch (e) {
    context.log.error("auth-reset-confirm", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra. Thử lại sau." });
  }
};
