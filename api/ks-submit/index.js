// Công khai: nhận một phiếu trả lời. Có bật "bắt nhập danh tính" thì mỗi mã nhân viên chỉ gửi được một lần.
const crypto = require("crypto");
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const store = require("../_lib/store");
const ks = require("../_lib/survey");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (!requireAjax(context, req)) return;
    const b = req.body || {};
    const code = String(b.code || "").trim().toLowerCase();
    const s = await ks.getSurvey(code);
    if (!s) return reply(context, 404, { ok: false, error: "Không tìm thấy phiếu khảo sát này." });
    if (!ks.isOpen(s)) return reply(context, 400, { ok: false, error: "Khảo sát đã đóng." });

    let answers;
    try { answers = ks.cleanAnswers(s.questions, b.answers); }
    catch (e) { return reply(context, 400, { ok: false, error: e.message }); }

    let empId = "", name = "";
    if (s.askIdentity) {
      empId = String(b.empId || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40);
      name = String(b.name || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 100);
      if (!empId || !name) return reply(context, 400, { ok: false, error: "Cần nhập mã nhân viên và họ tên." });
    }
    const id = empId || crypto.randomBytes(8).toString("hex");
    const rec = { empId, name, answers, submittedAt: Date.now() };
    let dup = false;
    await store.update(ks.respPrefix(code) + id + ".json", (cur) => { if (cur) { dup = true; return cur; } return rec; });
    if (dup) return reply(context, 409, { ok: false, error: "Mã nhân viên này đã gửi khảo sát rồi." });
    return reply(context, 200, { ok: true });
  } catch (e) {
    context.log.error(e);
    return reply(context, 500, { ok: false, error: "Lỗi máy chủ." });
  }
};
