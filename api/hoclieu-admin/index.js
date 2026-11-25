// Chỉ quản trị viên: quản trị học liệu (danh mục, tài liệu/video, tải tệp lên, đăng/ẩn, nổi bật).
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const { isAdmin } = require("../_lib/config");
const store = require("../_lib/store");
const hl = require("../_lib/hoclieu");
const pub = require("../hoclieu/index.js");

const strip = (it) => { const c = Object.assign({}, it); delete c._drop; return c; };

const handler = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (!requireAjax(context, req)) return;
    const u = await requireUserActive(context, req);
    if (!u) return;
    if (!isAdmin(u.email)) return reply(context, 403, { ok: false, error: "Bạn không có quyền quản trị." });

    if (req.method === "GET") {
      const op = (req.query && req.query.op) || "";
      const d = await hl.load();
      if (op === "list") {
        const V = await hl.loadVotes();
        const items = d.items.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map((it) => Object.assign(strip(it), { thumbUrl: (it.thumb && it.thumb.kind === "upload") ? "/api/hoclieu-file?id=" + it.id + "&k=thumb&v=" + (it.updatedAt || 0) : (it.thumb && it.thumb.url) || (it.source && it.source.kind === "youtube" ? "https://i.ytimg.com/vi/" + it.source.id + "/hqdefault.jpg" : "") }));
        const st = { total: items.length, published: items.filter((x) => x.status !== "draft").length, draft: items.filter((x) => x.status === "draft").length, views: items.reduce((a, x) => a + (x.views || 0), 0), uploads: items.filter((x) => x.source && x.source.kind === "upload").length };
        items.forEach((x) => { const v = hl.voteOf(V, x.id); x.up = v.up; x.down = v.down; x.reasons = hl.reasonsOf(V, x.id); });
        st.up = items.reduce((a, x) => a + x.up, 0); st.down = items.reduce((a, x) => a + x.down, 0);
        return reply(context, 200, { ok: true, items, categories: d.categories, stats: st, reasonLabels: hl.REASONS, limits: { video: hl.LIM.video, pdf: hl.LIM.pdf, thumb: hl.LIM.thumb } });
      }
      if (op === "preview") {
        const it = d.items.find((x) => x.id === hl.clip(req.query.id, 40));
        if (!it) return reply(context, 404, { ok: false, error: "Không tìm thấy học liệu." });
        return reply(context, 200, { ok: true, item: { id: it.id, title: it.title, type: it.type, desc: it.desc, play: pub.playOf(it, 30 * 60 * 1000) } });
      }
      return reply(context, 400, { ok: false, error: "Yêu cầu không hợp lệ." });
    }

    const b = req.body || {}, op = String(b.op || "");
    if (op === "upload") {
      const kind = String(b.kind || ""); if (!hl.MIME[kind]) return reply(context, 400, { ok: false, error: "Loại tệp không hợp lệ." });
      const idx = Number(b.idx); if (!Number.isInteger(idx) || idx < 0 || idx > 400) return reply(context, 400, { ok: false, error: "Phần tệp không hợp lệ." });
      const data = Buffer.from(String(b.data || ""), "base64");
      if (!data.length || data.length > 4 * 1024 * 1024) return reply(context, 400, { ok: false, error: "Phần tệp quá lớn hoặc rỗng." });
      let name = String(b.uploadId || "");
      if (idx === 0) {
        const mime = String(b.mime || "").toLowerCase();
        if (hl.MIME[kind].indexOf(mime) < 0) return reply(context, 400, { ok: false, error: kind === "video" ? "Chỉ nhận video MP4 hoặc WebM." : kind === "pdf" ? "Chỉ nhận tệp PDF." : "Ảnh bìa chỉ nhận JPG, PNG hoặc WebP." });
        if (!(Number(b.size) > 0) || Number(b.size) > hl.LIM[kind]) return reply(context, 400, { ok: false, error: "Tệp quá lớn (tối đa " + Math.round(hl.LIM[kind] / 1048576) + " MB)." });
        if (!hl.magicOk(kind, data, mime)) return reply(context, 400, { ok: false, error: "Nội dung tệp không đúng định dạng." });
        name = "f/" + hl.rid(8);
      } else if (!/^f\/[a-f0-9]{16}$/.test(name)) return reply(context, 400, { ok: false, error: "Phiên tải lên không hợp lệ." });
      if (idx * 3 * 1024 * 1024 > hl.LIM[kind]) return reply(context, 400, { ok: false, error: "Tệp quá lớn." });
      await hl.stage(name, idx, data);
      if (b.last === true) {
        const mime = String(b.mime || "").toLowerCase();
        const size = await hl.commit(name, idx + 1, hl.MIME[kind].indexOf(mime) >= 0 ? mime : hl.MIME[kind][0]);
        if (size > hl.LIM[kind]) { await hl.drop([name]); return reply(context, 400, { ok: false, error: "Tệp quá lớn." }); }
        return reply(context, 200, { ok: true, done: true, uploadId: name, size, mime });
      }
      return reply(context, 200, { ok: true, uploadId: name });
    }
    if (op === "saveItem") {
      let out = null;
      await store.update(hl.INDEX, (cur) => {
        const c = cur || {}; c.items = Array.isArray(c.items) ? c.items : []; if (!Array.isArray(c.categories) || !c.categories.length) c.categories = hl.DEFAULT_CATS.slice();
        const id = hl.clip((b.item || {}).id, 40), old = id ? c.items.find((x) => x.id === id) : null;
        if (id && !old) { out = { error: "Học liệu không còn." }; return c; }
        const r = hl.cleanItem(b.item, old);
        if (r.error) { out = r; return c; }
        if (!c.categories.some((x) => x.id === r.item.cat)) r.item.cat = c.categories[0].id;
        out = r;
        const drop = r.item._drop; delete r.item._drop; out = { item: r.item, drop };
        if (old) c.items[c.items.indexOf(old)] = r.item; else c.items.push(r.item);
        return c;
      });
      if (out.error) return reply(context, 400, { ok: false, error: out.error });
      await hl.drop(out.drop);
      return reply(context, 200, { ok: true, item: out.item });
    }
    if (op === "setFlag") {
      const id = hl.clip(b.id, 40); let found = false;
      await store.update(hl.INDEX, (cur) => { const c = cur || {}; (c.items || []).forEach((x) => { if (x.id === id) { found = true; if (b.status) x.status = b.status === "draft" ? "draft" : "published"; if (typeof b.featured === "boolean") x.featured = b.featured; x.updatedAt = Date.now(); } }); return c; });
      return found ? reply(context, 200, { ok: true }) : reply(context, 404, { ok: false, error: "Học liệu không còn." });
    }
    if (op === "deleteItem") {
      const id = hl.clip(b.id, 40); let gone = null;
      await store.update(hl.INDEX, (cur) => { const c = cur || {}; c.items = (c.items || []).filter((x) => { if (x.id === id) { gone = x; return false; } return true; }); return c; });
      if (!gone) return reply(context, 404, { ok: false, error: "Học liệu không còn." });
      const names = []; if (gone.source && gone.source.kind === "upload") names.push(gone.source.blob); if (gone.thumb && gone.thumb.kind === "upload") names.push(gone.thumb.blob);
      await hl.drop(names);
      return reply(context, 200, { ok: true });
    }
    if (op === "saveCats") {
      const cats = hl.cleanCats(b.categories); let moved = 0;
      await store.update(hl.INDEX, (cur) => { const c = cur || {}; c.categories = cats; c.items = (c.items || []).map((x) => { if (!cats.some((k) => k.id === x.cat)) { moved++; return Object.assign({}, x, { cat: cats[0].id }); } return x; }); return c; });
      return reply(context, 200, { ok: true, categories: cats, moved });
    }
    return reply(context, 400, { ok: false, error: "Yêu cầu không hợp lệ." });
  } catch (e) {
    context.log.error(e);
    return reply(context, 500, { ok: false, error: "Lỗi máy chủ." });
  }
};
// Tải lên theo từng phần: chỉ ghi nhật ký ở phần cuối (tránh hàng chục dòng cho một tệp)
const wrapped = require("../_lib/auditlog").wrap(handler, "hoclieu");
module.exports = function (context, req) {
  const b = (req.body && typeof req.body === "object") ? req.body : {};
  if (req.method === "POST" && b.op === "upload" && b.last !== true) return handler(context, req);
  return wrapped(context, req);
};
