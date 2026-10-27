// Công khai: nhận một phiếu trả lời. Kiểm tra lại toàn bộ ở máy chủ (loại câu, bắt buộc, logic ẩn/hiện, giới hạn).
// Chế độ danh tính "emp": mỗi mã nhân viên chỉ gửi được một lần.
const crypto = require("crypto");
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const store = require("../_lib/store");
const ks = require("../_lib/survey");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (!requireAjax(context, req)) return;
    const b = req.body || {};
    if (b.website) return reply(context, 200, { ok: true }); // ô bẫy dành cho bot: giả vờ thành công, không lưu
    const code = String(b.code || "").trim().toLowerCase();
    const s = await ks.getSurvey(code);
    if (!s) return reply(context, 404, { ok: false, error: "Không tìm thấy phiếu khảo sát này." });
    const st = ks.state(s);
    if (st === "notyet") return reply(context, 400, { ok: false, error: "Khảo sát chưa mở." });
    if (st === "closed") return reply(context, 400, { ok: false, error: "Khảo sát đã đóng." });

    let clean;
    try { clean = ks.cleanAnswers(s.questions, b.answers, b.others); }
    catch (e) { if (e instanceof ks.AnsErr) return reply(context, 400, { ok: false, error: e.message }); throw e; }

    const mode = s.identity || (s.askIdentity ? "emp" : "none");
    let empId = "", name = "";
    if (mode !== "none") {
      name = ks.str(b.name, 100);
      if (!name) return reply(context, 400, { ok: false, error: "Cần nhập họ tên." });
    }
    if (mode === "emp") {
      empId = String(b.empId || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40);
      if (!empId) return reply(context, 400, { ok: false, error: "Cần nhập mã nhân viên." });
    }
    if (s.maxResponses && (await ks.countResponses(code)) >= s.maxResponses)
      return reply(context, 400, { ok: false, error: "Khảo sát đã đủ số phiếu tối đa." });

    const id = empId || crypto.randomBytes(8).toString("hex");
    const ms = Number(b.ms);
    const rec = {
      empId, name, answers: clean.answers, others: clean.others, submittedAt: Date.now(),
      ms: Number.isFinite(ms) && ms >= 0 && ms < 86400000 ? Math.round(ms) : 0
    };
    let dup = false;
    await store.update(ks.respPrefix(code) + id + ".json", (cur) => { if (cur) { dup = true; return cur; } return rec; });
    if (dup) return reply(context, 409, { ok: false, error: "Mã nhân viên này đã gửi khảo sát rồi." });
    return reply(context, 200, { ok: true });
  } catch (e) {
    context.log.error(e);
    return reply(context, 500, { ok: false, error: "Lỗi máy chủ." });
  }
};
