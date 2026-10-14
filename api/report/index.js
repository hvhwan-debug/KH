// Báo cáo cuối ngày của SR. SR gửi lên các ngày đã nhập + ảnh chụp kế hoạch; ASM đọc qua /api/team.
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const { emailAllowed } = require("../_lib/config");
const { clearCookie } = require("../_lib/session");
const store = require("../_lib/store");
const org = require("../_lib/org");

const KEEP_DAYS = 100;

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = await requireUserActive(context, req);
    if (!u) return;
    if (!emailAllowed(u.email)) return reply(context, 403, { ok: false, error: "Tài khoản không còn được phép." }, { "Set-Cookie": clearCookie() });
    const key = "report/" + u.uid + ".json";
    const doc = (await store.get(key)) || { v: 1, uid: u.uid, email: u.email, days: {}, plan: null, updatedAt: 0 };

    if (req.method === "GET") return reply(context, 200, { ok: true, days: doc.days, plan: doc.plan, updatedAt: doc.updatedAt });

    if (!requireAjax(context, req)) return;
    const b = req.body || {};
    if (JSON.stringify(b).length > 120000) return reply(context, 413, { ok: false, error: "Dữ liệu quá lớn." });
    const prof = await org.getProfile(u.uid);
    if (!prof) return reply(context, 409, { ok: false, needProfile: true, error: "Hãy chọn ngành và ASM trước khi gửi báo cáo." });

    const now = Date.now(), today = org.vnToday(now);
    const oldest = org.addDays(today, -92), newest = org.addDays(today, 1);
    let accepted = 0;
    Object.keys(b.days || {}).slice(0, 70).forEach((d) => {
      if (!org.validDate(d) || d < oldest || d > newest) return;
      const e = org.cleanEntry(b.days[d], now);
      const cur = doc.days[d];
      if (cur && e.ts < cur.ts) return; // bản cũ hơn không ghi đè bản mới
      doc.days[d] = e; accepted++;
    });
    Object.keys(doc.days).sort().slice(0, Math.max(0, Object.keys(doc.days).length - KEEP_DAYS)).forEach((d) => { delete doc.days[d]; });
    if (b.plan) { const pl = org.cleanPlan(b.plan); if (pl) { doc.plan = pl; doc.planAt = now; } }
    doc.email = u.email; doc.name = prof.name || doc.name || ""; doc.updatedAt = now;
    await store.put(key, doc);
    return reply(context, 200, { ok: true, accepted, updatedAt: doc.updatedAt, asmEmail: prof.asmEmail || "" });
  } catch (e) {
    context.log.error("report", e && e.message);
    return reply(context, 500, { ok: false, error: "Không gửi được báo cáo. Thử lại sau." });
  }
};
