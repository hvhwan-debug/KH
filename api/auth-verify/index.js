const crypto = require("crypto");
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const { cfg, emailAllowed, validEmail } = require("../_lib/config");
const { uidOf, safeEq, sessionCookie, sessionValue } = require("../_lib/session");
const store = require("../_lib/store");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context) || !requireAjax(context, req)) return;
    const email = String((req.body && req.body.email) || "").trim().toLowerCase();
    const code = String((req.body && req.body.code) || "").replace(/\s/g, "");
    if (!validEmail(email) || !/^\d{6}$/.test(code) || !emailAllowed(email)) return reply(context, 400, { ok: false, error: "Mã không đúng hoặc đã hết hạn." });

    const key = "otp/" + uidOf(email) + ".json";
    const doc = await store.get(key);
    if (!doc || !doc.h || Date.now() > doc.exp) return reply(context, 400, { ok: false, error: "Mã không đúng hoặc đã hết hạn." });
    if ((doc.tries || 0) >= 5) { await store.del(key); return reply(context, 429, { ok: false, error: "Nhập sai quá nhiều lần. Hãy yêu cầu mã mới." }); }
    doc.tries = (doc.tries || 0) + 1;
    const h = crypto.createHash("sha256").update(cfg().secret + ":" + email + ":" + code).digest("hex");
    if (!safeEq(h, doc.h)) { await store.put(key, doc); return reply(context, 400, { ok: false, error: "Mã không đúng hoặc đã hết hạn." }); }

    await store.del(key);
    const uid = uidOf(email), ukey = "user/" + uid + ".json";
    const ud = (await store.get(ukey)) || { v: 1, uid, email, rev: 0, state: null, digest: null, prefs: {}, sent: {} };
    ud.email = email;
    await store.put(ukey, ud);
    return reply(context, 200, { ok: true, email, token: sessionValue(email) }, { "Set-Cookie": sessionCookie(email) });
  } catch (e) {
    context.log.error("auth-verify", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra. Thử lại sau." });
  }
};
