// Tài khoản QUẢN LÍ (do quản trị viên cấp): xem nhân viên thuộc phạm vi của mình và kết quả của họ,
// sửa / điều chỉnh thông tin nhân viên và xác nhận thông tin. KHÔNG có thao tác xoá (kết quả hay nhân viên).
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const { validEmail } = require("../_lib/config");
const quiz = require("../_lib/quiz");

const SEGMENT_INPUTS = ["both", "ca_hai", "gia_dung", "may_loc"]; // giá trị được chấp nhận; lưu dạng chuẩn: both | gia_dung | may_loc
const AUDIT_MAX = 30;

const empView = (c) => ({
  code: c.code, name: c.name || "", email: c.email || "", manager: c.manager || "", segment: quiz.normSegment(c.segment),
  confirmed: c.confirmed ? { by: c.confirmed.by, byName: c.confirmed.byName || c.confirmed.by, at: c.confirmed.at } : null
});

function summaryOf(r, settings) {
  return {
    score: r.score, total: r.total, pct: r.pct, compliancePoints: r.compliancePoints, passed: quiz.passState(r.pct, settings),
    submittedAt: r.submittedAt, startedAt: r.startedAt, durationSec: r.durationSec, wrong: r.wrong, blank: r.blank,
    proof: quiz.proofCode(r.id), verify: quiz.verifyToken(r.id), flags: r.flags || null, mailOk: r.mailOk
  };
}

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = await requireUserActive(context, req);
    if (!u) return;
    const viewer = await quiz.findViewer(u.email);
    if (!viewer) return reply(context, 403, { ok: false, error: "Tài khoản này chưa được cấp quyền quản lí. Hãy liên hệ quản trị viên." });
    const mine = (await quiz.getCandidates()).filter((c) => quiz.inScope(viewer, c));

    if (req.method === "GET") {
      const op = (req.query && req.query.op) || "";
      if (op === "me") return reply(context, 200, { ok: true, viewer: { email: viewer.email, name: viewer.name || "", scopes: viewer.scopes || [] }, serverNow: Date.now() });
      if (op === "employees") {
        const settings = await quiz.getSettings();
        const idx = await quiz.getIndex();
        const latest = {};
        idx.filter((a) => a.status === "submitted").forEach((a) => {
          const k = quiz.normCode(a.code);
          if (!latest[k] || (a.submittedAt || 0) > (latest[k].submittedAt || 0)) latest[k] = a;
        });
        const list = await Promise.all(mine.map(async (c) => {
          const r = latest[quiz.normCode(c.code)];
          let status = "none", active = null;
          if (r) status = "done";
          else { active = await quiz.getActive(c.code); if (active) { const t = Object.assign({}, active); quiz.syncAttempt(t, Date.now()); if (t.cursor < t.questionIds.length) status = "doing"; } }
          return Object.assign(empView(c), { status, result: r ? summaryOf(r, settings) : null });
        }));
        return reply(context, 200, { ok: true, employees: list, serverNow: Date.now() });
      }
      if (op === "employee") {
        const c = mine.find((x) => quiz.normCode(x.code) === quiz.normCode(req.query.code));
        if (!c) return reply(context, 404, { ok: false, error: "Không tìm thấy nhân viên trong phạm vi của bạn." });
        return reply(context, 200, { ok: true, employee: empView(c), history: (c.audit || []).slice().reverse().slice(0, 20) });
      }
      return reply(context, 400, { ok: false, error: "Thiếu tham số op." });
    }

    if (!requireAjax(context, req)) return;
    const b = req.body || {};
    const op = b.op || "";
    const all = await quiz.getCandidates();
    const i = all.findIndex((x) => quiz.normCode(x.code) === quiz.normCode(b.code));
    // Chỉ thao tác được trên nhân viên thuộc phạm vi của mình
    if ((op === "updateEmployee" || op === "confirmEmployee") && (i < 0 || !quiz.inScope(viewer, all[i]))) {
      return reply(context, 404, { ok: false, error: "Không tìm thấy nhân viên trong phạm vi của bạn." });
    }
    const who = { by: viewer.email, byName: viewer.name || viewer.email };

    if (op === "updateEmployee") {
      const c = all[i];
      const name = String(b.name == null ? c.name : b.name).trim().slice(0, 100);
      const email = quiz.normEmail(b.email == null ? c.email : b.email);
      const segIn = b.segment == null ? quiz.normSegment(c.segment) : String(b.segment).trim().toLowerCase();
      if (!name) return reply(context, 400, { ok: false, field: "name", error: "Họ tên không được để trống." });
      if (!validEmail(email)) return reply(context, 400, { ok: false, field: "email", error: "Email không hợp lệ." });
      if (SEGMENT_INPUTS.indexOf(segIn) < 0) return reply(context, 400, { ok: false, field: "segment", error: "Nhóm ngành không hợp lệ." });
      const segment = quiz.normSegment(segIn);
      const dup = all.find((x, k) => k !== i && quiz.normEmail(x.email) === email);
      if (dup) return reply(context, 409, { ok: false, field: "email", error: "Email này đang được dùng cho nhân viên khác (mã " + dup.code + ")." });
      const changes = {};
      if (name !== (c.name || "")) changes.name = { from: c.name || "", to: name };
      if (email !== quiz.normEmail(c.email)) changes.email = { from: c.email || "", to: email };
      if (segment !== quiz.normSegment(c.segment)) changes.segment = { from: quiz.normSegment(c.segment), to: segment };
      if (!Object.keys(changes).length) return reply(context, 200, { ok: true, unchanged: true, employee: empView(c) });
      const next = Object.assign({}, c, { name, email, segment });
      delete next.confirmed; // thông tin đã đổi thì cần xác nhận lại
      next.audit = (c.audit || []).concat([Object.assign({ at: Date.now(), kind: "edit", changes }, who)]).slice(-AUDIT_MAX);
      all[i] = next;
      await quiz.saveCandidates(all);
      return reply(context, 200, { ok: true, employee: empView(next), needReconfirm: true });
    }

    if (op === "confirmEmployee") {
      const c = all[i];
      const next = Object.assign({}, c, { confirmed: Object.assign({ at: Date.now(), snap: { name: c.name || "", email: c.email || "", segment: quiz.normSegment(c.segment) } }, who) });
      next.audit = (c.audit || []).concat([Object.assign({ at: Date.now(), kind: "confirm" }, who)]).slice(-AUDIT_MAX);
      all[i] = next;
      await quiz.saveCandidates(all);
      return reply(context, 200, { ok: true, employee: empView(next) });
    }

    if (/^delete|^remove|^clear/i.test(op)) return reply(context, 403, { ok: false, error: "Tài khoản quản lí không có quyền xoá. Hãy liên hệ quản trị viên." });
    return reply(context, 400, { ok: false, error: "Thao tác không hợp lệ." });
  } catch (e) {
    context.log.error("kt-viewer", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
