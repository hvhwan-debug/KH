// Hồ sơ liên hệ của chính tài khoản đang đăng nhập: họ và tên đầy đủ + số điện thoại (bắt buộc).
// Tài khoản tạo trước khi có quy định này cập nhật qua đây; tên được đồng bộ sang hồ sơ nhân sự và báo cáo
// để ASM thấy đúng họ tên.
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const { emailAllowed } = require("../_lib/config");
const { clearCookie } = require("../_lib/session");
const { normPhone, normName } = require("../_lib/phone");
const store = require("../_lib/store");
const org = require("../_lib/org");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "GET" && !requireAjax(context, req)) return;
    const u = await requireUserActive(context, req);
    if (!u) return;
    if (!emailAllowed(u.email)) return reply(context, 403, { ok: false, error: "Tài khoản không còn được phép." }, { "Set-Cookie": clearCookie() });

    const ukey = "user/" + u.uid + ".json";
    const ud = await store.get(ukey);
    if (!ud) return reply(context, 404, { ok: false, error: "Không tìm thấy tài khoản." });

    if (req.method === "GET") {
      return reply(context, 200, { ok: true, name: ud.name || "", phone: ud.phone || "", contactOk: !!(normName(ud.name) && normPhone(ud.phone)) });
    }

    const b = req.body || {};
    const name = normName(b.name), phone = normPhone(b.phone);
    if (!name) return reply(context, 400, { ok: false, field: "name", error: "Vui lòng nhập đầy đủ họ và tên (ví dụ: Nguyễn Văn A)." });
    if (!phone) return reply(context, 400, { ok: false, field: "phone", error: "Vui lòng nhập số điện thoại hợp lệ (10 số, ví dụ 0901234567)." });

    ud.name = name; ud.phone = phone;
    await store.put(ukey, ud);

    // Đồng bộ sang hồ sơ nhân sự và báo cáo (nơi ASM đọc tên hiển thị)
    const p = await org.getProfile(u.uid);
    if (p) { p.name = name; p.phone = phone; await org.putProfile(p); }
    const rkey = "report/" + u.uid + ".json";
    const rep = await store.get(rkey);
    if (rep) { rep.name = name; await store.put(rkey, rep); }

    return reply(context, 200, { ok: true, name, phone, contactOk: true });
  } catch (e) {
    context.log.error("account", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra. Thử lại sau." });
  }
};
