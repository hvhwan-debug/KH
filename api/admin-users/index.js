// Quản trị: liệt kê toàn bộ thành viên (SR) đã có dữ liệu, kèm tóm tắt để xem nhanh.
// Chỉ email trong ADMIN_EMAILS (Azure > Configuration > Application settings) mới gọi được.
const { reply, guardConfigured, requireUser } = require("../_lib/http");
const { isAdmin } = require("../_lib/config");
const store = require("../_lib/store");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = requireUser(context, req);
    if (!u) return;
    if (!isAdmin(u.email)) return reply(context, 403, { ok: false, error: "Bạn không có quyền quản trị." });

    const keys = await store.list("user/");
    const users = [];
    for (const k of keys) {
      let doc = null;
      try { doc = await store.get(k); } catch (e) { continue; }
      if (!doc) continue;
      const st = doc.state || {};
      const target = st.target || {};
      const total = (+target.bn || 0) + (+target.gd || 0);
      users.push({
        uid: doc.uid || k.replace(/^user\//, "").replace(/\.json$/, ""),
        email: doc.email || "",
        name: doc.name || "",
        updatedAt: doc.updatedAt || null,
        rev: doc.rev || 0,
        month: st.month || null,
        province: st.province || "",
        total: total,
        hasData: !!doc.state,
        mailOn: !!(doc.prefs && doc.prefs.mail && doc.prefs.mail.on),
        mailOff: !!doc.mailOff
      });
    }
    users.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return reply(context, 200, { ok: true, count: users.length, users: users });
  } catch (e) {
    context.log.error("admin-users", e && e.message);
    return reply(context, 500, { ok: false, error: "Không tải được danh sách thành viên." });
  }
};
