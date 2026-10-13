// Quên mật khẩu: gửi email chứa liên kết đặt lại, có hiệu lực 1 giờ.
// Luôn trả lời một câu chung chung dù email có tài khoản hay không, để không lộ việc email nào đã đăng ký.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const { validEmail, cfg, mailConfigured } = require("../_lib/config");
const { uidOf, resetToken } = require("../_lib/session");
const { layout } = require("../_lib/emails");
const store = require("../_lib/store");
const mail = require("../_lib/mail");

const MAXREQ = 5; // mỗi giờ, theo từng tài khoản — chống gửi email dồn dập

module.exports = async function (context, req) {
  const generic = { ok: true, message: "Nếu email này có tài khoản, một liên kết đặt lại mật khẩu đã được gửi tới hộp thư." };
  try {
    if (guardConfigured(context) || !requireAjax(context, req)) return;
    const email = String((req.body && req.body.email) || "").trim().toLowerCase();
    if (!validEmail(email)) return reply(context, 200, generic);
    const uid = uidOf(email), key = "user/" + uid + ".json";
    const ud = await store.get(key);
    if (!ud || !ud.pwd) return reply(context, 200, generic); // chưa có tài khoản/mật khẩu: vẫn trả lời như bình thường

    const now = Date.now();
    ud.resetTimes = (ud.resetTimes || []).filter((t) => now - t < 3600000);
    if (ud.resetTimes.length >= MAXREQ) return reply(context, 200, generic); // im lặng, không gửi thêm, nhưng không báo lỗi
    ud.resetTimes.push(now);
    await store.put(key, ud);

    if (mailConfigured()) {
      const link = cfg().appUrl + "/?reset=" + encodeURIComponent(resetToken(uid));
      const L = layout({
        tone: "info",
        title: "Đặt lại mật khẩu",
        sections: [{ h: "Yêu cầu đặt lại mật khẩu", lines: ["Liên kết bên dưới có hiệu lực trong 1 giờ.", "Nếu không phải bạn yêu cầu, hãy bỏ qua email này — mật khẩu hiện tại vẫn được giữ nguyên."] }],
        cta: "Đặt mật khẩu mới",
        ctaUrl: link
      });
      await mail.send({ to: ud.email || email, subject: "Đặt lại mật khẩu — Trợ lí kế hoạch bán hàng", html: L.html, text: L.text });
    }
    return reply(context, 200, generic);
  } catch (e) {
    context.log.error("auth-reset-request", e && e.message);
    return reply(context, 200, generic);
  }
};
