// Cấp thử thách sống (nhìn thẳng / quay trái / quay phải theo thứ tự ngẫu nhiên). Chỉ phát token ký, không lưu gì.
const _http = require("../_lib/http");
const { guardConfigured, requireAjax } = _http;
const live = require("../_lib/facelive");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return _http.reply(context, 405, { ok: false });
    if (!requireAjax(context, req)) return;
    const m = live.mode();
    if (m === "off") return _http.reply(context, 200, { ok: true, mode: "off" });
    const c = live.issue();
    return _http.reply(context, 200, { ok: true, mode: m, token: c.token, seq: c.seq, ttl: 180 });
  } catch (e) {
    context.log.error("kt-live", e && e.message);
    return _http.reply(context, 500, { ok: false });
  }
};
