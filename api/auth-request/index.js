const crypto = require("crypto");
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const { cfg, emailAllowed, validEmail } = require("../_lib/config");
const { uidOf } = require("../_lib/session");
const store = require("../_lib/store");
const mail = require("../_lib/mail");

const GENERIC = { ok: true, message: "Nếu email nằm trong danh sách được phép, mã đăng nhập đã được gửi. Hãy kiểm tra cả thư rác." };

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context) || !requireAjax(context, req)) return;
    const email = String((req.body && req.body.email) || "").trim().toLowerCase();
    if (!validEmail(email)) return reply(context, 400, { ok: false, error: "Email không hợp lệ." });
    if (!emailAllowed(email)) return reply(context, 200, GENERIC); // không tiết lộ email nào được phép

    const key = "otp/" + uidOf(email) + ".json", now = Date.now();
    const doc = (await store.get(key)) || { sent: [] };
    doc.sent = (doc.sent || []).filter((t) => now - t < 3600000);
    if (doc.sent.length >= 5) return reply(context, 429, { ok: false, error: "Bạn yêu cầu mã quá nhiều lần. Thử lại sau 1 giờ." });
    if (doc.sent.length && now - doc.sent[doc.sent.length - 1] < 30000) return reply(context, 429, { ok: false, error: "Vui lòng đợi 30 giây trước khi gửi lại mã." });

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    doc.h = crypto.createHash("sha256").update(cfg().secret + ":" + email + ":" + code).digest("hex");
    doc.exp = now + 10 * 60000;
    doc.tries = 0;
    doc.sent.push(now);
    await store.put(key, doc);
    await mail.send({
      to: email,
      subject: "Mã đăng nhập Livotec: " + code,
      text: "Mã đăng nhập của bạn là " + code + ". Mã có hiệu lực 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.",
      html: '<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:16px"><div style="background:#02A79E;color:#fff;padding:12px 16px;border-radius:10px 10px 0 0;font-weight:700">Livotec · Trợ lí thiết lập kế hoạch bán hàng</div><div style="border:1px solid #C6E4E0;border-top:0;padding:18px;border-radius:0 0 10px 10px"><div style="color:#4F6F6C">Mã đăng nhập của bạn</div><div style="font-size:34px;font-weight:800;letter-spacing:.2em;color:#007A73;margin:6px 0">' + code + '</div><div style="color:#4F6F6C;font-size:13px">Mã có hiệu lực 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.</div></div></div>'
    });
    return reply(context, 200, GENERIC);
  } catch (e) {
    context.log.error("auth-request", e && e.message);
    return reply(context, 500, { ok: false, error: "Không gửi được mã. Thử lại sau." });
  }
};
