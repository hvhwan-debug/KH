// Công khai: ảnh "sống" trong email mời chương trình học. Ứng dụng mail tải ảnh MỖI LẦN người nhận mở thư, nên ảnh đầu thư
// (tên, khẩu hiệu) và thẻ thông tin (thời gian, hình thức, đối tượng, hạn, số chỗ còn lại, liên hệ, trạng thái đóng/hết hạn)
// luôn theo dữ liệu mới nhất trên hệ thống. Có chữ ký (p + s) để không ai dò được chương trình khác; không lộ thông tin cá nhân.
const crypto = require("crypto");
const { cfg } = require("../_lib/config");
const P = require("../_lib/programs");
const A = require("../_lib/inviteart");

function sig(id) { return crypto.createHmac("sha256", cfg().secret || "x").update("pgimg:" + id).digest("base64url").slice(0, 22); }
function send(context, buf, type) {
  context.res = { status: 200, isRaw: true, body: buf, headers: {
    "Content-Type": type, "Content-Length": String(buf.length),
    // không cho lưu đệm: mỗi lần mở thư là một lần tải mới (Gmail / Apple Mail / Outlook web đều tải lại)
    "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0", "Pragma": "no-cache", "Expires": "0",
    "Cross-Origin-Resource-Policy": "cross-origin", "X-Content-Type-Options": "nosniff"
  } };
}
module.exports = async function (context, req) {
  try {
    const q = req.query || {}, id = String(q.p || "").slice(0, 40), k = q.k === "info" ? "info" : "hero";
    const ok = id && q.s && q.s.length === 22 && crypto.timingSafeEqual(Buffer.from(String(q.s)), Buffer.from(sig(id)));
    if (!ok) { context.res = { status: 404, body: "" }; return; }
    const p = await P.get(id);
    if (!p) return k === "hero" ? send(context, await A.goneHero(), "image/jpeg") : send(context, await A.infoCard({}, { state: "gone" }), "image/png");
    if (k === "hero") return send(context, await A.hero(p), "image/jpeg");
    const R = await P.regs(id);
    return send(context, await A.infoCard(p, { taken: Object.keys(R.regs).length, state: P.stateOf(p, R, "") }), "image/png");
  } catch (e) {
    context.log.error(e);
    context.res = { status: 500, body: "" };
  }
};
module.exports.sig = sig;
