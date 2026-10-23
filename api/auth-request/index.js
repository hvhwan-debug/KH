// Đăng nhập / đăng ký bằng email + mật khẩu. Tài khoản MỚI cần xác minh bằng mã OTP gửi qua email
// trước khi được kích hoạt (nếu server đã cấu hình SMTP) — chống việc đăng ký bằng email không phải của mình.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const { emailAllowed, validEmail, mailConfigured, cfg } = require("../_lib/config");
const { uidOf, sessionCookie, sessionValue } = require("../_lib/session");
const { layout } = require("../_lib/emails");
const store = require("../_lib/store");
const pwd = require("../_lib/pwd");
const mail = require("../_lib/mail");
const { normPhone, normName } = require("../_lib/phone");

const MAXFAILS = 10; // mỗi giờ, theo từng tài khoản
const OTP_TTL = 10 * 60 * 1000; // mã có hiệu lực 10 phút
const OTP_MAX_SEND = 5; // tối đa 5 lần gửi mã mỗi giờ, theo từng tài khoản
const OTP_MAX_TRY = 8; // tối đa 8 lần thử sai mỗi giờ

function genOtp() { return String(Math.floor(100000 + Math.random() * 900000)); }

async function sendOtpEmail(email, otp) {
  const L = layout({
    tone: "info",
    title: "Xác minh email của bạn",
    sections: [{ h: "Mã xác minh đăng ký", lines: ["Mã có hiệu lực trong 10 phút.", "Nếu không phải bạn yêu cầu, hãy bỏ qua email này."] }],
    code: otp
  });
  await mail.send({ to: email, subject: "Mã xác minh " + otp + " — Trợ lý kế hoạch bán hàng", html: L.html, text: L.text });
}

const handler = async function (context, req) {
  try {
    if (guardConfigured(context) || !requireAjax(context, req)) return;
    const email = String((req.body && req.body.email) || "").trim().toLowerCase();
    const password = String((req.body && req.body.password) || "");
    let name = String((req.body && req.body.name) || "").trim().slice(0, 80);
    const otpInput = String((req.body && req.body.otp) || "").trim();
    const phoneRaw = String((req.body && req.body.phone) || "").trim(), phone = normPhone(phoneRaw);
    if (!validEmail(email)) return reply(context, 400, { ok: false, error: "Email không hợp lệ." });
    if (!emailAllowed(email)) return reply(context, 403, { ok: false, error: "Email này chưa được cấp quyền sử dụng ứng dụng." });
    if (password.length < 6) return reply(context, 400, { ok: false, error: "Mật khẩu cần ít nhất 6 ký tự." });
    if (password.length > 200) return reply(context, 400, { ok: false, error: "Mật khẩu quá dài." });

    const uid = uidOf(email), ukey = "user/" + uid + ".json";
    let ud = await store.get(ukey);
    if (ud && ud.disabled) return reply(context, 403, { ok: false, error: "Tài khoản đã bị khoá. Hãy liên hệ quản trị viên." });
    const now = Date.now();
    const canSendOtp = mailConfigured();

    // Bước xác nhận mã OTP (sau khi đã đăng ký và được gửi mã)
    if (otpInput && ud && ud.verified === false) {
      if (!pwd.verify(password, ud.pwd)) return reply(context, 400, { ok: false, error: "Email hoặc mật khẩu không đúng." });
      if (!ud.otp || !ud.otpExp || now > ud.otpExp) return reply(context, 400, { ok: false, error: "Mã đã hết hạn. Hãy yêu cầu gửi lại mã mới." });
      ud.otpFails = (ud.otpFails || []).filter((t) => now - t < 3600000);
      if (ud.otpFails.length >= OTP_MAX_TRY) return reply(context, 429, { ok: false, error: "Nhập sai mã quá nhiều lần. Thử lại sau 1 giờ." });
      if (otpInput !== ud.otp) {
        ud.otpFails.push(now);
        await store.put(ukey, ud);
        return reply(context, 400, { ok: false, error: "Mã xác minh không đúng." });
      }
      ud.verified = true; ud.otp = null; ud.otpExp = null; ud.otpFails = [];
      if (name && !ud.name) ud.name = name;
      await store.put(ukey, ud);
      return reply(context, 200, { ok: true, created: true, email, name: ud.name || "", token: sessionValue(email) }, { "Set-Cookie": sessionCookie(email) });
    }

    // Chỉ quản trị viên được tạo tài khoản (SIGNUP_CLOSED=1): người chưa có tài khoản không tự đăng ký được
    if (cfg().signupClosed && (!ud || !ud.pwd)) return reply(context, 403, { ok: false, error: "Tài khoản do quản trị viên tạo. Hãy liên hệ quản trị viên để được cấp tài khoản." });

    // Chưa có tài khoản: tạo mới, cần xác minh OTP trước khi kích hoạt (nếu server đã bật gửi email)
    if (!ud) {
      // Đăng ký tài khoản mới: BẮT BUỘC họ tên và số điện thoại hợp lệ
      if (!name && !phoneRaw) return reply(context, 400, { ok: false, error: "Email hoặc mật khẩu không đúng. Nếu bạn chưa có tài khoản, hãy chọn tab Đăng ký và nhập họ tên, số điện thoại." });
      name = normName(name);
      if (!name) return reply(context, 400, { ok: false, field: "name", error: "Vui lòng nhập đầy đủ họ và tên (ví dụ: Nguyễn Văn A)." });
      if (!phone) return reply(context, 400, { ok: false, field: "phone", error: "Vui lòng nhập số điện thoại hợp lệ (10 số, ví dụ 0901234567)." });
      if (canSendOtp) {
        const otp = genOtp();
        ud = { v: 1, uid, email, name, phone, rev: 0, state: null, digest: null, prefs: {}, sent: {}, pwd: pwd.hash(password), verified: false, otp, otpExp: now + OTP_TTL, otpSendTimes: [now] };
        await store.put(ukey, ud);
        await sendOtpEmail(email, otp);
        return reply(context, 200, { ok: true, needsOtp: true, email });
      }
      ud = { v: 1, uid, email, name, phone, rev: 0, state: null, digest: null, prefs: {}, sent: {}, pwd: pwd.hash(password), verified: true };
      await store.put(ukey, ud);
      return reply(context, 200, { ok: true, created: true, email, name, token: sessionValue(email) }, { "Set-Cookie": sessionCookie(email) });
    }

    // Tài khoản cũ (thời đăng nhập bằng mã email) chưa có mật khẩu: đã có dữ liệu thật, coi như đã xác minh sẵn.
    if (!ud.pwd) {
      ud.email = email;
      if (name) ud.name = name;
      if (phone && !ud.phone) ud.phone = phone;
      ud.pwd = pwd.hash(password);
      ud.verified = true;
      await store.put(ukey, ud);
      return reply(context, 200, { ok: true, created: true, email, name: ud.name || "", token: sessionValue(email) }, { "Set-Cookie": sessionCookie(email) });
    }

    // Đã đăng ký nhưng bỏ dở việc xác minh: kiểm tra mật khẩu rồi gửi lại mã mới
    if (ud.verified === false) {
      if (!pwd.verify(password, ud.pwd)) return reply(context, 400, { ok: false, error: "Email hoặc mật khẩu không đúng." });
      if (!canSendOtp) {
        ud.verified = true;
        await store.put(ukey, ud);
        return reply(context, 200, { ok: true, created: false, email, name: ud.name || "", token: sessionValue(email) }, { "Set-Cookie": sessionCookie(email) });
      }
      ud.otpSendTimes = (ud.otpSendTimes || []).filter((t) => now - t < 3600000);
      if (ud.otpSendTimes.length >= OTP_MAX_SEND) return reply(context, 429, { ok: false, error: "Đã gửi mã quá nhiều lần. Thử lại sau 1 giờ." });
      const otp = genOtp();
      ud.otp = otp; ud.otpExp = now + OTP_TTL; ud.otpSendTimes.push(now);
      await store.put(ukey, ud);
      await sendOtpEmail(email, otp);
      return reply(context, 200, { ok: true, needsOtp: true, email });
    }

    // Đăng nhập bình thường
    ud.failTimes = (ud.failTimes || []).filter((t) => now - t < 3600000);
    if (ud.failTimes.length >= MAXFAILS) return reply(context, 429, { ok: false, error: "Nhập sai quá nhiều lần. Thử lại sau 1 giờ." });

    if (!pwd.verify(password, ud.pwd)) {
      ud.failTimes.push(now);
      await store.put(ukey, ud);
      return reply(context, 400, { ok: false, error: "Email hoặc mật khẩu không đúng." });
    }

    if (ud.failTimes.length) ud.failTimes = [];
    if (name && name !== ud.name) ud.name = name;
    await store.put(ukey, ud);
    return reply(context, 200, { ok: true, created: false, email, name: ud.name || "", token: sessionValue(email) }, { "Set-Cookie": sessionCookie(email) });
  } catch (e) {
    context.log.error("auth-request", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra. Thử lại sau." });
  }
};

// Ghi nhật ký đăng nhập của quản trị viên / quản lí hệ thống kiểm tra (không ghi mật khẩu, mã OTP)
module.exports = async function (context, req) {
  await handler(context, req);
  try {
    const al = require("../_lib/auditlog");
    const b = (req.body && typeof req.body === "object") ? req.body : {};
    const res = context.res || {}, body = res.body || {};
    const email = String(body.email || b.email || "").trim().toLowerCase();
    if (body.ok && body.token) await al.auth(req, email, "login", true);
    else if (!body.ok && b.password && res.status !== 429) await al.auth(req, email, "login_fail", false, { reason: String(body.error || "").slice(0, 120) });
  } catch (e) { /* bỏ qua */ }
};
