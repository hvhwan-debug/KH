// Công khai: nhân viên bấm "Xác nhận điểm" trong email -> trang /kiemtra/xacnhan-diem.html mở ra, hiện đúng điểm của họ và gửi xác nhận về đây.
// Không cần đăng nhập: mã ký trong liên kết (HMAC, hết hạn sau 120 ngày) xác định đợt + mã NV.
// GET chỉ ĐỌC (bộ quét link của hộp thư chỉ gọi GET nên không thể xác nhận nhầm); xác nhận / thắc mắc là POST có header riêng.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const SC = require("../_lib/scoreconfirm");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (!requireAjax(context, req)) return;
    const b = (req.body && typeof req.body === "object") ? req.body : {};
    const t = SC.readToken(req.method === "GET" ? (req.query && req.query.t) : b.t);
    if (!t) return reply(context, 400, { ok: false, error: "Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng liên hệ người gửi thư." });
    if (req.method === "GET") { const v = await SC.view(t); return reply(context, v.ok ? 200 : 404, v); }
    if (b.op !== "confirm" && b.op !== "dispute") return reply(context, 400, { ok: false, error: "Thao tác không hợp lệ." });
    const r = await SC.act(t, b.op, b, { ua: (req.headers && req.headers["user-agent"]) || "" });
    return reply(context, r.ok ? 200 : (r.code === "not_found" || r.code === "no_row" ? 404 : 400), r);
  } catch (e) {
    context.log.error(e);
    return reply(context, 500, { ok: false, error: "Lỗi máy chủ, vui lòng thử lại." });
  }
};
