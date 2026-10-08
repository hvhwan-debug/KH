const { reply, guardConfigured } = require("../_lib/http");
const { cfg } = require("../_lib/config");
const { safeEq } = require("../_lib/session");
const { dueEmails } = require("../_lib/emails");
const store = require("../_lib/store");
const mail = require("../_lib/mail");

const MAX_PER_DAY = 3;

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const c = cfg();
    const given = req.headers && (req.headers["x-cron-secret"] || "");
    if (!c.cronSecret || c.cronSecret.length < 16 || !safeEq(given, c.cronSecret)) return reply(context, 401, { ok: false });
    // Chỉ khi chạy thử (mail ở chế độ memory) mới cho phép giả lập thời gian
    const now = (c.mailMode === "memory" && req.headers["x-test-now"]) ? new Date(req.headers["x-test-now"]) : new Date();

    const names = await store.list("user/");
    let users = 0, sent = 0, failed = 0;
    for (const name of names) {
      try {
        const doc = await store.get(name);
        if (!doc || !doc.email || !doc.prefs || !doc.prefs.mail || !doc.prefs.mail.on) continue;
        users++;
        const r = dueEmails(doc, now);
        let changed = false;
        doc.sent = doc.sent || {};
        const day = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
        if (!doc.sent.cnt || doc.sent.cnt.d !== day) { doc.sent.cnt = { d: day, n: 0 }; changed = true; }
        for (const em of r.emails) {
          if (doc.sent.cnt.n >= MAX_PER_DAY) break;
          await mail.send({
            to: doc.email, subject: em.subject, html: em.html, text: em.text,
            headers: { "List-Unsubscribe": "<" + c.appUrl + "/api/mail/unsub>" }
          });
          Object.assign(doc.sent, em.patch);
          doc.sent.cnt.n++;
          sent++; changed = true;
        }
        if (changed) await store.put(name, doc);
      } catch (e) {
        failed++;
        context.log.error("cron user", name, e && e.message);
      }
    }
    return reply(context, 200, { ok: true, users, sent, failed });
  } catch (e) {
    context.log.error("cron", e && e.message);
    return reply(context, 500, { ok: false });
  }
};
