// Công khai: người nhận email mời bấm "Xác nhận tham gia" -> trang /kiemtra/dangky.html mở ra và tự gửi đăng ký về đây.
// Không cần đăng nhập: mã ký trong liên kết (HMAC, hết hạn sau 180 ngày) xác định chương trình + mã NV.
// GET chỉ ĐỌC thông tin (bộ quét link của hộp thư chỉ gọi GET nên không thể đăng ký nhầm); đăng ký / huỷ là POST có header riêng.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const P = require("../_lib/programs");

function view(p, R, t, extra) {
  const left = p.capacity ? Math.max(0, p.capacity - Object.keys(R.regs).length) : null;
  return Object.assign({
    ok: true,
    program: { title: p.title, desc: p.desc, when: p.when, where: p.where, contact: p.contact, deadline: p.deadline || 0, capacity: p.capacity || 0, left,
      audience: p.audience || "", speaker: p.speaker || "", phone: p.phone || "", email: p.email || "", org: p.org || "" },
    name: (R.invited[t.code] || R.regs[t.code] || {}).name || "", code: t.code,
    state: P.stateOf(p, R, t.code), regAt: (R.regs[t.code] || {}).at || 0,
    ask: p.ask === false ? null : { q1: p.q1 || P.ASK_DEFAULT.q1, q2: p.q2 || P.ASK_DEFAULT.q2, opts: p.opts || P.ASK_DEFAULT.opts },
    answer: R.answers[t.code] ? { opts: R.answers[t.code].opts || [], expect: R.answers[t.code].expect || "", story: R.answers[t.code].story || "", at: R.answers[t.code].at } : null
  }, extra || {});
}

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (!requireAjax(context, req)) return;
    const b = (req.body && typeof req.body === "object") ? req.body : {};
    const t = P.readToken(req.method === "GET" ? (req.query && req.query.t) : b.t);
    if (!t) return reply(context, 400, { ok: false, error: "Liên kết không hợp lệ hoặc đã hết hạn. Vui lòng liên hệ người gửi thư mời." });
    const p = await P.get(t.id);
    if (!p) return reply(context, 404, { ok: false, error: "Chương trình này không còn tồn tại." });
    if (req.method === "GET") return reply(context, 200, view(p, await P.regs(p.id), t));
    if (b.op === "answer") {
      const a = await P.answer(p.id, t.code, b);
      if (a.error) return reply(context, a.status || 400, { ok: false, error: a.error });
      return reply(context, 200, view(await P.get(p.id), await P.regs(p.id), t, { saved: true }));
    }
    if (b.op !== "join" && b.op !== "cancel") return reply(context, 400, { ok: false, error: "Thao tác không hợp lệ." });
    const ua = (req.headers && req.headers["user-agent"]) || "";
    const r = await P.act(p.id, t.code, b.op, { ua });
    if (r.error) return reply(context, r.status || 400, { ok: false, error: r.error });
    return reply(context, 200, view(r.program, await P.regs(p.id), t, { already: !!r.already, cancelled: !!r.cancelled, locked: !!r.locked }));
  } catch (e) {
    context.log.error(e);
    return reply(context, 500, { ok: false, error: "Lỗi máy chủ, vui lòng thử lại." });
  }
};
