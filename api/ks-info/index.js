// Công khai: trả phiếu khảo sát theo mã để trang /kiemtra/ks=<mã> hiển thị. Không trả kết quả hay dữ liệu người khác.
// ?preview=1 chỉ có tác dụng với admin đã đăng nhập: xem thử cả khi khảo sát chưa mở / đã đóng.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const { isAdmin } = require("../_lib/config");
const { userFromReq } = require("../_lib/session");
const ks = require("../_lib/survey");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (!requireAjax(context, req)) return;
    const q = req.query || {};
    const code = String(q.code || "").trim().toLowerCase();
    const s = await ks.getSurvey(code);
    if (!s) return reply(context, 404, { ok: false, error: "Không tìm thấy phiếu khảo sát này. Hãy kiểm tra lại đường link." });

    let preview = false;
    if (q.preview) { const u = userFromReq(req); preview = !!(u && u.email && isAdmin(u.email)); }

    const st = ks.state(s);
    if (!preview) {
      if (st === "notyet") return reply(context, 200, { ok: true, state: "notyet", title: s.title, openAt: s.openAt });
      if (st === "closed") return reply(context, 200, { ok: true, state: "closed", title: s.title });
      if (s.maxResponses && (await ks.countResponses(code)) >= s.maxResponses)
        return reply(context, 200, { ok: true, state: "full", title: s.title });
    }
    return reply(context, 200, {
      ok: true, state: "open", preview, code, title: s.title, description: s.description || "", thanks: s.thanks || "",
      identity: s.identity || (s.askIdentity ? "emp" : "none"), showProgress: s.showProgress !== false,
      questions: s.questions
    });
  } catch (e) {
    context.log.error(e);
    return reply(context, 500, { ok: false, error: "Lỗi máy chủ." });
  }
};
