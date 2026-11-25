// Chỉ quản trị viên: chương trình học (tạo / sửa / đóng / xoá), gửi email mời theo từng đợt nhỏ, xem danh sách đăng ký.
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const { isAdmin, mailConfigured } = require("../_lib/config");
const store = require("../_lib/store");
const quiz = require("../_lib/quiz");
const P = require("../_lib/programs");
const mail = require("../_lib/mail");

const BATCH = 25; // số email mỗi lần gọi (trang quản trị tự chia đợt) để không quá thời gian chạy của máy chủ

function counts(R) { return { invited: Object.keys(R.invited).length, regs: Object.keys(R.regs).length, cancels: Object.keys(R.cancels).length }; }

const handler = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = await requireUserActive(context, req);
    if (!u) return;
    if (!isAdmin(u.email)) return reply(context, 403, { ok: false, error: "Bạn không có quyền quản trị." });

    if (req.method === "GET") {
      const q = req.query || {}, op = q.op || "list";
      if (op === "list") {
        const L = await P.list();
        const out = await Promise.all(L.map(async (p) => Object.assign({}, p, counts(await P.regs(p.id)))));
        return reply(context, 200, { ok: true, programs: out.sort((a, b) => b.createdAt - a.createdAt), mail: mailConfigured() });
      }
      if (op === "detail") {
        const p = await P.get(String(q.id || ""));
        if (!p) return reply(context, 404, { ok: false, error: "Không tìm thấy chương trình." });
        const R = await P.regs(p.id);
        const cands = (await quiz.getCandidates()).filter((c) => !c.left).map((c) => ({ code: P.up(c.code), name: c.name || "", email: c.email || "", title: quiz.titleOf(c), manager: c.manager || "", segment: c.segment || "", province: c.province || "" }));
        return reply(context, 200, { ok: true, program: Object.assign({}, p, counts(R)), invited: R.invited, regs: R.regs, cancels: R.cancels, candidates: cands, mail: mailConfigured() });
      }
      if (op === "preview") { // xem trước email mời với một người mẫu
        const p = await P.get(String(q.id || ""));
        if (!p) return reply(context, 404, { ok: false, error: "Không tìm thấy chương trình." });
        return reply(context, 200, { ok: true, html: P.inviteMail(p, { code: "T000000000", name: "Nguyễn Văn An" }).html });
      }
      return reply(context, 400, { ok: false, error: "Thao tác không hợp lệ." });
    }

    if (!requireAjax(context, req)) return;
    const b = (req.body && typeof req.body === "object") ? req.body : {};
    if (b.op === "save") {
      const r = await P.save(b.program || {}, String(u.email).toLowerCase());
      if (r.error) return reply(context, 400, { ok: false, error: r.error });
      return reply(context, 200, { ok: true, program: r.program });
    }
    if (b.op === "delete") {
      return (await P.remove(String(b.id || ""))) ? reply(context, 200, { ok: true }) : reply(context, 404, { ok: false, error: "Không tìm thấy chương trình." });
    }
    if (b.op === "setStatus") {
      const p = await P.get(String(b.id || ""));
      if (!p) return reply(context, 404, { ok: false, error: "Không tìm thấy chương trình." });
      const r = await P.save(Object.assign({}, p, { status: b.status === "closed" ? "closed" : "open" }), p.by);
      return reply(context, 200, { ok: true, program: r.program });
    }
    if (b.op === "removeReg") { // quản trị viên gỡ một người khỏi danh sách đăng ký
      const id = String(b.id || ""), k = P.up(b.code); let found = false;
      await store.update("kt/program/" + id + ".json", (cur) => { const c = cur || {}; c.regs = c.regs || {}; c.cancels = c.cancels || {};
        if (c.regs[k]) { found = true; c.cancels[k] = Object.assign({}, c.regs[k], { at: Date.now(), regAt: c.regs[k].at, byAdmin: String(u.email).toLowerCase() }); delete c.regs[k]; } return c; });
      return found ? reply(context, 200, { ok: true }) : reply(context, 404, { ok: false, error: "Người này chưa đăng ký." });
    }
    if (b.op === "send") {
      const p = await P.get(String(b.id || ""));
      if (!p) return reply(context, 404, { ok: false, error: "Không tìm thấy chương trình." });
      if (p.status === "closed") return reply(context, 400, { ok: false, error: "Chương trình đang đóng đăng ký, hãy mở lại trước khi gửi mời." });
      if (!mailConfigured()) return reply(context, 400, { ok: false, error: "Máy chủ chưa cấu hình gửi email (SMTP)." });
      const codes = (Array.isArray(b.codes) ? b.codes : []).map(P.up).filter(Boolean);
      if (!codes.length) return reply(context, 400, { ok: false, error: "Chưa chọn người nhận." });
      if (codes.length > BATCH) return reply(context, 400, { ok: false, error: "Mỗi lần gửi tối đa " + BATCH + " người." });
      const byCode = {}; (await quiz.getCandidates()).forEach((c) => { byCode[P.up(c.code)] = c; });
      const sent = [], failed = [];
      for (const code of codes) {
        const c = byCode[code];
        if (!c) { failed.push({ code, reason: "Không có trong danh sách nhân sự" }); continue; }
        if (!c.email) { failed.push({ code, reason: "Chưa có email" }); continue; }
        const m = P.inviteMail(p, { code, name: c.name || "" });
        try {
          const ok = await mail.send({ fromName: mail.KT_NAME, to: c.email, subject: m.subject, html: m.html, text: m.text });
          if (ok) sent.push({ code, name: c.name || "", email: c.email }); else failed.push({ code, reason: "Máy chủ chưa gửi được email" });
        } catch (e) { failed.push({ code, reason: "Gửi thất bại: " + String((e && e.message) || e).slice(0, 80) }); }
      }
      if (sent.length) await P.markInvited(p.id, sent);
      return reply(context, 200, { ok: true, sent: sent.length, failed });
    }
    return reply(context, 400, { ok: false, error: "Thao tác không hợp lệ." });
  } catch (e) {
    context.log.error(e);
    return reply(context, 500, { ok: false, error: "Lỗi máy chủ, vui lòng thử lại." });
  }
};
module.exports = require("../_lib/auditlog").wrap(handler, "program");
