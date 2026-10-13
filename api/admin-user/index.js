// Quản trị: xem toàn bộ dữ liệu của 1 thành viên, hoặc xoá hẳn tài khoản đó khỏi kho lưu trữ.
// Chỉ email trong ADMIN_EMAILS mới gọi được.
const { reply, guardConfigured, requireUser, requireAjax } = require("../_lib/http");
const { isAdmin } = require("../_lib/config");
const store = require("../_lib/store");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = requireUser(context, req);
    if (!u) return;
    if (!isAdmin(u.email)) return reply(context, 403, { ok: false, error: "Bạn không có quyền quản trị." });

    const uid = String((req.query && req.query.uid) || "").trim();
    if (!/^[a-f0-9]{16,40}$/.test(uid)) return reply(context, 400, { ok: false, error: "Thiếu hoặc sai mã thành viên." });
    const key = "user/" + uid + ".json";

    if (req.method === "GET") {
      const doc = await store.get(key);
      if (!doc) return reply(context, 404, { ok: false, error: "Không tìm thấy thành viên." });
      return reply(context, 200, { ok: true, doc: doc });
    }

    if (req.method === "DELETE") {
      if (!requireAjax(context, req)) return;
      if (uid === u.uid) return reply(context, 400, { ok: false, error: "Không thể tự xoá chính tài khoản đang đăng nhập." });
      await store.del(key);
      return reply(context, 200, { ok: true });
    }

    return reply(context, 405, { ok: false, error: "Không hỗ trợ." });
  } catch (e) {
    context.log.error("admin-user", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra." });
  }
};
