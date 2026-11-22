// Phát tệp học liệu đã tải lên (video / PDF / ảnh bìa). Chỉ hiển thị trong trình duyệt (inline), KHÔNG có chế độ tải xuống.
// Video và PDF cần đường dẫn có chữ ký (tham số t) do /api/hoclieu cấp; ảnh bìa của học liệu đã đăng thì công khai.
const hl = require("../_lib/hoclieu");
const { userFromReq } = require("../_lib/session");
const { isAdmin } = require("../_lib/config");

function err(context, status, text) { context.res = { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }, body: text }; }

module.exports = async function (context, req) {
  try {
    const q = req.query || {}, id = hl.clip(q.id, 40);
    const d = await hl.load(), it = d.items.find((x) => x.id === id);
    if (!it) return err(context, 404, "Không tìm thấy.");
    const isThumb = q.k === "thumb";
    let blob, pub = false;
    if (isThumb) {
      if (!(it.thumb && it.thumb.kind === "upload")) return err(context, 404, "Không có ảnh.");
      let ok = it.status !== "draft";
      if (!ok) { try { const u = userFromReq(req); ok = !!(u && u.email && isAdmin(u.email)); } catch (e) { ok = false; } }
      if (!ok) return err(context, 404, "Không tìm thấy.");
      blob = it.thumb.blob; pub = true;
    } else {
      if (!hl.tokenOk(id, q.t)) return err(context, 403, "Đường dẫn đã hết hạn. Hãy mở lại học liệu.");
      if (!(it.source && it.source.kind === "upload")) return err(context, 404, "Không có tệp.");
      blob = it.source.blob;
    }
    const meta = await hl.head(blob);
    if (!meta) return err(context, 404, "Tệp không còn.");
    let mime = isThumb ? (it.thumb.mime || meta.mime) : meta.mime;
    if (!/^(video\/(mp4|webm)|application\/pdf|image\/(jpeg|png|webp))$/.test(mime)) mime = "application/octet-stream";
    const size = meta.size, h = req.headers || {}, rg = String(h.range || "").match(/^bytes=(\d*)-(\d*)$/);
    const headers = {
      "Content-Type": mime, "Content-Disposition": "inline", "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin",
      "Cache-Control": pub ? "public, max-age=3600" : "private, no-store"
    };
    const MAXCHUNK = 4 * 1024 * 1024;
    let start = 0, end = size - 1, partial = false;
    if (rg && (rg[1] !== "" || rg[2] !== "")) {
      if (rg[1] === "") { start = Math.max(0, size - Number(rg[2])); } else { start = Number(rg[1]); if (rg[2] !== "") end = Math.min(size - 1, Number(rg[2])); }
      if (start >= size || start > end) { context.res = { status: 416, headers: Object.assign({ "Content-Range": "bytes */" + size }, headers), body: "" }; return; }
      partial = true;
      if (/^video\//.test(mime) && end - start + 1 > MAXCHUNK) end = start + MAXCHUNK - 1;
    } else if (/^video\//.test(mime) && size > 25 * 1024 * 1024) { end = MAXCHUNK - 1; partial = true; }
    const buf = await hl.readRange(blob, start, end - start + 1);
    context.res = { status: partial ? 206 : 200, isRaw: true, headers: Object.assign(headers, { "Content-Length": String(buf.length) }, partial ? { "Content-Range": "bytes " + start + "-" + end + "/" + size } : {}), body: buf };
  } catch (e) {
    context.log.error(e);
    err(context, 500, "Lỗi máy chủ.");
  }
};
