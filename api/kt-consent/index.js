// Thí sinh chọn ở thông báo cookie: { accept:true } -> đặt cookie nhận diện trình duyệt kt_bid (giữ mã cũ nếu đã có);
// { accept:false } -> xoá kt_bid. (Cookie phiên kt_cand xoá qua kt-check { forget:true }.)
const _http = require("../_lib/http");
const { guardConfigured, requireAjax } = _http;
const CK = require("../_lib/candcookie");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return _http.reply(context, 405, { ok: false });
    if (!requireAjax(context, req)) return;
    const accept = !!(req.body && req.body.accept === true);
    if (!accept) { _http.reply(context, 200, { ok: true, accept: false }); CK.attach(context, CK.clearBid()); return; }
    const bid = CK.bidFromReq(req) || CK.newBid();
    _http.reply(context, 200, { ok: true, accept: true });
    CK.attach(context, CK.bidCookie(bid));
  } catch (e) {
    context.log.error("kt-consent", e && e.message);
    return _http.reply(context, 500, { ok: false });
  }
};
