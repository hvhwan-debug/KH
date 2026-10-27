// Công khai: trả phiếu khảo sát theo mã để trang /kiemtra/ks=<mã> hiển thị. Không trả kết quả hay dữ liệu người khác.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const ks = require("../_lib/survey");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (!requireAjax(context, req)) return;
    const code = String((req.query && req.query.code) || "").trim().toLowerCase();
    const s = await ks.getSurvey(code);
    if (!s) return reply(context, 404, { ok: false, error: "Không tìm thấy phiếu khảo sát này. Hãy kiểm tra lại đường link." });
    if (!ks.isOpen(s)) return reply(context, 200, { ok: true, closed: true, title: s.title });
    return reply(context, 200, {
      ok: true, code, title: s.title, description: s.description || "", thanks: s.thanks || "",
      askIdentity: !!s.askIdentity, questions: s.questions
    });
  } catch (e) {
    context.log.error(e);
    return reply(context, 500, { ok: false, error: "Lỗi máy chủ." });
  }
};
