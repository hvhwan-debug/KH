// Địa chỉ Google gọi về sau khi quản trị bấm "Cho phép" (đăng ký trong Google Cloud: <địa chỉ trang>/api/gdrive-oauth).
// Chỉ quản trị viên đang đăng nhập, và state phải khớp mã do chính họ yêu cầu, mới được lưu quyền truy cập Drive.
const { userFromReq, verify } = require("../_lib/session");
const { isAdmin } = require("../_lib/config");
const gd = require("../_lib/gdrive");

module.exports = async function (context, req) {
  const go = (flag) => { context.res = { status: 302, headers: { Location: "/kiemtra/admin?drive=" + flag + "#results", "Cache-Control": "no-store" }, body: "" }; };
  try {
    const q = req.query || {};
    const u = (() => { try { return userFromReq(req); } catch (e) { return null; } })();
    if (!u || !u.email || !isAdmin(u.email)) return go("denied");
    if (q.error) return go("cancel");
    const st = verify(String(q.state || ""));
    if (!st || st.k !== "gdrive" || String(st.email || "").toLowerCase() !== String(u.email).toLowerCase()) return go("state");
    await gd.completeOAuth(String(q.code || ""), u.email);
    return go("ok");
  } catch (e) {
    context.log.error("gdrive-oauth", e && e.message);
    return go("fail");
  }
};
