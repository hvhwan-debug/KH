// Công cụ cho QUẢN TRỊ VIÊN (đang đăng nhập): nạp / xem thư viện khuôn mặt dùng cho đăng nhập bằng khuôn mặt.
//   GET  /api/kt-facegallery               -> thống kê (số người, số dấu vân), chỉ xem
//   GET  /api/kt-facegallery?code=NV01     -> mã nhân viên đó đã có trong thư viện chưa
//   GET  /api/kt-facegallery?run=1         -> chạy một lượt: (1) đối chiếu các bài đã nộp chưa được kiểm tra, (2) bổ sung thư viện từ các bài cũ
//                                             Mỗi lượt có giới hạn thời gian (~30 giây); mở lại cho tới khi "left" = 0.
// Chỉ trả số liệu, không trả ảnh hay dấu vân khuôn mặt.
const _http = require("../_lib/http");
const { guardConfigured } = _http;
const { userFromReq } = require("../_lib/session");
const { isAdmin } = require("../_lib/config");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    let u = null; try { u = userFromReq(req); } catch (e) { u = null; }
    if (!u || !u.email || !isAdmin(u.email)) return _http.reply(context, 403, { ok: false, error: "Chỉ quản trị viên đang đăng nhập mới dùng được." });
    const gal = require("../_lib/facegallery"), faceid = require("../_lib/faceid");
    const q = req.query || {}, out = { ok: true };
    if (q.run === "1" || req.method === "POST") {
      out.scan = await faceid.scan({ ms: 15000 });       // { done, left, mismatch }: đối chiếu bài chưa kiểm tra (đồng thời đưa bài "match"/"first" vào thư viện)
      out.backfill = await gal.backfill({ ms: 15000 });   // { done, left }: bổ sung từ bài đã được đối chiếu trước đó
    }
    out.gallery = await gal.stats(q.code ? String(q.code).slice(0, 50) : "");
    return _http.reply(context, 200, out);
  } catch (e) {
    context.log.error("kt-facegallery", e && e.message);
    return _http.reply(context, 500, { ok: false, error: "Có lỗi xảy ra." });
  }
};
