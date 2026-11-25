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
function brief(it, V, code, EX) {
  const o = { id: it.id, title: it.title, desc: it.desc, cat: it.cat, type: it.type, dur: it.dur, pages: it.pages, featured: !!it.featured, views: it.views || 0, thumb: thumbOf(it), createdAt: it.createdAt };
  if (V) { const v = hl.voteOf(V, it.id, code); o.up = v.up; o.down = v.down; o.mine = v.mine; }
  if (EX) o.exams = (it.exams || []).filter((x) => EX[x]).map((x) => ({ id: x, title: EX[x] }));
  return o;
}
// Tên các bài kiểm tra (để hiện "Tài liệu ôn tập cho bài …"); bài đã xoá thì bỏ qua
async function examTitles() {
  const out = {};
  try { (await require("../_lib/quiz").getExams()).forEach((e) => { if (e && e.id) out[e.id] = e.title || e.examTitle || e.id; }); } catch (e) { /* bỏ qua */ }
  return out;
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
    const CK = require("../_lib/candcookie");
    // Khôi phục phiên đã xác thực khuôn mặt (cookie kt_hl) khi tải lại trang
    if (req.method === "GET" && req.query && req.query.me) {
      const s = CK.hlFromReq(req);
      return reply(context, 200, s ? { ok: true, name: s.name, birth: await require("../_lib/birthask").forCode(s.code) } : { ok: false });
    }
    if (req.method === "POST" && req.body && req.body.op === "logout") { reply(context, 200, { ok: true }); CK.attach(context, CK.clearHl()); return; }
    const d = await hl.load();
    const pub = d.items.filter((x) => x.status !== "draft");
    const me = CK.hlFromReq(req); // học viên đã xác thực khuôn mặt ở trang Học liệu
    if (req.method === "POST") {
      const b = req.body || {};
      if (b.op === "vote") { // thích / không thích: mỗi mã NV một phiếu, bấm lại để bỏ
        if (!me) return reply(context, 401, { ok: false, error: "Vui lòng xác thực khuôn mặt để đánh giá học liệu." });
        const id = hl.clip(b.id, 40), v = b.v === "up" || b.v === "down" ? b.v : "", why = hl.REASONS[b.reason] ? b.reason : "";
        if (!pub.some((x) => x.id === id)) return reply(context, 404, { ok: false, error: "Không tìm thấy học liệu này." });
        const k = String(me.code).toUpperCase(); let res = null;
        await store.update(hl.VOTES, (cur) => {
          const c = cur && typeof cur === "object" ? cur : {}; c.items = c.items || {};
          const x = (c.items[id] = c.items[id] || { u: {}, d: {}, r: {} }); x.u = x.u || {}; x.d = x.d || {}; x.r = x.r || {};
          delete x.u[k]; delete x.d[k]; delete x.r[k];
          if (v === "up") x.u[k] = Date.now();
          if (v === "down") { x.d[k] = Date.now(); if (why) x.r[k] = why; }
          res = hl.voteOf(c.items, id, k); return c;
        });
        return reply(context, 200, Object.assign({ ok: true }, res));
      }
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
      const [V, EX] = await Promise.all([hl.loadVotes(), examTitles()]);
      return reply(context, 200, { ok: true, item: Object.assign(brief(it, V, me && me.code, EX), { play: playOf(it) }) });
    }
    const cats = d.categories.map((c) => Object.assign({}, c, { count: pub.filter((x) => x.cat === c.id).length }));
    const [V, EX] = await Promise.all([hl.loadVotes(), examTitles()]);
    return reply(context, 200, { ok: true, categories: cats, total: pub.length, items: pub.map((it) => brief(it, V, me && me.code, EX)).sort((a, b) => b.createdAt - a.createdAt) });
  } catch (e) {
    context.log.error(e);
    return reply(context, 500, { ok: false, error: "Lỗi máy chủ." });
  }
};
module.exports.playOf = playOf;
