// Link xác nhận nhân sự theo quản lí, có thời hạn (xem _lib/worklink.js).
//  - Người mở link (KHÔNG đăng nhập): mã link gửi qua header X-Link-Token (không nằm trong URL nên không lọt vào nhật ký máy chủ).
//      GET                      -> danh sách nhân viên của quản lí trên link
//      POST {code,left|clear}   -> bấm Còn làm / Đã nghỉ / hoàn tác
//  - Quản trị viên (đăng nhập):  GET ?op=links | POST {op:"create",manager,until} | POST {op:"revoke",id}
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const { isAdmin } = require("../_lib/config");
const quiz = require("../_lib/quiz");
const W = require("../_lib/worklink");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const h = req.headers || {}, b = req.body || {}, q = req.query || {};
    const token = h["x-link-token"] || h["X-Link-Token"] || "";
    const isPost = req.method === "POST";
    if (isPost && !requireAjax(context, req)) return;

    // ----- Người mở link -----
    if (token) {
      const r = await W.resolve(String(token));
      if (!r.link) return reply(context, r.expired ? 410 : 404, { ok: false, expired: !!r.expired, error: r.error });
      const L = r.link, scope = { scopes: [L.manager] };
      if (!isPost) {
        const rows = (await quiz.getCandidates()).filter((c) => quiz.inScope(scope, c)).map(W.rowOf).sort(W.sortRows);
        return reply(context, 200, { ok: true, link: { manager: L.manager, exp: L.exp }, canEdit: true, employees: rows, serverNow: Date.now() });
      }
      if (b.clear !== true && typeof b.left !== "boolean") return reply(context, 400, { ok: false, error: "Yêu cầu không hợp lệ." });
      const all = await quiz.getCandidates();
      const i = all.findIndex((x) => quiz.normCode(x.code) === quiz.normCode(b.code));
      if (i < 0 || !quiz.inScope(scope, all[i])) return reply(context, 404, { ok: false, error: "Không tìm thấy nhân viên này trong nhóm của " + L.manager + "." });
      const who = { by: "link:" + L.id, byName: L.manager + " (qua link)" };
      const { next, changed } = W.applyEmployment(all[i], b.clear === true ? { clear: true } : { left: b.left }, who);
      all[i] = next;
      await quiz.saveCandidates(all);
      return reply(context, 200, { ok: true, employee: W.rowOf(next), changed });
    }

    // ----- Quản trị viên -----
    const u = await requireUserActive(context, req);
    if (!u) return;
    if (!isAdmin(u.email)) return reply(context, 403, { ok: false, error: "Chỉ quản trị viên được tạo / thu hồi link." });
    const view = (l) => ({ id: l.id, token: l.token, manager: l.manager, exp: l.exp, createdAt: l.createdAt, createdBy: l.createdBy, revoked: !!l.revoked,
      state: l.revoked ? "revoked" : Date.now() > l.exp ? "expired" : "active" });
    if (!isPost) {
      if (q.op !== "links") return reply(context, 400, { ok: false, error: "Yêu cầu không hợp lệ." });
      const cands = await quiz.getCandidates(), seen = {};
      cands.forEach((c) => { const m = String(c.manager || "").trim(); if (!m) return; const k = quiz.normPerson(m); seen[k] = seen[k] || { name: m, count: 0 }; seen[k].count++; });
      const managers = Object.values(seen).sort((a, b2) => a.name.localeCompare(b2.name, "vi"));
      return reply(context, 200, { ok: true, managers, links: (await W.getLinks()).slice().reverse().map(view), maxDays: W.MAX_DAYS, serverNow: Date.now() });
    }
    const list = await W.getLinks();
    if (b.op === "create") {
      const manager = String(b.manager || "").trim();
      const cands = await quiz.getCandidates();
      if (!manager || !cands.some((c) => quiz.inScope({ scopes: [manager] }, c))) return reply(context, 400, { ok: false, error: "Chọn một quản lí có nhân viên trong danh sách." });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.until || ""))) return reply(context, 400, { ok: false, error: "Chọn ngày hết hạn." });
      const exp = W.endOfVnDay(b.until), now = Date.now();
      if (!(exp > now)) return reply(context, 400, { ok: false, error: "Ngày hết hạn phải từ hôm nay trở đi." });
      if (exp - now > W.MAX_DAYS * 86400000) return reply(context, 400, { ok: false, error: "Thời hạn tối đa " + W.MAX_DAYS + " ngày." });
      const l = { id: "wl" + now.toString(36), token: W.newToken(), manager, exp, createdAt: now, createdBy: u.email };
      list.push(l); await W.saveLinks(list);
      return reply(context, 200, { ok: true, link: view(l) });
    }
    if (b.op === "revoke") {
      const l = list.find((x) => x.id === String(b.id || ""));
      if (!l) return reply(context, 404, { ok: false, error: "Không tìm thấy link." });
      l.revoked = true; l.revokedAt = Date.now(); l.revokedBy = u.email;
      await W.saveLinks(list);
      return reply(context, 200, { ok: true, link: view(l) });
    }
    return reply(context, 400, { ok: false, error: "Yêu cầu không hợp lệ." });
  } catch (e) {
    context.log.error(e);
    return reply(context, 500, { ok: false, error: "Lỗi máy chủ, vui lòng thử lại." });
  }
};
