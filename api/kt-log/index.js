// Công khai: trang làm bài gửi lên các sự cố phía trình duyệt (không mở được camera, chặn vị trí, mất mạng, lỗi JavaScript...)
// để ghi vào nhật ký lỗi. Chỉ nhận vài loại cố định, cắt ngắn mọi chuỗi, giới hạn số lần theo IP.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const entrylog = require("../_lib/entrylog");

const KINDS = { camera: 1, location: 1, network: 1, js: 1, other: 1 };
const _hits = new Map();
function limited(req) {
  const h = (req && req.headers) || {}, k = String(h["x-forwarded-for"] || h["x-azure-clientip"] || "").split(",")[0].trim() || "unknown", now = Date.now();
  const list = (_hits.get(k) || []).filter((t) => now - t < 10 * 60 * 1000); list.push(now); _hits.set(k, list);
  if (_hits.size > 5000) _hits.clear();
  return list.length > 30;
}

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (!requireAjax(context, req)) return;
    if (limited(req)) return reply(context, 200, { ok: true });
    const b = req.body || {};
    const kind = KINDS[b.kind] ? b.kind : "other";
    await entrylog.write(req, { area: "client", kind, status: 0, msg: String(b.msg || "").slice(0, 300), detail: String(b.detail || "").slice(0, 300),
      code: String(b.code || "").slice(0, 60), email: String(b.email || "").slice(0, 120), exam: String(b.exam || "").slice(0, 60) });
    return reply(context, 200, { ok: true });
  } catch (e) {
    return reply(context, 200, { ok: true });
  }
};
