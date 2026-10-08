const { unsubVerify } = require("../_lib/session");
const { missing } = require("../_lib/config");
const store = require("../_lib/store");

function page(status, msg) {
  return {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email tự động</title><body style="font-family:Arial,sans-serif;background:#E9F6F4;margin:0;padding:24px"><div style="max-width:440px;margin:40px auto;background:#fff;border-radius:14px;padding:22px"><h2 style="margin:0 0 8px;color:#06302D">Email tự động</h2><p style="color:#06302D;line-height:1.5">' + msg + '</p><a href="/" style="color:#007A73">Mở ứng dụng</a></div></body>'
  };
}

module.exports = async function (context, req) {
  try {
    if (missing().length) { context.res = page(503, "Tính năng chưa được cấu hình."); return; }
    const uid = unsubVerify(req.query && req.query.t);
    if (!uid) { context.res = page(400, "Liên kết không hợp lệ hoặc đã hết hạn."); return; }
    const key = "user/" + uid + ".json";
    const doc = await store.get(key);
    if (doc) {
      doc.prefs = doc.prefs || {};
      doc.prefs.mail = Object.assign({}, doc.prefs.mail, { on: false });
      doc.mailOff = true;
      await store.put(key, doc);
    }
    context.res = page(200, "Đã tắt email tự động. Bạn có thể bật lại trong Thiết lập › Tài khoản &amp; email.");
  } catch (e) {
    context.log.error("mail-unsub", e && e.message);
    context.res = page(500, "Có lỗi xảy ra. Thử lại sau.");
  }
};
