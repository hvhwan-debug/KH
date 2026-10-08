const { reply, guardConfigured, requireAjax, requireUser } = require("../_lib/http");
const { emailAllowed } = require("../_lib/config");
const { clearCookie } = require("../_lib/session");
const store = require("../_lib/store");

const TIME = /^\d{1,2}:\d{2}$/;
const bool = (v, d) => (typeof v === "boolean" ? v : d);

function cleanPrefs(p) {
  const m = (p && p.mail) || {}, t = (p && p.times) || {};
  const time = (v, d) => (typeof v === "string" && TIME.test(v) ? v : d);
  return {
    mail: { on: bool(m.on, false), morning: bool(m.morning, true), evening: bool(m.evening, true), warn: bool(m.warn, true), weekly: bool(m.weekly, true) },
    times: { m: time(t.m, "08:00"), e: time(t.e, "20:00"), a: time(t.a, "21:30") }
  };
}

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = requireUser(context, req);
    if (!u) return;
    if (!emailAllowed(u.email)) return reply(context, 403, { ok: false, error: "Tài khoản không còn được phép." }, { "Set-Cookie": clearCookie() });
    const key = "user/" + u.uid + ".json";
    const doc = (await store.get(key)) || { v: 1, uid: u.uid, email: u.email, rev: 0, state: null, digest: null, prefs: {}, sent: {} };

    if (req.method === "GET") {
      return reply(context, 200, {
        ok: true, email: u.email, mailOff: !!doc.mailOff,
        doc: doc.state ? { rev: doc.rev, updatedAt: doc.updatedAt, state: doc.state } : null
      });
    }

    if (!requireAjax(context, req)) return;
    const b = req.body || {};
    if (!b.state || typeof b.state !== "object" || Array.isArray(b.state) || typeof b.state.month !== "string") {
      return reply(context, 400, { ok: false, error: "Dữ liệu không hợp lệ." });
    }
    if (JSON.stringify(b.state).length > 500000) return reply(context, 413, { ok: false, error: "Dữ liệu quá lớn." });
    if (b.digest && JSON.stringify(b.digest).length > 80000) return reply(context, 413, { ok: false, error: "Bản tóm tắt quá lớn." });
    if (doc.state && !b.force && Number(b.baseRev) !== doc.rev) {
      return reply(context, 409, { ok: false, conflict: true, rev: doc.rev, updatedAt: doc.updatedAt });
    }

    const prefs = cleanPrefs(b.prefs);
    if (doc.mailOff && !b.ackMailOff) prefs.mail.on = false; // đã bấm "Tắt email" trong thư: không cho trạng thái cũ bật lại
    if (b.ackMailOff) doc.mailOff = false;
    doc.state = b.state;
    if (b.digest && typeof b.digest === "object") doc.digest = b.digest;
    doc.prefs = prefs;
    doc.email = u.email;
    doc.rev = (doc.rev || 0) + 1;
    doc.updatedAt = Date.now();
    await store.put(key, doc);
    return reply(context, 200, { ok: true, rev: doc.rev, updatedAt: doc.updatedAt });
  } catch (e) {
    context.log.error("sync", e && e.message);
    return reply(context, 500, { ok: false, error: "Không đồng bộ được. Thử lại sau." });
  }
};
