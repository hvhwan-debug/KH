// Đăng nhập / đăng ký bằng email + mật khẩu (không cần gửi email).
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const { emailAllowed, validEmail } = require("../_lib/config");
const { uidOf, sessionCookie, sessionValue } = require("../_lib/session");
const store = require("../_lib/store");
const pwd = require("../_lib/pwd");

const MAXFAILS = 10; // mỗi giờ, theo từng tài khoản

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context) || !requireAjax(context, req)) return;
    const email = String((req.body && req.body.email) || "").trim().toLowerCase();
    const password = String((req.body && req.body.password) || "");
    if (!validEmail(email)) return reply(context, 400, { ok: false, error: "Email không hợp lệ." });
    if (!emailAllowed(email)) return reply(context, 403, { ok: false, error: "Email này chưa được cấp quyền sử dụng ứng dụng." });
    if (password.length < 6) return reply(context, 400, { ok: false, error: "Mật khẩu cần ít nhất 6 ký tự." });
    if (password.length > 200) return reply(context, 400, { ok: false, error: "Mật khẩu quá dài." });

    const uid = uidOf(email), ukey = "user/" + uid + ".json";
    let ud = await store.get(ukey);

    // Chưa có tài khoản, hoặc tài khoản cũ (thời đăng nhập bằng mã email) chưa có mật khẩu: tạo mật khẩu lần đầu này.
    if (!ud) {
      ud = { v: 1, uid, email, rev: 0, state: null, digest: null, prefs: {}, sent: {}, pwd: pwd.hash(password) };
      await store.put(ukey, ud);
      return reply(context, 200, { ok: true, created: true, email, token: sessionValue(email) }, { "Set-Cookie": sessionCookie(email) });
    }
    if (!ud.pwd) {
      ud.email = email;
      ud.pwd = pwd.hash(password);
      await store.put(ukey, ud);
      return reply(context, 200, { ok: true, created: true, email, token: sessionValue(email) }, { "Set-Cookie": sessionCookie(email) });
    }

    const now = Date.now();
    ud.failTimes = (ud.failTimes || []).filter((t) => now - t < 3600000);
    if (ud.failTimes.length >= MAXFAILS) return reply(context, 429, { ok: false, error: "Nhập sai quá nhiều lần. Thử lại sau 1 giờ." });

    if (!pwd.verify(password, ud.pwd)) {
      ud.failTimes.push(now);
      await store.put(ukey, ud);
      return reply(context, 400, { ok: false, error: "Email hoặc mật khẩu không đúng." });
    }

    if (ud.failTimes.length) { ud.failTimes = []; await store.put(ukey, ud); }
    return reply(context, 200, { ok: true, created: false, email, token: sessionValue(email) }, { "Set-Cookie": sessionCookie(email) });
  } catch (e) {
    context.log.error("auth-request", e && e.message);
    return reply(context, 500, { ok: false, error: "Lỗi (tạm hiện để chẩn đoán): " + (e && e.message ? e.message : String(e)) });
  }
};
