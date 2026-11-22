// Công khai (học viên): danh mục + danh sách học liệu đã đăng; mở một học liệu để xem; đếm lượt xem.
// Học viên chỉ được XEM: không có tải xuống. Tệp tải lên phát qua /api/hoclieu-file bằng đường dẫn có chữ ký, hết hạn sau 3 giờ.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const store = require("../_lib/store");
const hl = require("../_lib/hoclieu");

const seen = new Map(); // chống tăng lượt xem liên tục từ cùng một nơi
function ipOf(req) { const h = req.headers || {}; return String(h["x-forwarded-for"] || h["x-azure-clientip"] || "").split(",")[0].trim().slice(0, 45); }

function thumbOf(it) {
  const t = it.thumb;
  if (t && t.kind === "upload") return "/api/hoclieu-file?id=" + encodeURIComponent(it.id) + "&k=thumb&v=" + (it.updatedAt || 0);
  if (t && t.kind === "url") return t.url;
  if (it.source && it.source.kind === "youtube") return "https://i.ytimg.com/vi/" + it.source.id + "/hqdefault.jpg";
  return "";
}
function brief(it) {
  return { id: it.id, title: it.title, desc: it.desc, cat: it.cat, type: it.type, dur: it.dur, pages: it.pages, featured: !!it.featured, views: it.views || 0, thumb: thumbOf(it), createdAt: it.createdAt };
}
function playOf(it, ttl) {
  const s = it.source || {};
  if (s.kind === "youtube") return { mode: "embed", src: "https://www.youtube-nocookie.com/embed/" + s.id + "?rel=0&modestbranding=1&playsinline=1&disablekb=0" };
  if (s.kind === "vimeo") return { mode: "embed", src: "https://player.vimeo.com/video/" + s.id + "?dnt=1" };
  if (s.kind === "gdrive") return { mode: "embed", src: "https://drive.google.com/file/d/" + s.id + "/preview" };
  if (s.kind === "url") return { mode: it.type, src: s.url, frame: it.type === "pdf" ? s.url : "" };
  return { mode: it.type, src: "/api/hoclieu-file?id=" + encodeURIComponent(it.id) + "&t=" + hl.token(it.id, ttl) };
}

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (!requireAjax(context, req)) return;
    const d = await hl.load();
    const pub = d.items.filter((x) => x.status !== "draft");
    if (req.method === "POST") {
      const b = req.body || {};
      if (b.op !== "view") return reply(context, 400, { ok: false, error: "Yêu cầu không hợp lệ." });
      const id = hl.clip(b.id, 40), key = ipOf(req) + "|" + id, now = Date.now();
      if (!pub.some((x) => x.id === id)) return reply(context, 404, { ok: false });
      if (seen.size > 5000) seen.clear();
      if (now - (seen.get(key) || 0) > 30 * 60 * 1000) {
        seen.set(key, now);
        await store.update(hl.INDEX, (cur) => { const c = cur || {}; (c.items || []).forEach((x) => { if (x.id === id) x.views = (x.views || 0) + 1; }); return c; });
      }
      return reply(context, 200, { ok: true });
    }
    const id = hl.clip(req.query && req.query.id, 40);
    if (id) {
      const it = pub.find((x) => x.id === id);
      if (!it) return reply(context, 404, { ok: false, error: "Không tìm thấy học liệu này." });
      return reply(context, 200, { ok: true, item: Object.assign(brief(it), { play: playOf(it) }) });
    }
    const cats = d.categories.map((c) => Object.assign({}, c, { count: pub.filter((x) => x.cat === c.id).length }));
    return reply(context, 200, { ok: true, categories: cats, total: pub.length, items: pub.map(brief).sort((a, b) => b.createdAt - a.createdAt) });
  } catch (e) {
    context.log.error(e);
    return reply(context, 500, { ok: false, error: "Lỗi máy chủ." });
  }
};
module.exports.playOf = playOf;
