const { reply, guardConfigured, requireAjax, requireUser } = require("../_lib/http");
const { emailAllowed } = require("../_lib/config");
const { layout, unsubUrl } = require("../_lib/emails");
const store = require("../_lib/store");
const mail = require("../_lib/mail");
const { cfg } = require("../_lib/config");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context) || !requireAjax(context, req)) return;
    const u = requireUser(context, req);
    if (!u) return;
    if (!emailAllowed(u.email)) return reply(context, 403, { ok: false, error: "Tài khoản không còn được phép." });
    const key = "user/" + u.uid + ".json", now = Date.now();
    const doc = (await store.get(key)) || { v: 1, uid: u.uid, email: u.email, rev: 0, state: null, digest: null, prefs: {}, sent: {} };
    doc.testSent = (doc.testSent || []).filter((t) => now - t < 86400000);
    if (doc.testSent.length >= 3) return reply(context, 429, { ok: false, error: "Chỉ gửi thử tối đa 3 lần mỗi ngày." });
    doc.testSent.push(now);
    await store.put(key, doc);
    const L = layout({
      tone: "info", title: "Email thử: thông báo đã hoạt động",
      sections: [{ h: "Bạn sẽ nhận được", lines: ["Sáng: kết quả hôm qua (chỉ khi hôm qua là ngày làm việc).", "Tối: nhắc nhập số liệu nếu hôm nay chưa nhập.", "Cảnh báo khi có rủi ro cao; tổng kết tuần vào thứ Hai."] }],
      cta: "Mở ứng dụng", ctaUrl: cfg().appUrl, unsub: unsubUrl(u.uid)
    });
    await mail.send({ to: u.email, subject: "[Tham khảo] Email thử từ Trợ lí kế hoạch bán hàng", html: L.html, text: L.text });
    return reply(context, 200, { ok: true });
  } catch (e) {
    context.log.error("mail-test", e && e.message);
    return reply(context, 500, { ok: false, error: "Không gửi được email thử." });
  }
};
